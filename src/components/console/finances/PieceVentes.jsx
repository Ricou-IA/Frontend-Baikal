/**
 * PieceVentes.jsx - Baikal Console
 * ============================================================================
 * Piece de ventes d'un site sur une periode de mois entiers : ce qu'elle
 * contiendrait, puis son brouillon dans Pennylane. Baikal ne finalise jamais la
 * piece : c'est le comptable qui la relit et la valide dans Pennylane.
 *
 * Ce composant ne calcule rien : lignes et totaux viennent de la fonction
 * (_shared/piece-ventes.ts).
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import { FilePlus, Trash2 } from 'lucide-react';
import { financeService } from '../../../services/finance.service';
import { Chargement, Erreur, Section } from '../etats';

const CHAMP = 'px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm';

function fmtEur(n) {
  if (n === null || n === undefined) return '—';
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
}

function fmtJour(iso) {
  if (!iso) return '';
  const [a, m, j] = String(iso).slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

function moisPrecedent() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PieceVentes({ appId, lectureSeule = false }) {
  const [du, setDu] = useState(moisPrecedent);
  const [au, setAu] = useState(moisPrecedent);
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null); // 'creation' | id de la piece supprimee
  const [cree, setCree] = useState(null);

  const calculer = useCallback(async () => {
    if (!appId || !du || !au) return;
    setChargement(true);
    setErreur(null);
    const { data, error } = await financeService.calculerPiece(appId, du, au);
    setChargement(false);
    if (error) { setErreur(error.message); setDonnees(null); return; }
    setDonnees(data);
  }, [appId, du, au]);

  useEffect(() => { setCree(null); calculer(); }, [calculer]);

  const creer = async () => {
    setEnCours('creation');
    setErreur(null);
    const { data, error } = await financeService.creerPiece(appId, du, au);
    setEnCours(null);
    if (error) { setErreur(error.message); return; }
    setCree(data);
    calculer();
  };

  const supprimer = async (id) => {
    setEnCours(id);
    setErreur(null);
    const { error } = await financeService.supprimerPiece(appId, id);
    setEnCours(null);
    if (error) { setErreur(error.message); return; }
    setCree(null);
    calculer();
  };

  if (donnees && !donnees.ouverte) return null;

  const piece = donnees?.piece;
  const hors = piece?.hors_piece;
  const pieces = donnees?.pieces ?? [];

  return (
    <Section titre="Pièce de ventes">
      <div className="bg-baikal-surface border-y sm:border border-baikal-border sm:rounded-lg p-4 space-y-4">
        <div className="flex items-end gap-3 flex-wrap text-xs text-baikal-text">
          <label className="block">
            Du mois
            <input type="month" className={`${CHAMP} block mt-1`} value={du} max={au} onChange={(e) => setDu(e.target.value)} />
          </label>
          <label className="block">
            au mois
            <input type="month" className={`${CHAMP} block mt-1`} value={au} min={du} onChange={(e) => setAu(e.target.value)} />
          </label>
          <p className="opacity-70 max-w-md">
            Une facture au client « Clients particuliers » du site, datée du dernier jour de la période,
            sur le compte <span className="font-mono text-white">{donnees?.compte_produit ?? '…'}</span>.
          </p>
        </div>

        {erreur && <Erreur message={erreur} />}
        {chargement && !donnees && <Chargement />}

        {piece && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-baikal-text">
                <thead>
                  <tr className="text-left text-xs opacity-70">
                    <th className="py-1.5 pr-2">Ligne</th>
                    <th className="text-right px-2 py-1.5">Quantité</th>
                    <th className="text-right pl-2 py-1.5">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {piece.lignes.length === 0 && (
                    <tr><td colSpan={3} className="py-3 opacity-60">Aucune vente à porter sur cette période.</td></tr>
                  )}
                  {piece.lignes.map((l) => (
                    <tr key={l.libelle} className="border-t border-baikal-border/50">
                      <td className="py-1.5 pr-2">{l.libelle}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{l.quantite}</td>
                      <td className={`text-right pl-2 py-1.5 tabular-nums ${l.ttc < 0 ? 'text-red-400' : 'text-white'}`}>{fmtEur(l.ttc)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-baikal-border font-medium">
                    <td className="py-1.5 pr-2 text-white">Total de la pièce</td>
                    <td className="text-right px-2 py-1.5 tabular-nums">{piece.nb_ventes}</td>
                    <td className="text-right pl-2 py-1.5 tabular-nums text-white">{fmtEur(piece.ttc)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-baikal-text opacity-70">
              Hors pièce sur la période : {hors.facturees_individuellement.nombre} vente(s) facturée(s) une à une
              ({fmtEur(hors.facturees_individuellement.ttc)}), {hors.pros.nombre} vente(s) aux pros facturée(s) par
              Stripe ({fmtEur(hors.pros.ttc)}), {hors.gratuites} vente(s) gratuite(s), {hors.exclues} exclue(s).
            </p>

            {donnees.deja_faite && !cree && (
              <p className="text-xs text-amber-300">
                Une pièce existe déjà sur une période qui recouvre celle-ci (du {fmtJour(donnees.deja_faite.du)} au {fmtJour(donnees.deja_faite.au)}).
              </p>
            )}

            {cree && (
              <p className="text-sm text-emerald-300">
                Brouillon créé dans Pennylane : HT {fmtEur(cree.rendus.ht)}, TVA {fmtEur(cree.rendus.tva)},
                TTC {fmtEur(cree.rendus.ttc)}. Il vous reste à le relire et à le finaliser dans Pennylane.
              </p>
            )}

            {!lectureSeule && !donnees.deja_faite && piece.lignes.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={creer}
                  disabled={Boolean(enCours) || chargement}
                  className="px-3 py-1.5 rounded bg-baikal-cyan text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
                >
                  <FilePlus className="w-4 h-4" />
                  {enCours === 'creation' ? 'Création en cours…' : 'Créer le brouillon dans Pennylane'}
                </button>
              </div>
            )}
          </>
        )}

        {pieces.length > 0 && (
          <div className="border-t border-baikal-border pt-3 space-y-1">
            <p className="text-xs text-baikal-text opacity-70">Pièces déjà préparées</p>
            {pieces.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm text-baikal-text">
                <span>
                  Du {fmtJour(p.du)} au {fmtJour(p.au)} · {p.nb_ventes} vente(s) ·{' '}
                  <span className="text-white tabular-nums">{fmtEur(Number(p.montant_ttc))}</span>
                </span>
                {!lectureSeule && (
                  <button
                    type="button"
                    onClick={() => supprimer(p.id)}
                    disabled={Boolean(enCours)}
                    title="Supprime le brouillon dans Pennylane. Refusé si la pièce y est déjà finalisée."
                    className="px-2 py-0.5 rounded border border-baikal-border text-xs hover:text-white disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    {enCours === p.id ? 'Suppression…' : 'Supprimer le brouillon'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
