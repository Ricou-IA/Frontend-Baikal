/**
 * ingestion.config.js - Configuration partagée pour l'ingestion
 * ============================================================================
 * Centralise les constantes et configurations utilisées par:
 * - IngestionPremium.jsx (page standalone)
 * - IngestionContent.jsx (onglet admin)
 * ============================================================================
 */

import {
  Upload,
  Scale,
  Globe,
  Link2,
} from 'lucide-react';

// ============================================================================
// SOURCES D'INGESTION DISPONIBLES
// ============================================================================

export const INGESTION_SOURCES = [
  {
    id: 'file-upload',
    label: 'Upload de fichiers',
    description: 'PDF, Word, Excel, texte...',
    icon: Upload,
    color: 'indigo',
    available: true,
  },
  {
    id: 'legifrance',
    label: 'Légifrance',
    description: 'Codes juridiques français',
    icon: Scale,
    color: 'emerald',
    available: true,
    superAdminOnly: true,
  },
  {
    id: 'api-externe',
    label: 'API Externe',
    description: 'Connecteurs personnalisés',
    icon: Globe,
    color: 'blue',
    available: false,
    comingSoon: true,
  },
  {
    id: 'web-scraping',
    label: 'Web Scraping',
    description: 'Extraction de sites web',
    icon: Link2,
    color: 'violet',
    available: false,
    comingSoon: true,
  },
];

// ============================================================================
// CLASSES DE COULEURS PAR THÈME
// ============================================================================

/**
 * Classes Tailwind pour le thème sombre (Baikal)
 */
export const DARK_THEME_COLORS = {
  indigo: {
    bg: 'bg-baikal-cyan/20',
    text: 'text-baikal-cyan',
    border: 'border-baikal-cyan',
    activeBg: 'bg-baikal-cyan/10',
  },
  emerald: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500',
    activeBg: 'bg-emerald-500/10',
  },
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500',
    activeBg: 'bg-blue-500/10',
  },
  violet: {
    bg: 'bg-violet-500/20',
    text: 'text-violet-400',
    border: 'border-violet-500',
    activeBg: 'bg-violet-500/10',
  },
};

/**
 * Classes Tailwind pour le thème clair (standard)
 */
export const LIGHT_THEME_COLORS = {
  indigo: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-600',
    border: 'border-indigo-400',
    activeBg: 'bg-indigo-50',
  },
  emerald: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-600',
    border: 'border-emerald-400',
    activeBg: 'bg-emerald-50',
  },
  blue: {
    bg: 'bg-blue-100',
    text: 'text-blue-600',
    border: 'border-blue-400',
    activeBg: 'bg-blue-50',
  },
  violet: {
    bg: 'bg-violet-100',
    text: 'text-violet-600',
    border: 'border-violet-400',
    activeBg: 'bg-violet-50',
  },
};

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Récupère les classes de couleur selon le thème
 * @param {string} color - Nom de la couleur (indigo, emerald, blue, violet)
 * @param {'dark' | 'light'} theme - Thème actif
 * @returns {Object} Classes Tailwind pour bg, text, border, activeBg
 */
export function getColorClasses(color, theme = 'dark') {
  const themeColors = theme === 'dark' ? DARK_THEME_COLORS : LIGHT_THEME_COLORS;
  return themeColors[color] || themeColors.indigo;
}

/**
 * Filtre les sources selon le rôle utilisateur
 * @param {boolean} isSuperAdmin - L'utilisateur est-il super admin?
 * @returns {Array} Sources filtrées
 */
export function getAvailableSources(isSuperAdmin = false) {
  return INGESTION_SOURCES.filter(source => {
    if (source.superAdminOnly && !isSuperAdmin) {
      return false;
    }
    return true;
  });
}

/**
 * Récupère une source par son ID
 * @param {string} sourceId - ID de la source
 * @returns {Object|undefined} Source ou undefined
 */
export function getSourceById(sourceId) {
  return INGESTION_SOURCES.find(s => s.id === sourceId);
}

// ============================================================================
// MESSAGES ET LABELS
// ============================================================================

export const INGESTION_MESSAGES = {
  selectVertical: 'Sélectionnez une verticale métier',
  selectLayer: 'Sélectionnez une couche de destination',
  uploadSuccess: 'Document uploadé avec succès',
  uploadError: 'Erreur lors de l\'upload du document',
  syncSuccess: 'Synchronisation terminée avec succès',
  syncError: 'Erreur lors de la synchronisation',
  duplicateWarning: 'Un document similaire existe déjà',
};

export default {
  INGESTION_SOURCES,
  DARK_THEME_COLORS,
  LIGHT_THEME_COLORS,
  getColorClasses,
  getAvailableSources,
  getSourceById,
  INGESTION_MESSAGES,
};
