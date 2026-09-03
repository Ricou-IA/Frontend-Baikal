/**
 * OngletTimeline.jsx - Baikal Console
 * ============================================================================
 * Onglet Events : le parcours client. Le libelle du site prime, le type brut
 * sert de repli -- un produit qui ne nomme pas ses evenements reste lisible.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';

const COULEUR_ACTEUR = {
  client: 'text-baikal-cyan',
  admin: 'text-amber-300',
  systeme: 'text-baikal-text',
};

export default function OngletTimeline({ lignes, vide }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  return (
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
  );
}
