// Page d'arrivée d'un site dans la console.
//
// ARPET a un tableau de bord (/admin). Les autres sites n'en ont pas : leurs
// chiffres s'affichent en tête de leurs chapitres (contrat des mesures), et le
// premier chapitre est Clients. C'est la même règle à la connexion et quand on
// quitte l'étage Baikal pour un site.
export function routeAccueilSite(appId) {
  return appId === 'arpet' ? '/admin' : '/clients';
}
