/**
 * OngletTimeline.jsx - Baikal Console
 * ============================================================================
 * Onglet Events : le parcours client. Le libelle du site prime, le type brut
 * sert de repli -- un produit qui ne nomme pas ses evenements reste lisible.
 * Le `detail` est rendu en paires cle/valeur telles qu'elles viennent : le
 * contrat n'en definit aucune, donc aucune n'est privilegiee.
 *
 * Deux vides distincts : total nul (<Vide> seul) et page hors bornes
 * (message distinct suivi du pied de pagination pour permettre de revenir) --
 * le serveur pagine les sept onglets uniformement, celui-ci y compris.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';
import Pagination from './Pagination';

const COULEUR_ACTEUR = {
  client: 'text-baikal-cyan',
  admin: 'text-amber-300',
  systeme: 'text-baikal-text',
};

// JSON.stringify et pas String() : une valeur imbriquee s'ecrirait sinon
// "[object Object]".
function lisible(valeur) {
  if (valeur === null || valeur === undefined) return '—';
  if (typeof valeur === 'object') return JSON.stringify(valeur);
  return String(valeur);
}

// Le contrat ne definit AUCUNE cle de `detail` : n'en privilegier aucune est
// la seule facon d'etre juste pour tous les produits. L'ancien rendu lisait
// `detail.page` -- un produit dont les evenements portent {montant: 120}
// n'affichait rien, un produit qui nommait sa cle `page` etait servi.
function pairesDetail(detail) {
  if (detail === null || detail === undefined || detail === '') return [];
  if (typeof detail !== 'object') return [[null, String(detail)]];
  return Object.entries(detail).map(([cle, valeur]) => [cle, lisible(valeur)]);
}

export default function OngletTimeline({
  lignes, total, page, parPage, onPage, vide,
}) {
  if (total === 0) return <Vide message={vide} />;
  if (!lignes || lignes.length === 0) {
    return (
      <div className="space-y-3">
        <Vide message="Aucune ligne sur cette page." />
        <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {lignes.map((ev, i) => {
          const details = pairesDetail(ev.detail);
          return (
            <li key={i} className="text-sm text-baikal-text flex items-start gap-3">
              <span className="whitespace-nowrap text-xs opacity-60 mt-0.5">
                {fmtDateHeure(ev.survenu_le)}
              </span>
              <div className="min-w-0">
                <span className={`text-xs ${ev.libelle ? 'text-white' : 'font-mono text-white'}`}>
                  {ev.libelle || ev.type}
                </span>
                {ev.acteur && (
                  <span className={`ml-2 text-[11px] ${COULEUR_ACTEUR[ev.acteur] || 'opacity-60'}`}>
                    {ev.acteur}
                  </span>
                )}
                {details.length > 0 && (
                  <span className="ml-2 text-xs opacity-60 break-all">
                    {details
                      .map(([cle, valeur]) => (cle ? `${cle} : ${valeur}` : valeur))
                      .join(' · ')}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
    </div>
  );
}
