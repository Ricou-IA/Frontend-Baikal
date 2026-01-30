/**
 * Storage Service - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - Base de données Baikal v2
 * 
 * MODIFICATIONS APPORTÉES (BUCKETS):
 * - 'documents' → 'premium-sources' (bucket principal pour documents premium)
 * - 'baikal-workspace' → 'user-workspace' (workspace utilisateur)
 * - 'project-recordings' → supprimé (fusionné dans 'user-workspace')
 * - 'invoices' → conservé tel quel
 * - 'avatars' → conservé tel quel
 * 
 * v2.1.0 - Ajout support customFileName pour filename_clean
 * v2.2.0 - Restructuration des paths par layer/org/project
 *          Path format: {layer}/{org_id}/{project_id|user_id}/{timestamp}_{filename}
 * 
 * @example
 * import { storageService, STORAGE_BUCKETS } from '@/services';
 * 
 * // Upload avec contexte complet (v2.2.0+)
 * const { url, error } = await storageService.uploadFileAuto(
 *   STORAGE_BUCKETS.PREMIUM_SOURCES, 
 *   file,
 *   { userId: 'xxx', orgId: 'yyy', projectId: 'zzz', layer: 'project' }
 * );
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// ============================================================================
// BUCKETS DISPONIBLES
// ============================================================================

/**
 * Constantes des buckets Storage
 * 
 * MIGRATION:
 * - DOCUMENTS → PREMIUM_SOURCES (renommé)
 * - Ajout WORKSPACE (nouveau nom)
 * - RECORDINGS → supprimé (fusionné dans WORKSPACE)
 */
export const STORAGE_BUCKETS = {
  // Buckets renommés
  PREMIUM_SOURCES: 'premium-sources',            // ← CHANGÉ: documents → premium-sources
  WORKSPACE: 'user-workspace',                   // ← CHANGÉ: baikal-workspace → user-workspace
  
  // Buckets conservés
  INVOICES: 'invoices',
  AVATARS: 'avatars',
  
  // Alias pour compatibilité (deprecated)
  /** @deprecated Utiliser PREMIUM_SOURCES */
  DOCUMENTS: 'premium-sources',
  /** @deprecated Utiliser WORKSPACE */
  RECORDINGS: 'user-workspace',                  // ← CHANGÉ: project-recordings fusionné
};

// ============================================================================
// SERVICE STORAGE
// ============================================================================

/**
 * Service de stockage
 */
