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
 * @example
 * import { storageService, STORAGE_BUCKETS } from '@/services';
 * 
 * const { url, error } = await storageService.uploadFile(STORAGE_BUCKETS.PREMIUM_SOURCES, file);
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
   * Upload un fichier avec génération automatique du chemin
   * @param {string} bucket - Nom du bucket
   * @param {File} file - Fichier à uploader
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<{data: Object|null, path: string|null, error: Error|null}>}
   */
  async uploadFileAuto(bucket, file, userId) {
    const actualBucket = this._migrateBucketName(bucket);

    try {
      // Génère un chemin unique
      const timestamp = Date.now();
      const sanitizedFileName = this.sanitizeFileName(file.name);
      const path = `${userId}/${timestamp}_${sanitizedFileName}`;

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
};

export default storageService;
