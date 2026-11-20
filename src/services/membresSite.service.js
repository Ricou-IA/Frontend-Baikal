/**
 * membresSite.service.js - Baikal Console
 * ============================================================================
 * Les membres d'un site en modèle « organisations » qui a sa propre base :
 * canal Membres de l'EF admin-comptes, relayé au site (contrat
 * docs/contrats/membres-relais-v1.ts). Rien n'est lu ni écrit dans la base de
 * Baikal : liste, rôles et état des comptes viennent du site.
 *
 * Une erreur porte la phrase à afficher ; jamais de succès supposé.
 * ============================================================================
 */
import { appelerEdge } from './edge';

const appel = (appId, action, corps = {}) =>
  appelerEdge('admin-comptes', { canal: 'membres', action, appId, ...corps });

export const membresSiteService = {
  // { disponible, actions, roles } ou { disponible: false, motif }
  etat(appId) {
    return appel(appId, 'etat');
  },
  // { organisations: [{ id, nom }], membres: [...] }
  lister(appId) {
    return appel(appId, 'membres');
  },
  // password absent = généré par Baikal, rendu une fois dans motDePasse.
  creer(appId, { email, nom, orgId, role, password }) {
    return appel(appId, 'creer', { email, nom: nom || null, orgId, role, password: password || undefined });
  },
  setMotDePasse(appId, id, password) {
    return appel(appId, 'mot-de-passe', { id, password: password || undefined });
  },
  bloquer(appId, id, bloque) {
    return appel(appId, 'bloquer', { id, bloque });
  },
};
