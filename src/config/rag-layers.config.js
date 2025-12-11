/**
 * rag-layers.config.js - Baikal Console
 * ============================================================================
 * Configuration des couches RAG et permissions associées.
 * 
 * MIGRATION PHASE 3:
 * - 'vertical' → 'app' (alignement avec schéma DB)
 * 
 * Couches disponibles:
 * - app: Visible par tous les utilisateurs (anciennement 'vertical')
 * - org: Visible par les membres de l'organisation
 * - project: Visible par les membres du projet
 * - user: Visible uniquement par l'utilisateur
 * ============================================================================
 */

import { BookOpen, Building2, FolderOpen, User } from 'lucide-react';

// ============================================================================
// TYPES / ENUMS
// ============================================================================

/**
 * Enum des couches de documents
 */
export const DocumentLayer = {
    APP: 'app',
    ORG: 'org',
    PROJECT: 'project',
    USER: 'user',
};

/**
 * Enum des statuts de documents
 */
export const DocumentStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    ARCHIVED: 'archived',
};

// ============================================================================
// CONFIGURATION DES COUCHES (LAYERS)
// ============================================================================

/**
 * Labels des couches pour l'affichage
 */
export const LAYER_LABELS = {
    app: 'Verticale Métier',
    org: 'Organisation',
    project: 'Projet',
    user: 'Personnel',
};

/**
 * Descriptions des couches
 */
export const LAYER_DESCRIPTIONS = {
    app: 'Partagé entre toutes les organisations',
    org: "Interne à l'organisation",
    project: "Visible par l'équipe projet",
    user: 'Documents personnels',
};

/**
 * Couleurs des couches (Tailwind classes)
 */
export const LAYER_COLORS = {
    app: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-500',
        text: 'text-emerald-700',
        icon: 'text-emerald-600',
    },
    org: {
        bg: 'bg-blue-50',
        border: 'border-blue-500',
        text: 'text-blue-700',
        icon: 'text-blue-600',
    },
    project: {
        bg: 'bg-purple-50',
        border: 'border-purple-500',
        text: 'text-purple-700',
        icon: 'text-purple-600',
    },
    user: {
        bg: 'bg-amber-50',
        border: 'border-amber-500',
        text: 'text-amber-700',
        icon: 'text-amber-600',
    },
};

/**
 * Icônes des couches
 */
export const LAYER_ICONS = {
    app: BookOpen,
    org: Building2,
    project: FolderOpen,
    user: User,
};

// ============================================================================
// CONFIGURATION DES STATUTS
// ============================================================================

/**
 * Labels des statuts pour l'affichage
 */
export const STATUS_LABELS = {
    draft: 'Brouillon',
    pending: 'En attente',
    approved: 'Approuvé',
    rejected: 'Rejeté',
    archived: 'Archivé',
};

/**
 * Couleurs des statuts (Tailwind classes)
 */
export const STATUS_COLORS = {
    draft: {
        bg: 'bg-slate-100',
        border: 'border-slate-300',
        text: 'text-slate-700',
        icon: 'text-slate-500',
        badge: 'bg-slate-100 text-slate-700',
    },
    pending: {
        bg: 'bg-amber-50',
        border: 'border-amber-300',
        text: 'text-amber-700',
        icon: 'text-amber-500',
        badge: 'bg-amber-100 text-amber-700',
    },
    approved: {
        bg: 'bg-green-50',
        border: 'border-green-300',
        text: 'text-green-700',
        icon: 'text-green-500',
        badge: 'bg-green-100 text-green-700',
    },
    rejected: {
        bg: 'bg-red-50',
        border: 'border-red-300',
        text: 'text-red-700',
        icon: 'text-red-500',
        badge: 'bg-red-100 text-red-700',
    },
    archived: {
        bg: 'bg-gray-50',
        border: 'border-gray-300',
        text: 'text-gray-700',
        icon: 'text-gray-500',
        badge: 'bg-gray-100 text-gray-700',
    },
};

// ============================================================================
// CONFIGURATION DES FICHIERS
// ============================================================================

/**
 * Types MIME acceptés pour l'upload
 */
export const ACCEPTED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
];

/**
 * Extensions acceptées
 */
