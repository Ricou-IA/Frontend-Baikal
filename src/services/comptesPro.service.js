// Service du chapitre Comptes (EF admin-comptes-pro). Lecture dans les vues
// contractuelles du site (baikal_comptes_pro, baikal_compte_historique,
// baikal_dossiers.compte_id), actions relayées à son EF d'administration
// (env_admin_fn) par le manifeste du compte. Les tuiles du chapitre ne
// viennent pas d'ici : elles sont servies par admin-site-stats.
import { appelerEdge } from './edge';

export const comptesProService = {
  getListe(appId, criteres) {
    return appelerEdge('admin-comptes-pro', { action: 'liste', appId, ...criteres });
  },
  getFiche(appId, compteId) {
    return appelerEdge('admin-comptes-pro', { action: 'fiche', appId, compteId });
  },
  executerActionSite(appId, compteId, actionSite, parametres = {}) {
    return appelerEdge('admin-comptes-pro', {
      action: 'site-action', appId, compteId, actionSite, parametres,
    });
  },
};
