/**
 * sites.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-sites : le registre config.apps (liste et
 * parametrage des sites) et la taxonomie partagee admin.metier. Extrait de
 * partenariats.service.js, qui portait aussi listSites/saveSite avant que
 * le registre ne soit degage du module Partenariats.
 * ============================================================================
 */
import { appelerEdge } from './seo.service';

export const sitesService = {
  listSites() {
    return appelerEdge('admin-sites', { action: 'list-sites' });
  },
  saveSite(site) {
    return appelerEdge('admin-sites', { action: 'save-site', site });
  },
  listMetiers() {
    return appelerEdge('admin-sites', { action: 'list-metiers' });
  },
  saveMetier(metier) {
    return appelerEdge('admin-sites', { action: 'save-metier', metier });
  },
  deleteMetier(slug) {
    return appelerEdge('admin-sites', { action: 'delete-metier', slug });
  },
};
