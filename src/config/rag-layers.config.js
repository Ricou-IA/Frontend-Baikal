// ============================================================================
// RAG LAYERS CONFIG - Phase 3 Frontend (Baikal Console)
// ============================================================================
// Constantes et configuration pour le système RAG multicouche
// 
// MIGRATION v2.0 - Décembre 2025
// - DocumentLayer.VERTICAL → DocumentLayer.APP
// - Alias maintenus pour compatibilité
// ============================================================================

// ============================================================================
// ENUMS - Valeurs possibles (correspondent aux types PostgreSQL)
// ============================================================================

/**
 * Couches documentaires
 * MIGRATION: 'vertical' → 'app' dans la DB mais on garde les deux
 * @readonly
 * @enum {string}
 */
export const DocumentLayer = {
  APP: 'app',           // Nouveau nom (valeur DB)
  VERTICAL: 'app',      // Alias pour compatibilité (pointe vers 'app')
  ORG: 'org',
  PROJECT: 'project',
  USER: 'user',
};

/**
 * Statuts de validation
 * @readonly
 * @enum {string}
 */
export const DocumentStatus = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

/**
 * Niveaux de qualité
 * @readonly
 * @enum {string}
 */
export const DocumentQualityLevel = {
  STANDARD: 'standard',
  VERIFIED: 'verified',
  PREMIUM: 'premium',
};

/**
 * Statuts de traitement
 * @readonly
 * @enum {string}
 */
export const ProcessingStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Rôles utilisateur
 * @readonly
 * @enum {string}
 */
export const AppRole = {
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  TEAM_LEADER: 'team_leader',
  MEMBER: 'member',
};

// ============================================================================
// LABELS - Textes d'affichage
// ============================================================================

/** Labels pour les couches */
export const LAYER_LABELS = {
  [DocumentLayer.APP]: 'Application Métier',
  // Note: 'app' === DocumentLayer.VERTICAL donc pas de doublon
  [DocumentLayer.ORG]: 'Organisation',
  [DocumentLayer.PROJECT]: 'Projet',
  [DocumentLayer.USER]: 'Personnel',
};

/** Descriptions pour les couches */
export const LAYER_DESCRIPTIONS = {
  [DocumentLayer.APP]: 'Documents métier partagés (DTU, normes, réglementations)',
  [DocumentLayer.ORG]: 'Documents internes à l\'organisation',
  [DocumentLayer.PROJECT]: 'Documents spécifiques à un projet/chantier',
  [DocumentLayer.USER]: 'Documents personnels de l\'utilisateur',
};

/** Labels pour les statuts */
export const STATUS_LABELS = {
  [DocumentStatus.DRAFT]: 'Brouillon',
  [DocumentStatus.PENDING]: 'En attente',
  [DocumentStatus.APPROVED]: 'Approuvé',
  [DocumentStatus.REJECTED]: 'Rejeté',
};

/** Labels pour les niveaux de qualité */
export const QUALITY_LABELS = {
  [DocumentQualityLevel.STANDARD]: 'Standard',
  [DocumentQualityLevel.VERIFIED]: 'Vérifié',
  [DocumentQualityLevel.PREMIUM]: 'Premium',
};

/** Labels pour les rôles */
export const ROLE_LABELS = {
  [AppRole.SUPER_ADMIN]: 'Super Admin',
  [AppRole.ORG_ADMIN]: 'Admin Organisation',
  [AppRole.TEAM_LEADER]: 'Chef d\'équipe',
  [AppRole.MEMBER]: 'Membre',
};

// ============================================================================
// ICÔNES - Noms Lucide React
// ============================================================================

/** Icônes pour les couches (noms Lucide) */
export const LAYER_ICONS = {
  [DocumentLayer.APP]: 'BookOpen',
  [DocumentLayer.ORG]: 'Building2',
  [DocumentLayer.PROJECT]: 'FolderOpen',
  [DocumentLayer.USER]: 'User',
};

/** Icônes pour les statuts */
export const STATUS_ICONS = {
  [DocumentStatus.DRAFT]: 'FileEdit',
  [DocumentStatus.PENDING]: 'Clock',
  [DocumentStatus.APPROVED]: 'CheckCircle2',
  [DocumentStatus.REJECTED]: 'XCircle',
};

