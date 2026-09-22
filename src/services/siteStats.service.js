// Service de la vue d'ensemble par site (EF admin-site-stats).
import { appelerEdge } from './seo.service';

export const siteStatsService = {
  getOverview(appId, jours = 30) {
    return appelerEdge('admin-site-stats', { action: 'overview', appId, jours });
  },
  // Tuiles d'un chapitre (clients | finances | comptes_pro), lues dans la vue
  // contractuelle baikal_mesures du site. Le chapitre est aussi le module de
  // la console : l'EF en exige le droit en lecture.
  getMesures(appId, chapitre, jours = 30) {
    return appelerEdge('admin-site-stats', { action: 'mesures', appId, chapitre, jours });
  },
};
