/**
 * Documents Service - Baikal Console
 * ============================================================================
 * Service centralisé pour les opérations sur les documents et couches RAG.
 * Gère : visualisation, ingestion, validation, promotion des documents.
 * 
 * @example
 * import { documentsService } from '@/services';
 * 
 * const { data, error } = await documentsService.getLayerStats('org-id');
 * const docs = await documentsService.getDocumentsByLayer('vertical', filters);
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;

// ============================================================================
// SERVICE DOCUMENTS
// ============================================================================

export const documentsService = {
  
  // ==========================================================================
  // STATISTIQUES & COMPTEURS
  // ==========================================================================

  /**
   * Récupère les statistiques globales par couche
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async getLayerStats(orgId) {
    try {
      // Comptage par layer et status
      const { data, error } = await supabase
        .from('documents')
        .select('layer, status, quality_level', { count: 'exact' })
        .eq('org_id', orgId);

      if (error) throw error;

      // Agrégation côté client
      const stats = {
        vertical: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        org: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        project: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        user: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
      };

      (data || []).forEach(doc => {
        if (stats[doc.layer]) {
          stats[doc.layer].total++;
          stats[doc.layer][doc.status]++;
        }
      });

      return { data: stats, error: null };
    } catch (error) {
      console.error('[documentsService] getLayerStats error:', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère le nombre de documents en attente de validation
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{count: number, error: Error|null}>}
   */
  async getPendingCount(orgId) {
    try {
      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'pending');

      if (error) throw error;
      return { count: count || 0, error: null };
    } catch (error) {
      console.error('[documentsService] getPendingCount error:', error);
      return { count: 0, error };
    }
  },

  // ==========================================================================
  // LECTURE DES DOCUMENTS
  // ==========================================================================

  /**
   * Récupère les documents avec filtres et pagination
   * @param {Object} filters - Filtres de recherche
   * @param {string} filters.layer - Couche (vertical, org, project, user)
   * @param {string} filters.status - Statut (draft, pending, approved, rejected)
   * @param {string} filters.quality_level - Niveau de qualité
   * @param {string} filters.search - Recherche textuelle
   * @param {string} filters.orgId - ID organisation (obligatoire)
   * @param {string} filters.createdBy - Filtrer par créateur
   * @param {Object} pagination - Options de pagination
   * @param {number} pagination.page - Numéro de page (1-indexed)
   * @param {number} pagination.pageSize - Taille de page
   * @param {string} pagination.sortBy - Colonne de tri
   * @param {string} pagination.sortOrder - Ordre (asc/desc)
   * @returns {Promise<{data: Array, total: number, error: Error|null}>}
   */
  async getDocuments(filters = {}, pagination = {}) {
    try {
      const {
        layer,
        status,
        quality_level,
        search,
        orgId,
        createdBy,
        verticalId,
        projectId,
      } = filters;

      const {
        page = 1,
        pageSize = DEFAULT_PAGE_SIZE,
        sortBy = 'created_at',
        sortOrder = 'desc',
      } = pagination;

      // Construction de la requête
      let query = supabase
        .from('documents')
        .select(`
          id,
          content,
          layer,
          status,
          quality_level,
          metadata,
          target_verticals,
          target_projects,
          org_id,
          created_by,
          source_file_id,
          usage_count,
          positive_feedback_count,
          created_at,
          updated_at
        `, { count: 'exact' });

      // Filtres
      if (orgId) query = query.eq('org_id', orgId);
      if (layer) query = query.eq('layer', layer);
      if (status) query = query.eq('status', status);
      if (quality_level) query = query.eq('quality_level', quality_level);
      if (createdBy) query = query.eq('created_by', createdBy);
      if (verticalId) query = query.contains('target_verticals', [verticalId]);
      if (projectId) query = query.contains('target_projects', [projectId]);

      // Recherche textuelle (sur le contenu via FTS si disponible)
      if (search) {
        query = query.textSearch('fts', search, { type: 'websearch' });
      }

      // Tri et pagination
      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        data: data || [],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] getDocuments error:', error);
      return { data: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 0, error };
    }
  },

  /**
   * Récupère les documents en attente de validation
   * @param {string} orgId - ID de l'organisation
   * @param {Object} pagination - Options de pagination
   * @returns {Promise<{data: Array, total: number, error: Error|null}>}
   */
  async getPendingDocuments(orgId, pagination = {}) {
    return this.getDocuments(
      { orgId, status: 'pending' },
      { ...pagination, sortBy: 'created_at', sortOrder: 'asc' }
    );
  },

  /**
   * Récupère un document par son ID avec les détails du fichier source
   * @param {number} documentId - ID du document
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async getDocumentById(documentId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          source_file:source_files(
            id,
            original_filename,
            mime_type,
            file_size,
            created_at
          ),
          creator:profiles!created_by(
            id,
            display_name,
            email
          )
        `)
        .eq('id', documentId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[documentsService] getDocumentById error:', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // FICHIERS SOURCES
  // ==========================================================================

  /**
   * Récupère les fichiers sources avec leurs statistiques
   * @param {Object} filters - Filtres
   * @param {string} filters.orgId - ID organisation
   * @param {string} filters.layer - Couche
   * @param {string} filters.processingStatus - Statut de traitement
   * @param {Object} pagination - Options de pagination
   * @returns {Promise<{data: Array, total: number, error: Error|null}>}
   */
  async getSourceFiles(filters = {}, pagination = {}) {
    try {
      const { orgId, layer, processingStatus } = filters;
      const {
        page = 1,
        pageSize = DEFAULT_PAGE_SIZE,
        sortBy = 'created_at',
        sortOrder = 'desc',
      } = pagination;

      let query = supabase
        .from('source_files')
        .select(`
          id,
          original_filename,
          mime_type,
          file_size,
          chunk_count,
          layer,
          processing_status,
          processing_error,
          created_by,
          created_at,
          processed_at,
          creator:profiles!created_by(
            id,
            display_name
          )
        `, { count: 'exact' });

      if (orgId) query = query.eq('org_id', orgId);
      if (layer) query = query.eq('layer', layer);
      if (processingStatus) query = query.eq('processing_status', processingStatus);

      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        data: data || [],
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] getSourceFiles error:', error);
      return { data: [], total: 0, error };
    }
  },

  // ==========================================================================
  // DÉTECTION DE DOUBLONS
  // ==========================================================================

  /**
   * Vérifie si un fichier existe déjà (basé sur le hash)
   * @param {string} contentHash - Hash SHA-256 du contenu
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{isDuplicate: boolean, existingFile: Object|null, error: Error|null}>}
   */
  async checkDuplicate(contentHash, orgId) {
    try {
      const { data, error } = await supabase
        .from('source_files')
        .select(`
          id,
          original_filename,
          layer,
          created_at,
          creator:profiles!created_by(
            display_name
          )
        `)
        .eq('content_hash', contentHash)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;

      return {
        isDuplicate: !!data,
        existingFile: data ? {
          id: data.id,
          filename: data.original_filename,
          layer: data.layer,
          created_at: data.created_at,
          created_by_name: data.creator?.display_name,
        } : null,
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] checkDuplicate error:', error);
      return { isDuplicate: false, existingFile: null, error };
    }
  },

  /**
   * Calcule le hash SHA-256 d'un fichier
   * @param {File} file - Fichier à hasher
   * @returns {Promise<string>} Hash en hexadécimal
   */
  async calculateFileHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // ==========================================================================
  // VALIDATION (APPROVE / REJECT)
  // ==========================================================================

  /**
   * Approuve un document
   * @param {number} documentId - ID du document
   * @param {string} approvedBy - ID de l'utilisateur qui approuve
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
   */
  async approveDocument(documentId, approvedBy) {
    try {
      // Utilise la fonction RPC si disponible
      const { data, error } = await supabase.rpc('approve_document', {
        p_document_id: documentId,
        p_approved_by: approvedBy,
      });

      if (error) throw error;

      return {
        success: data?.success ?? true,
        data,
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] approveDocument error:', error);
      return { success: false, data: null, error };
    }
  },

  /**
   * Rejette un document
   * @param {number} documentId - ID du document
   * @param {string} rejectedBy - ID de l'utilisateur qui rejette
   * @param {string} reason - Raison du rejet
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
   */
  async rejectDocument(documentId, rejectedBy, reason) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
          metadata: supabase.sql`metadata || ${JSON.stringify({
            rejected_at: new Date().toISOString(),
            rejected_by: rejectedBy,
            rejection_reason: reason,
          })}::jsonb`,
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data, error: null };
    } catch (error) {
      console.error('[documentsService] rejectDocument error:', error);
      return { success: false, data: null, error };
    }
  },

  /**
   * Approuve plusieurs documents en batch
   * @param {number[]} documentIds - IDs des documents
   * @param {string} approvedBy - ID de l'utilisateur
   * @returns {Promise<{success: boolean, count: number, errors: Array}>}
   */
  async approveBatch(documentIds, approvedBy) {
    const results = await Promise.allSettled(
      documentIds.map(id => this.approveDocument(id, approvedBy))
    );

    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = results.filter(r => r.status === 'rejected' || !r.value?.success);

    return {
      success: failed.length === 0,
      count: succeeded.length,
      errors: failed.map((r, i) => ({
        documentId: documentIds[i],
        error: r.reason || r.value?.error,
      })),
    };
  },

  // ==========================================================================
  // PROMOTION DE COUCHE
  // ==========================================================================

  /**
   * Change la couche d'un document (promotion/rétrogradation)
   * @param {number} documentId - ID du document
   * @param {string} newLayer - Nouvelle couche
   * @param {string} changedBy - ID de l'utilisateur
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
   */
  async changeDocumentLayer(documentId, newLayer, changedBy) {
    try {
      const { data, error } = await supabase.rpc('change_document_layer', {
        p_document_id: documentId,
        p_new_layer: newLayer,
        p_changed_by: changedBy,
      });

      if (error) throw error;

      return {
        success: data?.success ?? true,
        data,
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] changeDocumentLayer error:', error);
      return { success: false, data: null, error };
    }
  },

  // ==========================================================================
  // SUPPRESSION
  // ==========================================================================

  /**
   * Supprime un document (soft delete ou hard delete selon config)
   * @param {number} documentId - ID du document
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async deleteDocument(documentId) {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('[documentsService] deleteDocument error:', error);
      return { success: false, error };
    }
  },

  /**
   * Supprime un fichier source et tous ses chunks
   * @param {string} sourceFileId - ID du fichier source
   * @returns {Promise<{success: boolean, deletedChunks: number, error: Error|null}>}
   */
  async deleteSourceFile(sourceFileId) {
    try {
      // 1. Supprimer les chunks associés
      const { count: deletedChunks, error: chunksError } = await supabase
        .from('documents')
        .delete({ count: 'exact' })
        .eq('source_file_id', sourceFileId);

      if (chunksError) throw chunksError;

      // 2. Supprimer le fichier source
      const { error: fileError } = await supabase
        .from('source_files')
        .delete()
        .eq('id', sourceFileId);

      if (fileError) throw fileError;

      return { success: true, deletedChunks: deletedChunks || 0, error: null };
    } catch (error) {
      console.error('[documentsService] deleteSourceFile error:', error);
      return { success: false, deletedChunks: 0, error };
    }
  },

  // ==========================================================================
  // UPLOAD VERS STORAGE
  // ==========================================================================

  /**
   * Upload un fichier vers le storage Supabase
   * @param {File} file - Fichier à uploader
   * @param {string} userId - ID de l'utilisateur
   * @param {string} layer - Couche cible
   * @returns {Promise<{path: string, error: Error|null}>}
   */
  async uploadToStorage(file, userId, layer = 'project') {
    try {
      const timestamp = Date.now();
      const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${layer}/${userId}/${timestamp}_${cleanFilename}`;

      const { data, error } = await supabase.storage
        .from('documents')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      return { path: data.path, error: null };
    } catch (error) {
      console.error('[documentsService] uploadToStorage error:', error);
      return { path: null, error };
    }
  },

  /**
   * Récupère l'URL publique d'un fichier
   * @param {string} path - Chemin du fichier dans le storage
   * @returns {string} URL publique
   */
  getPublicUrl(path) {
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(path);
    
    return data?.publicUrl;
  },

  /**
   * Récupère une URL signée (temporaire) pour un fichier privé
   * @param {string} path - Chemin du fichier
   * @param {number} expiresIn - Durée de validité en secondes (défaut: 1h)
   * @returns {Promise<{url: string, error: Error|null}>}
   */
  async getSignedUrl(path, expiresIn = 3600) {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(path, expiresIn);

      if (error) throw error;
      return { url: data.signedUrl, error: null };
    } catch (error) {
      console.error('[documentsService] getSignedUrl error:', error);
      return { url: null, error };
    }
  },

  // ==========================================================================
  // WEBHOOK N8N
  // ==========================================================================

  /**
   * Déclenche le webhook N8N pour l'ingestion
   * @param {Object} payload - Données à envoyer
   * @param {string} payload.path - Chemin du fichier dans le storage
   * @param {string} payload.user_id - ID utilisateur
   * @param {string} payload.org_id - ID organisation
   * @param {string} payload.layer - Couche cible
   * @param {Object} payload.metadata - Métadonnées additionnelles
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async triggerIngestionWebhook(payload) {
    try {
      const webhookUrl = import.meta.env.VITE_N8N_INGEST_WEBHOOK_URL;
      
      if (!webhookUrl) {
        console.warn('[documentsService] N8N webhook URL not configured');
        return { success: true, error: null }; // Silencieux si non configuré
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          source: 'baikal-console',
          quality_level: 'premium',
          triggered_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('[documentsService] triggerIngestionWebhook error:', error);
      return { success: false, error };
    }
  },
};

export default documentsService;
