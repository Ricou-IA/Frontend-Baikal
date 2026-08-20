/**
 * Sites.jsx - Baikal Console
 * ============================================================================
 * Parametrage des sites (registre config.apps) : domaine, propriete GSC,
 * environnement et expediteur des campagnes. Super admin uniquement.
 * Les secrets ne se saisissent jamais ici : env_secret_ref ne porte que le
 * NOM du secret Edge Functions.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Settings, LogOut, ArrowLeft, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { partenariatsService } from '../services/partenariats.service';

const CHAMPS = [
  ['domaine', 'Domaine'],
  ['gsc_propriete', 'Propriete GSC'],
  ['env_url', 'URL environnement'],
  ['env_secret_ref', 'Nom du secret'],
  ['expediteur_nom', 'Expediteur (nom)'],
  ['expediteur_email', 'Expediteur (email)'],
  ['reply_to', 'Reply-to'],
];

function FicheSite({ site, onSaved }) {
  const [valeurs, setValeurs] = useState(() => {
    const v = {};
    for (const [champ] of CHAMPS) v[champ] = site[champ] ?? '';
    return v;
  });
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);

  const enregistrer = async () => {
    setEnregistrement(true);
    setMessage(null);
    setErreur(null);
    const { error } = await partenariatsService.saveSite({ id: site.id, ...valeurs });
    setEnregistrement(false);
    if (error) {
      setErreur(error.message || String(error));
    } else {
      setMessage('Enregistre');
      onSaved?.();
    }
  };

  return (
    <div className="border border-baikal-border rounded-lg p-4 bg-baikal-surface space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-baikal-text">
          {site.name}
          <span className="ml-2 text-sm font-mono opacity-60">{site.id}</span>
          {!site.is_active && (
            <span className="ml-2 text-xs px-2 py-0.5 border border-baikal-border rounded text-baikal-text opacity-70">
              inactif
            </span>
          )}
        </h2>
        <button
          onClick={enregistrer}
          disabled={enregistrement}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CHAMPS.map(([champ, label]) => (
          <label key={champ} className="block text-sm text-baikal-text">
            <span className="opacity-70">{label}</span>
            <input
              type="text"
              value={valeurs[champ]}
              onChange={(e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))}
              className="mt-1 w-full px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm"
            />
            {champ === 'env_secret_ref' && (
              <span className="block mt-1 text-xs opacity-60">
                Les clés et secrets ne se saisissent jamais ici : ce champ ne porte que le nom du secret.
              </span>
            )}
          </label>
        ))}
      </div>

      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}
    </div>
  );
}

function SitesContent() {
  const [sites, setSites] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await partenariatsService.listSites();
    if (error) setErreur(error.message || String(error));
    setSites(data || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-baikal-text">Sites</h1>
        <p className="text-sm text-baikal-text opacity-70 mt-1">
          Registre des sites (config.apps) : domaine, Search Console, environnement et
          expediteur des campagnes. La creation d'un site reste une migration.
        </p>
      </div>

      {erreur && (
        <p className="text-red-400 border border-red-400 rounded p-3">{erreur}</p>
      )}
      {chargement && <p className="text-baikal-text">Chargement…</p>}

      {sites.map((site) => (
        <FicheSite key={site.id} site={site} onSaved={charger} />
      ))}
    </div>
  );
}

export default function Sites() {
  const navigate = useNavigate();
  const { isSuperAdmin, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-baikal-bg flex items-center justify-center">
        <p className="text-baikal-text">Accès réservé au super admin.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-baikal-bg">
      <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
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

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan rounded-md text-sm font-mono">
                <Shield className="w-4 h-4" />
                SUPER_ADMIN
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SitesContent />
      </main>
    </div>
  );
}
