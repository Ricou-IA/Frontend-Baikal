/**
 * Seo.jsx - Baikal Console
 * ============================================================================
 * Suivi Search Console multi-sites (module admin).
 * Enrobage et selecteur de site fournis par ConsoleLayout ; le site affiche
 * est le site global de la console (useApp).
 * Le contenu appelle l'Edge Function admin-seo via seoService.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { seoService } from '../services/seo.service';

const FENETRES = [7, 28, 90];

function pct(n) {
  return `${(n * 100).toFixed(1)} %`;
}

function Delta({ actuel, precedent, inverse = false }) {
  if (!precedent) return <Minus className="w-4 h-4 text-baikal-text" />;
  const delta = ((actuel - precedent) / precedent) * 100;
  const positif = inverse ? delta < 0 : delta > 0;
  const Icone = delta === 0 ? Minus : (delta > 0 ? TrendingUp : TrendingDown);
  return (
    <span className={positif ? 'text-green-400' : 'text-red-400'}>
      <Icone className="w-4 h-4 inline" /> {delta > 0 ? '+' : ''}{delta.toFixed(1)} %
    </span>
  );
}

function SeoContent() {
  const { currentApp } = useApp();
  const [jours, setJours] = useState(28);
  const [overview, setOverview] = useState(null);
  const [topRequetes, setTopRequetes] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [tousSites, setTousSites] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const [o, q, p, t] = await Promise.all([
      seoService.getOverview(currentApp, jours),
      seoService.getTop(currentApp, 'query', jours, 25),
      seoService.getTop(currentApp, 'page', jours, 25),
      seoService.getAllSites(jours),
    ]);
    const premiereErreur = o.error || q.error || p.error || t.error;
    if (premiereErreur) setErreur(premiereErreur.message);
    setOverview(o.data);
    setTopRequetes(q.data || []);
    setTopPages(p.data || []);
    setTousSites(t.data);
    setChargement(false);
  }, [currentApp, jours]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-baikal-text">SEO</h1>
        <div className="flex gap-2">
          {FENETRES.map((f) => (
            <button
              key={f}
              onClick={() => setJours(f)}
              className={`px-3 py-1 rounded border ${jours === f
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              {f} j
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <p className="text-red-400 border border-red-400 rounded p-3">{erreur}</p>
      )}
      {chargement && <p className="text-baikal-text">Chargement…</p>}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Clics', overview.totaux.clicks, overview.totauxPrecedents.clicks, false],
            ['Impressions', overview.totaux.impressions, overview.totauxPrecedents.impressions, false],
            ['CTR', pct(overview.totaux.ctr), null, false],
            ['Position', overview.totaux.position.toFixed(1), overview.totauxPrecedents.position, true],
          ].map(([label, valeur, precedent, inverse]) => (
            <div key={label} className="border border-baikal-border rounded-lg p-4 bg-baikal-surface">
              <p className="text-sm text-baikal-text opacity-70">{label}</p>
              <p className="text-2xl font-semibold text-baikal-text">
                {typeof valeur === 'number' ? valeur.toLocaleString('fr-FR') : valeur}
              </p>
              {typeof precedent === 'number' && (
                <Delta
                  actuel={typeof valeur === 'string' ? parseFloat(valeur) : valeur}
                  precedent={precedent}
                  inverse={inverse}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <TableauTop titre="Top requêtes" lignes={topRequetes} />
        <TableauTop titre="Top pages" lignes={topPages} />
      </div>

      {tousSites && (
        <div>
          <h2 className="text-lg font-semibold text-baikal-text mb-3">Tous les sites</h2>
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="border-b border-baikal-border text-left opacity-70">
                <th className="py-2">Site</th><th>Clics</th><th>Impressions</th>
                <th>CTR</th><th>Position</th>
              </tr>
            </thead>
            <tbody>
              {tousSites.sites.map((s) => (
                <tr key={s.appId} className="border-b border-baikal-border">
                  <td className="py-2">{s.nom}</td>
                  {s.erreur
                    ? <td colSpan={4} className="text-red-400">{s.erreur}</td>
                    : <>
                        <td>{s.clicks.toLocaleString('fr-FR')}</td>
                        <td>{s.impressions.toLocaleString('fr-FR')}</td>
                        <td>{pct(s.ctr)}</td>
                        <td>{s.position.toFixed(1)}</td>
                      </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TableauTop({ titre, lignes }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-baikal-text mb-3">{titre}</h2>
      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="border-b border-baikal-border text-left opacity-70">
            <th className="py-2 w-1/2"></th><th>Clics</th><th>Impr.</th><th>Pos.</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle} className="border-b border-baikal-border">
              <td className="py-2 truncate max-w-0" title={l.cle}>{l.cle}</td>
              <td>{l.clicks}</td>
              <td>{l.impressions}</td>
              <td>{l.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
