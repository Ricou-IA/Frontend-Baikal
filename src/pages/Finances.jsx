/**
 * Finances.jsx - Baikal Console
 * ============================================================================
 * Suivi financier du site selectionne, lu dans l'archive quotidienne
 * (admin.ventes + admin.finance_jours), jamais dans Stripe en direct.
 *
 *   1. Synthese : 7 jours / mois en cours / annee en cours, poste par poste.
 *   2. Tendance : serie mensuelle CA HT / couts / resultat.
 *   3. Couts par mois : Stripe, IA, remboursements, charges, poste par poste.
 *   4. Ventes de la periode, ouvrables ligne a ligne.
 *   5. Partenariat au resultat (mois par mois, sans report).
 *   6. Charges recurrentes (saisie, edition, revocation) et ponctuelles.
 *
 * Une vente remboursee reste comptee dans les ventes : le remboursement est
 * un cout affiche a part, pas une annulation de chiffre d'affaires.
 * ============================================================================
 */
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Plus, Trash2, AlertTriangle, RefreshCw, Pencil, Check, X, Ban } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { useDonneesCachees } from '../hooks/useDonneesCachees';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import { financeService } from '../services/finance.service';
// Origine des ventes : memes buckets et memes libelles que la page Clients
// (BadgeCanal), calcules par l'EF avec la cascade de admin-dossiers/canal.ts.
import { BadgeCanal, CANAUX } from '../components/console/badges-clients';

const FENETRES = [
  ['7j', '7 derniers jours'],
  ['mois', 'Mois en cours'],
  ['annee', 'Année en cours'],
];

const POSTES = [
  ['ventes', 'Ventes', 'nombre'],
  ['ca_ttc', 'CA TTC', 'eur'],
  ['ca_ht', 'CA HT', 'eur'],
  ['frais_stripe', 'Frais Stripe', 'eur'],
  ['remboursements', 'Remboursements', 'eur'],
  ['cout_ia', 'Coût IA', 'eur'],
  ['ads', 'Google Ads', 'eur'],
  ['charges_fixes', 'Charges fixes', 'eur'],
  ['charges_ponctuelles', 'Charges ponctuelles', 'eur'],
  ['resultat', 'Résultat', 'eur'],
];

// Le mois en cours est le seul mis en avant dans les tableaux mensuels.
const MOIS_COURANT = new Date().toISOString().slice(0, 7);
const classeMois = (mois) => (String(mois).slice(0, 7) === MOIS_COURANT
  ? 'bg-baikal-cyan/10 text-white'
  : '');

const CHAMP = 'px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm';

function fmtEur(n) {
  if (n === null || n === undefined) return '—';
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
}
function fmtNombre(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0);
}

function BandeauIncomplet({ fenetres }) {
  const jours = new Set();
  for (const f of Object.values(fenetres || {})) {
    for (const j of f.jours_incomplets || []) jours.add(j);
  }
  if (jours.size === 0) return null;
  return (
    <div className="p-3 bg-amber-900/20 border border-amber-500/50 rounded-md flex items-start gap-3 text-amber-300 text-sm">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>
        {jours.size} journée{jours.size > 1 ? 's' : ''} incomplète{jours.size > 1 ? 's' : ''} dans
        la période ({[...jours].sort().join(', ')}) — une source de coûts a échoué ce jour-là.
        Les totaux ci-dessous sont donc minorés.
      </span>
    </div>
  );
}

