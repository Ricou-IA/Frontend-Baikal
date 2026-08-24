// Gestion des admins delegues par site (EF admin-droits, super_admin only).
import { appelerEdge } from './seo.service';

export const droitsService = {
  list(appId) {
    return appelerEdge('admin-droits', { action: 'list', appId });
  },
  grant(appId, email) {
    return appelerEdge('admin-droits', { action: 'grant', appId, email });
  },
  revoke(appId, userId) {
    return appelerEdge('admin-droits', { action: 'revoke', appId, userId });
  },
};
