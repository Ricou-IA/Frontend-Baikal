/**
 * OngletListe.jsx - Baikal Console
 * ============================================================================
 * Tableau generique des onglets de liste (Documents, Resultat, Emails,
 * Logs IA). Une colonne absente de TOUTES les lignes n'est pas rendue : c'est
 * la regle "pas de colonne, pas de section" appliquee a l'affichage. La
 * colonne details, quand elle existe, se replie sous la ligne.
 * ============================================================================
 */
import { Fragment, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Vide } from '../etats';
import { formaterValeur } from './formats';

function LigneDetails({ details, colonnes }) {
  return (
    <tr className="border-t border-baikal-border/30 bg-baikal-bg/40">
      <td colSpan={colonnes} className="px-4 py-2">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(details).map(([cle, valeur]) => (
            <div key={cle}>
              <dt className="text-[11px] uppercase tracking-wide text-baikal-text opacity-60">{cle}</dt>
              <dd className="text-xs text-white break-all">{String(valeur)}</dd>
            </div>
          ))}
        </dl>
      </td>
    </tr>
  );
}

export default function OngletListe({
  colonnes, lignes, total, page, parPage, onPage, onOuvrir, vide,
}) {
  const [deplie, setDeplie] = useState(null);
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;

  // Une colonne n'est affichee que si au moins une ligne la porte.
  const visibles = colonnes.filter((c) => lignes.some((l) => l[c.cle] !== undefined && l[c.cle] !== null));
  const aDetails = lignes.some((l) => l.details && Object.keys(l.details).length > 0);
  const aOuvrir = Boolean(onOuvrir) && lignes.some((l) => l.ouvrable);
  const nbColonnes = visibles.length + (aDetails ? 1 : 0) + (aOuvrir ? 1 : 0);
  const pages = Math.max(1, Math.ceil(total / parPage));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
              {aDetails && <th className="py-2 w-6"></th>}
              {visibles.map((c) => <th key={c.cle} className="py-2 pr-4">{c.libelle}</th>)}
              {aOuvrir && <th className="py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const id = l.document_id || l.resultat_id || i;
              const porteDetails = l.details && Object.keys(l.details).length > 0;
              return (
                <Fragment key={id}>
                  <tr className="border-t border-baikal-border/50">
                    {aDetails && (
                      <td className="py-2">
                        {porteDetails && (
                          <button
                            onClick={() => setDeplie(deplie === id ? null : id)}
                            className="text-baikal-text hover:text-baikal-cyan"
                            aria-label="Détails"
                          >
                            <ChevronRight
                              className={`w-4 h-4 transition-transform ${deplie === id ? 'rotate-90' : ''}`}
                            />
                          </button>
                        )}
                      </td>
                    )}
                    {visibles.map((c) => (
                      <td key={c.cle} className="py-2 pr-4 max-w-[260px] truncate">
                        {formaterValeur(l[c.cle], c.format)}
                      </td>
                    ))}
                    {aOuvrir && (
                      <td className="py-2">
                        {l.ouvrable && (
                          <button
                            onClick={() => onOuvrir(l)}
                            className="inline-flex items-center gap-1 text-baikal-cyan hover:underline text-xs"
                          >
                            Ouvrir <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {deplie === id && porteDetails && (
                    <LigneDetails details={l.details} colonnes={nbColonnes} />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-baikal-text">
          <span>
            Page {page} sur {pages} · {(page - 1) * parPage + 1}–
            {Math.min(page * parPage, total)} / {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded-md border border-baikal-border disabled:opacity-40 hover:border-baikal-cyan"
            >
              Précédent
            </button>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page >= pages}
              className="px-2 py-1 rounded-md border border-baikal-border disabled:opacity-40 hover:border-baikal-cyan"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
