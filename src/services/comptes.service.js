// Comptes de la console (EF admin-comptes, super_admin only) : tout ce qui
// touche à auth.users — mot de passe, lien de réinitialisation, email, blocage.
// La suppression passe par usersService.deleteUser (EF delete-user).
import { appelerEdge } from './seo.service';

export const comptesService = {
  lister(search = '') {
    return appelerEdge('admin-comptes', { action: 'list', search });
  },
  // password absent = généré côté serveur, renvoyé une seule fois.
  creer({ email, fullName, password }) {
    return appelerEdge('admin-comptes', { action: 'create', email, fullName, password: password || undefined });
  },
  setMotDePasse(userId, password) {
    return appelerEdge('admin-comptes', { action: 'set-password', userId, password: password || undefined });
  },
  lienReinitialisation(userId) {
    return appelerEdge('admin-comptes', {
      action: 'recovery-link',
      userId,
      redirectTo: `${window.location.origin}/reset-password`,
    });
  },
  renommer(userId, fullName) {
    return appelerEdge('admin-comptes', { action: 'rename', userId, fullName });
  },
  setEmail(userId, email) {
    return appelerEdge('admin-comptes', { action: 'set-email', userId, email });
  },
  bloquer(userId, bloque) {
    return appelerEdge('admin-comptes', { action: 'ban', userId, bloque });
  },
};
