// Acces console par site et super admins (EF admin-droits, super_admin only).
// Les droits vivent dans admin.droits_sites ; la colonne modules porte le
// niveau par module ({module: 'lecture'|'ecriture'}, absent = ferme).
import { appelerEdge } from './seo.service';

export const droitsService = {
  list(appId) {
    return appelerEdge('admin-droits', { action: 'list', appId });
  },
  listAll() {
    return appelerEdge('admin-droits', { action: 'list-all' });
  },
  // modules absent = tout en ecriture (defaut decide par Eric le 07/09/2026).
  grant(appId, email, modules) {
    return appelerEdge('admin-droits', { action: 'grant', appId, email, modules });
  },
  setModules(appId, userId, modules) {
    return appelerEdge('admin-droits', { action: 'set-modules', appId, userId, modules });
  },
  revoke(appId, userId) {
    return appelerEdge('admin-droits', { action: 'revoke', appId, userId });
  },
  superAdmins() {
    return appelerEdge('admin-droits', { action: 'super-admins' });
  },
  setSuperAdmin(email, actif, reason = null) {
    return appelerEdge('admin-droits', { action: 'super-admin-set', email, actif, reason });
  },
};
