/**
 * FicheCompte.jsx - Baikal Console
 * ============================================================================
 * Le « backend » d'un compte : tout ce que la personne a fait et acheté.
 * Même squelette que la fiche Clients : en-tête, barre d'actions du
 * manifeste, puis deux listes lues dans les vues du site — les dossiers du
 * compte (baikal_dossiers.compte_id) et l'historique
 * (baikal_compte_historique). Une liste dont le site n'a pas la vue ne
 * s'affiche pas : capacité absente, pas erreur.
 * ============================================================================
 */
import { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDonneesCachees } from '../../../hooks/useDonneesCachees';
import { comptesProService } from '../../../services/comptesPro.service';
import { Chargement, Erreur, Vide } from '../etats';
import { fmtDate, fmtEur } from '../badges-clients';
import BarreActions from '../fiche/BarreActions';
import Fiche from '../fiche/Fiche';
import { COLONNES } from '../fiche/colonnes';
import { formaterValeur } from '../fiche/formats';

function Tuile({ libelle, valeur }) {
  return (
    <div className="bg-baikal-bg border border-baikal-border rounded-md px-3 py-2">
      <div className="text-xs text-baikal-text opacity-70">{libelle}</div>
      <div className="text-white font-semibold tabular-nums">{valeur}</div>
    </div>
  );
}

// Une colonne n'est affichee que si au moins une ligne la porte : regle
// « pas de colonne, pas de section » du contrat, comme OngletListe.
function Tableau({ colonnes, lignes, cleLigne, vide, onOuvrir }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  const visibles = colonnes.filter(
    (c) => lignes.some((l) => l[c.cle] !== undefined && l[c.cle] !== null),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
            {visibles.map((c) => <th key={c.cle} className="py-2 pr-4">{c.libelle}</th>)}
            {onOuvrir && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l[cleLigne]} className="border-t border-baikal-border/50">
              {visibles.map((c) => (
                <td key={c.cle} className="py-2 pr-4 max-w-[260px] truncate">
                  {formaterValeur(l[c.cle], c.format)}
                </td>
              ))}
              {onOuvrir && (
                <td className="py-2">
                  {l.dossier_id && (
                    <button
                      onClick={() => onOuvrir(l.dossier_id)}
                      className="inline-flex items-center gap-1 text-baikal-cyan hover:underline text-xs"
                    >
                      Dossier <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FicheCompte({ appId, compteId, onClose }) {
  const [version, setVersion] = useState(0);
  const [dossierOuvert, setDossierOuvert] = useState(null);
  const { isSuperAdmin } = useAuth();
  const { donnees, erreur } = useDonneesCachees(
    `compte:${appId}:${compteId}:${version}`,
    () => comptesProService.getFiche(appId, compteId),
    appId,
  );
  const c = donnees?.compte;
  const blocs = donnees?.blocs || {};
  const vues = donnees?.vues || {};

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-baikal-surface border-y sm:border border-baikal-border sm:rounded-lg w-full max-w-4xl min-h-full sm:min-h-0 my-0 sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border sticky top-0 z-10 bg-baikal-surface">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-semibold truncate">{c?.raison_sociale || compteId}</h3>
              {c?.actif === false && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-900/30 text-red-300">compte fermé</span>
              )}
              {c?.est_test && (
                <span className="text-xs px-2 py-0.5 rounded bg-baikal-bg text-baikal-text">test</span>
              )}
            </div>
            <p className="text-sm text-baikal-text truncate">
              {c?.email || '— pas d’email'}
              {c?.cree_le ? ` · ouvert le ${fmtDate(c.cree_le)}` : ''}
            </p>
            <p className="font-mono text-xs text-baikal-text opacity-60 mt-1">{compteId}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-2 text-baikal-text hover:text-white rounded-md hover:bg-baikal-bg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {c && (
          <BarreActions
            actions={donnees.actions}
            isSuperAdmin={isSuperAdmin}
            onFait={() => setVersion((v) => v + 1)}
            module="comptes_pro"
            executer={(actionSite, parametres) =>
              comptesProService.executerActionSite(appId, compteId, actionSite, parametres)}
          />
        )}

        <div className="p-4 space-y-5">
          {erreur && <Erreur message={erreur} />}
          {donnees?.actionsErreur && (
            <p className="text-xs text-amber-300">Actions indisponibles : {donnees.actionsErreur}</p>
          )}
          {!donnees && !erreur && <Chargement />}

          {c && (blocs.credits || blocs.argent) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {blocs.credits && (
                <Tuile libelle="Crédits en stock" valeur={formaterValeur(c.credits_stock, 'nombre')} />
              )}
              {blocs.credits && c.credits_achetes !== undefined && (
                <Tuile libelle="Achetés" valeur={formaterValeur(c.credits_achetes, 'nombre')} />
              )}
              {blocs.credits && c.credits_consommes !== undefined && (
                <Tuile libelle="Consommés" valeur={formaterValeur(c.credits_consommes, 'nombre')} />
              )}
              {blocs.argent && <Tuile libelle="CA TTC" valeur={fmtEur(c.ca_ttc)} />}
            </div>
          )}

          {c && vues.dossiers && (
            <section>
              <h4 className="text-sm font-semibold text-white mb-2">
                Dossiers ({donnees.dossiers.length})
              </h4>
              <Tableau
                colonnes={COLONNES.compte_dossiers}
                lignes={donnees.dossiers}
                cleLigne="dossier_id"
                vide="Aucun dossier sur ce compte."
                onOuvrir={setDossierOuvert}
              />
            </section>
          )}

          {c && vues.historique && (
            <section>
              <h4 className="text-sm font-semibold text-white mb-2">
                Historique ({donnees.historique.length})
              </h4>
              <Tableau
                colonnes={COLONNES.historique}
                lignes={donnees.historique}
                cleLigne="evenement_id"
                vide="Aucun événement sur ce compte."
                onOuvrir={setDossierOuvert}
              />
            </section>
          )}
        </div>
      </div>

      {dossierOuvert && (
        <Fiche appId={appId} dossierId={dossierOuvert} onClose={() => setDossierOuvert(null)} />
      )}
    </div>
  );
}
