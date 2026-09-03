/**
 * OngletListe.jsx - Baikal Console
 * ============================================================================
 * Tableau generique des onglets de liste (Documents, Resultat, Emails,
 * Logs IA). Une colonne absente de TOUTES les lignes n'est pas rendue : c'est
 * la regle "pas de colonne, pas de section" appliquee a l'affichage. La
 * colonne details, quand elle existe, se replie sous la ligne.
 *
 * Deux vides distincts : total nul (rien du tout, <Vide> seul) et page hors
 * bornes (des lignes existent ailleurs -- message distinct, jamais le message
 * "vide" du site qui dirait le contraire de la verite -- suivi du pied de
 * pagination pour permettre de revenir).
 * ============================================================================
 */
import { Fragment, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Vide } from '../etats';
import { formaterValeur } from './formats';
import Pagination from './Pagination';

// Regle generique, portee par le statut et non par l'onglet : le contrat
// definit `statut = 'erreur'` pour les logs IA, mais rien n'empeche un autre
// onglet de s'en servir -- une ligne en echec doit se voir partout.
function enErreur(ligne) {
  return String(ligne.statut ?? '').toLowerCase() === 'erreur';
}

// Repli de la spec 3.4 : `ouvrable` absent se deduit de `nature = 'fichier'`
// et de la presence du relais -- laquelle est deja portee par le fait qu'une
// fonction d'ouverture nous soit fournie (voir aOuvrir). Sans ce repli, un
// site qui suivrait la seule spec publierait des documents non ouvrables sans
// comprendre pourquoi.
function estOuvrable(ligne) {
  if (ligne.ouvrable === undefined || ligne.ouvrable === null) {
    return ligne.nature === 'fichier';
  }
  return Boolean(ligne.ouvrable);
}

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
  if (total === 0) return <Vide message={vide} />;
  if (!lignes || lignes.length === 0) {
    return (
      <div className="space-y-3">
        <Vide message="Aucune ligne sur cette page." />
        <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
      </div>
    );
  }

  // Une colonne n'est affichee que si au moins une ligne la porte.
  const visibles = colonnes.filter((c) => lignes.some((l) => l[c.cle] !== undefined && l[c.cle] !== null));
  const aDetails = lignes.some((l) => l.details && Object.keys(l.details).length > 0);
  const aOuvrir = Boolean(onOuvrir) && lignes.some(estOuvrable);
  const nbColonnes = visibles.length + (aDetails ? 1 : 0) + (aOuvrir ? 1 : 0);

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
                  <tr
                    className={`border-t border-baikal-border/50 ${
                      enErreur(l) ? 'text-red-300' : ''
                    }`}
                  >
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
                        {estOuvrable(l) && (
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
      <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
    </div>
  );
}
