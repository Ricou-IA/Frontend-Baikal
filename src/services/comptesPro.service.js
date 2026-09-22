// Service du chapitre Comptes pro (EF admin-comptes-pro).
// Les entreprises qui achètent au site, lues dans sa vue contractuelle
// baikal_comptes_pro. Les tuiles du chapitre ne viennent pas d'ici : elles
// sont servies par admin-site-stats, chapitre comptes_pro.
import { appelerEdge } from './seo.service';

export const comptesProService = {
  getListe(appId, criteres) {
    return appelerEdge('admin-comptes-pro', { action: 'liste', appId, ...criteres });
  },
};
