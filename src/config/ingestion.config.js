/**
 * ingestion.config.js - Configuration des sources d'ingestion
 * ============================================================================
 */

import { Upload, Scale, Globe, Link2 } from 'lucide-react';

// ============================================================================
// SOURCES D'INGESTION DISPONIBLES
// ============================================================================

export const INGESTION_SOURCES = [
    {
        id: 'file-upload',
        label: 'Upload de fichier',
        description: 'PDF, Word, Excel, texte...',
        icon: Upload,
        color: 'indigo',
        available: true,
        comingSoon: false,
        superAdminOnly: false,
    },
    {
        id: 'legifrance',
        label: 'Légifrance',
        description: 'Codes juridiques officiels',
        icon: Scale,
        color: 'emerald',
        available: true,
        comingSoon: false,
        superAdminOnly: true,
    },
    {
        id: 'web-scraping',
        label: 'Page Web',
        description: 'Importer depuis une URL',
        icon: Globe,
        color: 'blue',
        available: false,
        comingSoon: true,
        superAdminOnly: false,
    },
    {
        id: 'api-connector',
        label: 'Connecteur API',
        description: 'Intégrations tierces',
        icon: Link2,
        color: 'violet',
        available: false,
        comingSoon: true,
        superAdminOnly: false,
    },
];

// ============================================================================
// COULEURS DU THÈME SOMBRE
// ============================================================================

export const DARK_THEME_COLORS = {
    background: '#0a0a0a',
    surface: '#141414',
    border: '#2D3748',
    text: '#94A3B8',
    textMuted: '#64748B',
    primary: '#00D9FF',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
};
