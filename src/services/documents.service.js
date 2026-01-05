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
 * - Ajout storage_bucket dans payload webhook n8n
 * - Layer ajouté à la RACINE du payload (pas seulement metadata)
 * - target_layer → layer (renommé dans syncLegifranceCodes)
 * 
 * MODIFICATIONS 17/12/2025:
 * - projectId → projectIds (tableau) pour support multi-projets
 * - target_projects reçoit maintenant un tableau complet
 * 
 * MODIFICATIONS V2 (Phase 1.1):
 * - Ajout document_title à la RACINE du payload webhook
 * - Ajout category_slug à la RACINE du payload webhook
 * 
 * MODIFICATIONS 04/01/2026 - Intégration Edge Function:
 * - Suppression appel webhook N8N direct
 * - Ajout création job dans sources.ingestion_queue
 * - Appel Edge Function trigger-ingestion (flux unifié ARPET/Baikal)
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

/**
 * Normalise la valeur du layer (rétrocompatibilité)
 * @param {string} layer - Valeur brute
 * @returns {string} Valeur normalisée
 */
function normalizeLayer(layer) {
  if (layer === 'vertical') return 'app';
  return layer || 'org';
}

/**
 * Génère un filename_clean depuis le titre
 * @param {string} title - Titre du document
 * @param {string} originalFilename - Nom de fichier original
 * @returns {string} Filename nettoyé
 */
function generateFilenameClean(title, originalFilename) {
  if (!title) return originalFilename;
  
  // Extraire l'extension du fichier original
  const ext = originalFilename.split('.').pop()?.toLowerCase() || '';
  
  // Slugifier le titre
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^a-z0-9]+/g, '_')     // Remplacer caractères spéciaux par _
    .replace(/^_|_$/g, '')            // Supprimer _ en début/fin
    .substring(0, 100);               // Limiter la longueur
  
  return ext ? `${slug}.${ext}` : slug;
}

