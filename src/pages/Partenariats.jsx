/**
 * Partenariats.jsx - Baikal Console
 * ============================================================================
 * CRM de prospection multi-sites : prospects (import CSV, sync diagnostiqueurs)
 * et campagnes email Resend (module admin).
 * Enrobage et selecteur de site fournis par ConsoleLayout ; le site affiche
 * est le site global de la console (useApp).
 * Le contenu appelle l'Edge Function admin-partenariats via partenariatsService.
 * ============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  Users,
  Mail,
  Send,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
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

  async function synchroniserDiagnostiqueurs() {
    setOccupe(true);
    const { data, error } = await partenariatsService.syncDiagnostiqueurs(appId);
    setMessage(error
      ? error.message
      : `Synchronisation : ${data.inseres} insérés, ${data.doublons} doublons ignorés `
        + `(${data.lus} certifiés lus, ${data.avecEmail} avec email). `
        + `La synchronisation est également automatique chaque nuit à 03h30.`);
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
          onClick={synchroniserDiagnostiqueurs}
          disabled={occupe}
          title="Tourne aussi automatiquement chaque nuit à 03h30"
          className="px-3 py-1 rounded border border-baikal-border text-baikal-text flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${occupe ? 'animate-spin' : ''}`} /> Synchroniser les diagnostiqueurs
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

export default function Partenariats() {
  return (
    <ConsoleLayout actif="partenariats">
      <PartenariatsContent />
    </ConsoleLayout>
  );
}
