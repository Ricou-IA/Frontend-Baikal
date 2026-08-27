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
  // `creer` distingue la ligne "Ajouter" (refus serveur si le slug existe
  // deja) de l'edition d'un metier existant (upsert normal) — meme payload
  // `metier` sinon, voir admin-sites/index.ts.
  saveMetier(metier, creer = false) {
    return appelerEdge('admin-sites', { action: 'save-metier', metier, creer });
  },
  deleteMetier(slug) {
    return appelerEdge('admin-sites', { action: 'delete-metier', slug });
  },
};