/**
 * Crée un job dans la queue d'ingestion
 * @param {string} fileId - ID du fichier source
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
async function createIngestionJob(fileId) {
  try {
    const { data, error } = await supabase
      .schema('sources')
      .from('ingestion_queue')
      .insert({
        file_id: fileId,
        status: 'queued',
        attempts: 0,
        max_attempts: 3,
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[documentsService] Ingestion job created:', data.id);
    return { data, error: null };
  } catch (error) {
    console.error('[documentsService] createIngestionJob error:', error);
    return { data: null, error };
  }
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
   */
  async getLayerStats(orgId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('layer, status, quality_level', { count: 'exact' })
        .eq('org_id', orgId);

      if (error) throw error;

      const stats = {
        app: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        org: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        project: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
        user: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
      };

      (data || []).forEach(doc => {
        const layer = normalizeLayer(doc.layer);
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
   * @param {string} layer - Couche cible ('app', 'org', 'project', 'user')
   * @param {Object} filters - Filtres
   * @param {Object} pagination - Pagination
   * @returns {Promise<{data: Array, total: number, error: Error|null}>}
   */
  async getDocumentsByLayer(layer, filters = {}, pagination = {}) {
    try {
      const normalizedLayer = normalizeLayer(layer);
      const { orgId, status, qualityLevel, appId, search } = filters;
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
          content,
          layer,
          status,
          quality_level,
          target_apps,
          target_projects,
          org_id,
          created_by,
          approved_by,
          created_at,
          updated_at,
          metadata
        `, { count: 'exact' })
        .eq('layer', normalizedLayer);

      if (orgId) query = query.eq('org_id', orgId);
      if (status) query = query.eq('status', status);
      if (qualityLevel) query = query.eq('quality_level', qualityLevel);
      if (appId) query = query.contains('target_apps', [appId]);
      if (search) query = query.ilike('content', `%${search}%`);

      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      return { data: data || [], total: count || 0, error: null };
    } catch (error) {
      console.error('[documentsService] getDocumentsByLayer error:', error);
      return { data: [], total: 0, error };
    }
  },

  /**
   * Récupère un document par son ID avec les relations
   * @param {string} documentId - ID du document
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async getDocumentById(documentId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) throw error;

      // Récupérer les profils associés
      let creator = null;
      let approver = null;
      let source_file = null;

      if (data.created_by) {
        const { data: creatorData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', data.created_by)
          .single();
        creator = creatorData;
      }

      if (data.approved_by) {
        const { data: approverData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', data.approved_by)
          .single();
        approver = approverData;
      }

      if (data.source_file_id) {
        const { data: fileData } = await supabase
          .from('files')
          .select('id, original_filename, storage_path, storage_bucket')
          .eq('id', data.source_file_id)
          .single();
        source_file = fileData;
      }

      const mappedData = data ? {
        ...data,
        layer: normalizeLayer(data.layer),
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

  // ==========================================================================
  // GESTION DU STATUT
  // ==========================================================================

  /**
   * Approuve un document
   * @param {string} documentId - ID du document
   * @param {string} approverId - ID de l'approbateur
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async approveDocument(documentId, approverId) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'approved',
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[documentsService] approveDocument error:', error);
      return { data: null, error };
    }
  },

  /**
   * Rejette un document
   * @param {string} documentId - ID du document
   * @param {string} rejecterId - ID du rejeteur
   * @param {string} reason - Raison du rejet
   * @returns {Promise<{data: Object, error: Error|null}>}
   */
  async rejectDocument(documentId, rejecterId, reason = '') {
    try {
      const { data: currentDoc } = await supabase
        .from('documents')
        .select('metadata')
        .eq('id', documentId)
        .single();

      const updatedMetadata = {
        ...(currentDoc?.metadata || {}),
        rejection_reason: reason,
      };

      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          approved_by: rejecterId,
          approved_at: new Date().toISOString(),
          metadata: updatedMetadata,
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('[documentsService] rejectDocument error:', error);
      return { data: null, error };
    }
  },

  // ==========================================================================
  // SUPPRESSION
  // ==========================================================================

  /**
   * Supprime un document et ses chunks associés
   * @param {string} documentId - ID du document
   * @returns {Promise<{success: boolean, deletedChunks: number, error: Error|null}>}
   */
  async deleteDocument(documentId) {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      return { success: true, deletedChunks: 0, error: null };
    } catch (error) {
      console.error('[documentsService] deleteDocument error:', error);
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
   * @param {string} bucket - Nom du bucket
   * @returns {Promise<{path: string, error: Error|null}>}
   */
  async uploadToStorage(file, userId, layer = 'org', bucket = 'premium-sources') {
    try {
      const normalizedLayer = normalizeLayer(layer);
      const timestamp = Date.now();
      const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${normalizedLayer}/${userId}/${timestamp}_${cleanFilename}`;

      const { data, error } = await supabase.storage
        .from(bucket)
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
   * Upload complet d'un document (storage + metadata + Edge Function ingestion)
   * ============================================================================
   * FLUX UNIFIÉ ARPET / BAIKAL CONSOLE (04/01/2026)
   * 
   * 1. Upload vers Storage (premium-sources)
   * 2. Insert sources.files (processing_status: 'pending')
   * 3. Insert sources.ingestion_queue (status: 'queued')
   * 4. Appel Edge Function trigger-ingestion
   * 
   * En cas d'erreur à l'étape 4, le fichier reste uploadé et le job
   * peut être relancé via la page /admin/ingestion
   * ============================================================================
   * @param {Object} params - Paramètres d'upload
   * @param {File} params.file - Fichier à uploader
   * @param {string} params.layer - Couche cible ('app', 'org', 'project')
   * @param {string} params.appId - ID de l'application
   * @param {string} params.orgId - ID de l'organisation
   * @param {string} params.userId - ID de l'utilisateur
   * @param {Array<string>} [params.projectIds] - IDs des projets cibles (tableau)
   * @param {Object} [params.metadata] - Métadonnées du document
   * @param {string} [params.qualityLevel='premium'] - Niveau de qualité
   * @param {string} [params.status='approved'] - Statut initial
   * @param {string} [params.bucket='premium-sources'] - Bucket de stockage
   * @returns {Promise<{data: Object, path: string, error: Error|null}>}
   */
  async uploadDocument(params) {
    const {
      file,
      layer,
      appId,
      orgId,
      userId,
      projectIds = null,
      metadata = {},
      qualityLevel = 'premium',
      status = 'approved',
      bucket = 'premium-sources',
    } = params;

    // Normaliser le layer (vertical → app)
    const normalizedLayer = normalizeLayer(layer);

    // Normaliser projectIds en tableau
    const normalizedProjectIds = Array.isArray(projectIds) 
      ? projectIds.filter(Boolean) 
      : (projectIds ? [projectIds] : []);

    // V2: Extraire document_title et category_slug depuis metadata
    const documentTitle = metadata.title || null;
    const categorySlug = metadata.category || null;
    
    // V2: Générer filename_clean depuis le titre
    const filenameClean = generateFilenameClean(documentTitle, file.name);

    try {
      // =========================================================================
      // ÉTAPE 1: Calculer le hash du fichier
      // =========================================================================
      const contentHash = await computeFileHash(file);

      // =========================================================================
      // ÉTAPE 2: Upload vers Storage
      // =========================================================================
      const { path, error: uploadError } = await this.uploadToStorage(file, userId, normalizedLayer, bucket);
      if (uploadError) throw uploadError;

      // =========================================================================
      // ÉTAPE 3: Créer l'entrée source file (processing_status: 'pending')
      // =========================================================================
      const { data: sourceFile, error: sourceError } = await supabase
        .schema('sources')
        .from('files')
        .insert({
          original_filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          content_hash: contentHash,
          storage_path: path,
          storage_bucket: bucket,
          layer: normalizedLayer,
          app_id: appId,
          org_id: orgId,
          project_id: normalizedProjectIds[0] || null,
          created_by: userId,
          processing_status: 'pending',
          metadata: {
            ...metadata,
            target_project_ids: normalizedProjectIds.length > 0 ? normalizedProjectIds : undefined,
            document_title: documentTitle,
            category_slug: categorySlug,
            filename_clean: filenameClean,
          },
        })
        .select()
        .single();

      if (sourceError) throw sourceError;

      console.log('[documentsService] Source file created:', sourceFile.id);

      // =========================================================================
      // ÉTAPE 4: Créer le job dans la queue d'ingestion
      // =========================================================================
      const { data: ingestionJob, error: jobError } = await createIngestionJob(sourceFile.id);
      
      if (jobError) {
        console.error('[documentsService] Failed to create ingestion job:', jobError);
        // On continue quand même - le fichier est uploadé, retry possible via admin
      }

      // =========================================================================
      // ÉTAPE 5: Appeler l'Edge Function trigger-ingestion
      // =========================================================================
      if (ingestionJob) {
        try {
          const triggerPayload = {
            // Champs directs attendus par Edge Function
            queue_id: ingestionJob.id,
            file_id: sourceFile.id,
            filename: file.name,
            storage_bucket: bucket,
            storage_path: path,
            mime_type: file.type,
            layer: normalizedLayer,
            org_id: orgId,
            project_id: normalizedProjectIds[0] || null,
            created_by: userId,
            app_id: appId,
            
            // Metadata complète pour N8N
            metadata: {
              ...metadata,
              document_title: documentTitle,
              category_slug: categorySlug,
              filename_clean: filenameClean,
              quality_level: qualityLevel,
              file_size: file.size,
              target_project_ids: normalizedProjectIds.length > 0 ? normalizedProjectIds : undefined,
            },
          };

          console.log('[documentsService] Calling trigger-ingestion with payload:', triggerPayload);

          const { data: fnData, error: fnError } = await supabase.functions.invoke('trigger-ingestion', {
            body: triggerPayload,
          });

          if (fnError) {
            console.error('[documentsService] Edge Function error:', fnError);
            // Non bloquant - le job reste en queue, retry possible via admin
          } else {
            console.log('[documentsService] Edge Function response:', fnData);
          }
        } catch (fnException) {
          console.error('[documentsService] Edge Function exception:', fnException);
          // Non bloquant - le job reste en queue, retry possible via admin
        }
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
   * ============================================================================
   * IMPORTANT: Utilise 'layer' (pas 'target_layer') pour le payload
   * ============================================================================
   */
  async syncLegifranceCodes(params) {
    const { codeIds, appId, layer } = params;

    // Normaliser le layer
    const normalizedLayer = normalizeLayer(layer) || 'app';

    try {
      const results = [];
      const errors = [];

      for (const codeId of codeIds) {
        try {
          const { data, error } = await supabase.functions.invoke('trigger-legifrance-sync', {
            body: {
              code_id: codeId,
              sync_type: 'full',
              target_apps: appId ? [appId] : null,
              layer: normalizedLayer,
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

  // ==========================================================================
  // FICHIERS SOURCES
  // ==========================================================================

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
        .schema('sources')
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
      if (layer) query = query.eq('layer', normalizeLayer(layer));
      if (processingStatus) query = query.eq('processing_status', processingStatus);

      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      // Récupérer les créateurs
      const creatorIds = [...new Set((data || []).filter(d => d.created_by).map(d => d.created_by))];
      let creatorsMap = {};

      if (creatorIds.length > 0) {
        const { data: creatorsData } = await supabase
          .schema('core')
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

      const mappedData = (data || []).map(file => ({
        ...file,
        layer: normalizeLayer(file.layer),
        creator: file.created_by ? creatorsMap[file.created_by] : null,
      }));

      return { data: mappedData, total: count || 0, error: null };
    } catch (error) {
      console.error('[documentsService] getSourceFiles error:', error);
      return { data: [], total: 0, error };
    }
  },

  // ==========================================================================
  // VÉRIFICATION DE DOUBLONS
  // ==========================================================================

  /**
   * Vérifie si un fichier existe déjà (par hash)
   * @param {string} contentHash - Hash SHA-256 du fichier
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{isDuplicate: boolean, existingFile: Object|null, error: Error|null}>}
   */
  async checkDuplicate(contentHash, orgId) {
    try {
      const { data, error } = await supabase
        .schema('sources')
        .from('files')
        .select('id, original_filename, created_at, created_by')
        .eq('content_hash', contentHash)
        .eq('org_id', orgId)
        .limit(1);

      if (error) throw error;

      return {
        isDuplicate: data && data.length > 0,
        existingFile: data?.[0] || null,
        error: null,
      };
    } catch (error) {
      console.error('[documentsService] checkDuplicate error:', error);
      return { isDuplicate: false, existingFile: null, error };
    }
  },

  /**
   * Vérifie un fichier avant upload (calcule le hash et vérifie les doublons)
   * @param {File} file - Fichier à vérifier
   * @param {string} orgId - ID de l'organisation
   * @returns {Promise<{isDuplicate: boolean, existingFile: Object|null, contentHash: string, error: Error|null}>}
   */
  async checkFileBeforeUpload(file, orgId) {
    try {
      const contentHash = await computeFileHash(file);
      const { isDuplicate, existingFile, error } = await this.checkDuplicate(contentHash, orgId);

      if (error) throw error;

      return { isDuplicate, existingFile, contentHash, error: null };
    } catch (error) {
      console.error('[documentsService] checkFileBeforeUpload error:', error);
      return { isDuplicate: false, existingFile: null, contentHash: null, error };
    }
  },
};

export default documentsService;
