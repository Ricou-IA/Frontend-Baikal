/**
 * OngletBlocs.jsx - Baikal Console
 * ============================================================================
 * Onglet Donnees : le mouchard brut, un accordeon par bloc. Aucune structure
 * n'est supposee -- c'est precisement l'interet de cet onglet.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';

export default function OngletBlocs({ lignes, vide }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  return (
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
  );
}