function Synthese({ appId }) {
  const [version, setVersion] = useState(0);
  const [rafraichissement, setRafraichissement] = useState(false);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `synthese:${appId}:${version}`,
    () => financeService.getSynthese(appId),
    appId,
  );

  // La capture tourne toutes les 4 h : ce bouton evite d'attendre le passage
  // suivant pour voir une vente qui vient d'etre encaissee.
  const rafraichir = async () => {
    setRafraichissement(true);
    await financeService.rafraichir(appId);
    setRafraichissement(false);
    setVersion((v) => v + 1);
  };

  const fenetres = donnees?.fenetres;
  const rienEncore = Boolean(donnees) && FENETRES.every(([cle]) => (fenetres?.[cle]?.ventes ?? 0) === 0);

  return (
    <Section
      titre="Synthèse"
      sousTitre="Archive alimentée toutes les 4 h — le montant fait foi côté Stripe, la TVA vient du registre des sites"
      action={(
        <button
          onClick={rafraichir}
          disabled={rafraichissement || enCours}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan transition-colors disabled:opacity-50 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${rafraichissement ? 'animate-spin' : ''}`} />
          {rafraichissement ? 'Relevé en cours…' : 'Rafraîchir'}
        </button>
      )}
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {rienEncore && (
        <Vide message="Aucune vente archivée pour ce site. La capture tourne chaque nuit à 04h30 ; un site qui n'encaisse pas restera vide." />
      )}
      {donnees && !rienEncore && (
        <ContenuEstompe enCours={enCours}>
          <BandeauIncomplet fenetres={fenetres} />
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">Indicateur</th>
                  {FENETRES.map(([cle, libelle]) => (
                    <th key={cle} className="text-right px-4 py-2">{libelle}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSTES.map(([cle, libelle, format]) => (
                  <tr key={cle} className={`border-t border-baikal-border/50 ${cle === 'resultat' ? 'font-semibold text-white' : ''}`}>
                    <td className="px-4 py-2">{libelle}</td>
                    {FENETRES.map(([f]) => {
                      const v = fenetres?.[f]?.[cle];
                      const classe = cle === 'resultat'
                        ? (v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : '')
                        : '';
                      return (
                        <td key={f} className={`text-right px-4 py-2 tabular-nums ${classe}`}>
                          {format === 'nombre' ? fmtNombre(v) : fmtEur(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · Le résultat déduit du CA HT les frais
            Stripe, les remboursements, le coût IA, les charges fixes au prorata journalier et les
            charges ponctuelles le jour où elles tombent.
            Une vente remboursée reste comptée dans les ventes — le remboursement apparaît à sa
            propre ligne. « Google Ads » reste vide tant qu'aucun compte n'est branché : c'est une
            absence de configuration, pas un jour manquant.
          </p>
        </ContenuEstompe>
      )}
    </Section>
  );
}

function Tendance({ appId }) {
  const [mois, setMois] = useState(12);
  const { donnees, erreur, enCours } = useDonneesCachees(
    `serie:${appId}:${mois}`,
    () => financeService.getSerie(appId, mois),
    appId,
  );

  const points = useMemo(() => (donnees?.lignes ?? []).map((l) => ({
    mois: l.mois,
    ca_ht: l.ca_ht,
    couts: Number((l.frais_stripe + l.remboursements + l.cout_ia + l.charges_fixes).toFixed(2)),
    resultat: l.resultat,
  })), [donnees]);

  const vide = Boolean(donnees) && points.every((p) => p.ca_ht === 0 && p.couts === 0);

  return (
    <Section
      titre="Tendance"
      sousTitre="Série mensuelle, calculée depuis l'archive"
      action={(
        <div className="flex gap-2 items-center">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              onClick={() => setMois(m)}
              disabled={enCours}
              className={`px-3 py-1 rounded border disabled:opacity-50 ${mois === m
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              {m} mois
            </button>
          ))}
        </div>
      )}
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {vide && <Vide message="Aucun mois archivé sur cette période." />}
      {donnees && !vide && (
        <div className={`bg-baikal-surface border border-baikal-border rounded-lg p-4 ${enCours ? 'opacity-50' : ''}`}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mois" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${v} €`} />
              <Tooltip
                contentStyle={{ background: '#161B26', border: '1px solid #2D3748', borderRadius: 6 }}
                formatter={(v) => fmtEur(v)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ca_ht" name="CA HT" stroke="#00F0FF" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="couts" name="Coûts" stroke="#f59e0b" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              <Line type="monotone" dataKey="resultat" name="Résultat" stroke="#10b981" dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

const POSTES_COUTS = [
  ['frais_stripe', 'Stripe'],
  ['cout_ia', 'IA'],
  ['remboursements', 'Remboursements'],
  ['charges_fixes', 'Charges fixes'],
  ['charges_ponctuelles', 'Charges ponctuelles'],
];

function CoutsParMois({ appId }) {
  const [mois, setMois] = useState(12);
  const { donnees, erreur, enCours } = useDonneesCachees(
    `serie:${appId}:${mois}`,
    () => financeService.getSerie(appId, mois),
    appId,
  );

  // Les mois sans la moindre activite alourdissent le tableau sans rien dire.
  const lignes = useMemo(() => (donnees?.lignes ?? [])
    .filter((l) => l.ventes > 0 || POSTES_COUTS.some(([c]) => Number(l[c]) > 0))
    .reverse(), [donnees]);

  return (
    <Section
      titre="Coûts par mois"
      sousTitre="Ce que chaque mois a coûté, poste par poste — la même série que la tendance"
      action={(
        <div className="flex gap-2 items-center">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              onClick={() => setMois(m)}
              disabled={enCours}
              className={`px-3 py-1 rounded border disabled:opacity-50 ${mois === m
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              {m} mois
            </button>
          ))}
        </div>
      )}
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">Mois</th>
                  <th className="text-right px-2 py-2">Ventes</th>
                  <th className="text-right px-2 py-2">CA HT</th>
                  {POSTES_COUTS.map(([cle, libelle]) => (
                    <th key={cle} className="text-right px-2 py-2">{libelle}</th>
                  ))}
                  <th className="text-right px-2 py-2">Total coûts</th>
                  <th className="text-right px-4 py-2">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && (
                  <LigneVide colonnes={5 + POSTES_COUTS.length} message="Aucun mois archivé sur cette période." />
                )}
                {lignes.map((l) => {
                  const total = POSTES_COUTS.reduce((acc, [c]) => acc + Number(l[c] || 0), 0);
                  return (
                    <tr key={l.mois} className={`border-t border-baikal-border/50 ${classeMois(l.mois)}`}>
                      <td className="px-4 py-2 font-mono text-xs">{l.mois}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtNombre(l.ventes)}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtEur(l.ca_ht)}</td>
                      {POSTES_COUTS.map(([cle]) => (
                        <td key={cle} className={`text-right px-2 py-2 tabular-nums ${Number(l[cle]) > 0 ? '' : 'opacity-40'}`}>
                          {Number(l[cle]) > 0 ? `− ${fmtEur(l[cle])}` : '—'}
                        </td>
                      ))}
                      <td className="text-right px-2 py-2 tabular-nums font-semibold">− {fmtEur(total)}</td>
                      <td className={`text-right px-4 py-2 tabular-nums font-semibold ${l.resultat > 0 ? 'text-emerald-400' : l.resultat < 0 ? 'text-red-400' : ''}`}>
                        {fmtEur(l.resultat)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ContenuEstompe>
      )}
    </Section>
  );
}

// Fin d'une charge recurrente : une date, ou « jusqu'a revocation » (fin NULL).
// Composant de premier niveau : defini dans le rendu, il serait remonte a chaque
// frappe et l'input de date perdrait le focus.
function ChampsFin({ etat, setEtat }) {
return (
  <div className="flex items-center gap-1.5">
    <select
      value={etat.finMode}
      onChange={(e) => setEtat({ ...etat, finMode: e.target.value })}
      className={`${CHAMP} w-40`}
    >
      <option value="revocation">Jusqu'à révocation</option>
      <option value="date">Jusqu'au…</option>
    </select>
    {etat.finMode === 'date' && (
      <input
        type="date"
        value={etat.fin}
        min={etat.debut || undefined}
        onChange={(e) => setEtat({ ...etat, fin: e.target.value })}
        className={`${CHAMP} font-mono`}
      />
    )}
  </div>
);
}

function ChargesRecurrentes({ appId }) {
  const [version, setVersion] = useState(0);
  const formVide = { libelle: '', montant: '', debut: '', finMode: 'revocation', fin: '' };
  const [form, setForm] = useState(formVide);
  const [edition, setEdition] = useState(null); // { id, libelle, montant, debut, finMode, fin }
  const [revocation, setRevocation] = useState(null); // { id, fin }
  const [occupe, setOccupe] = useState(false);
  const [erreurForm, setErreurForm] = useState(null);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `charges:${appId}:${version}`,
    () => financeService.getCharges(appId),
    appId,
  );

  const terminer = ({ error }) => {
    setOccupe(false);
    if (error) setErreurForm(error.message);
    else {
      setErreurForm(null);
      setEdition(null);
      setRevocation(null);
      setVersion((v) => v + 1);
    }
  };

  const finValide = (f) => f.finMode === 'revocation' || Boolean(f.fin);

  const ajouter = async () => {
    if (!form.libelle || !form.montant || !form.debut || !finValide(form)) return;
    setOccupe(true);
    const r = await financeService.creerCharge(appId, {
      libelle: form.libelle,
      montant: Number(form.montant),
      debut: form.debut,
      fin: form.finMode === 'date' ? form.fin : null,
    });
    if (!r.error) setForm(formVide);
    terminer(r);
  };

  const enregistrer = async () => {
    if (!edition.libelle || !edition.montant || !edition.debut || !finValide(edition)) return;
    setOccupe(true);
    terminer(await financeService.modifierCharge(edition.id, {
      libelle: edition.libelle,
      montant: Number(edition.montant),
      debut: edition.debut,
      fin: edition.finMode === 'date' ? edition.fin : null,
    }));
  };

  // Revoquer = poser la date de fin d'une charge « jusqu'a revocation ».
  const revoquer = async () => {
    if (!revocation?.fin) return;
    setOccupe(true);
    terminer(await financeService.modifierCharge(revocation.id, { fin: revocation.fin }));
  };

  const supprimer = async (id) => {
    setOccupe(true);
    terminer(await financeService.supprimerCharge(id));
  };

  const lignes = donnees?.lignes ?? [];

  return (
    <Section
      titre="Charges récurrentes"
      sousTitre="Réparties au prorata journalier — une charge mensuelle ne creuse pas un trou le 1er"
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">Libellé</th>
                  <th className="text-right px-2 py-2">Par mois</th>
                  <th className="px-2 py-2">Depuis</th>
                  <th className="px-2 py-2">Jusqu'au</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && (
                  <LigneVide colonnes={5} message="Aucune charge saisie — le résultat ne déduit alors que les frais Stripe, les remboursements et le coût IA." />
                )}
                {lignes.map((c) => {
                  const enEdition = edition?.id === c.id;
                  const enRevocation = revocation?.id === c.id;
                  if (enEdition) {
                    return (
                      <tr key={c.id} className="border-t border-baikal-border/50 bg-baikal-cyan/5">
                        <td className="px-4 py-2">
                          <input value={edition.libelle} onChange={(e) => setEdition({ ...edition, libelle: e.target.value })} className={`${CHAMP} w-full`} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input type="number" step="0.01" value={edition.montant} onChange={(e) => setEdition({ ...edition, montant: e.target.value })} className={`${CHAMP} w-24 text-right tabular-nums`} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="date" value={edition.debut} onChange={(e) => setEdition({ ...edition, debut: e.target.value })} className={`${CHAMP} font-mono`} />
                        </td>
                        <td className="px-2 py-2"><ChampsFin etat={edition} setEtat={setEdition} /></td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button onClick={enregistrer} disabled={occupe} title="Enregistrer" className="p-1 text-baikal-cyan hover:text-white disabled:opacity-50">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEdition(null)} disabled={occupe} title="Annuler" className="p-1 text-baikal-text hover:text-white disabled:opacity-50">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={c.id} className={`border-t border-baikal-border/50 ${c.fin && c.fin < MOIS_COURANT ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2">{c.libelle}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(c.montant_mensuel_eur))}</td>
                      <td className="px-2 py-2 font-mono text-xs">{c.debut}</td>
                      <td className="px-2 py-2 text-xs">
                        {enRevocation ? (
                          <span className="flex items-center gap-1.5">
                            <input
                              type="date"
                              value={revocation.fin}
                              min={c.debut}
                              onChange={(e) => setRevocation({ ...revocation, fin: e.target.value })}
                              className={`${CHAMP} font-mono`}
                            />
                            <button onClick={revoquer} disabled={occupe || !revocation.fin} title="Confirmer la révocation" className="p-1 text-baikal-cyan hover:text-white disabled:opacity-50">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setRevocation(null)} disabled={occupe} title="Annuler" className="p-1 text-baikal-text hover:text-white disabled:opacity-50">
                              <X className="w-4 h-4" />
                            </button>
                          </span>
                        ) : c.fin ? (
                          <span className="font-mono">{c.fin}</span>
                        ) : (
                          <span className="opacity-60">Jusqu'à révocation</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {!c.fin && !enRevocation && (
                          <button
                            onClick={() => setRevocation({ id: c.id, fin: new Date().toISOString().slice(0, 10) })}
                            disabled={occupe}
                            title="Révoquer : poser la date de fin"
                            className="p-1 text-baikal-text hover:text-amber-400 transition-colors disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setEdition({
                            id: c.id,
                            libelle: c.libelle,
                            montant: String(c.montant_mensuel_eur),
                            debut: c.debut,
                            finMode: c.fin ? 'date' : 'revocation',
                            fin: c.fin || '',
                          })}
                          disabled={occupe}
                          title="Modifier"
                          className="p-1 text-baikal-text hover:text-baikal-cyan transition-colors disabled:opacity-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => supprimer(c.id)}
                          disabled={occupe}
                          title="Supprimer"
                          className="p-1 text-baikal-text hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              placeholder="Libellé (hébergement, API…)"
              className={`${CHAMP} w-64`}
            />
            <input
              type="number"
              step="0.01"
              value={form.montant}
              onChange={(e) => setForm({ ...form, montant: e.target.value })}
              placeholder="€ / mois"
              className={`${CHAMP} w-28 tabular-nums`}
            />
            <input
              type="date"
              value={form.debut}
              onChange={(e) => setForm({ ...form, debut: e.target.value })}
              title="Depuis le"
              className={`${CHAMP} font-mono`}
            />
            <ChampsFin etat={form} setEtat={setForm} />
            <button
              onClick={ajouter}
              disabled={occupe || !form.libelle || !form.montant || !form.debut || !finValide(form)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>
          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · Une charge « jusqu'à révocation »
            court sans fin ; la révoquer, c'est lui poser sa date de fin, elle cesse d'être
            déduite le lendemain. Chaque ligne se modifie en place.
          </p>
          {erreurForm && <Erreur message={erreurForm} />}
        </ContenuEstompe>
      )}
    </Section>
  );
}

function ChargesPonctuelles({ appId }) {
  const [version, setVersion] = useState(0);
  const formVide = { libelle: '', montant: '', jour: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(formVide);
  const [occupe, setOccupe] = useState(false);
  const [erreurForm, setErreurForm] = useState(null);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `ponctuelles:${appId}:${version}`,
    () => financeService.getPonctuelles(appId),
    appId,
  );

  const terminer = ({ error }) => {
    setOccupe(false);
    if (error) setErreurForm(error.message);
    else {
      setErreurForm(null);
      setVersion((v) => v + 1);
    }
  };

  const ajouter = async () => {
    if (!form.libelle || !form.montant || !form.jour) return;
    setOccupe(true);
    const r = await financeService.creerPonctuelle(appId, {
      libelle: form.libelle,
      montant: Number(form.montant),
      jour: form.jour,
    });
    if (!r.error) setForm(formVide);
    terminer(r);
  };

  const supprimer = async (id) => {
    setOccupe(true);
    terminer(await financeService.supprimerPonctuelle(id));
  };

  const lignes = donnees?.lignes ?? [];

  return (
    <Section
      titre="Charges ponctuelles"
      sousTitre="Dépenses non récurrentes — déduites le jour où elles tombent, sans prorata"
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-2 py-2">Libellé</th>
                  <th className="text-right px-2 py-2">Montant</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && (
                  <LigneVide colonnes={4} message="Aucune charge ponctuelle saisie." />
                )}
                {lignes.map((c) => (
                  <tr key={c.id} className={`border-t border-baikal-border/50 ${classeMois(c.jour)}`}>
                    <td className="px-4 py-2 font-mono text-xs">{c.jour}</td>
                    <td className="px-2 py-2">{c.libelle}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(c.montant_eur))}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => supprimer(c.id)}
                        disabled={occupe}
                        title="Supprimer"
                        className="p-1 text-baikal-text hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={form.jour}
              onChange={(e) => setForm({ ...form, jour: e.target.value })}
              className={`${CHAMP} font-mono`}
            />
            <input
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              placeholder="Libellé (nom de domaine, prestation…)"
              className={`${CHAMP} w-72`}
            />
            <input
              type="number"
              step="0.01"
              value={form.montant}
              onChange={(e) => setForm({ ...form, montant: e.target.value })}
              placeholder="€"
              className={`${CHAMP} w-28 tabular-nums`}
            />
            <button
              onClick={ajouter}
              disabled={occupe || !form.libelle || !form.montant || !form.jour}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>
          {erreurForm && <Erreur message={erreurForm} />}
        </ContenuEstompe>
      )}
    </Section>
  );
}

function Ventes({ appId }) {
  const debut = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1)).toISOString();
  }, []);
  const fin = useMemo(() => new Date().toISOString(), []);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `ventes:${appId}`,
    () => financeService.getVentes(appId, debut, fin),
    appId,
  );

  const lignes = donnees?.lignes ?? [];

  const parCanal = useMemo(() => {
    const m = new Map();
    for (const v of lignes) {
      const cle = v.canal || 'unattributed';
      const cur = m.get(cle) || { canal: cle, ventes: 0, ca: 0 };
      cur.ventes += 1;
      cur.ca += Number(v.montant_ttc);
      m.set(cle, cur);
    }
    return [...m.values()].sort((a, b) => b.ventes - a.ventes);
  }, [lignes]);

  const parOffre = useMemo(() => {
    const m = new Map();
    for (const v of lignes) {
      const cur = m.get(v.offre) || { offre: v.offre, ventes: 0, ca: 0 };
      cur.ventes += 1;
      cur.ca += Number(v.montant_ttc);
      m.set(v.offre, cur);
    }
    return [...m.values()].sort((a, b) => b.ca - a.ca);
  }, [lignes]);

  return (
    <Section
      titre="Ventes"
      sousTitre="Trois derniers mois — chaque ligne est ouvrable, c'est ce qui rend le calcul auditable"
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && (
        <ContenuEstompe enCours={enCours}>
          {parOffre.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {parOffre.map((o) => (
                <span key={o.offre} className="px-3 py-1.5 rounded-md border border-baikal-border text-sm text-baikal-text">
                  {o.offre} · <span className="text-white">{o.ventes}</span> · {fmtEur(o.ca)}
                </span>
              ))}
            </div>
          )}

          {parCanal.length > 0 && (
            <>
              <div className="flex gap-2 flex-wrap">
                {parCanal.map((c) => {
                  const [libelle, classe] = CANAUX[c.canal] || [c.canal, 'text-baikal-text'];
                  return (
                    <span key={c.canal} className="px-3 py-1.5 rounded-md border border-baikal-border text-sm text-baikal-text">
                      <span className={classe}>{libelle || 'Sans origine'}</span> · <span className="text-white">{c.ventes}</span> · {fmtEur(c.ca)}
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
                <strong className="opacity-100">Lecture</strong> · « Sans origine » est une catégorie
                à part entière, jamais un reste à répartir : ces visiteurs sont arrivés sans que le
                navigateur transmette d'où. « Origine perdue » est différent — la vente <em>avait</em>
                une origine, effacée depuis par la purge RGPD du site. Les confondre ferait croire à
                une baisse de l'organique là où il n'y a qu'un oubli de mesure.
              </p>
            </>
          )}
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm text-baikal-text">
                <thead className="sticky top-0 z-10 bg-baikal-surface">
                  <tr className="text-left text-xs opacity-70">
                    <th className="px-4 py-2">Payée le</th>
                    <th className="px-2 py-2">Offre</th>
                    <th className="px-2 py-2">Origine</th>
                    <th className="text-right px-2 py-2">TTC</th>
                    <th className="text-right px-2 py-2">HT</th>
                    <th className="text-right px-2 py-2">Frais</th>
                    <th className="text-right px-4 py-2">Remboursé</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.length === 0 && (
                    <LigneVide colonnes={7} message="Aucune vente archivée sur les trois derniers mois." />
                  )}
                  {lignes.map((v) => (
                    <tr key={v.id} className="border-t border-baikal-border/50">
                      <td className="px-4 py-1.5 font-mono text-xs">{v.paid_at?.slice(0, 10)}</td>
                      <td className="px-2 py-1.5">{v.offre}</td>
                      <td className="px-2 py-1.5">
                        {CANAUX[v.canal]?.[0]
                          ? <BadgeCanal canal={v.canal} attribution={v.attribution} />
                          : <span className="opacity-40">—</span>}
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{fmtEur(Number(v.montant_ttc))}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums opacity-70">{fmtEur(Number(v.montant_ht))}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums opacity-70">{fmtEur(Number(v.frais_stripe_eur))}</td>
                      <td className={`text-right px-4 py-1.5 tabular-nums ${Number(v.montant_rembourse) > 0 ? 'text-red-400' : 'opacity-40'}`}>
                        {Number(v.montant_rembourse) > 0 ? fmtEur(Number(v.montant_rembourse)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ContenuEstompe>
      )}
    </Section>
  );
}

function Partenariat({ appId }) {
  // Decompte du contrat tel quel : toutes les ventes encaissees, aucune
  // simulation d'assiette (decision d'Eric du 06/09/2026).
  const { donnees, erreur, enCours } = useDonneesCachees(
    `partenariat:${appId}`,
    () => financeService.getPartenariat(appId),
    appId,
  );

  const contrat = donnees?.contrat;
  const lignes = donnees?.lignes ?? [];

  return (
    <Section
      titre="Partenariat au résultat"
      sousTitre={contrat
        ? `${contrat.partenaire} — franchise de ${contrat.franchise} ventes par mois civil, partage à ${Math.round(contrat.part * 100)} %, depuis le ${contrat.debut}`
        : undefined}
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && !contrat && (
        <Vide message="Aucun partenariat au résultat sur ce site." />
      )}
      {contrat && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">Mois</th>
                  <th className="text-right px-2 py-2">Ventes</th>
                  <th className="text-right px-2 py-2">CA HT</th>
                  <th className="text-right px-2 py-2">Coûts du mois</th>
                  <th className="text-right px-2 py-2">Partageables</th>
                  <th className="text-right px-2 py-2">CA partageable</th>
                  <th className="text-right px-2 py-2">Coûts imputés</th>
                  <th className="text-right px-2 py-2">Résultat</th>
                  <th className="text-right px-4 py-2">Quote-part</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && (
                  <LigneVide colonnes={9} message="Aucune vente archivée pour ce site." />
                )}
                {lignes.map((l) => {
                  // Avant le contrat : ventes et CA HT pour la tendance, pas de partage.
                  const dans = l.dans_decompte !== false;
                  return (
                    <tr key={l.mois} className={`border-t border-baikal-border/50 ${classeMois(l.mois)}`}>
                      <td className="px-4 py-2 font-mono text-xs">{String(l.mois).slice(0, 7)}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtNombre(l.ventes)}</td>
                      <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(l.ca_ht))}</td>
                      <td className="text-right px-2 py-2 tabular-nums opacity-70">{fmtEur(Number(l.couts_mois))}</td>
                      {dans ? (
                        <>
                          <td className={`text-right px-2 py-2 tabular-nums ${l.ventes_partageables === 0 ? 'opacity-40' : 'text-white'}`}>
                            {fmtNombre(l.ventes_partageables)}
                          </td>
                          <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(l.ca_partageable_ht))}</td>
                          <td className="text-right px-2 py-2 tabular-nums opacity-70">{fmtEur(Number(l.couts_imputables))}</td>
                          <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(l.resultat_partageable))}</td>
                          <td className={`text-right px-4 py-2 tabular-nums font-semibold ${Number(l.quote_part) > 0 ? 'text-emerald-400' : 'opacity-40'}`}>
                            {Number(l.quote_part) > 0 ? fmtEur(Number(l.quote_part)) : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          {[0, 1, 2, 3].map((i) => (
                            <td key={i} className="text-right px-2 py-2 opacity-40">—</td>
                          ))}
                          <td className="text-right px-4 py-2 opacity-40">—</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · Les {contrat.franchise} premières
            ventes encaissées de chaque mois civil ne sont pas partagées. Le seuil s'apprécie mois
            par mois, sans report d'un mois sur l'autre. Les coûts directs retenus
            ({contrat.couts_directs.join(', ')}) sont imputés au prorata des ventes partageables.
            Les mois antérieurs au contrat donnent la tendance, sans franchise ni partage.
          </p>
        </ContenuEstompe>
      )}
    </Section>
  );
}

function FinancesContent() {
  const { currentApp } = useApp();
  return (
    <div className="p-6 space-y-10">
      <Synthese appId={currentApp} />
      <Tendance appId={currentApp} />
      <CoutsParMois appId={currentApp} />
      <Ventes appId={currentApp} />
      <Partenariat appId={currentApp} />
      <ChargesRecurrentes appId={currentApp} />
      <ChargesPonctuelles appId={currentApp} />
    </div>
  );
}

export default function Finances() {
  return (
    <ConsoleLayout actif="finances">
      <FinancesContent />
    </ConsoleLayout>
  );
}
