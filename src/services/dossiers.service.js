/**
 * dossiers.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-dossiers : liste et fiche des dossiers
 * clients du site selectionne, lus en direct dans les vues contractuelles
 * baikal_dossiers du site (spec 2026-08-26). Aucune archive nominative
 * cote Baikal.
 * ============================================================================
 */
import { appelerEdge } from './edge';

export const dossiersService = {
  getListe(appId, criteres = {}) {
    return appelerEdge('admin-dossiers', { action: 'liste', appId, ...criteres });
  },
  getFiche(appId, dossierId) {
    return appelerEdge('admin-dossiers', { action: 'fiche', appId, dossierId });
  },
  getOnglet(appId, dossierId, onglet, page = 1, parPage = 50) {
    return appelerEdge('admin-dossiers', {
      action: 'onglet', appId, dossierId, onglet, page, parPage,
    });
  },
  getFichier(appId, dossierId, cible, id) {
    return appelerEdge('admin-dossiers', { action: 'fichier', appId, dossierId, cible, id });
  },
  executerActionSite(appId, dossierId, actionSite, parametres = {}) {
    return appelerEdge('admin-dossiers', {
      action: 'site-action', appId, dossierId, actionSite, parametres,
    });
  },
};
