/**
 * useDonneesCachees - Baikal Console
 * ============================================================================
 * Chargement de donnees avec cache par cle : re-basculer sur une fenetre deja
 * vue est instantane, et pendant un fetch les donnees precedentes restent
 * affichees (estompees) — pas de saut de mise en page.
 *
 * `scope` (le site) borne cet effet de persistance : changer de site vide
 * l'affichage immediatement, sinon on lirait les chiffres du site precedent
 * sous le nom du nouveau. Une erreur vide egalement l'affichage.
 *
 * Partage par /seo et /finances : la regle de scope doit etre la meme partout,
 * sinon le bug des chiffres d'un autre site revient par la porte de derriere.
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react';

export function useDonneesCachees(cle, chargeur, scope = null) {
  const cache = useRef(new Map());
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(true);
  const [scopeRendu, setScopeRendu] = useState(scope);

  // Vidage PENDANT le rendu (et non dans un effet) : React reexecute le
  // composant avant de peindre, donc aucune image, meme fugace, ne montre
  // les chiffres du site precedent sous le nom du nouveau.
  if (scope !== scopeRendu) {
    setScopeRendu(scope);
    setDonnees(null);
    setErreur(null);
    setEnCours(true);
  }

  useEffect(() => {
    if (cache.current.has(cle)) {
      setDonnees(cache.current.get(cle));
      setErreur(null);
      setEnCours(false);
      return;
    }
    let actif = true;
    setEnCours(true);
    setErreur(null);
    chargeur().then(({ data, error }) => {
      if (!actif) return;
      if (error) {
        setErreur(error.message);
        setDonnees(null);
      } else {
        cache.current.set(cle, data);
        setDonnees(data);
      }
      setEnCours(false);
    });
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, scope]);

  return { donnees, erreur, enCours };
}

export default useDonneesCachees;
