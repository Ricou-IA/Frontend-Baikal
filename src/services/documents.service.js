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
      const { data, error } = await supabase
        .from('documents')
        .select('layer, status, quality_level', { count: 'exact' })
        .eq('org_id', orgId);

      if (error) throw error;

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
   * @param {Object} pagination - Options de pagination
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

      let query = supabase
        .from('documents')
        .select(`
          id,
          title,
          content,
          layer,
          status,
          quality_level,
          vertical_id,
          org_id,
          project_id,
          created_by,
          created_at,
          updated_at,
          approved_at,
          approved_by,
          metadata,
          source_file_id,
          creator:profiles!created_by(id, display_name, email)
        `, { count: 'exact' });

      // Filtres
      if (orgId) query = query.eq('org_id', orgId);
      if (layer) query = query.eq('layer', layer);
      if (status) query = query.eq('status', status);
      if (quality_level) query = query.eq('quality_level', quality_level);
      if (verticalId) query = query.eq('vertical_id', verticalId);
      if (projectId) query = query.eq('project_id', projectId);
      if (createdBy) query = query.eq('created_by', createdBy);
      if (search) query = query.ilike('title', `%${search}%`);

      // Pagination et tri
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
      return { data: [], total: 0, error };
    }
  },

  /**
   * Récupère un document par son ID
   * @param {number} documentId - ID du document
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async getDocumentById(documentId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          creator:profiles!created_by(id, display_name, email),
          approver:profiles!approved_by(id, display_name, email),
          source_file:source_files(id, original_filename, mime_type, file_size)
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

  /**
   * Récupère les fichiers sources avec pagination
   * @param {Object} filters - Filtres
   * @param {Object} pagination - Pagination
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
          creator:profiles!created_by(id, display_name)
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
   * Vérifie si un fichier existe déjà (basé sur nom et taille)
   * @param {string} filename - Nom du fichier
   * @param {number} fileSize - Taille du fichier
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{isDuplicate: boolean, existingFile: Object|null, error: Error|null}>}
   */
  async checkDuplicate(filename, fileSize, orgId) {
    try {
      const { data, error } = await supabase
        .from('source_files')
        .select(`
          id,
          original_filename,
          layer,
          created_at,
          creator:profiles!created_by(display_name)
        `)
        .eq('original_filename', filename)
        .eq('file_size', fileSize)
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
   * @param {string} rejectedBy - ID de l'utilisateur qui rejette
   * @param {string} reason - Raison du rejet
   * @returns {Promise<{success: boolean, data: Object, error: Error|null}>}
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
      const { count: deletedChunks, error: chunksError } = await supabase
        .from('documents')
        .delete({ count: 'exact' })
        .eq('source_file_id', sourceFileId);

      if (chunksError) throw chunksError;

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
   * Upload complet d'un document (storage + metadata + processing)
   * @param {Object} params - Paramètres d'upload
   * @returns {Promise<{data: Object, path: string, error: Error|null}>}
   */
  async uploadDocument(params) {
    const {
      file,
      layer,
      verticalId,
      orgId,
      userId,
      projectId = null,
      metadata = {},
      qualityLevel = 'standard',
      status = 'pending',
    } = params;

    try {
      // 1. Upload vers Storage
      const { path, error: uploadError } = await this.uploadToStorage(file, userId, layer);
      if (uploadError) throw uploadError;

      // 2. Créer l'entrée source_file
      const { data: sourceFile, error: sourceError } = await supabase
        .from('source_files')
        .insert({
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          storage_path: path,
          layer,
          vertical_id: verticalId,
          org_id: orgId,
          project_id: projectId,
          created_by: userId,
          processing_status: 'pending',
          metadata,
        })
        .select()
        .single();

      if (sourceError) throw sourceError;

      // 3. Déclencher le traitement (Edge Function)
      const { error: processError } = await supabase.functions.invoke('process-document', {
        body: {
          sourceFileId: sourceFile.id,
          qualityLevel,
          extractToc: metadata.extractToc || false,
        },
      });

      if (processError) {
        console.warn('[documentsService] Processing trigger failed:', processError);
      }

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
   * Utilise l'Edge Function "trigger-legifrance-sync" qui appelle n8n
   * 
   * @param {Object} params - Paramètres de synchronisation
   * @param {string[]} params.codeIds - IDs des codes à synchroniser
   * @param {string} params.verticalId - ID de la verticale cible
   * @param {string} params.layer - Couche de destination
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async syncLegifranceCodes(params) {
    const { codeIds, verticalId, layer } = params;

    try {
      // Si plusieurs codes, on les traite séquentiellement
      // L'Edge Function attend un code_id singulier
      const results = [];
      const errors = [];

      for (const codeId of codeIds) {
        try {
          // ✅ CORRIGÉ : Appel à "trigger-legifrance-sync" au lieu de "sync-legifrance"
          const { data, error } = await supabase.functions.invoke('trigger-legifrance-sync', {
            body: {
              code_id: codeId,           // L'Edge Function attend code_id (singulier)
              sync_type: 'full',
              target_verticals: verticalId ? [verticalId] : null,
              layer: layer,
            },
          });

          if (error) {
            console.warn(`[documentsService] Sync failed for code ${codeId}:`, error);
            errors.push({ codeId, error: error.message });
          } else {
            results.push({ codeId, success: true, ...data });
          }
        } catch (err) {
          errors.push({ codeId, error: err.message });
        }
      }

      // Résumé du résultat
      const allSuccess = errors.length === 0;
      const partialSuccess = results.length > 0 && errors.length > 0;

      return { 
        data: {
          success: allSuccess,
          partialSuccess,
          syncedCodes: results.length,
          failedCodes: errors.length,
          results,
          errors: errors.length > 0 ? errors : undefined,
        }, 
        error: allSuccess ? null : new Error(`${errors.length} code(s) failed to sync`)
      };

    } catch (error) {
      console.error('[documentsService] syncLegifranceCodes error:', error);
      
      // Améliorer le message d'erreur
      let errorMessage = error.message || 'Erreur lors de la synchronisation';
      
      if (error.message?.includes('Failed to send a request')) {
        errorMessage = 'Impossible de contacter l\'Edge Function. Vérifiez que "trigger-legifrance-sync" est déployée.';
      } else if (error.message?.includes('Function not found')) {
        errorMessage = 'L\'Edge Function "trigger-legifrance-sync" n\'est pas trouvée. Vérifiez le déploiement.';
      } else if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
        errorMessage = 'Vous n\'avez pas les permissions nécessaires (super_admin requis).';
      } else if (error.message?.includes('403')) {
        errorMessage = 'Accès refusé. Seuls les super_admin peuvent synchroniser les codes Légifrance.';
      }
      
      return { data: null, error: new Error(errorMessage) };
    }
  },

  /**
   * Synchronise un seul code Légifrance (méthode simplifiée)
   * @param {string} codeId - ID du code Légifrance (ex: "LEGITEXT000006074075")
   * @param {Object} options - Options de synchronisation
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async syncSingleLegifranceCode(codeId, options = {}) {
    const { verticalId, layer = 'vertical', syncType = 'full' } = options;

    try {
      const { data, error } = await supabase.functions.invoke('trigger-legifrance-sync', {
        body: {
          code_id: codeId,
          sync_type: syncType,
          target_verticals: verticalId ? [verticalId] : null,
          layer,
        },
      });

      if (error) throw error;

      return { 
        data: {
          success: true,
          codeId,
          ...data,
        }, 
        error: null 
      };
    } catch (error) {
      console.error('[documentsService] syncSingleLegifranceCode error:', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère le statut d'un job de synchronisation Légifrance
   * @param {string} jobId - ID du job
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async getLegifranceSyncStatus(jobId) {
    try {
      const { data, error } = await supabase
        .schema('legifrance')
        .from('sync_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('[documentsService] getLegifranceSyncStatus error:', error);
      return { data: null, error };
    }
  },

  /**
   * Récupère l'historique des synchronisations Légifrance
   * @param {Object} filters - Filtres optionnels
   * @returns {Promise<{data: Array, error: Error|null}>}
   */
  async getLegifranceSyncHistory(filters = {}) {
    try {
      let query = supabase
        .schema('legifrance')
        .from('sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit || 50);

      if (filters.codeId) {
        query = query.eq('code_id', filters.codeId);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: data || [], error: null };
    } catch (error) {
      console.error('[documentsService] getLegifranceSyncHistory error:', error);
      return { data: [], error };
    }
  },
};

export default documentsService;
