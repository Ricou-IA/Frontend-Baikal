// Comptes (EF admin-comptes) : tout ce qui touche à auth.users — mot de passe,
// lien de réinitialisation, email, blocage — en deux périmètres :
//   scope 'baikal'  : les clients de Baikal (étage Baikal, onglet Comptes), super admin
//   scope <app_id>  : les clients d'un site à organisations (page Utilisateurs
//                     du site) — propriétaire du site ou org_admin sur son org
// La suppression passe par usersService.deleteUser (EF delete-user).
import { appelerEdge } from './seo.service';

const appel = (scope, corps) => appelerEdge('admin-comptes', { scope, ...corps });

export const comptesService = {
  lister(scope = 'baikal', search = '') {
    return appel(scope, { action: 'list', search });
  },
  // Périmètre baikal seulement. password absent = généré côté serveur,
  // renvoyé une seule fois.
  creer({ email, fullName, password }) {
    return appel('baikal', { action: 'create', email, fullName, password: password || undefined });
  },
  setMotDePasse(scope, userId, password) {
    return appel(scope, { action: 'set-password', userId, password: password || undefined });
  },
  lienReinitialisation(scope, userId) {
    return appel(scope, {
      action: 'recovery-link',
      userId,
      redirectTo: `${window.location.origin}/reset-password`,
    });
  },
  renommer(scope, userId, fullName) {
    return appel(scope, { action: 'rename', userId, fullName });
  },
  setEmail(scope, userId, email) {
    return appel(scope, { action: 'set-email', userId, email });
  },
  bloquer(scope, userId, bloque) {
    return appel(scope, { action: 'ban', userId, bloque });
  },
  // Tableau de bord des sites (étage Baikal) : registre + compteurs.
  sites() {
    return appel('baikal', { action: 'sites' });
  },
};