/** Icônes pour les niveaux de qualité */
export const QUALITY_ICONS = {
  [DocumentQualityLevel.STANDARD]: 'File',
  [DocumentQualityLevel.VERIFIED]: 'FileCheck',
  [DocumentQualityLevel.PREMIUM]: 'Crown',
};

// ============================================================================
// COULEURS - Classes Tailwind
// ============================================================================

/** Couleurs pour les couches */
export const LAYER_COLORS = {
  [DocumentLayer.APP]: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-300',
    icon: 'text-purple-600',
    badge: 'bg-purple-600',
  },
  [DocumentLayer.ORG]: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    icon: 'text-blue-600',
    badge: 'bg-blue-600',
  },
  [DocumentLayer.PROJECT]: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    icon: 'text-green-600',
    badge: 'bg-green-600',
  },
  [DocumentLayer.USER]: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
    icon: 'text-amber-600',
    badge: 'bg-amber-600',
  },
};

/** Couleurs pour les statuts */
export const STATUS_COLORS = {
  [DocumentStatus.DRAFT]: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
  },
  [DocumentStatus.PENDING]: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
  },
  [DocumentStatus.APPROVED]: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
  },
  [DocumentStatus.REJECTED]: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
};

/** Couleurs pour les niveaux de qualité */
export const QUALITY_COLORS = {
  [DocumentQualityLevel.STANDARD]: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
  },
  [DocumentQualityLevel.VERIFIED]: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
  },
  [DocumentQualityLevel.PREMIUM]: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-300',
  },
};

// ============================================================================
// PERMISSIONS PAR RÔLE
// ============================================================================

/** Matrice des permissions par rôle */
export const ROLE_PERMISSIONS = {
  [AppRole.SUPER_ADMIN]: {
    canUploadApp: true,
    canUploadVertical: true,      // Alias
    canUploadOrg: true,
    canUploadProject: true,
    canUploadUser: true,
    canValidate: true,
    canPromote: true,
    canDelete: true,
    requiresValidation: false,
  },
  [AppRole.ORG_ADMIN]: {
    canUploadApp: false,
    canUploadVertical: false,     // Alias
    canUploadOrg: true,
    canUploadProject: true,
    canUploadUser: true,
    canValidate: true,
    canPromote: false,
    canDelete: true,
    requiresValidation: false,
  },
  [AppRole.TEAM_LEADER]: {
    canUploadApp: false,
    canUploadVertical: false,     // Alias
    canUploadOrg: false,
    canUploadProject: true,
    canUploadUser: true,
    canValidate: true,
    canPromote: false,
    canDelete: false,
    requiresValidation: false,
  },
  [AppRole.MEMBER]: {
    canUploadApp: false,
    canUploadVertical: false,     // Alias
    canUploadOrg: false,
    canUploadProject: true,
    canUploadUser: true,
    canValidate: false,
    canPromote: false,
    canDelete: false,
    requiresValidation: true,
  },
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Obtenir les permissions d'un rôle
 * @param {string} role - Rôle utilisateur
 * @returns {Object} Permissions du rôle
 */
export function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[AppRole.MEMBER];
}

/**
 * Vérifier si un utilisateur peut uploader vers une couche
 * @param {string} role - Rôle utilisateur
 * @param {string} layer - Couche cible
 * @returns {boolean}
 */
export function canUploadToLayer(role, layer) {
  const permissions = getPermissions(role);
  switch (layer) {
    case DocumentLayer.APP:
    case 'vertical':  // Compatibilité ancienne valeur
      return permissions.canUploadApp || permissions.canUploadVertical;
    case DocumentLayer.ORG:
      return permissions.canUploadOrg;
    case DocumentLayer.PROJECT:
      return permissions.canUploadProject;
    case DocumentLayer.USER:
      return permissions.canUploadUser;
    default:
      return false;
  }
}

/**
 * Obtenir les couches disponibles pour un rôle
 * @param {string} role - Rôle utilisateur
 * @returns {string[]} Liste des couches accessibles
 */
