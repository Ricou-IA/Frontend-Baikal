// Service de la vue d'ensemble par site (EF admin-site-stats).
import { appelerEdge } from './seo.service';

export const siteStatsService = {
  getOverview(appId, jours = 30) {
    return appelerEdge('admin-site-stats', { action: 'overview', appId, jours });
  },
};
