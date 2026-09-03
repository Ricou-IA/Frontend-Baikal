/**
 * OngletListe.jsx - Baikal Console
 * ============================================================================
 * Tableau generique des onglets de liste (Documents, Resultat, Emails,
 * Logs IA). Une colonne absente de TOUTES les lignes n'est pas rendue : c'est
 * la regle "pas de colonne, pas de section" appliquee a l'affichage.
 *
 * La colonne `details` (jsonb libre, cles decidees par le site) est eclatee
 * en autant de colonnes que de cles rencontrees sur les lignes affichees,
 * apres les colonnes declarees dans colonnes.js -- generique par
 * construction, Baikal n'a connaissance d'aucune cle en particulier.
 *
 * Deux vides distincts : total nul (rien du tout, <Vide> seul) et page hors
 * bornes (des lignes existent ailleurs -- message distinct, jamais le message
 * "vide" du site qui dirait le contraire de la verite -- suivi du pied de
 * pagination pour permettre de revenir).
 * ============================================================================
 */
import { ExternalLink } from 'lucide-react';
import { Vide } from '../etats';
import { formaterDetail, formaterValeur } from './formats';
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

export default function OngletListe({
  colonnes, lignes, total, page, parPage, onPage, onOuvrir, vide,
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

  // Une colonne n'est affichee que si au moins une ligne la porte.
  const visibles = colonnes.filter((c) => lignes.some((l) => l[c.cle] !== undefined && l[c.cle] !== null));
  // Union des cles de `details` sur les lignes affichees, dans leur ordre de
  // premiere apparition : chacune devient une colonne. Une ligne qui n'a pas
  // cette cle laisse simplement la cellule vide (formaterDetail(undefined)),
  // comme n'importe quelle colonne declaree absente de cette ligne.
  const colonnesDetails = [...new Set(
    lignes.flatMap((l) => (l.details && typeof l.details === 'object' ? Object.keys(l.details) : [])),
  )];
  const aOuvrir = Boolean(onOuvrir) && lignes.some(estOuvrable);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
              {visibles.map((c) => <th key={c.cle} className="py-2 pr-4">{c.libelle}</th>)}
              {colonnesDetails.map((cle) => <th key={cle} className="py-2 pr-4">{cle}</th>)}
              {aOuvrir && <th className="py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const id = l.document_id || l.resultat_id || i;
              return (
                <tr
                  key={id}
                  className={`border-t border-baikal-border/50 ${
                    enErreur(l) ? 'text-red-300' : ''
                  }`}
                >
                  {visibles.map((c) => (
                    <td key={c.cle} className="py-2 pr-4 max-w-[260px] truncate">
                      {formaterValeur(l[c.cle], c.format)}
                    </td>
                  ))}
                  {colonnesDetails.map((cle) => (
                    <td key={cle} className="py-2 pr-4 max-w-[260px] truncate">
                      {formaterDetail(l.details?.[cle])}
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
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
    </div>
  );
}