export const storageService = {
  /**
   * Upload un fichier dans un bucket
   * @param {string} bucket - Nom du bucket
   * @param {string} path - Chemin du fichier dans le bucket
   * @param {File} file - Fichier à uploader
   * @param {Object} options - Options d'upload
   * @param {string} options.cacheControl - Cache control header
   * @param {boolean} options.upsert - Remplacer si existe
   * @returns {Promise<{data: Object|null, error: Error|null}>}
   */
  async uploadFile(bucket, path, file, options = {}) {
    const {
      cacheControl = '3600',
      upsert = false,
    } = options;

    // Migration automatique des anciens noms de buckets
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { data, error } = await supabase
        .storage
        .from(actualBucket)
        .upload(path, file, {
          cacheControl,
          upsert,
        });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Upload un fichier avec génération automatique du chemin structuré
   * 
   * v2.2.0: Nouveau format de path structuré par layer/org/project
   * 
   * @param {string} bucket - Nom du bucket
   * @param {File} file - Fichier à uploader
   * @param {Object|string} context - Contexte d'upload (ou userId pour rétrocompat)
   * @param {string} context.userId - ID de l'utilisateur (requis)
   * @param {string} [context.orgId] - ID de l'organisation
   * @param {string} [context.projectId] - ID du projet (requis si layer='project')
   * @param {string} [context.layer='user'] - Layer cible: 'app', 'org', 'project', 'user'
   * @param {Object} options - Options d'upload
   * @param {string} [options.customFileName] - Nom personnalisé (filename_clean)
   * @returns {Promise<{data: Object|null, path: string|null, error: Error|null}>}
   * 
   * @example
   * // Upload document projet (v2.2.0+)
   * const { path } = await storageService.uploadFileAuto(
   *   STORAGE_BUCKETS.PREMIUM_SOURCES, 
   *   file,
   *   { 
   *     userId: 'user-uuid', 
   *     orgId: 'org-uuid', 
   *     projectId: 'project-uuid', 
   *     layer: 'project' 
   *   },
   *   { customFileName: 'CCAG-Travaux-2021.pdf' }
   * );
   * // → path: "project/org-uuid/project-uuid/1769209168406_CCAG-Travaux-2021.pdf"
   * 
   * @example
   * // Upload document personnel
   * const { path } = await storageService.uploadFileAuto(
   *   STORAGE_BUCKETS.PREMIUM_SOURCES, 
   *   file,
   *   { userId: 'user-uuid', orgId: 'org-uuid', layer: 'user' }
   * );
   * // → path: "user/org-uuid/user-uuid/1769209168406_document.pdf"
   * 
   * @example
   * // Rétrocompatibilité (deprecated) - userId string
   * const { path } = await storageService.uploadFileAuto(bucket, file, 'user-uuid');
   * // → path: "user-uuid/1769209168406_document.pdf" (ancien format)
   */
  async uploadFileAuto(bucket, file, context, options = {}) {
    const actualBucket = this._migrateBucketName(bucket);
    const { customFileName } = options;

    try {
      // Génère un chemin unique avec timestamp
      const timestamp = Date.now();
      
      // Utilise customFileName si fourni, sinon fallback sur le nom original
      const fileName = customFileName 
        ? this.sanitizeFileName(customFileName)
        : this.sanitizeFileName(file.name);
      
      // Génère le path selon le contexte
      const path = this._buildStoragePath(context, timestamp, fileName);

      const { data, error } = await this.uploadFile(actualBucket, path, file);

      if (error) throw error;
      return { data, path, error: null };
    } catch (error) {
      return { data: null, path: null, error };
    }
  },

  /**
   * Récupère l'URL publique d'un fichier
   * @param {string} bucket - Nom du bucket
   * @param {string} path - Chemin du fichier
   * @returns {string} - URL publique
   */
  getPublicUrl(bucket, path) {
    const actualBucket = this._migrateBucketName(bucket);

    const { data } = supabase
      .storage
      .from(actualBucket)
      .getPublicUrl(path);

    return data?.publicUrl || null;
  },

  /**
   * Génère une URL signée (temporaire) pour un fichier
   * @param {string} bucket - Nom du bucket
   * @param {string} path - Chemin du fichier
   * @param {number} expiresIn - Durée de validité en secondes (défaut: 1 heure)
   * @returns {Promise<{signedUrl: string|null, error: Error|null}>}
   */
  async getSignedUrl(bucket, path, expiresIn = 3600) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { data, error } = await supabase
        .storage
        .from(actualBucket)
        .createSignedUrl(path, expiresIn);

      if (error) throw error;
      return { signedUrl: data?.signedUrl, error: null };
    } catch (error) {
      return { signedUrl: null, error };
    }
  },

  /**
   * Supprime un fichier
   * @param {string} bucket - Nom du bucket
   * @param {string} path - Chemin du fichier
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async deleteFile(bucket, path) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { error } = await supabase
        .storage
        .from(actualBucket)
        .remove([path]);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Supprime plusieurs fichiers
   * @param {string} bucket - Nom du bucket
   * @param {string[]} paths - Chemins des fichiers
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async deleteFiles(bucket, paths) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { error } = await supabase
        .storage
        .from(actualBucket)
        .remove(paths);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Liste les fichiers dans un dossier
   * @param {string} bucket - Nom du bucket
   * @param {string} folder - Chemin du dossier
   * @param {Object} options - Options de listage
   * @param {number} options.limit - Limite de résultats
   * @param {number} options.offset - Offset pour pagination
   * @returns {Promise<{files: Array, error: Error|null}>}
   */
  async listFiles(bucket, folder = '', options = {}) {
    const { limit = 100, offset = 0 } = options;
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { data, error } = await supabase
        .storage
        .from(actualBucket)
        .list(folder, {
          limit,
          offset,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;
      return { files: data || [], error: null };
    } catch (error) {
      return { files: [], error };
    }
  },

  /**
   * Déplace un fichier
   * @param {string} bucket - Nom du bucket
   * @param {string} fromPath - Chemin source
   * @param {string} toPath - Chemin destination
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async moveFile(bucket, fromPath, toPath) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { error } = await supabase
        .storage
        .from(actualBucket)
        .move(fromPath, toPath);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Copie un fichier
   * @param {string} bucket - Nom du bucket
   * @param {string} fromPath - Chemin source
   * @param {string} toPath - Chemin destination
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async copyFile(bucket, fromPath, toPath) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { error } = await supabase
        .storage
        .from(actualBucket)
        .copy(fromPath, toPath);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Télécharge un fichier
   * @param {string} bucket - Nom du bucket
   * @param {string} path - Chemin du fichier
   * @returns {Promise<{data: Blob|null, error: Error|null}>}
   */
  async downloadFile(bucket, path) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const { data, error } = await supabase
        .storage
        .from(actualBucket)
        .download(path);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  /**
   * Sanitize un nom de fichier
   * @param {string} fileName - Nom du fichier
   * @returns {string} - Nom sanitisé
   */
  sanitizeFileName(fileName) {
    return fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Remplace caractères spéciaux
      .replace(/_+/g, '_'); // Évite les underscores multiples
  },

  /**
   * Vérifie si un fichier existe
   * @param {string} bucket - Nom du bucket
   * @param {string} path - Chemin du fichier
   * @returns {Promise<boolean>}
   */
  async fileExists(bucket, path) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      const folder = path.substring(0, path.lastIndexOf('/'));
      const fileName = path.substring(path.lastIndexOf('/') + 1);

      const { data, error } = await supabase
        .storage
        .from(actualBucket)
        .list(folder);

      if (error) return false;

      return data?.some(file => file.name === fileName) || false;
    } catch {
      return false;
    }
  },

  /**
   * Valide un fichier avant upload
   * @param {File} file - Fichier à valider
   * @param {Object} options - Options de validation
   * @param {number} options.maxSize - Taille max en MB
   * @param {string[]} options.acceptedTypes - Types MIME acceptés
   * @returns {{valid: boolean, error: string|null}}
   */
  validateFile(file, options = {}) {
    const {
      maxSize = 20, // MB
      acceptedTypes = null,
    } = options;

    // Vérifie la taille
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      return {
        valid: false,
        error: `Fichier trop volumineux (${fileSizeMB.toFixed(1)} MB). Maximum: ${maxSize} MB`,
      };
    }

    // Vérifie le type
    if (acceptedTypes && !acceptedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Type de fichier non supporté: ${file.type}`,
      };
    }

    return { valid: true, error: null };
  },

  // ==========================================================================
  // HELPERS PRIVÉS
  // ==========================================================================

  /**
   * Migre automatiquement les anciens noms de buckets vers les nouveaux
   * @private
   * @param {string} bucket - Nom du bucket (ancien ou nouveau)
   * @returns {string} - Nom du bucket actuel
   */
  _migrateBucketName(bucket) {
    const migrations = {
      'documents': 'premium-sources',
      'baikal-workspace': 'user-workspace',
      'project-recordings': 'user-workspace',    // Fusionné dans user-workspace
    };

    if (migrations[bucket]) {
      console.warn(`[StorageService] Bucket "${bucket}" migré vers "${migrations[bucket]}". Mettez à jour votre code.`);
      return migrations[bucket];
    }

    return bucket;
  },

  /**
   * Construit le chemin de stockage selon le contexte
   * 
   * v2.2.0: Nouvelle structure de paths par layer
   * 
   * Structure des paths:
   * - app:     app/{org_id}/{timestamp}_{filename}
   * - org:     org/{org_id}/{timestamp}_{filename}
   * - project: project/{org_id}/{project_id}/{timestamp}_{filename}
   * - user:    user/{org_id}/{user_id}/{timestamp}_{filename}
   * 
   * @private
   * @param {Object|string} context - Contexte d'upload ou userId (rétrocompat)
   * @param {string} context.userId - ID utilisateur (requis)
   * @param {string} [context.orgId] - ID organisation
   * @param {string} [context.projectId] - ID projet
   * @param {string} [context.layer='user'] - Layer cible
   * @param {number} timestamp - Timestamp pour unicité
   * @param {string} fileName - Nom du fichier sanitisé
   * @returns {string} - Chemin complet
   */
  _buildStoragePath(context, timestamp, fileName) {
    // Rétrocompatibilité: si context est une string, c'est l'ancien format (userId seul)
    if (typeof context === 'string') {
      console.warn('[StorageService] Format deprecated: uploadFileAuto(bucket, file, userId). Utilisez le format context object.');
      return `${context}/${timestamp}_${fileName}`;
    }

    const { userId, orgId, projectId, layer = 'user' } = context;

    // Validation
    if (!userId) {
      console.error('[StorageService] userId requis dans le contexte');
      throw new Error('userId requis pour uploadFileAuto');
    }

    // Fallback pour orgId si non fourni
    const safeOrgId = orgId || 'no-org';

    // Construction du path selon le layer
    switch (layer) {
      case 'app':
        // Documents métier globaux: app/{org_id}/{timestamp}_{filename}
        return `app/${safeOrgId}/${timestamp}_${fileName}`;

      case 'org':
        // Documents organisation: org/{org_id}/{timestamp}_{filename}
        return `org/${safeOrgId}/${timestamp}_${fileName}`;

      case 'project':
        // Documents projet: project/{org_id}/{project_id}/{timestamp}_{filename}
        if (!projectId) {
          console.warn('[StorageService] projectId manquant pour layer "project", fallback sur userId');
          return `project/${safeOrgId}/${userId}/${timestamp}_${fileName}`;
        }
        return `project/${safeOrgId}/${projectId}/${timestamp}_${fileName}`;

      case 'user':
      default:
        // Documents personnels: user/{org_id}/{user_id}/{timestamp}_{filename}
        return `user/${safeOrgId}/${userId}/${timestamp}_${fileName}`;
    }
  },
};

export default storageService;
