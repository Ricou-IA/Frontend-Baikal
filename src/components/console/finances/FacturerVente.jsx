/**
 * FacturerVente.jsx - Baikal Console
 * ============================================================================
 * Fenetre « Facturer » d'une vente de la page Finances, en deux gestes :
 *   1. le nom et l'adresse du client, puis « Creer le brouillon » : il est cree
 *      dans Pennylane et y reste, le temps de le relire ;
 *   2. « Finaliser et envoyer » : le brouillon devient la facture definitive et
 *      son PDF part par e-mail. Un brouillon peut aussi etre supprime.
 *
 * Ce composant ne calcule rien : les montants viennent de l'action
 * `facture-preparer` (module pur _shared/facturation.ts cote fonction). Le nom
 * et l'e-mail du payeur sont lus en direct dans Stripe a l'ouverture ; ils ne
 * sont gardes nulle part dans Baikal.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { X, Send, FilePlus, Trash2, Check, AlertTriangle } from 'lucide-react';
import { financeService } from '../../../services/finance.service';
import { Chargement, Erreur } from '../etats';

const CHAMP = 'mt-1 w-full px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm';

function fmtEur(n) {
  if (n === null || n === undefined) return '—';
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
}

function fmtJour(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

// Stripe ne rend qu'un nom complet : on propose un decoupage, a corriger.
function decouperNom(complet) {
  const mots = String(complet || '').trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return { prenom: '', nom: mots[0] || '' };
  return { prenom: mots[0], nom: mots.slice(1).join(' ') };
}

function Champ({ libelle, children, className = '' }) {
  return (
    <label className={`block text-xs text-baikal-text ${className}`}>
      {libelle}
      {children}
    </label>
  );
}

export default function FacturerVente({ appId, vente, onClose, onFacturee }) {
  const [prepa, setPrepa] = useState(null);
  const [erreurPrepa, setErreurPrepa] = useState(null);
  const [form, setForm] = useState({
    type: 'particulier', prenom: '', nom: '', raison_sociale: '',
    adresse: '', code_postal: '', ville: '', pays: 'FR', email: '', designation: '',
  });
  const [enCours, setEnCours] = useState(null); // 'brouillon' | 'envoi' | 'suppression' | null
  const [erreur, setErreur] = useState(null);
  // Derniere reponse de la fonction : elle prime sur l'etat lu a l'ouverture.
  const [resultat, setResultat] = useState(null);

  useEffect(() => {
    let actif = true;
    financeService.preparerFacture(appId, vente.id).then(({ data, error }) => {
      if (!actif) return;
      if (error) { setErreurPrepa(error.message); return; }
      setPrepa(data);
      const p = data.payeur || {};
      setForm((f) => ({
        ...f,
        ...decouperNom(p.nom),
        adresse: p.adresse || '',
        code_postal: p.code_postal || '',
        ville: p.ville || '',
        pays: p.pays || 'FR',
        email: p.email || '',
        designation: data.designation || '',
      }));
    });
    return () => { actif = false; };
  }, [appId, vente.id]);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const jouer = async (geste, appel) => {
    setEnCours(geste);
    setErreur(null);
    const { data, error } = await appel();
    setEnCours(null);
    if (error) { setErreur(error.message); return null; }
    return data;
  };

  const creerBrouillon = async () => {
    const { designation, ...client } = form;
    const data = await jouer('brouillon', () => financeService.creerBrouillonFacture(appId, vente.id, client, designation));
    if (!data) return;
    setResultat(data);
    if (data.facture) onFacturee(vente.id, data.facture);
  };

  const envoyer = async () => {
    const data = await jouer('envoi', () => financeService.envoyerFacture(appId, vente.id));
    if (!data) return;
    setResultat(data);
    if (data.facture) onFacturee(vente.id, data.facture);
  };

  const supprimer = async () => {
    const data = await jouer('suppression', () => financeService.supprimerBrouillonFacture(appId, vente.id));
    if (!data) return;
    setResultat({ facture: { etat: 'aucune' } });
    onFacturee(vente.id, { etat: 'aucune' });
  };

  const m = prepa?.montants;
  const facture = resultat?.facture ?? prepa?.facture ?? null;
  const etat = facture?.etat ?? 'aucune';
  const emise = etat === 'emise_envoyee' || etat === 'emise_envoi_en_attente';
  const enBrouillon = etat === 'brouillon';
  const aSaisir = prepa?.facturable && !emise && !enBrouillon;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-0 sm:p-4"
      onClick={enCours ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Facturer la vente"
        className="bg-baikal-surface border-y sm:border border-baikal-border sm:rounded-lg w-full max-w-xl min-h-full sm:min-h-0 my-0 sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="min-w-0">
            <h3 className="text-white font-semibold">Facturer la vente du {fmtJour(vente.paid_at)}</h3>
            <p className="text-sm text-baikal-text truncate">
              {vente.offre} · {fmtEur(Number(vente.montant_ttc))} TTC
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(enCours)}
            aria-label="Fermer"
            className="p-1.5 rounded text-baikal-text hover:text-white disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {erreurPrepa && <Erreur message={erreurPrepa} />}
          {!prepa && !erreurPrepa && <Chargement />}

          {prepa && !prepa.facturable && (
            <p className="text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {prepa.raison}
            </p>
          )}

          {prepa && emise && (
            <div className="space-y-2">
              <p className="text-sm text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Facture émise : <span className="font-mono text-white">{facture.numero}</span>
              </p>
              <p className="text-sm text-baikal-text">
                {etat === 'emise_envoyee'
                  ? 'Elle est partie par e-mail au client, PDF en pièce jointe.'
                  : 'L’envoi par e-mail est en attente : Pennylane prépare encore le PDF. « Renvoyer » le rejoue dans un instant.'}
              </p>
              {resultat?.envoi_erreur && <Erreur message={`Envoi : ${resultat.envoi_erreur}`} />}
              {erreur && <Erreur message={erreur} />}
            </div>
          )}

          {prepa && enBrouillon && (
            <div className="space-y-3">
              <p className="text-sm text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Le brouillon est créé dans Pennylane.
              </p>
              <p className="text-sm text-baikal-text">
                Il vous attend dans Pennylane, parmi les brouillons de factures clients : vous pouvez l’y relire.
                Rien n’est émis tant que vous n’avez pas cliqué sur « Finaliser et envoyer ».
              </p>
              {resultat?.rendus && (
                <p className="text-sm text-baikal-text tabular-nums">
                  Pennylane calcule HT <span className="text-white">{fmtEur(resultat.rendus.ht)}</span>,
                  TVA <span className="text-white">{fmtEur(resultat.rendus.tva)}</span>,
                  TTC <span className="text-white">{fmtEur(resultat.rendus.ttc)}</span>.
                </p>
              )}
              {resultat?.client_existant === true && (
                <p className="text-xs text-baikal-text opacity-70">
                  Ce client existait déjà dans Pennylane : sa fiche a été reprise telle quelle, l’adresse saisie ici n’a pas été appliquée.
                </p>
              )}
              {facture.erreur && !erreur && <p className="text-xs text-amber-300">Dernier refus : {facture.erreur}</p>}
              {erreur && <Erreur message={erreur} />}
              <p className="text-xs text-baikal-text opacity-70">
                À l’envoi, la facture devient définitive, datée du jour. Elle prend un numéro et ne se supprime plus : une erreur se corrige par un avoir, dans Pennylane. Le PDF part à l’adresse e-mail de la fiche du client.
              </p>
            </div>
          )}

          {aSaisir && (
            <>
              {prepa.payeur_erreur && (
                <p className="text-xs text-amber-300">
                  Le payeur n’a pas pu être lu dans Stripe ({prepa.payeur_erreur}) : tout se saisit à la main.
                </p>
              )}

              <div className="flex gap-4 text-sm text-baikal-text">
                {[['particulier', 'Particulier'], ['societe', 'Société']].map(([valeur, libelle]) => (
                  <label key={valeur} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="type-client"
                      checked={form.type === valeur}
                      onChange={() => setForm((f) => ({ ...f, type: valeur }))}
                    />
                    {libelle}
                  </label>
                ))}
              </div>

              {form.type === 'particulier' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Champ libelle="Prénom"><input className={CHAMP} value={form.prenom} onChange={maj('prenom')} /></Champ>
                  <Champ libelle="Nom"><input className={CHAMP} value={form.nom} onChange={maj('nom')} /></Champ>
                </div>
              ) : (
                <Champ libelle="Raison sociale">
                  <input className={CHAMP} value={form.raison_sociale} onChange={maj('raison_sociale')} />
                </Champ>
              )}

              <Champ libelle="Adresse"><input className={CHAMP} value={form.adresse} onChange={maj('adresse')} /></Champ>
              <div className="grid grid-cols-3 gap-3">
                <Champ libelle="Code postal"><input className={CHAMP} value={form.code_postal} onChange={maj('code_postal')} /></Champ>
                <Champ libelle="Ville" className="col-span-2"><input className={CHAMP} value={form.ville} onChange={maj('ville')} /></Champ>
              </div>
              <Champ libelle="E-mail d’envoi">
                <input type="email" className={CHAMP} value={form.email} onChange={maj('email')} />
              </Champ>
              <Champ libelle="Désignation sur la facture">
                <input className={CHAMP} value={form.designation} onChange={maj('designation')} />
              </Champ>

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-baikal-text border-t border-baikal-border pt-3 tabular-nums">
                <span>HT <span className="text-white">{fmtEur(m.ht)}</span></span>
                <span>TVA <span className="text-white">{fmtEur(m.tva)}</span></span>
                <span>TTC facturé <span className="text-white">{fmtEur(m.ttc)}</span></span>
                <span>Encaissé <span className="text-white">{fmtEur(m.encaisse)}</span></span>
                <span>Compte <span className="text-white font-mono">{prepa.compte_produit}</span></span>
              </div>

              {m.ecart !== 0 && (
                <p className="text-xs text-amber-300">
                  La facture sortira à {fmtEur(m.ttc)} pour {fmtEur(m.encaisse)} encaissés : Pennylane arrondit le HT puis calcule la TVA dessus. L’écart de {fmtEur(Math.abs(m.ecart))} restera sur le compte du client.
                </p>
              )}

              {erreur && <Erreur message={erreur} />}

              <p className="text-xs text-baikal-text opacity-70">
                Le brouillon sera créé dans Pennylane, sans numéro. Rien ne part chez le client à cette étape.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-baikal-border flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(enCours)}
            className="px-3 py-1.5 rounded border border-baikal-border text-sm text-baikal-text hover:text-white disabled:opacity-40"
          >
            {emise || enBrouillon ? 'Fermer' : 'Annuler'}
          </button>
          {aSaisir && (
            <button
              type="button"
              onClick={creerBrouillon}
              disabled={Boolean(enCours)}
              className="px-3 py-1.5 rounded bg-baikal-cyan text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
            >
              <FilePlus className="w-4 h-4" />
              {enCours === 'brouillon' ? 'Création en cours…' : 'Créer le brouillon'}
            </button>
          )}
          {prepa && enBrouillon && (
            <>
              <button
                type="button"
                onClick={supprimer}
                disabled={Boolean(enCours)}
                className="px-3 py-1.5 rounded border border-baikal-border text-sm text-baikal-text hover:text-white disabled:opacity-40 inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {enCours === 'suppression' ? 'Suppression…' : 'Supprimer le brouillon'}
              </button>
              <button
                type="button"
                onClick={envoyer}
                disabled={Boolean(enCours)}
                className="px-3 py-1.5 rounded bg-baikal-cyan text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {enCours === 'envoi' ? 'Envoi en cours…' : 'Finaliser et envoyer'}
              </button>
            </>
          )}
          {prepa && etat === 'emise_envoi_en_attente' && (
            <button
              type="button"
              onClick={envoyer}
              disabled={Boolean(enCours)}
              className="px-3 py-1.5 rounded bg-baikal-cyan text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {enCours === 'envoi' ? 'Envoi en cours…' : 'Renvoyer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
