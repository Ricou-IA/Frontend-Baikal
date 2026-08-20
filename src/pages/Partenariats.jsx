/**
 * Partenariats.jsx - Baikal Console
 * ============================================================================
 * CRM de prospection multi-sites : prospects (imports CSV et diagnostiqueurs)
 * et campagnes email Resend (module admin).
 * Enrobage repris de Admin.jsx (header sticky BAIKAL_CONSOLE), avec le
 * sélecteur d'app de Dashboard.jsx pour piloter le site affiché.
 * Le contenu appelle l'Edge Function admin-partenariats via partenariatsService.
 * ============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Users,
  Mail,
  Send,
  RefreshCw,
  Shield,
  Settings,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppProvider, useApp } from '../contexts/AppContext';
import AppSelector from '../components/AppSelector';
import supabase from '../lib/supabaseClient';
import { partenariatsService } from '../services/partenariats.service';
import { parseCsv, versProspects } from '../utils/csv';

const STATUTS = ['nouveau', 'contacte', 'relance', 'repondu', 'partenaire', 'refus', 'desinscrit'];
const TYPES = ['agence', 'diagnostiqueur', 'autre'];

function PartenariatsContent() {
  const { currentApp } = useApp();
  const [onglet, setOnglet] = useState('prospects');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-baikal-text">Partenariats</h1>
        <div className="flex gap-2">
          {[['prospects', 'Prospects', Users], ['campagnes', 'Campagnes', Mail]].map(([id, label, Icone]) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={`px-3 py-1 rounded border flex items-center gap-2 ${onglet === id
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              <Icone className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      {onglet === 'prospects'
        ? <Prospects appId={currentApp} />
        : <Campagnes appId={currentApp} />}
    </div>
  );
}

function Prospects({ appId }) {
  const [prospects, setProspects] = useState([]);
  const [total, setTotal] = useState(0);
  const [filtres, setFiltres] = useState({ type: '', statut: '', recherche: '' });
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const fichierRef = useRef(null);

  const charger = useCallback(async () => {
    const { data, error } = await partenariatsService.listProspects(appId, {
      type: filtres.type || undefined,
      statut: filtres.statut || undefined,
      recherche: filtres.recherche || undefined,
      limit: 100,
    });
    if (error) { setMessage(error.message); return; }
    setProspects(data.prospects);
    setTotal(data.total);
  }, [appId, filtres]);

  useEffect(() => { charger(); }, [charger]);

  async function importerCsv(event) {
    const fichier = event.target.files?.[0];
    if (!fichier) return;
    setOccupe(true);
    const texte = await fichier.text();
    const lignes = versProspects(parseCsv(texte).lignes);
    const { data, error } = await partenariatsService.importCsv(appId, 'agence', lignes);
    setMessage(error
      ? error.message
      : `Import : ${data.inseres} insérés, ${data.doublons} doublons ignorés (${data.recus} lignes lues).`);
    setOccupe(false);
    event.target.value = '';
    charger();
  }

  async function importerDiagnostiqueurs() {
    const departement = window.prompt('Département (vide = tous) :') ?? '';
    setOccupe(true);
    const { data, error } = await partenariatsService.importDiagnostiqueurs(
      appId, departement.trim() || undefined);
    setMessage(error
      ? error.message
      : `Import : ${data.inseres} insérés, ${data.doublons} doublons (${data.lus} certifiés lus, ${data.avecEmail} avec email).`);
    setOccupe(false);
    charger();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="Rechercher…"
          className="bg-baikal-bg border border-baikal-border rounded px-3 py-1 text-baikal-text"
          value={filtres.recherche}
          onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
        />
        <select
          className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
          value={filtres.type}
          onChange={(e) => setFiltres({ ...filtres, type: e.target.value })}
        >
          <option value="">Tous types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
          value={filtres.statut}
          onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })}
        >
          <option value="">Tous statuts</option>
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-baikal-text opacity-70">{total} prospects</span>
        <div className="flex-1" />
        <button
          onClick={() => fichierRef.current?.click()}
          disabled={occupe}
          className="px-3 py-1 rounded border border-baikal-border text-baikal-text flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Import CSV agences
        </button>
        <input ref={fichierRef} type="file" accept=".csv" className="hidden" onChange={importerCsv} />
        <button
          onClick={importerDiagnostiqueurs}
          disabled={occupe}
          className="px-3 py-1 rounded border border-baikal-border text-baikal-text flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Import diagnostiqueurs
        </button>
      </div>

      {message && <p className="text-baikal-cyan text-sm">{message}</p>}

      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="border-b border-baikal-border text-left opacity-70">
            <th className="py-2">Email</th><th>Nom</th><th>Entreprise</th>
            <th>Type</th><th>CP</th><th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((p) => (
            <tr key={p.id} className="border-b border-baikal-border">
              <td className="py-2">{p.email}</td>
              <td>{[p.prenom, p.nom].filter(Boolean).join(' ')}</td>
              <td>{p.entreprise}</td>
              <td>{p.type}</td>
              <td>{p.code_postal}</td>
              <td>
                <select
                  className="bg-baikal-bg border border-baikal-border rounded px-1"
                  value={p.statut}
                  onChange={async (e) => {
                    const { error } = await partenariatsService.saveProspect(appId, { ...p, statut: e.target.value });
                    if (error) setMessage(error.message);
                    charger();
                  }}
                >
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Campagnes({ appId }) {
  const [campagnes, setCampagnes] = useState([]);
  const [edition, setEdition] = useState(null); // campagne en cours d'edition
  const [apercu, setApercu] = useState(null);   // nb de destinataires du segment
  const [stats, setStats] = useState({});       // campagneId -> stats
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await partenariatsService.listCampagnes(appId);
    if (error) { setMessage(error.message); return; }
    setCampagnes(data);
    for (const c of data.filter((x) => x.statut === 'envoyee')) {
      partenariatsService.campaignStats(appId, c.id).then(({ data: s }) => {
        if (s) setStats((prev) => ({ ...prev, [c.id]: s }));
      });
    }
  }, [appId]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!edition) { setApercu(null); return; }
    partenariatsService.previewSegment(appId, edition.segment ?? {})
      .then(({ data, error }) => {
        if (error) setMessage(error.message);
        setApercu(data?.destinataires ?? null);
      });
  }, [appId, !!edition, edition?.segment?.type, edition?.segment?.statut, edition?.segment?.departement]);

  async function sauvegarder() {
    setOccupe(true);
    const { data, error } = await partenariatsService.saveCampagne(appId, edition);
    setOccupe(false);
    if (error) { setMessage(error.message); return; }
    setEdition(data);
    setMessage('Campagne enregistrée.');
    charger();
  }

  async function envoyerTest() {
    const email = window.prompt('Envoyer le test à :');
    if (!email) return;
    setOccupe(true);
    const { error } = await partenariatsService.sendTest(appId, edition.id, email);
    setOccupe(false);
    setMessage(error ? error.message : `Test envoyé à ${email}.`);
  }

  async function envoyer() {
    if (!window.confirm(`Envoyer à ${apercu ?? '?'} destinataires ? Cette action est définitive.`)) return;
    setOccupe(true);
    const { data, error } = await partenariatsService.sendCampaign(appId, edition.id);
    setOccupe(false);
    setMessage(error
      ? error.message
      : `Envoyé : ${data.envoyes} ok, ${data.erreurs} erreurs, ${data.dejaTraites} déjà traités, ${data.restants} restants.`
        + (data.restants > 0 ? ' Relancer l\'envoi pour continuer.' : ''));
    setEdition(null);
    charger();
  }

  if (edition) {
    const segment = edition.segment ?? {};
    return (
      <div className="space-y-4 max-w-3xl">
        {message && <p className="text-baikal-cyan text-sm">{message}</p>}
        <input
          className="w-full bg-baikal-bg border border-baikal-border rounded px-3 py-2 text-baikal-text"
          placeholder="Nom de la campagne"
          value={edition.nom ?? ''}
          onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
        />
        <input
          className="w-full bg-baikal-bg border border-baikal-border rounded px-3 py-2 text-baikal-text"
          placeholder="Objet de l'email"
          value={edition.objet ?? ''}
          onChange={(e) => setEdition({ ...edition, objet: e.target.value })}
        />
        <textarea
          className="w-full h-64 bg-baikal-bg border border-baikal-border rounded px-3 py-2 text-baikal-text font-mono text-sm"
          placeholder="Corps HTML. Variables : {{prenom}} {{nom}} {{entreprise}}"
          value={edition.corps_html ?? ''}
          onChange={(e) => setEdition({ ...edition, corps_html: e.target.value })}
        />
        <div className="flex gap-2 items-center">
          <select
            className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
            value={segment.type ?? ''}
            onChange={(e) => setEdition({ ...edition, segment: { ...segment, type: e.target.value || undefined } })}
          >
            <option value="">Tous types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
            value={segment.statut ?? ''}
            onChange={(e) => setEdition({ ...edition, segment: { ...segment, statut: e.target.value || undefined } })}
          >
            <option value="">Tous statuts</option>
            {STATUTS.filter((s) => s !== 'desinscrit').map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            className="w-24 bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
            placeholder="Dépt"
            value={segment.departement ?? ''}
            onChange={(e) => setEdition({ ...edition, segment: { ...segment, departement: e.target.value || undefined } })}
          />
          <span className="text-sm text-baikal-text opacity-70">
            {apercu === null ? '…' : `${apercu} destinataires`}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEdition(null)} className="px-3 py-1 rounded border border-baikal-border text-baikal-text">Retour</button>
          <button onClick={sauvegarder} disabled={occupe} className="px-3 py-1 rounded border border-baikal-cyan text-baikal-cyan">Enregistrer</button>
          {edition.id && edition.statut === 'brouillon' && (
            <>
              <button onClick={envoyerTest} disabled={occupe} className="px-3 py-1 rounded border border-baikal-border text-baikal-text">Envoyer un test</button>
              <button onClick={envoyer} disabled={occupe} className="px-3 py-1 rounded border border-red-400 text-red-400 flex items-center gap-2">
                <Send className="w-4 h-4" /> Envoyer la campagne
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && <p className="text-baikal-cyan text-sm">{message}</p>}
      <button
        onClick={() => setEdition({ nom: '', objet: '', corps_html: '', segment: {}, statut: 'brouillon' })}
        className="px-3 py-1 rounded border border-baikal-cyan text-baikal-cyan"
      >
        Nouvelle campagne
      </button>
      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="border-b border-baikal-border text-left opacity-70">
            <th className="py-2">Nom</th><th>Statut</th><th>Envoyée le</th><th>Résultats</th><th></th>
          </tr>
        </thead>
        <tbody>
          {campagnes.map((c) => (
            <tr key={c.id} className="border-b border-baikal-border">
              <td className="py-2">{c.nom}</td>
              <td>{c.statut}</td>
              <td>{c.envoyee_le ? new Date(c.envoyee_le).toLocaleDateString('fr-FR') : ''}</td>
              <td>
                {stats[c.id]
                  ? Object.entries(stats[c.id]).map(([k, v]) => `${k}: ${v}`).join(', ')
                  : ''}
              </td>
              <td>
                <button onClick={() => setEdition(c)} className="text-baikal-cyan">
                  {c.statut === 'brouillon' ? 'Éditer' : 'Voir'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PartenariatsLayout() {
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
        <PartenariatsContent />
      </main>
    </div>
  );
}

export default function Partenariats() {
  return (
    <AppProvider supabaseClient={supabase} defaultApp="audit">
      <PartenariatsLayout />
    </AppProvider>
  );
}
