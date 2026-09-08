/**
 * Sites.jsx - Baikal Console — page « Paramétrage »
 * ============================================================================
 * Parametrage du site selectionne (registre config.apps) : domaine, propriete
 * GSC, environnement, expediteur des campagnes, modele de comptes, acces
 * console. Super admin uniquement. Route historique /sites conservee.
 * Les metiers (vocabulaire commun) vivent dans l'etage Baikal (/baikal).
 * Les secrets ne se saisissent jamais ici : env_secret_ref ne porte que le
 * NOM du secret Edge Functions.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { Save } from 'lucide-react';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { useApp } from '../contexts/AppContext';
import { sitesService } from '../services/sites.service';
import AdminsSite from '../components/console/AdminsSite';

const CHAMPS = [
  ['domaine', 'Domaine'],
  ['gsc_propriete', 'Propriete GSC'],
  ['env_url', 'URL environnement'],
  ['env_secret_ref', 'Nom du secret'],
  ['expediteur_nom', 'Expediteur (nom)'],
  ['expediteur_email', 'Expediteur (email)'],
  ['reply_to', 'Reply-to'],
  ['repo_github', 'Dépôt GitHub (owner/repo)'],
  ['seo_panier', 'Requêtes SEO suivies (une par ligne)', 'liste'],
  ['seo_pages_cles', 'Pages clés SEO (chemins, une par ligne)', 'liste'],
];

// Modele de comptes du site (config.apps.modele_comptes). Decide ce que la
// console fait des inscriptions du site : membres d'organisations (page
// Utilisateurs) ou clients du site (page Clients, aucun profil console).
const MODELES_COMPTES = [
  ['organisations', "Organisations — les comptes sont des membres d'organisations (page Utilisateurs)"],
  ['clients', 'Clients — les comptes sont des clients du site (page Clients)'],
];

function FicheSite({ site, onSaved }) {
  const [valeurs, setValeurs] = useState(() => {
    const v = {};
    for (const [champ, , type] of CHAMPS) {
      // Les listes arrivent en tableau JSON et se saisissent une valeur par ligne.
      v[champ] = type === 'liste' && Array.isArray(site[champ]) ? site[champ].join('\n') : (site[champ] ?? '');
    }
    v.modele_comptes = site.modele_comptes || 'organisations';
    return v;
  });
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);

  const enregistrer = async () => {
    setEnregistrement(true);
    setMessage(null);
    setErreur(null);
    const { error } = await sitesService.saveSite({ id: site.id, ...valeurs });
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
        {CHAMPS.map(([champ, label, type]) => (
          <label key={champ} className="block text-sm text-baikal-text">
            <span className="opacity-70">{label}</span>
            {type === 'liste' ? (
              <textarea
                value={valeurs[champ]}
                rows={4}
                onChange={(e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm"
              />
            ) : (
              <input
                type="text"
                value={valeurs[champ]}
                onChange={(e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm"
              />
            )}
            {champ === 'env_secret_ref' && (
              <span className="block mt-1 text-xs opacity-60">
                Les clés et secrets ne se saisissent jamais ici : ce champ ne porte que le nom du secret.
              </span>
            )}
          </label>
        ))}
      </div>

      <label className="block text-sm text-baikal-text">
        <span className="opacity-70">Modèle de comptes</span>
        <select
          value={valeurs.modele_comptes}
          onChange={(e) => setValeurs((v) => ({ ...v, modele_comptes: e.target.value }))}
          className="mt-1 w-full max-w-xl px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
        >
          {MODELES_COMPTES.map(([valeur, label]) => (
            <option key={valeur} value={valeur}>{label}</option>
          ))}
        </select>
        <span className="block mt-1 text-xs opacity-60">
          Un site en modèle « clients » ne crée jamais de compte console à l'inscription :
          ses clients se lisent dans la page Clients, jamais dans Utilisateurs.
        </span>
      </label>

      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      <div className="border-t border-baikal-border pt-3">
        <AdminsSite appId={site.id} />
      </div>
    </div>
  );
}

function SitesContent() {
  const { currentApp } = useApp();
  const [sites, setSites] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await sitesService.listSites();
    if (error) setErreur(error.message || String(error));
    setSites(data || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Parametrage du site selectionne dans le header — une fiche a la fois.
  const site = sites.find((s) => s.id === currentApp);

  return (
    <div className="sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-baikal-text">
          Paramétrage{site ? ` — ${site.name}` : ''}
        </h1>
        <p className="text-sm text-baikal-text opacity-70 mt-1">
          Réglages propres à ce site : domaine, Search Console, environnement,
          expéditeur des campagnes, modèle de comptes et accès console. Changer
          de site via le sélecteur. Le registre complet et les métiers sont
          dans l'étage Baikal.
        </p>
      </div>

      {erreur && (
        <p className="text-red-400 border border-red-400 rounded p-3">{erreur}</p>
      )}
      {chargement && <p className="text-baikal-text">Chargement…</p>}
      {!chargement && !site && !erreur && (
        <p className="text-baikal-text opacity-70">
          Site introuvable dans le registre (inactif ?).
        </p>
      )}

      {site && <FicheSite key={site.id} site={site} onSaved={charger} />}

    </div>
  );
}

export default function Sites() {
  return (
    <ConsoleLayout actif="sites">
      <SitesContent />
    </ConsoleLayout>
  );
}
