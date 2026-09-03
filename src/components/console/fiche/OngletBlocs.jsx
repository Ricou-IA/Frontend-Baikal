/**
 * OngletBlocs.jsx - Baikal Console
 * ============================================================================
 * Onglet Donnees : le mouchard brut, un accordeon par bloc. Aucune structure
 * n'est supposee -- c'est precisement l'interet de cet onglet.
 *
 * Deux vides distincts : total nul (<Vide> seul) et page hors bornes (message
 * distinct suivi du pied de pagination pour permettre de revenir).
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';
import Pagination from './Pagination';

export default function OngletBlocs({
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
      <div className="space-y-2">
        {lignes.map((b, i) => (
          <details key={b.bloc || i} className="border border-baikal-border rounded-md">
            <summary className="px-3 py-2 text-sm text-baikal-text cursor-pointer select-none flex items-center gap-2">
              <span className="text-white">{b.libelle || b.bloc}</span>
              {b.maj_le && (
                <span className="text-xs opacity-60">· {fmtDateHeure(b.maj_le)}</span>
              )}
            </summary>
            <pre className="m-2 p-2 bg-baikal-bg border border-baikal-border rounded text-[11px] text-baikal-text overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(b.contenu, null, 2)}
            </pre>
          </details>
        ))}
      </div>
      <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
    </div>
  );
}
