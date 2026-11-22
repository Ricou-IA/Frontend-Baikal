/**
 * FacturerVente.jsx - Baikal Console
 * ============================================================================
 * Fenetre « Facturer » d'une vente de la page Finances : le nom et l'adresse du
 * client, puis la facture definitive emise dans Pennylane et envoyee par e-mail.
 *
 * Ce composant ne calcule rien : les montants viennent de l'action
 * `facture-preparer` (module pur _shared/facturation.ts cote fonction). Le nom
 * et l'e-mail du payeur sont lus en direct dans Stripe a l'ouverture ; ils ne
 * sont gardes nulle part dans Baikal.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { X, Send, FlaskConical, Check, AlertTriangle } from 'lucide-react';
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
  const [enCours, setEnCours] = useState(null); // 'essai' | 'emission' | null
  const [erreur, setErreur] = useState(null);
  const [essai, setEssai] = useState(null);
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

  const lancer = async (mode) => {
    setEnCours(mode);
    setErreur(null);
    if (mode === 'essai') setEssai(null);
    const { designation, ...client } = form;
    const { data, error } = await financeService.emettreFacture(appId, vente.id, client, designation, mode === 'essai');
    setEnCours(null);
    if (error) { setErreur(error.message); return; }
    if (mode === 'essai') { setEssai(data); return; }
    setResultat(data);
    if (data.facture) onFacturee(vente.id, data.facture);
  };

  const m = prepa?.montants;
  const facture = resultat?.facture;

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

          {prepa?.facturable && facture && (
            <div className="space-y-2">
              <p className="text-sm text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4" />
                {resultat.deja_emise ? 'Cette vente était déjà facturée : ' : 'Facture émise : '}
                <span className="font-mono text-white">{facture.numero}</span>
              </p>
              <p className="text-sm text-baikal-text">
                {facture.etat === 'emise_envoyee'
                  ? 'Elle est partie par e-mail au client.'
                  : 'L’envoi par e-mail est en attente : Pennylane prépare encore le PDF. Le bouton « Renvoyer » de la liste le rejoue dans quelques minutes.'}
              </p>
              {resultat.client_existant && (
                <p className="text-xs text-baikal-text opacity-70">
                  Ce client existait déjà dans Pennylane : sa fiche a été reprise telle quelle, l’adresse saisie ici n’a pas été appliquée.
                </p>
              )}
              {resultat.envoi_erreur && <Erreur message={`Envoi : ${resultat.envoi_erreur}`} />}
            </div>
          )}

          {prepa?.facturable && !facture && (
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

              {essai && (
                <div className={`text-sm rounded border px-3 py-2 ${essai.conforme ? 'border-emerald-700 text-emerald-300' : 'border-red-700 text-red-300'}`}>
                  {essai.conforme
                    ? `Essai concluant : Pennylane calcule HT ${fmtEur(essai.rendus.ht)}, TVA ${fmtEur(essai.rendus.tva)}, TTC ${fmtEur(essai.rendus.ttc)}. Le brouillon d’essai est supprimé.`
                    : `Essai non conforme : ${essai.raison} Le brouillon d’essai est supprimé, rien n’est émis.`}
                  {essai.client_existant === false && ' Le client a été créé dans Pennylane.'}
                </div>
              )}

              {erreur && <Erreur message={erreur} />}

              <p className="text-xs text-baikal-text opacity-70">
                La facture sera définitive et envoyée au client. Elle prend un numéro et ne se supprime plus : une erreur se corrige par un avoir, dans Pennylane.
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
            {facture ? 'Fermer' : 'Annuler'}
          </button>
          {prepa?.facturable && !facture && (
            <>
              <button
                type="button"
                onClick={() => lancer('essai')}
                disabled={Boolean(enCours)}
                title="Crée le client et un brouillon dans Pennylane, vérifie les montants, puis supprime le brouillon"
                className="px-3 py-1.5 rounded border border-baikal-border text-sm text-baikal-text hover:text-white disabled:opacity-40 inline-flex items-center gap-2"
              >
                <FlaskConical className="w-4 h-4" />
                {enCours === 'essai' ? 'Essai en cours…' : 'Essai sans émettre'}
              </button>
              <button
                type="button"
                onClick={() => lancer('emission')}
                disabled={Boolean(enCours)}
                className="px-3 py-1.5 rounded bg-baikal-cyan text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {enCours === 'emission' ? 'Émission en cours…' : 'Émettre et envoyer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
