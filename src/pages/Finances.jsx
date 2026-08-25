/**
 * Finances.jsx - Baikal Console
 * ============================================================================
 * Suivi financier du site selectionne, lu dans l'archive quotidienne
 * (admin.ventes + admin.finance_jours), jamais dans Stripe en direct.
 *
 *   1. Synthese : 7 jours / mois en cours / annee en cours, poste par poste.
 *   2. Tendance : serie mensuelle CA HT / couts / resultat.
 *   3. Ventilation par offre.
 *   4. Charges recurrentes (saisie).
 *   5. Ventes de la periode, ouvrables ligne a ligne.
 *
 * Une vente remboursee reste comptee dans les ventes : le remboursement est
 * un cout affiche a part, pas une annulation de chiffre d'affaires.
 * ============================================================================
 */
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { useDonneesCachees } from '../hooks/useDonneesCachees';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import { financeService } from '../services/finance.service';

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
  ['resultat', 'Résultat', 'eur'],
];

const CANAUX = {
  paid: ['Publicité', 'text-amber-400'],
  campaign: ['Campagne', 'text-violet-400'],
  organic: ['Organique', 'text-emerald-400'],
  referral: ['Référent', 'text-blue-400'],
  unattributed: ['Sans origine', 'text-baikal-text'],
  indetermine: ['Origine perdue', 'text-red-400/80'],
};

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
  const { donnees, erreur, enCours } = useDonneesCachees(
    `synthese:${appId}`,
    () => financeService.getSynthese(appId),
    appId,
  );

  const fenetres = donnees?.fenetres;
  const rienEncore = Boolean(donnees) && FENETRES.every(([cle]) => (fenetres?.[cle]?.ventes ?? 0) === 0);

  return (
    <Section
      titre="Synthèse"
      sousTitre="Archive quotidienne — le montant fait foi côté Stripe, la TVA vient du registre des sites"
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
            Stripe, les remboursements, le coût IA et les charges fixes au prorata journalier.
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

function ChargesRecurrentes({ appId }) {
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({ libelle: '', montant: '', debut: '' });
  const [occupe, setOccupe] = useState(false);
  const [erreurForm, setErreurForm] = useState(null);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `charges:${appId}:${version}`,
    () => financeService.getCharges(appId),
    appId,
  );

  const ajouter = async () => {
    if (!form.libelle || !form.montant || !form.debut) return;
    setOccupe(true);
    setErreurForm(null);
    const { error } = await financeService.creerCharge(appId, {
      libelle: form.libelle,
      montant: Number(form.montant),
      debut: form.debut,
    });
    setOccupe(false);
    if (error) setErreurForm(error.message);
    else {
      setForm({ libelle: '', montant: '', debut: '' });
      setVersion((v) => v + 1);
    }
  };

  const supprimer = async (id) => {
    const { error } = await financeService.supprimerCharge(id);
    if (error) setErreurForm(error.message);
    else setVersion((v) => v + 1);
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
                  <LigneVide colonnes={5} message="Aucune charge saisie — le résultat ne déduit alors que les frais Stripe et le coût IA." />
                )}
                {lignes.map((c) => (
                  <tr key={c.id} className="border-t border-baikal-border/50">
                    <td className="px-4 py-2">{c.libelle}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(c.montant_mensuel_eur))}</td>
                    <td className="px-2 py-2 font-mono text-xs">{c.debut}</td>
                    <td className="px-2 py-2 font-mono text-xs">{c.fin || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => supprimer(c.id)}
                        title="Supprimer"
                        className="p-1 text-baikal-text hover:text-red-400 transition-colors"
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
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              placeholder="Libellé (hébergement, API…)"
              className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm w-64"
            />
            <input
              type="number"
              step="0.01"
              value={form.montant}
              onChange={(e) => setForm({ ...form, montant: e.target.value })}
              placeholder="€ / mois"
              className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm w-28 tabular-nums"
            />
            <input
              type="date"
              value={form.debut}
              onChange={(e) => setForm({ ...form, debut: e.target.value })}
              className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm font-mono"
            />
            <button
              onClick={ajouter}
              disabled={occupe || !form.libelle || !form.montant || !form.debut}
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
                      <span className={classe}>{libelle}</span> · <span className="text-white">{c.ventes}</span> · {fmtEur(c.ca)}
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
                        <span className={(CANAUX[v.canal] || ['', 'text-baikal-text'])[1]}>
                          {(CANAUX[v.canal] || [v.canal])[0]}
                        </span>
                        {v.domaine && (
                          <span className="ml-1.5 text-xs font-mono opacity-60">{v.domaine}</span>
                        )}
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

const ASSIETTES = [
  ['organic', 'Organique seul'],
  ['organic_unattributed', 'Organique + sans origine'],
  ['hors_ads', 'Tout sauf publicité'],
  ['toutes', 'Toutes les ventes'],
];

function Partenariat({ appId }) {
  const [assiette, setAssiette] = useState(null);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `partenariat:${appId}:${assiette ?? 'contrat'}`,
    () => financeService.getPartenariat(appId, assiette),
    appId,
  );

  const contrat = donnees?.contrat;
  const lignes = donnees?.lignes ?? [];
  const assietteActive = donnees?.simulation?.assiette;

  return (
    <Section
      titre="Partenariat au résultat"
      sousTitre={contrat
        ? `${contrat.partenaire} — franchise de ${contrat.franchise} ventes par mois civil, partage à ${Math.round(contrat.part * 100)} %, depuis le ${contrat.debut}`
        : undefined}
      action={contrat && (
        <div className="flex gap-2 items-center flex-wrap">
          {ASSIETTES.map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setAssiette(cle)}
              disabled={enCours}
              className={`px-3 py-1 rounded border text-sm disabled:opacity-50 ${assietteActive === cle
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              {libelle}
            </button>
          ))}
        </div>
      )}
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
                  <th className="text-right px-2 py-2">Partageables</th>
                  <th className="text-right px-2 py-2">CA partageable</th>
                  <th className="text-right px-2 py-2">Coûts imputés</th>
                  <th className="text-right px-2 py-2">Résultat</th>
                  <th className="text-right px-2 py-2">Report</th>
                  <th className="text-right px-4 py-2">Quote-part</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 && (
                  <LigneVide colonnes={8} message="Aucun mois depuis le début du contrat." />
                )}
                {lignes.map((l) => (
                  <tr key={l.mois} className="border-t border-baikal-border/50">
                    <td className="px-4 py-2 font-mono text-xs">{String(l.mois).slice(0, 7)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{fmtNombre(l.ventes)}</td>
                    <td className={`text-right px-2 py-2 tabular-nums ${l.ventes_partageables === 0 ? 'opacity-40' : 'text-white'}`}>
                      {fmtNombre(l.ventes_partageables)}
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(l.ca_partageable_ht))}</td>
                    <td className="text-right px-2 py-2 tabular-nums opacity-70">{fmtEur(Number(l.couts_imputables))}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{fmtEur(Number(l.resultat_partageable))}</td>
                    <td className={`text-right px-2 py-2 tabular-nums ${Number(l.report_sortant) < 0 ? 'text-red-400' : 'opacity-40'}`}>
                      {Number(l.report_sortant) < 0 ? fmtEur(Number(l.report_sortant)) : '—'}
                    </td>
                    <td className={`text-right px-4 py-2 tabular-nums font-semibold ${Number(l.quote_part) > 0 ? 'text-emerald-400' : 'opacity-40'}`}>
                      {Number(l.quote_part) > 0 ? fmtEur(Number(l.quote_part)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · Les {contrat.franchise} premières
            ventes de chaque mois civil ne sont pas partagées. Le seuil s'apprécie mois par mois,
            sans report des ventes non réalisées — mais un résultat négatif, lui, se reporte
            jusqu'à apurement. Les coûts directs retenus ({contrat.couts_directs.join(', ')}) sont
            imputés au prorata des ventes partageables.
            {' '}<strong className="opacity-100">Les boutons ci-dessus simulent une autre assiette</strong> ;
            ils ne modifient pas le contrat, dont l'assiette reste « {contrat.assiette} ».
          </p>
          <div className="p-3 bg-amber-900/20 border border-amber-500/50 rounded-md flex items-start gap-3 text-amber-300 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Trois termes de l'article 7 ne sont pas encore définis contractuellement : l'assiette
              des « Ventes du mois », le « prix unitaire HT encaissé » (ici {fmtEur(Number(contrat.prix_catalogue_ht))},
              mode « {contrat.prix_unitaire} ») et la liste des « Coûts Directs ». Les valeurs
              affichées sont des hypothèses de travail, pas un décompte opposable.
            </span>
          </div>
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
      <Ventes appId={currentApp} />
      <Partenariat appId={currentApp} />
      <ChargesRecurrentes appId={currentApp} />
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
