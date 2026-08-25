/**
 * Seo.jsx - Baikal Console
 * ============================================================================
 * SEO multi-sites, parite avec le /admin de Pre-etat-date :
 *   1. Vue d'ensemble : KPIs a accents metier, distribution des impressions
 *      par bucket de position (barres cliquables filtrant la table), top 50
 *      requetes, top pages, notes de lecture.
 *   2. Comparatif periode vs periode : statuts Regression / Disparue /
 *      Nouvelle / Progression / Stable (logique PV, ±1 rang).
 *   3. Bing vs Google : archive mensuelle admin.seo_snapshots + ecarts.
 *   4. Tous les sites : vue croisee propre a Baikal.
 * Enrobage et selecteur de site fournis par ConsoleLayout (useApp).
 * ============================================================================
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApp } from '../contexts/AppContext';
import { useDonneesCachees } from '../hooks/useDonneesCachees';
import {
  Chargement,
  ContenuEstompe,
  Erreur,
  LigneVide,
  Section,
  Vide,
} from '../components/console/etats';
import ConsoleLayout from '../components/console/ConsoleLayout';
import KpiCarte from '../components/console/KpiCarte';
import { seoService } from '../services/seo.service';

const FENETRES = [7, 28, 90];

function fmtInt(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0);
}
function pct(n) {
  return `${((n || 0) * 100).toFixed(1)} %`;
}
function fmtPos(n) {
  return n === null || n === undefined ? '—' : Number(n).toFixed(1);
}
function fmtSigne(n) {
  if (n === null || n === undefined) return '—';
  return n > 0 ? `+${fmtInt(n)}` : fmtInt(n);
}

function accentCtr(ctrFraction) {
  const c = (ctrFraction || 0) * 100;
  if (c >= 5) return 'success';
  if (c >= 3) return 'info';
  return 'warning';
}
function accentPosition(pos) {
  if (pos === null || pos === undefined || pos === 0) return 'default';
  if (pos <= 3) return 'success';
  if (pos <= 10) return 'info';
  if (pos <= 20) return 'warning';
  return 'danger';
}
function classePosition(pos) {
  if (pos === null || pos === undefined) return 'text-baikal-text opacity-50';
  if (pos <= 3) return 'text-emerald-400';
  if (pos <= 10) return 'text-blue-400';
  if (pos <= 20) return 'text-amber-400';
  return 'text-baikal-text opacity-50';
}
function classeCtr(ctrPct) {
  if (ctrPct >= 5) return 'text-emerald-400';
  if (ctrPct >= 3) return 'text-blue-400';
  return 'text-baikal-text opacity-60';
}
function bucketDe(pos) {
  if (pos === null || pos === undefined) return 'beyond';
  if (pos <= 3) return 'top3';
  if (pos <= 10) return 'top10';
  if (pos <= 20) return 'top20';
  return 'beyond';
}

function Delta({ actuel, precedent, inverse = false }) {
  if (!precedent) return <Minus className="w-4 h-4 text-baikal-text" />;
  const delta = ((actuel - precedent) / precedent) * 100;
  const positif = inverse ? delta < 0 : delta > 0;
  const Icone = delta === 0 ? Minus : (delta > 0 ? TrendingUp : TrendingDown);
  return (
    <span className={positif ? 'text-emerald-400' : 'text-red-400'}>
      <Icone className="w-4 h-4 inline" /> {delta > 0 ? '+' : ''}{delta.toFixed(1)} %
    </span>
  );
}

// Variation en VALEUR (rangs) — pour les positions, ou un % n'a pas de sens.
// inverse : une baisse de rang est une bonne nouvelle.
function DeltaRangs({ actuel, precedent }) {
  if (actuel === null || actuel === undefined
    || precedent === null || precedent === undefined || precedent === 0) {
    return <Minus className="w-4 h-4 text-baikal-text" />;
  }
  const delta = actuel - precedent;
  const positif = delta < 0; // rang qui baisse = mieux classe
  const Icone = delta === 0 ? Minus : (delta > 0 ? TrendingUp : TrendingDown);
  return (
    <span className={delta === 0 ? 'text-baikal-text' : positif ? 'text-emerald-400' : 'text-red-400'}>
      <Icone className="w-4 h-4 inline" /> {delta > 0 ? '+' : ''}{delta.toFixed(1)} rang{Math.abs(delta) >= 2 ? 's' : ''}
    </span>
  );
}


function ChoixFenetre({ valeur, onChange, options = FENETRES, occupe = false }) {
  return (
    <div className="flex gap-2 items-center">
      {occupe && <Loader2 className="w-4 h-4 text-baikal-cyan animate-spin" />}
      {options.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          disabled={occupe}
          className={`px-3 py-1 rounded border disabled:opacity-50 ${valeur === f
            ? 'border-baikal-cyan text-baikal-cyan'
            : 'border-baikal-border text-baikal-text'}`}
        >
          {f} j
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// 0. PERFORMANCES (serie quotidienne, archive interne)
// ============================================================================

const SERIES_PERF = [
  { cle: 'clicks', libelle: 'Clics', couleur: '#3b82f6' },
  { cle: 'impressions', libelle: 'Impressions', couleur: '#8b5cf6' },
  { cle: 'ctr_pct', libelle: 'CTR %', couleur: '#10b981' },
  { cle: 'position', libelle: 'Position', couleur: '#f59e0b' },
];

function InfoBulle({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const brut = payload[0]?.payload?.brut;
  if (!brut) return null;
  return (
    <div className="bg-baikal-bg border border-baikal-border rounded p-2 text-xs text-baikal-text space-y-0.5">
      <p className="font-mono opacity-70">{label}</p>
      <p style={{ color: '#3b82f6' }}>Clics : {fmtInt(brut.clicks)}</p>
      <p style={{ color: '#8b5cf6' }}>Impressions : {fmtInt(brut.impressions)}</p>
      <p style={{ color: '#10b981' }}>CTR : {brut.ctr_pct ?? '—'} %</p>
      <p style={{ color: '#f59e0b' }}>Position : {fmtPos(brut.position)}</p>
    </div>
  );
}

function Performances({ appId }) {
  const [moisPeriode, setMoisPeriode] = useState(16);
  const [actives, setActives] = useState({
    clicks: true, impressions: true, ctr_pct: true, position: true,
  });
  const { donnees, erreur, enCours } = useDonneesCachees(
    `serie:${appId}:${moisPeriode}`,
    () => seoService.getSerie(appId, moisPeriode),
    appId,
  );

  // Normalisation 0-100 par serie, comme Search Console : chaque metrique a
  // sa propre echelle, l'infobulle montre les valeurs reelles.
  const points = useMemo(() => {
    const jours = donnees?.jours ?? [];
    const maxi = {};
    for (const serie of SERIES_PERF) {
      maxi[serie.cle] = Math.max(1, ...jours.map((j) => j[serie.cle] ?? 0));
    }
    return jours.map((j) => {
      const point = { date: j.date, brut: j };
      for (const serie of SERIES_PERF) {
        point[serie.cle] = j[serie.cle] !== null
          ? (j[serie.cle] / maxi[serie.cle]) * 100
          : null;
      }
      return point;
    });
  }, [donnees]);

  return (
    <Section
      titre="Performances"
      sousTitre="Serie quotidienne Google — archivee en base, analysable a la demande (demande a Claude)"
      action={(
        <div className="flex gap-2 items-center flex-wrap">
          {enCours && <Loader2 className="w-4 h-4 text-baikal-cyan animate-spin" />}
          {[3, 6, 12, 16].map((m) => (
            <button
              key={m}
              onClick={() => setMoisPeriode(m)}
              disabled={enCours}
              className={`px-3 py-1 rounded border disabled:opacity-50 ${moisPeriode === m
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
      {donnees && points.length === 0 && (
        <Vide message={`Aucune journee archivee pour ce site sur les ${moisPeriode} derniers mois. L'archive se remplit au fil des releves quotidiens, et uniquement pour un site dote d'une propriete Search Console.`} />
      )}
      {donnees && points.length > 0 && (
        <div className={enCours ? 'opacity-50' : ''}>
          <div className="flex gap-2 flex-wrap mb-3">
            {SERIES_PERF.map((serie) => (
              <button
                key={serie.cle}
                onClick={() => setActives((a) => ({ ...a, [serie.cle]: !a[serie.cle] }))}
                className={`px-3 py-1 rounded border text-sm transition-opacity ${actives[serie.cle] ? '' : 'opacity-40'}`}
                style={{ borderColor: serie.couleur, color: serie.couleur }}
              >
                {serie.libelle}
              </button>
            ))}
          </div>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip content={<InfoBulle />} />
                {SERIES_PERF.filter((serie) => actives[serie.cle]).map((serie) => (
                  <Line
                    key={serie.cle}
                    type="monotone"
                    dataKey={serie.cle}
                    stroke={serie.couleur}
                    dot={false}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-baikal-text opacity-40 mt-2">
              Chaque serie est tracee sur sa propre echelle (normalisee), comme dans
              Search Console — survole pour lire les valeurs reelles.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

// ============================================================================
// 1. VUE D'ENSEMBLE
// ============================================================================

const BUCKETS_UI = [
  { cle: 'top3', libelle: 'Top 3 (positions 1-3)', couleur: 'bg-emerald-500', cliquable: true },
  { cle: 'top10', libelle: 'Top 10 (positions 4-10)', couleur: 'bg-blue-500', cliquable: true },
  { cle: 'top20', libelle: 'Top 20 (positions 11-20)', couleur: 'bg-amber-500', cliquable: true },
  { cle: 'beyond', libelle: 'Au-dela (position > 20)', couleur: 'bg-baikal-border', cliquable: true },
  { cle: 'hidden', libelle: 'Recherches masquees par Google', couleur: 'bg-baikal-border/60', cliquable: false },
];

function VueEnsemble({ appId }) {
  const [jours, setJours] = useState(28);
  const [filtreBucket, setFiltreBucket] = useState('all');
  const { donnees, erreur, enCours } = useDonneesCachees(
    `overview:${appId}:${jours}`,
    () => seoService.getOverview(appId, jours),
    appId,
  );

  useEffect(() => { setFiltreBucket('all'); }, [appId, jours]);

  const requetesFiltrees = useMemo(() => {
    const toutes = donnees?.topRequetes ?? [];
    if (filtreBucket === 'all') return toutes;
    return toutes.filter((q) => bucketDe(q.position) === filtreBucket);
  }, [donnees, filtreBucket]);

  const { totaux, totauxPrecedents, buckets, topPages } = donnees ?? {};
  const totalBuckets = BUCKETS_UI.reduce((s, b) => s + (buckets?.[b.cle] || 0), 0);

  // Requete aboutie mais rien a montrer : ni impression, ni requete, ni page.
  const rienARemonter = Boolean(donnees)
    && !totaux?.impressions
    && (donnees.topRequetes?.length ?? 0) === 0
    && (topPages?.length ?? 0) === 0;

  return (
    <Section
      titre="Vue d'ensemble"
      sousTitre={`Fenetre ${jours} j ancree a J-3 (delai de consolidation Search Console)`}
      action={<ChoixFenetre valeur={jours} onChange={setJours} occupe={enCours} />}
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {rienARemonter && (
        <Vide message={`Search Console n'a remonte aucune impression pour ce site sur les ${jours} derniers jours.`} />
      )}
      {donnees && !rienARemonter && (
      <ContenuEstompe enCours={enCours}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCarte
          label="Clics SEO"
          valeur={fmtInt(totaux.clicks)}
          sous={<Delta actuel={totaux.clicks} precedent={totauxPrecedents.clicks} />}
          accent="info"
        />
        <KpiCarte
          label="Impressions"
          valeur={fmtInt(totaux.impressions)}
          sous={<Delta actuel={totaux.impressions} precedent={totauxPrecedents.impressions} />}
        />
        <KpiCarte
          label="CTR moyen"
          valeur={pct(totaux.ctr)}
          sous="Mediane secteur : 5-8 %"
          accent={accentCtr(totaux.ctr)}
        />
        <KpiCarte
          label="Position mots-cles"
          valeur={fmtPos(totaux.position)}
          sous={<DeltaRangs actuel={totaux.position} precedent={totauxPrecedents.position} />}
          accent={accentPosition(totaux.position)}
        />
        <KpiCarte
          label="Position longue traine"
          valeur={fmtPos(totaux.positionLongueTraine)}
          sous={<DeltaRangs actuel={totaux.positionLongueTraine} precedent={totauxPrecedents.positionLongueTraine} />}
          accent={accentPosition(totaux.positionLongueTraine)}
        />
      </div>

      {/* Distribution des impressions par position — cliquable pour filtrer */}
      {buckets && (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-baikal-text uppercase">
              Distribution des impressions par position
            </p>
            <p className="text-[10px] text-baikal-text opacity-50">
              Clique sur une ligne pour filtrer la table
            </p>
          </div>
          <div className="space-y-1">
            {BUCKETS_UI.map((b) => {
              const valeur = buckets[b.cle] || 0;
              const part = totalBuckets > 0 ? (valeur / totalBuckets) * 100 : 0;
              const actifB = filtreBucket === b.cle;
              const contenu = (
                <>
                  <span className={`w-56 text-xs ${b.cliquable
                    ? (actifB ? 'text-white font-medium' : 'text-baikal-text')
                    : 'text-baikal-text opacity-50 italic'}`}
                  >
                    {b.libelle}
                  </span>
                  <span className="flex-1 h-2 bg-baikal-bg rounded-full overflow-hidden">
                    <span className={`block h-full ${b.couleur}`} style={{ width: `${part}%` }} />
                  </span>
                  <span className="w-28 text-xs text-right tabular-nums text-baikal-text">
                    {part.toFixed(0)} % ({fmtInt(valeur)})
                  </span>
                </>
              );
              if (!b.cliquable) {
                return (
                  <div
                    key={b.cle}
                    className="w-full flex items-center gap-3 px-2 py-1.5"
                    title="Requetes trop rares que Google masque (vie privee) : comptees dans les totaux mais non detaillees."
                  >
                    {contenu}
                  </div>
                );
              }
              return (
                <button
                  key={b.cle}
                  onClick={() => setFiltreBucket(actifB ? 'all' : b.cle)}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 rounded text-left transition-colors hover:bg-baikal-bg/60 ${actifB ? 'bg-baikal-bg ring-1 ring-baikal-cyan/50' : ''}`}
                >
                  {contenu}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Top requetes */}
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-baikal-border flex items-center justify-between">
            <p className="text-xs font-mono text-baikal-text uppercase">
              {filtreBucket === 'all'
                ? `Top ${requetesFiltrees.length} requetes par clics`
                : `${requetesFiltrees.length} requete(s) dans le filtre`}
            </p>
            {filtreBucket !== 'all' && (
              <button
                onClick={() => setFiltreBucket('all')}
                className="flex items-center gap-1 text-[11px] text-baikal-text hover:text-white"
              >
                <X className="w-3 h-3" /> Effacer le filtre
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead className="sticky top-0 z-10 bg-baikal-surface">
                <tr className="text-left text-xs opacity-70">
                  <th className="px-4 py-2">Requete</th>
                  <th className="text-right px-2 py-2">Clics</th>
                  <th className="text-right px-2 py-2">Impr.</th>
                  <th className="text-right px-2 py-2">CTR</th>
                  <th className="text-right px-4 py-2">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {requetesFiltrees.length === 0 && (
                  <LigneVide
                    colonnes={5}
                    message={filtreBucket === 'all'
                      ? 'Aucune requete detaillee sur cette fenetre — les recherches trop rares restent masquees par Google.'
                      : 'Aucune requete dans ce filtre.'}
                  />
                )}
                {requetesFiltrees.map((q, i) => (
                  <tr key={`${q.cle}-${i}`} className="border-t border-baikal-border/50">
                    <td className="px-4 py-1.5">{q.cle}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums">{fmtInt(q.clicks)}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums opacity-70">{fmtInt(q.impressions)}</td>
                    <td className={`text-right px-2 py-1.5 tabular-nums ${classeCtr(q.ctr_pct)}`}>
                      {q.ctr_pct.toFixed(1)} %
                    </td>
                    <td className={`text-right px-4 py-1.5 tabular-nums font-medium ${classePosition(q.position)}`}>
                      {fmtPos(q.position)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top pages */}
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-baikal-border">
            <p className="text-xs font-mono text-baikal-text uppercase">Top pages</p>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead className="sticky top-0 z-10 bg-baikal-surface">
                <tr className="text-left text-xs opacity-70">
                  <th className="px-4 py-2">Page</th>
                  <th className="text-right px-2 py-2">Clics</th>
                  <th className="text-right px-2 py-2">Impr.</th>
                  <th className="text-right px-4 py-2">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {(topPages ?? []).length === 0 && (
                  <LigneVide colonnes={4} message="Aucune page remontee sur cette fenetre." />
                )}
                {(topPages ?? []).map((p, i) => (
                  <tr key={`${p.cle}-${i}`} className="border-t border-baikal-border/50">
                    <td className="px-4 py-1.5 max-w-[280px] truncate" title={p.cle}>
                      {p.cle.replace(/^https?:\/\/[^/]+/, '') || '/'}
                    </td>
                    <td className="text-right px-2 py-1.5 tabular-nums">{fmtInt(p.clicks)}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums opacity-70">{fmtInt(p.impressions)}</td>
                    <td className={`text-right px-4 py-1.5 tabular-nums ${classePosition(p.position)}`}>
                      {fmtPos(p.position)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
        <strong className="opacity-100">Lecture</strong> · Top 3 = candidates au CTR maximal,
        top 10 = premiere page Google. Au-dela de la position 20, capter du clic devient
        difficile — cibler ces requetes via contenu + maillage interne.
        {' '}« Recherches masquees » = requetes trop rares que Google ne detaille pas (vie
        privee) : elles comptent dans les totaux mais pas dans le tableau — c'est l'ecart
        avec le gros chiffre de l'interface Search Console. Les recherches en « phrase
        exacte » (guillemets, outils de verification) sont ecartees des tops.
      </p>
      </ContenuEstompe>
      )}
    </Section>
  );
}

// ============================================================================
// 2. COMPARATIF PERIODE VS PERIODE
// ============================================================================

const STATUTS_UI = [
  { cle: 'all', libelle: 'Tout', classe: 'text-baikal-text' },
  { cle: 'regression', libelle: 'Regressions', classe: 'text-red-400' },
  { cle: 'lost', libelle: 'Disparues', classe: 'text-red-300' },
  { cle: 'new', libelle: 'Nouvelles', classe: 'text-blue-400' },
  { cle: 'progress', libelle: 'Progressions', classe: 'text-emerald-400' },
  { cle: 'stable', libelle: 'Stables', classe: 'text-baikal-text opacity-70' },
];
const BADGE_STATUT = {
  regression: ['Regression', 'text-red-400 border-red-900/60 bg-red-950/40'],
  lost: ['Disparue', 'text-red-300 border-red-900/40 bg-red-950/30'],
  new: ['Nouvelle', 'text-blue-400 border-blue-900/50 bg-blue-950/40'],
  progress: ['Progression', 'text-emerald-400 border-emerald-900/50 bg-emerald-950/40'],
  stable: ['Stable', 'text-baikal-text border-baikal-border bg-baikal-bg'],
};

function Comparatif({ appId }) {
  const [jours, setJours] = useState(28);
  const [filtre, setFiltre] = useState('all');
  const { donnees, erreur, enCours } = useDonneesCachees(
    `compare:${appId}:${jours}`,
    () => seoService.getCompare(appId, jours),
    appId,
  );

  useEffect(() => { setFiltre('all'); }, [appId, jours]);

  const lignes = useMemo(() => {
    const toutes = donnees?.requetes ?? [];
    if (filtre === 'all') return toutes;
    return toutes.filter((q) => q.statut === filtre);
  }, [donnees, filtre]);

  const d = donnees?.totauxDelta;
  const compteurs = donnees ? {
    regression: donnees.resume.regressions,
    lost: donnees.resume.disparues,
    new: donnees.resume.nouvelles,
    progress: donnees.resume.progressions,
    stable: donnees.resume.stables,
  } : {};

  return (
    <Section
      titre="Comparatif periode vs periode"
      sousTitre={donnees
        ? `${donnees.fenetre.startDate} → ${donnees.fenetre.endDate} vs ${donnees.fenetrePrecedente.startDate} → ${donnees.fenetrePrecedente.endDate}`
        : undefined}
      action={<ChoixFenetre valeur={jours} onChange={setJours} options={[7, 28]} occupe={enCours} />}
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && (
      <ContenuEstompe enCours={enCours}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCarte
          label="Δ Clics"
          valeur={fmtSigne(d.clicks)}
          sous={d.clicksPct !== null ? `${d.clicksPct > 0 ? '+' : ''}${d.clicksPct} %` : ''}
          accent={d.clicks > 0 ? 'success' : d.clicks < 0 ? 'danger' : 'default'}
        />
        <KpiCarte
          label="Δ Impressions"
          valeur={fmtSigne(d.impressions)}
          sous={d.impressionsPct !== null ? `${d.impressionsPct > 0 ? '+' : ''}${d.impressionsPct} %` : ''}
          accent={d.impressions > 0 ? 'success' : d.impressions < 0 ? 'danger' : 'default'}
        />
        <KpiCarte
          label="Δ CTR"
          valeur={`${d.ctrPct > 0 ? '+' : ''}${d.ctrPct} pt`}
          accent={d.ctrPct > 0 ? 'success' : d.ctrPct < 0 ? 'danger' : 'default'}
        />
        <KpiCarte
          label="Δ Position"
          valeur={`${d.position > 0 ? '+' : ''}${d.position}`}
          sous="negatif = mieux classe"
          accent={d.position < 0 ? 'success' : d.position > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUTS_UI.map((s) => (
          <button
            key={s.cle}
            onClick={() => setFiltre(s.cle)}
            className={`px-3 py-1 rounded border text-sm ${filtre === s.cle
              ? 'border-baikal-cyan text-baikal-cyan'
              : `border-baikal-border ${s.classe}`}`}
          >
            {s.libelle}
            {s.cle !== 'all' && ` (${compteurs[s.cle] ?? 0})`}
          </button>
        ))}
      </div>

      <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm text-baikal-text">
            <thead className="sticky top-0 z-10 bg-baikal-surface">
              <tr className="text-left text-xs opacity-70">
                <th className="px-4 py-2">Requete</th>
                <th className="px-2 py-2">Statut</th>
                <th className="text-right px-2 py-2">Clics</th>
                <th className="text-right px-2 py-2">Δ Clics</th>
                <th className="text-right px-2 py-2">Position</th>
                <th className="text-right px-4 py-2">Δ Pos.</th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <LigneVide
                  colonnes={6}
                  message={filtre === 'all'
                    ? 'Aucune requete comparable entre les deux periodes.'
                    : 'Aucune requete dans ce filtre.'}
                />
              )}
              {lignes.map((q, i) => {
                const [libelle, classes] = BADGE_STATUT[q.statut] ?? BADGE_STATUT.stable;
                return (
                  <tr key={`${q.requete}-${i}`} className="border-t border-baikal-border/50">
                    <td className="px-4 py-1.5">{q.requete}</td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded border text-[11px] ${classes}`}>
                        {libelle}
                      </span>
                    </td>
                    <td className="text-right px-2 py-1.5 tabular-nums">
                      {fmtInt(q.clicksPrev)} → {fmtInt(q.clicksCur)}
                    </td>
                    <td className={`text-right px-2 py-1.5 tabular-nums ${q.clicksDelta > 0 ? 'text-emerald-400' : q.clicksDelta < 0 ? 'text-red-400' : 'opacity-60'}`}>
                      {fmtSigne(q.clicksDelta)}
                    </td>
                    <td className="text-right px-2 py-1.5 tabular-nums">
                      {fmtPos(q.posPrev)} → {fmtPos(q.posCur)}
                    </td>
                    <td className={`text-right px-4 py-1.5 tabular-nums font-medium ${q.posDelta === null ? 'opacity-50' : q.posDelta < 0 ? 'text-emerald-400' : q.posDelta > 0 ? 'text-red-400' : 'opacity-60'}`}>
                      {q.posDelta === null ? '—' : `${q.posDelta > 0 ? '+' : ''}${q.posDelta}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-baikal-text opacity-50">
        Requetes de moins de 10 impressions cumulees ecartees (bruit). Δ position positif =
        rang qui se degrade. Tri : pires regressions en tete.
      </p>
      </ContenuEstompe>
      )}
    </Section>
  );
}

// ============================================================================
// 3. BING VS GOOGLE (archive admin.seo_snapshots)
// ============================================================================

function BingVsGoogle({ appId }) {
  const { donnees, erreur, enCours } = useDonneesCachees(
    `bing:${appId}`,
    () => seoService.getBingVsGoogle(appId),
    appId,
  );

  const sousTitre = "Archive mensuelle — « Bing » inclut Yahoo, DuckDuckGo et Ecosia (meme index)";

  if (enCours && !donnees) return <Chargement />;
  // Meme en echec, la section garde son titre : sinon un bandeau rouge
  // orphelin flotte entre deux sections.
  if (erreur) {
    return (
      <Section titre="Bing vs Google" sousTitre={sousTitre}>
        <Erreur message={erreur} />
      </Section>
    );
  }

  if (!donnees?.disponible) {
    return (
      <Section titre="Bing vs Google" sousTitre={sousTitre}>
        <Vide message="Archive vide pour ce site. Les crons la remplissent (quotidien 04h15, mensuel le 4 a 05h00 UTC) ; Bing demande la cle BING_WEBMASTER_API_KEY et une propriete verifiee dans Bing Webmaster Tools." />
      </Section>
    );
  }

  return (
    <Section titre="Bing vs Google" sousTitre={sousTitre}>
      <p className="text-[11px] text-baikal-text opacity-60">
        Bing ne conserve aucun historique interrogeable : ses clics ne sont comptes que
        depuis la mise en place du releve quotidien. Un « — » signifie
        {' '}<strong className="opacity-100">pas de mesure</strong>, pas zero clic.
      </p>
      <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70">
              <th className="px-4 py-2">Mois</th>
              <th className="text-right px-2 py-2">Clics Google</th>
              <th className="text-right px-2 py-2">Clics Bing</th>
              <th className="text-right px-2 py-2">Part Bing</th>
              <th className="text-right px-4 py-2">Impressions Google</th>
            </tr>
          </thead>
          <tbody>
            {donnees.mensuel.map((m) => (
              <tr key={m.mois} className="border-t border-baikal-border/50">
                <td className="px-4 py-2 font-mono">
                  {m.mois.slice(0, 7)}
                  {m.enCours && (
                    <span className="ml-2 text-[10px] text-amber-400 uppercase">en cours</span>
                  )}
                </td>
                <td className="text-right px-2 py-2 tabular-nums">{fmtInt(m.google)}</td>
                <td className="text-right px-2 py-2 tabular-nums">
                  {m.bing === null ? '—' : fmtInt(m.bing)}
                </td>
                <td className={`text-right px-2 py-2 tabular-nums ${m.partBingPct !== null && m.partBingPct >= 20 ? 'text-emerald-400' : ''}`}>
                  {m.partBingPct === null ? '—' : `${m.partBingPct} %`}
                </td>
                <td className="text-right px-4 py-2 tabular-nums opacity-70">
                  {fmtInt(m.impressionsGoogle)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {donnees.ecarts.length > 0 && (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-baikal-border">
            <p className="text-xs font-mono text-baikal-text uppercase">
              Requetes ou Bing classe nettement mieux (≥ 5 rangs)
            </p>
          </div>
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="text-left text-xs opacity-70">
                <th className="px-4 py-2">Requete</th>
                <th className="text-right px-2 py-2">Pos. Bing</th>
                <th className="text-right px-2 py-2">Pos. Google</th>
                <th className="text-right px-4 py-2">Ecart</th>
              </tr>
            </thead>
            <tbody>
              {donnees.ecarts.map((e) => (
                <tr key={e.requete} className="border-t border-baikal-border/50">
                  <td className="px-4 py-1.5">{e.requete}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-emerald-400">{fmtPos(e.positionBing)}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-red-400">{fmtPos(e.positionGoogle)}</td>
                  <td className="text-right px-4 py-1.5 tabular-nums font-medium">{e.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
        Les positions Bing sont un releve PONCTUEL{donnees.dernierReleve ? ` (dernier : ${donnees.dernierReleve})` : ''},
        pas une moyenne mensuelle : l'API Bing n'accepte aucune plage de dates. Un mois sans
        mesure Bing affiche « — », jamais 0 — Bing n'archive pas son historique, les mois
        d'avant la mise en place des crons sont definitivement vides.
      </p>
    </Section>
  );
}

// ============================================================================
// PAGE
// ============================================================================

function SeoContent() {
  const { currentApp } = useApp();
  return (
    <div className="p-6 space-y-10">
      <Performances appId={currentApp} />
      <VueEnsemble appId={currentApp} />
      <Comparatif appId={currentApp} />
      <BingVsGoogle appId={currentApp} />
    </div>
  );
}

export default function Seo() {
  return (
    <ConsoleLayout actif="seo">
      <SeoContent />
    </ConsoleLayout>
  );
}