export const ACCEPTED_EXTENSIONS = [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.txt',
    '.md',
    '.csv',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
];

/**
 * Taille maximale des fichiers
 */
export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ============================================================================
// PERMISSIONS PAR RÔLE
// ============================================================================

/**
 * Permissions par rôle utilisateur
 */
const ROLE_PERMISSIONS = {
    super_admin: {
        canUploadApp: true,
        canUploadOrg: true,
        canUploadProject: true,
        canUploadUser: true,
        canApprove: true,
        canReject: true,
        canDelete: true,
        canViewAll: true,
    },
    org_admin: {
        canUploadApp: false,
        canUploadOrg: true,
        canUploadProject: true,
        canUploadUser: true,
        canApprove: true,
        canReject: true,
        canDelete: true,
        canViewAll: false,
    },
    team_leader: {
        canUploadApp: false,
        canUploadOrg: false,
        canUploadProject: true,
        canUploadUser: true,
        canApprove: false,
        canReject: false,
        canDelete: false,
        canViewAll: false,
    },
    member: {
        canUploadApp: false,
        canUploadOrg: false,
        canUploadProject: false,
        canUploadUser: true,
        canApprove: false,
        canReject: false,
        canDelete: false,
        canViewAll: false,
    },
};

/**
 * Récupère les permissions pour un rôle donné
 * @param {string} role - Rôle de l'utilisateur
 * @returns {Object} Permissions
 */
export function getPermissions(role) {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.member;
}

/**
 * Récupère les couches disponibles pour un rôle
 * @param {string} role - Rôle de l'utilisateur
 * @returns {string[]} Liste des couches autorisées
 */
export function getAvailableLayers(role) {
    const permissions = getPermissions(role);
    const layers = [];
    
    if (permissions.canUploadApp) layers.push('app');
    if (permissions.canUploadOrg) layers.push('org');
    if (permissions.canUploadProject) layers.push('project');
    if (permissions.canUploadUser) layers.push('user');
    
    return layers;
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Formate la taille d'un fichier pour l'affichage
 * @param {number} bytes - Taille en octets
 * @returns {string} Taille formatée
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formate une date en format relatif (il y a X minutes, heures, jours...)
 * @param {string|Date} date - Date à formater
 * @returns {string} Date formatée en relatif
 */
export function formatRelativeDate(date) {
    if (!date) return 'Date inconnue';
    
    const now = new Date();
    const targetDate = new Date(date);
    const diffMs = now - targetDate;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
        return "À l'instant";
    } else if (diffMinutes < 60) {
        return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
        return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    } else if (diffDays < 7) {
        return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else if (diffWeeks < 4) {
        return `Il y a ${diffWeeks} semaine${diffWeeks > 1 ? 's' : ''}`;
    } else if (diffMonths < 12) {
        return `Il y a ${diffMonths} mois`;
    } else {
        return `Il y a ${diffYears} an${diffYears > 1 ? 's' : ''}`;
    }
}

/**
 * Formate une date en format lisible
 * @param {string|Date} date - Date à formater
 * @returns {string} Date formatée
 */
export function formatDate(date) {
    if (!date) return 'Date inconnue';
    
    const targetDate = new Date(date);
    return targetDate.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Vérifie si un fichier est valide pour l'upload
 * @param {File} file - Fichier à vérifier
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateFile(file) {
    if (!file) {
        return { valid: false, error: 'Aucun fichier sélectionné' };
    }
    
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return { valid: false, error: `Le fichier dépasse la limite de ${MAX_FILE_SIZE_MB} MB` };
    }
    
    const isValidType = ACCEPTED_MIME_TYPES.includes(file.type);
    const hasValidExtension = ACCEPTED_EXTENSIONS.some(ext => 
        file.name.toLowerCase().endsWith(ext)
    );
    
    if (!isValidType && !hasValidExtension) {
        return { valid: false, error: 'Type de fichier non supporté' };
    }
    
    return { valid: true, error: null };
}

/**
 * Normalise la valeur du layer (rétrocompatibilité)
 * @param {string} layer - Valeur de la couche
 * @returns {string} Valeur normalisée
 */
export function normalizeLayer(layer) {
    if (layer === 'vertical') return 'app';
    return layer;
}
