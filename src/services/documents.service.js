/**
 * Documents Service - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Base de données Baikal v2
 * 
 * MODIFICATIONS APPORTÉES:
 * - documents → rag.documents (schéma changé)
 * - source_files → sources.files (schéma + table renommés)
 * - vertical_id → app_id (colonne renommée)
 * - profiles → core.profiles (schéma changé)
 * - Bucket 'documents' → 'premium-sources' (storage renommé)
 * - Ajout de .schema() pour toutes les requêtes
 * 
 * @example
 * import { documentsService } from '@/services';
 * 
 * const { data, error } = await documentsService.getLayerStats('org-id');
 * const docs = await documentsService.getDocumentsByLayer('app', filters);
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Calcule le hash SHA-256 d'un fichier
 * @param {File} file - Fichier à hasher
 * @returns {Promise<string>} Hash en hexadécimal
 */
async function computeFileHash(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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
   * 
   * MIGRATION: documents → rag.documents
   * - Ajout .schema('rag')
   */
  async getLayerStats(orgId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('layer, status, quality_level', { count: 'exact' })
        .eq('org_id', orgId);

      if (error) throw error;

      // MIGRATION: 'vertical' layer → 'app' layer
      const stats = {
        app: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },      // ← CHANGÉ: vertical → app
        org: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        project: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        user: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
      };

      (data || []).forEach(doc => {
        // Mapping pour compatibilité: 'vertical' → 'app'
        const layer = doc.layer === 'vertical' ? 'app' : doc.layer;
        if (stats[layer]) {
          stats[layer].total++;
          stats[layer][doc.status]++;
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
   * 
   * MIGRATION: documents → rag.documents
   * - Ajout .schema('rag')
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
   * @param {Object} pagination - Options de pagination
   * @returns {Promise<{data: Array, total: number, error: Error|null}>}
   * 
   * MIGRATION:
   * - documents → rag.documents (schéma)
   * - vertical_id → app_id (colonne)
   * - profiles!created_by → core.profiles (schéma)
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
        appId,
        projectId,
      } = filters;

      const {
        page = 1,
        pageSize = DEFAULT_PAGE_SIZE,
        sortBy = 'created_at',
        sortOrder = 'desc',
      } = pagination;

      // Requête principale sans jointures (les vues ne supportent pas les relations PostgREST)
      let query = supabase
        .from('documents')
        .select(`
          id,
          title,
          content,
          layer,
          status,
          quality_level,
          app_id,
          org_id,
          project_id,
          created_by,
          created_at,
          updated_at,
          approved_at,
          approved_by,
          metadata,
          source_file_id
        `, { count: 'exact' });

      // Filtres
      if (orgId) query = query.eq('org_id', orgId);
      if (layer) query = query.eq('layer', layer);
      if (status) query = query.eq('status', status);
      if (quality_level) query = query.eq('quality_level', quality_level);
      if (appId) query = query.eq('app_id', appId);
      if (projectId) query = query.eq('project_id', projectId);
      if (createdBy) query = query.eq('created_by', createdBy);
      if (search) query = query.ilike('title', `%${search}%`);

      // Pagination et tri
      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Récupérer les créateurs séparément
      const creatorIds = [...new Set((data || []).filter(d => d.created_by).map(d => d.created_by))];
      let creatorsMap = {};

      if (creatorIds.length > 0) {
        const { data: creatorsData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', creatorIds);
        if (creatorsData) {
          creatorsMap = creatorsData.reduce((acc, p) => {
            acc[p.id] = { id: p.id, display_name: p.full_name, email: p.email };
            return acc;
          }, {});
        }
      }

      // Fusionner les données
      const mappedData = (data || []).map(doc => ({
        ...doc,
        creator: doc.created_by ? creatorsMap[doc.created_by] : null,
      }));

      return {
        data: mappedData,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] getDocuments error:', error);
      return { data: [], total: 0, error };
    }
  },

  /**
   * Récupère un document par son ID
   * @param {number} documentId - ID du document
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   * 
   * MIGRATION:
   * - documents → rag.documents
   * - source_files → sources.files
   * - profiles → core.profiles
   */
  async getDocumentById(documentId) {
    try {
      // Requête principale sans jointures
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      // Récupérer les données liées séparément
      let creator = null;
      let approver = null;
      let source_file = null;

      if (data?.created_by) {
        const { data: creatorData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', data.created_by)
          .single();
        if (creatorData) {
          creator = { id: creatorData.id, display_name: creatorData.full_name, email: creatorData.email };
        }
      }

      if (data?.approved_by) {
        const { data: approverData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', data.approved_by)
          .single();
        if (approverData) {
          approver = { id: approverData.id, display_name: approverData.full_name, email: approverData.email };
        }
      }

      if (data?.source_file_id) {
        const { data: fileData } = await supabase
          .from('files')
          .select('id, original_filename, mime_type, file_size')
          .eq('id', data.source_file_id)
          .single();
        source_file = fileData;
      }

      const mappedData = data ? {
        ...data,
        creator,
        approver,
        source_file,
      } : null;

      return { data: mappedData, error: null };
    } catch (error) {
      console.error('[documentsService] getDocumentById error:', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère les fichiers sources avec pagination
   * @param {Object} filters - Filtres
   * @param {Object} pagination - Pagination
   * @returns {Promise<{data: Array, total: number, error: Error|null}>}
   * 
   * MIGRATION:
   * - source_files → sources.files
   * - profiles!created_by → core.profiles
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

      // Requête principale sans jointures
      let query = supabase
        .from('files')
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
          processed_at
        `, { count: 'exact' });

      if (orgId) query = query.eq('org_id', orgId);
      if (layer) query = query.eq('layer', layer);
      if (processingStatus) query = query.eq('processing_status', processingStatus);

      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Récupérer les créateurs séparément
      const creatorIds = [...new Set((data || []).filter(d => d.created_by).map(d => d.created_by))];
      let creatorsMap = {};

      if (creatorIds.length > 0) {
        const { data: creatorsData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        if (creatorsData) {
          creatorsMap = creatorsData.reduce((acc, p) => {
            acc[p.id] = { id: p.id, display_name: p.full_name };
            return acc;
          }, {});
        }
      }

      // Fusionner les données
      const mappedData = (data || []).map(file => ({
        ...file,
        creator: file.created_by ? creatorsMap[file.created_by] : null,
      }));

      return {
        data: mappedData,
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
   * Vérifie si un fichier existe déjà (basé sur nom et taille)
   * @param {string} filename - Nom du fichier
   * @param {number} fileSize - Taille du fichier
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{isDuplicate: boolean, existingFile: Object|null, error: Error|null}>}
   * 
   * MIGRATION: source_files → sources.files
   */
  async checkDuplicate(filename, fileSize, orgId) {
    try {
      // Requête principale sans jointure
      const { data, error } = await supabase
        .from('files')
        .select(`
          id,
          original_filename,
          layer,
          created_at,
          created_by
        `)
        .eq('original_filename', filename)
        .eq('file_size', fileSize)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) throw error;

      // Récupérer le créateur séparément si nécessaire
      let creatorName = 'Inconnu';
      if (data?.created_by) {
        const { data: creatorData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.created_by)
          .single();
        if (creatorData?.full_name) {
          creatorName = creatorData.full_name;
        }
      }

      return {
        isDuplicate: !!data,
        existingFile: data ? {
          id: data.id,
          filename: data.original_filename,
          layer: data.layer,
          uploadedAt: data.created_at,
          uploadedBy: creatorName,
        } : null,
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] checkDuplicate error:', error);
      return { isDuplicate: false, existingFile: null, error };
    }
  },

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Approuve un document
   * @param {number} documentId - ID du document
   * @param {string} approvedBy - ID de l'utilisateur
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
   * 
   * MIGRATION: documents → rag.documents
   */
  async approveDocument(documentId, approvedBy) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data, error: null };
    } catch (error) {
      console.error('[documentsService] approveDocument error:', error);
      return { success: false, data: null, error };
    }
  },

  /**
   * Rejette un document
   * @param {number} documentId - ID du document
   * @param {string} rejectedBy - ID de l'utilisateur
   * @param {string} reason - Raison du rejet
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
   * 
   * MIGRATION: documents → rag.documents
   */
  async rejectDocument(documentId, rejectedBy, reason = '') {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          rejected_by: rejectedBy,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
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
   * Approuve plusieurs documents en lot
   * @param {number[]} documentIds - IDs des documents
   * @param {string} approvedBy - ID de l'utilisateur
   * @returns {Promise<{success: boolean, count: number, error: Error|null}>}
   * 
   * MIGRATION: documents → rag.documents
   */
  async bulkApprove(documentIds, approvedBy) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        })
        .in('id', documentIds)
        .select();

      if (error) throw error;

      return { success: true, count: data?.length || 0, error: null };
    } catch (error) {
      console.error('[documentsService] bulkApprove error:', error);
      return { success: false, count: 0, error };
    }
  },

  /**
   * Rejette plusieurs documents en lot
   * @param {number[]} documentIds - IDs des documents
   * @param {string} rejectedBy - ID de l'utilisateur
   * @param {string} reason - Raison du rejet
   * @returns {Promise<{success: boolean, count: number, error: Error|null}>}
   * 
   * MIGRATION: documents → rag.documents
   */
  async bulkReject(documentIds, rejectedBy, reason = '') {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          rejected_by: rejectedBy,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .in('id', documentIds)
        .select();

      if (error) throw error;

      return { success: true, count: data?.length || 0, error: null };
    } catch (error) {
      console.error('[documentsService] bulkReject error:', error);
      return { success: false, count: 0, error };
    }
  },

  // ==========================================================================
  // CHANGEMENT DE COUCHE
  // ==========================================================================

  /**
   * Change la couche d'un document (promotion/démotion)
   * @param {number} documentId - ID du document
   * @param {string} newLayer - Nouvelle couche
   * @param {string} changedBy - ID de l'utilisateur
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
   * 
   * MIGRATION: documents → rag.documents
   */
  async changeDocumentLayer(documentId, newLayer, changedBy) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          layer: newLayer,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data, error: null };
    } catch (error) {
      console.error('[documentsService] changeDocumentLayer error:', error);
      return { success: false, data: null, error };
    }
  },

  // ==========================================================================
  // SUPPRESSION
  // ==========================================================================

  /**
   * Supprime un document
   * @param {number} documentId - ID du document
   * @returns {Promise<{success: boolean, error: Error|null}>}
   * 
   * MIGRATION: documents → rag.documents
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
   * 
   * MIGRATION:
   * - documents → rag.documents
   * - source_files → sources.files
   */
  async deleteSourceFile(sourceFileId) {
    try {
      // D'abord supprimer les chunks associés
      const { count: deletedChunks, error: chunksError } = await supabase
        .from('documents')
        .delete({ count: 'exact' })
        .eq('source_file_id', sourceFileId);

      if (chunksError) throw chunksError;

      // Ensuite supprimer le fichier source
      const { error: fileError } = await supabase
        .from('files')                           // ← CHANGÉ: source_files → files
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
   * 
   * MIGRATION: bucket 'documents' → 'premium-sources'
   */
  async uploadToStorage(file, userId, layer = 'project') {
    try {
      const timestamp = Date.now();
      const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${layer}/${userId}/${timestamp}_${cleanFilename}`;

      const { data, error } = await supabase.storage
        .from('premium-sources')                 // ← CHANGÉ: documents → premium-sources
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
   * Upload complet d'un document (storage + metadata + processing)
   * @param {Object} params - Paramètres d'upload
   * @returns {Promise<{data: Object, path: string, error: Error|null}>}
   * 
   * MIGRATION:
   * - source_files → sources.files
   * - vertical_id → app_id
   */
  async uploadDocument(params) {
    const {
      file,
      layer,
      appId,                                     // ← CHANGÉ: verticalId → appId
      orgId,
      userId,
      projectId = null,
      metadata = {},
      qualityLevel = 'standard',
      status = 'pending',
    } = params;

    try {
      // 1. Calculer le hash du fichier
      const contentHash = await computeFileHash(file);

      // 2. Upload vers Storage
      const { path, error: uploadError } = await this.uploadToStorage(file, userId, layer);
      if (uploadError) throw uploadError;

      // 3. Créer l'entrée source file
      const { data: sourceFile, error: sourceError } = await supabase
        .from('files')
        .insert({
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          content_hash: contentHash,
          storage_path: path,
          storage_bucket: 'premium-sources',
          layer,
          app_id: appId,
          org_id: orgId,
          project_id: projectId,
          created_by: userId,
          processing_status: 'pending',
          metadata,
        })
        .select()
        .single();

      if (sourceError) throw sourceError;

      // L'Edge Function ingest-documents est déclenchée automatiquement
      // via un trigger database ou webhook après l'insertion dans sources.files

      return { data: sourceFile, path, error: null };
    } catch (error) {
      console.error('[documentsService] uploadDocument error:', error);
      return { data: null, path: null, error };
    }
  },

  // ==========================================================================
  // LÉGIFRANCE - SYNCHRONISATION
  // ==========================================================================

  /**
   * Synchronise des codes Légifrance vers la base RAG
   * @param {Object} params - Paramètres de synchronisation
   * @param {string[]} params.codeIds - IDs des codes à synchroniser
   * @param {string} params.appId - ID de l'app cible
   * @param {string} params.layer - Couche de destination
   * @returns {Promise<{data: Object, error: Error|null}>}
   * 
   * MIGRATION: verticalId → appId, target_verticals → target_apps
   */
  async syncLegifranceCodes(params) {
    const { codeIds, appId, layer } = params;    // ← CHANGÉ: verticalId → appId

    try {
      const results = [];
      const errors = [];

      for (const codeId of codeIds) {
        try {
          const { data, error } = await supabase.functions.invoke('trigger-legifrance-sync', {
            body: {
              code_id: codeId,
              sync_type: 'full',
              target_apps: appId ? [appId] : null,  // ← CHANGÉ: target_verticals → target_apps
              target_layer: layer || 'app',          // ← CHANGÉ: 'vertical' → 'app'
            },
          });

          if (error) {
            errors.push({ codeId, error: error.message });
          } else {
            results.push({ codeId, ...data });
          }
        } catch (err) {
          errors.push({ codeId, error: err.message });
        }
      }

      return {
        data: {
          success: errors.length === 0,
          synced: results.length,
          failed: errors.length,
          results,
          errors,
        },
        error: errors.length > 0 ? new Error(`${errors.length} codes failed`) : null,
      };
    } catch (error) {
      console.error('[documentsService] syncLegifranceCodes error:', error);
      return { data: null, error };
    }
  },
};

export default documentsService;
