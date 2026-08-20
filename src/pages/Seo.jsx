/**
 * Seo.jsx - Baikal Console
 * ============================================================================
 * Suivi Search Console multi-sites (module admin).
 * Enrobage repris de Admin.jsx (header sticky BAIKAL_CONSOLE), avec le
 * sélecteur d'app de Dashboard.jsx pour piloter le site affiché.
 * Le contenu appelle l'Edge Function admin-seo via seoService.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Settings,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppProvider, useApp } from '../contexts/AppContext';
import AppSelector from '../components/AppSelector';
import supabase from '../lib/supabaseClient';
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

function SeoLayout() {
  const navigate = useNavigate();
  const { isSuperAdmin, signOut } = useAuth();
  const { currentApp, setCurrentApp } = useApp();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-baikal-bg">
      {/* Header */}
      <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/admin')}
                className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                title="Retour à l'administration"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 bg-baikal-cyan rounded-md flex items-center justify-center">
                <Shield className="w-5 h-5 text-black" />
              </div>
              <h1 className="text-lg font-mono font-bold text-white">
                BAIKAL_CONSOLE
              </h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <AppSelector
                currentApp={currentApp}
                onAppChange={setCurrentApp}
                supabaseClient={supabase}
                showLabel={false}
              />

              {/* Badge rôle */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan rounded-md text-sm font-mono">
                <Shield className="w-4 h-4" />
                {isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN'}
              </div>

              {/* Bouton paramètres */}
              <button
                onClick={() => navigate('/settings')}
                className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Bouton déconnexion */}
              <button
                onClick={handleSignOut}
                className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SeoContent />
      </main>
    </div>
  );
}

export default function Seo() {
  return (
    <AppProvider supabaseClient={supabase} defaultApp="audit">
      <SeoLayout />
    </AppProvider>
  );
}
