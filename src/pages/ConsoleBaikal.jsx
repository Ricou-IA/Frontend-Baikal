/**
 * ConsoleBaikal.jsx - Baikal Console — l'étage Baikal
 * ============================================================================
 * Ce qui n'appartient à aucun site, super admin uniquement (spec
 * 2026-09-07-etage-baikal-droits-modules) :
 *   - Accès par site : la grille personnes × sites × modules (admin.droits_sites)
 *   - Super admins : liste, promotion d'un compte existant, rétrogradation
 *   - Registre des sites : lecture du registre config.apps ; la création d'un
 *     site reste une migration faite ensemble
 *   - Métiers : le vocabulaire commun (admin.metier)
 *   - Demandes : les demandes d'accès déposées depuis la landing publique
 *     (admin.demandes, EF baikal-demande)
 * Route : /baikal?tab=acces|superadmins|registre|metiers|demandes
 * ============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, UserCog, ListChecks, UserPlus, X, Check, Settings2, AlertCircle, Inbox } from 'lucide-react';
import ConsoleLayout from '../components/console/ConsoleLayout';
import ModulesDroits, { MODULES_CONSOLE } from '../components/console/ModulesDroits';
import SectionMetiers from '../components/console/SectionMetiers';
import ConfirmModal from '../components/ui/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { droitsService } from '../services/droits.service';
import { sitesService } from '../services/sites.service';
import { demandesService } from '../services/demandes.service';

const ONGLETS = ['acces', 'superadmins', 'registre', 'metiers', 'demandes'];

// ---------------------------------------------------------------------------
// Accès par site
// ---------------------------------------------------------------------------
function LigneAcces({ acces, onRevoke }) {
  const [modules, setModules] = useState(acces.modules || {});
  const [sauve, setSauve] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => { setModules(acces.modules || {}); }, [acces.modules]);

  const changer = async (suivant) => {
    setModules(suivant);
    setErreur(null);
    const { error } = await droitsService.setModules(acces.appId, acces.userId, suivant);
    if (error) { setErreur(error.message); return; }
    setSauve(true);
    setTimeout(() => setSauve(false), 1500);
  };

  return (
    <tr className="border-b border-baikal-border align-top">
      <td className="px-3 py-2 text-sm text-white whitespace-nowrap">{acces.site}</td>
      <td className="px-3 py-2">
        <ModulesDroits modules={modules} onChange={changer} />
        {erreur && <p className="text-red-400 text-xs mt-1">{erreur}</p>}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {sauve && <Check className="inline w-3.5 h-3.5 text-green-400 mr-2" />}
        <button
          onClick={() => onRevoke(acces)}
          title="Retirer l'accès"
          className="p-2 text-baikal-text hover:text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

function AccesParSite() {
  const [donnees, setDonnees] = useState({ sites: [], acces: [] });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [email, setEmail] = useState('');
  const [siteAjout, setSiteAjout] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [aRetirer, setARetirer] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await droitsService.listAll();
    if (error) setErreur(error.message);
    else setDonnees(data || { sites: [], acces: [] });
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // Regroupé par personne : une personne, ses sites en dessous.
  const parPersonne = useMemo(() => {
    const m = new Map();
    for (const a of donnees.acces || []) {
      if (!m.has(a.userId)) m.set(a.userId, { userId: a.userId, email: a.email, nom: a.nom, sites: [] });
      m.get(a.userId).sites.push(a);
    }
    return [...m.values()].sort((x, y) => x.email.localeCompare(y.email));
  }, [donnees]);

  const ajouter = async () => {
    if (!email.includes('@') || !siteAjout) return;
    setOccupe(true);
    setErreur(null);
    const { error } = await droitsService.grant(siteAjout, email.trim());
    setOccupe(false);
    if (error) setErreur(error.message);
    else { setEmail(''); charger(); }
  };

  const confirmerRetrait = async () => {
    const a = aRetirer;
    setARetirer(null);
    if (!a) return;
    const { error } = await droitsService.revoke(a.appId, a.userId);
    if (error) setErreur(error.message);
    else charger();
  };

  return (
    <div className="space-y-4">
      <div className="bg-baikal-surface border border-baikal-border rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email d'un compte existant"
            className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm w-full sm:w-64"
          />
          <select
            value={siteAjout}
            onChange={(e) => setSiteAjout(e.target.value)}
            className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
          >
            <option value="">Site…</option>
            {(donnees.sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={ajouter}
            disabled={occupe || !email.includes('@') || !siteAjout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Donner l'accès
          </button>
          <span className="text-xs text-baikal-text opacity-50">Tout en écriture par défaut. Le compte doit exister (Utilisateurs → Nouvel user).</span>
        </div>
        {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
      </div>

      {chargement && <p className="text-baikal-text">Chargement…</p>}
      {!chargement && parPersonne.length === 0 && (
        <p className="text-baikal-text opacity-70">Aucun accès délégué : seuls les super admins voient les sites.</p>
      )}
      {parPersonne.map((p) => (
        <div key={p.userId} className="bg-baikal-surface border border-baikal-border rounded-md overflow-x-auto">
          <div className="px-3 py-2 border-b border-baikal-border flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-baikal-cyan" />
            <span className="font-mono text-sm text-white">{p.email}</span>
            {p.nom && <span className="text-xs text-baikal-text opacity-60">({p.nom})</span>}
            <span className="ml-auto text-xs text-baikal-text opacity-60">{p.sites.length} site{p.sites.length > 1 ? 's' : ''}</span>
          </div>
          <table className="tableau-large w-full min-w-[640px]">
            <thead>
              <tr className="bg-baikal-bg/50 text-[11px] font-mono uppercase text-baikal-text">
                <th className="px-3 py-1.5 text-left">Site</th>
                <th className="px-3 py-1.5 text-left">Modules</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {p.sites.map((a) => <LigneAcces key={a.appId} acces={a} onRevoke={setARetirer} />)}
            </tbody>
          </table>
        </div>
      ))}

      <ConfirmModal
        isOpen={!!aRetirer}
        onClose={() => setARetirer(null)}
        onConfirm={confirmerRetrait}
        title="RETIRER_ACCES"
        message="Cette personne ne verra plus ce site dans Baikal. Son compte et ses autres accès ne bougent pas."
        confirmLabel="RETIRER"
        variant="danger"
        icon={X}
        itemPreview={aRetirer ? { label: aRetirer.email, sublabel: aRetirer.site } : null}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Super admins
// ---------------------------------------------------------------------------
function SuperAdmins() {
  const [liste, setListe] = useState([]);
  const [email, setEmail] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [aRetrograder, setARetrograder] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await droitsService.superAdmins();
    if (error) setErreur(error.message);
    else setListe(data || []);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const promouvoir = async () => {
    if (!email.includes('@')) return;
    setOccupe(true);
    setErreur(null);
    const { error } = await droitsService.setSuperAdmin(email.trim(), true);
    setOccupe(false);
    if (error) setErreur(error.message);
    else { setEmail(''); charger(); }
  };

  const confirmerRetrogradation = async () => {
    const cible = aRetrograder;
    setARetrograder(null);
    if (!cible) return;
    const { error } = await droitsService.setSuperAdmin(cible.email, false);
    if (error) setErreur(error.message);
    else charger();
  };

  return (
    <div className="space-y-4">
      <div className="bg-baikal-surface border border-baikal-border rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') promouvoir(); }}
            placeholder="email d'un compte existant"
            className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm w-full sm:w-64"
          />
          <button
            onClick={promouvoir}
            disabled={occupe || !email.includes('@')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
          >
            <UserCog className="w-4 h-4" />
            Promouvoir super admin
          </button>
        </div>
        {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
      </div>

      <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-baikal-bg/50 text-[11px] font-mono uppercase text-baikal-text">
              <th className="px-3 py-2 text-left">Compte</th>
              <th className="px-3 py-2 text-left">Depuis</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {liste.map((s) => (
              <tr key={s.userId} className="border-t border-baikal-border">
                <td className="px-3 py-2">
                  <span className="font-mono text-sm text-white">{s.email}</span>
                  {s.nom && <span className="ml-2 text-xs text-baikal-text opacity-60">({s.nom})</span>}
                  {s.moi && <span className="ml-2 text-xs px-1.5 py-0.5 rounded border border-baikal-cyan/50 text-baikal-cyan">vous</span>}
                </td>
                <td className="px-3 py-2 text-sm text-baikal-text">{s.depuis ? new Date(s.depuis).toLocaleDateString('fr-FR') : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {!s.moi && (
                    <button
                      onClick={() => setARetrograder(s)}
                      title="Retirer le statut super admin"
                      className="p-2 text-baikal-text hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={!!aRetrograder}
        onClose={() => setARetrograder(null)}
        onConfirm={confirmerRetrogradation}
        title="RETIRER_SUPER_ADMIN"
        message="Ce compte redevient un compte ordinaire : il garde ses accès par site et son organisation, mais perd tous les droits Baikal."
        confirmLabel="RETIRER"
        variant="danger"
        icon={UserCog}
        itemPreview={aRetrograder ? { label: aRetrograder.email, sublabel: aRetrograder.nom || '' } : null}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registre des sites (lecture)
// ---------------------------------------------------------------------------
function Registre() {
  const navigate = useNavigate();
  const { setCurrentApp } = useApp();
  const [sites, setSites] = useState([]);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    sitesService.listSites().then(({ data, error }) => {
      if (error) setErreur(error.message);
      else setSites(data || []);
    });
  }, []);

  const ouvrirParametrage = (id) => {
    setCurrentApp(id);
    navigate('/sites');
  };

  return (
    <div className="space-y-3">
      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
      <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-x-auto">
        <table data-mobile="1,3,5" className="w-full">
          <thead>
            <tr className="bg-baikal-bg/50 text-[11px] font-mono uppercase text-baikal-text">
              <th className="px-3 py-2 text-left">Site</th>
              <th className="px-3 py-2 text-left">Identifiant</th>
              <th className="px-3 py-2 text-left">Domaine</th>
              <th className="px-3 py-2 text-left">Modèle de comptes</th>
              <th className="px-3 py-2 text-left">État</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="border-t border-baikal-border">
                <td className="px-3 py-2 text-sm text-white">{s.name}</td>
                <td className="px-3 py-2 text-sm font-mono text-baikal-text">{s.id}</td>
                <td className="px-3 py-2 text-sm font-mono text-baikal-text">{s.domaine || '—'}</td>
                <td className="px-3 py-2 text-sm text-baikal-text">
                  {s.modele_comptes === 'clients' ? 'Clients' : 'Organisations'}
                </td>
                <td className="px-3 py-2 text-sm">
                  {s.is_active
                    ? <span className="text-green-400">actif</span>
                    : <span className="text-baikal-text opacity-60">inactif</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.is_active && (
                    <button
                      onClick={() => ouvrirParametrage(s.id)}
                      className="inline-flex items-center gap-1 text-xs text-baikal-cyan hover:underline"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> Paramétrage
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Demandes d'accès (landing publique)
// ---------------------------------------------------------------------------
const STATUTS_DEMANDE = [
  ['nouvelle', 'Nouvelle'],
  ['contactee', 'Contactée'],
  ['branchee', 'Branchée'],
  ['ecartee', 'Écartée'],
];
const PILES_DEMANDE = { postgres_stripe: 'Postgres + Stripe', postgres: 'Postgres', autre_base: 'Autre base', autre: 'Autre' };

function Demandes() {
  const [demandes, setDemandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await demandesService.lister();
    if (error) setErreur(error.message);
    else setDemandes(data || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const changerStatut = async (id, statut) => {
    setDemandes((d) => d.map((x) => (x.id === id ? { ...x, statut } : x)));
    const { error } = await demandesService.setStatut(id, statut);
    if (error) { setErreur(error.message); charger(); }
  };

  return (
    <div className="space-y-4">
      {erreur && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{erreur}</p>}
      {chargement ? (
        <p className="text-baikal-text text-sm font-mono">Chargement…</p>
      ) : demandes.length === 0 ? (
        <p className="text-baikal-text text-sm">Aucune demande pour l'instant.</p>
      ) : (
        <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-x-auto">
          <table data-mobile="2,5,6" className="w-full text-sm">
            <thead>
              <tr className="border-b border-baikal-border text-left text-xs font-mono uppercase tracking-wider text-baikal-text">
                <th className="px-3 py-2">Reçue</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Site</th>
                <th className="px-3 py-2">Pile</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr key={d.id} className="border-b border-baikal-border align-top">
                  <td className="px-3 py-2 text-baikal-text font-mono whitespace-nowrap">
                    {new Date(d.cree_le).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-3 py-2 text-white font-mono">{d.email}</td>
                  <td className="px-3 py-2 text-baikal-text break-all">{d.site || '—'}</td>
                  <td className="px-3 py-2 text-baikal-text whitespace-nowrap">{PILES_DEMANDE[d.pile] || d.pile}</td>
                  <td className="px-3 py-2 text-baikal-text max-w-xs sm:max-w-md whitespace-pre-wrap">{d.message || '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      value={d.statut}
                      onChange={(e) => changerStatut(d.id, e.target.value)}
                      className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
                    >
                      {STATUTS_DEMANDE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContenuBaikal() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ONGLETS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'acces';

  useEffect(() => {
    if (!isSuperAdmin) navigate('/clients', { replace: true });
  }, [isSuperAdmin, navigate]);

  useEffect(() => {
    if (!searchParams.get('tab')) setSearchParams({ tab: 'acces' }, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!isSuperAdmin) {
    return (
      <div className="p-4 flex items-center gap-2 text-baikal-text">
        <AlertCircle className="w-4 h-4" /> Réservé au super admin.
      </div>
    );
  }

  const titres = {
    acces: ['Accès par site', 'Qui administre quel site, module par module'],
    superadmins: ['Super admins', 'Tous les droits, partout'],
    registre: ['Registre des sites', 'Les sites déclarés dans Baikal'],
    metiers: ['Métiers', 'Le vocabulaire commun à tous les sites'],
    demandes: ['Demandes', "Les demandes d'accès déposées sur withbaikal.io"],
  };
  const [titre, sousTitre] = titres[tab];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="p-2 bg-baikal-cyan/20 rounded-md">
          <ListChecks className="w-5 h-5 text-baikal-cyan" />
        </div>
        <div>
          <h1 className="text-lg font-mono font-bold text-white">BAIKAL · {titre.toUpperCase()}</h1>
        </div>
      </div>
      {tab === 'acces' && <AccesParSite />}
      {tab === 'superadmins' && <SuperAdmins />}
      {tab === 'registre' && <Registre />}
      {tab === 'metiers' && <SectionMetiers />}
      {tab === 'demandes' && <Demandes />}
    </div>
  );
}

export default function ConsoleBaikal() {
  const [searchParams] = useSearchParams();
  const tab = ONGLETS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'acces';
  return (
    <ConsoleLayout actif={`baikal-${tab}`}>
      <ContenuBaikal />
    </ConsoleLayout>
  );
}
