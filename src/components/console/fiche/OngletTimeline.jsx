/**
 * OngletTimeline.jsx - Baikal Console
 * ============================================================================
 * Onglet Events : le parcours client. Le libelle du site prime, le type brut
 * sert de repli -- un produit qui ne nomme pas ses evenements reste lisible.
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
        {lignes.map((ev, i) => (
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
              {ev.detail?.page && (
                <span className="ml-2 text-xs opacity-60 break-all">{ev.detail.page}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
    </div>
  );
}