export function getAvailableLayers(role) {
  const permissions = getPermissions(role);
  const layers = [];
  
  if (permissions.canUploadApp) layers.push(DocumentLayer.APP);
  if (permissions.canUploadOrg) layers.push(DocumentLayer.ORG);
  if (permissions.canUploadProject) layers.push(DocumentLayer.PROJECT);
  if (permissions.canUploadUser) layers.push(DocumentLayer.USER);
  
  return layers;
}

/**
 * Déterminer le statut initial selon le rôle et la couche
 * @param {string} role - Rôle utilisateur
 * @param {string} layer - Couche cible
 * @returns {string} Statut initial
 */
export function getInitialStatus(role, layer) {
  const permissions = getPermissions(role);
  if (permissions.requiresValidation && layer === DocumentLayer.PROJECT) {
    return DocumentStatus.PENDING;
  }
  return DocumentStatus.APPROVED;
}

/**
 * Obtenir le niveau de qualité selon la source
 * @param {'baikal' | 'arpet'} source - Source de l'upload
 * @returns {string} Niveau de qualité
 */
export function getQualityLevel(source) {
  return source === 'baikal' ? DocumentQualityLevel.PREMIUM : DocumentQualityLevel.STANDARD;
}

/**
 * Formater la taille d'un fichier
 * @param {number} bytes - Taille en bytes
 * @returns {string} Taille formatée
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Formater une date relative
 * @param {string} dateString - Date ISO
 * @returns {string} Date formatée
 */
export function formatRelativeDate(dateString) {
  if (!dateString) return '-';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// ============================================================================
// CONFIGURATION UPLOAD
// ============================================================================

/** Types MIME acceptés pour les documents */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Extensions acceptées */
export const ACCEPTED_EXTENSIONS = [
  '.pdf', '.txt', '.md', '.doc', '.docx', '.csv', '.xls', '.xlsx'
];

/** Taille max de fichier en MB */
export const MAX_FILE_SIZE_MB = 20;

/** Taille max de fichier en bytes */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ============================================================================
// CATÉGORIES DE DOCUMENTS (pour l'ingestion Premium)
// ============================================================================

/** Catégories de documents disponibles */
export const DOCUMENT_CATEGORIES = [
  { id: 'norme', label: 'Norme / DTU', icon: 'Scale' },
  { id: 'procedure', label: 'Procédure', icon: 'ClipboardList' },
  { id: 'template', label: 'Modèle / Template', icon: 'FileText' },
  { id: 'guide', label: 'Guide / Manuel', icon: 'BookOpen' },
  { id: 'rapport', label: 'Rapport', icon: 'FileBarChart' },
  { id: 'contrat', label: 'Contrat / Juridique', icon: 'FileCheck' },
  { id: 'technique', label: 'Fiche technique', icon: 'Wrench' },
  { id: 'formation', label: 'Formation', icon: 'GraduationCap' },
  { id: 'autre', label: 'Autre', icon: 'File' },
];

/** Tags prédéfinis */
export const PREDEFINED_TAGS = [
  'DTU', 'NF', 'ISO', 'Sécurité', 'Qualité', 'Environnement',
  'RH', 'Juridique', 'Commercial', 'Technique', 'Formation',
  'Template', 'Archive', 'Urgent', 'Confidentiel',
];

// ============================================================================
// EXPORT PAR DÉFAUT
// ============================================================================

export default {
  // Enums
  DocumentLayer,
  DocumentStatus,
  DocumentQualityLevel,
  ProcessingStatus,
  AppRole,
  
  // Labels
  LAYER_LABELS,
  LAYER_DESCRIPTIONS,
  STATUS_LABELS,
  QUALITY_LABELS,
  ROLE_LABELS,
  
  // Icons
  LAYER_ICONS,
  STATUS_ICONS,
  QUALITY_ICONS,
  
  // Colors
  LAYER_COLORS,
  STATUS_COLORS,
  QUALITY_COLORS,
  
  // Permissions
  ROLE_PERMISSIONS,
  
  // Functions
  getPermissions,
  canUploadToLayer,
  getAvailableLayers,
  getInitialStatus,
  getQualityLevel,
  formatFileSize,
  formatRelativeDate,
  
  // Upload config
  ACCEPTED_MIME_TYPES,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  
  // Categories
  DOCUMENT_CATEGORIES,
  PREDEFINED_TAGS,
};
