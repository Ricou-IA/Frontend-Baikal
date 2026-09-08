/**
 * SectionComptes - Baikal Console
 * ============================================================================
 * L'onglet Comptes de l'étage Baikal (/baikal?tab=comptes) : TOUT ce qui
 * concerne un compte client de Baikal, en un seul endroit — c'est la gestion
 * des comptes qui dit à chacun quels sites il voit (décision d'Eric du
 * 08/09/2026, plus d'onglets séparés Accès par site / Super admins).
 *
 * Les clients de Baikal sont les comptes qui administrent des sites depuis
 * cette console : super admins, admins délégués (admin.droits_sites) et
 * comptes créés ici en attente d'un site. Les clients de chaque site se
 * gèrent dans ce site (Clients ou Utilisateurs).
 *
 * Par compte : identité et état (EF admin-comptes, scope 'baikal'), ses
 * sites et le niveau par module (EF admin-droits), le statut super admin
 * (EF admin-droits), et les actions compte (mot de passe, lien, nom, email,
 * blocage, suppression) via les modales partagées comptes/ModalesCompte.
 * ============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus, Search, KeyRound, Link2, Pencil, AtSign, Ban, ShieldOff, UserX,
  Check, AlertCircle, Shield, Clock, X, UserCog,
} from 'lucide-react';
import { comptesService } from '../../services/comptes.service';
import { droitsService } from '../../services/droits.service';
import ModulesDroits from './ModulesDroits';
import ConfirmModal from '../ui/ConfirmModal';
import ModalesCompte from './comptes/ModalesCompte';

const SCOPE = 'baikal';
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : null);
const BOUTON_ACTION = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors disabled:opacity-50';

function Badge({ children, ton = 'slate' }) {
  const tons = {
    slate: 'border-slate-500/40 text-slate-300',
    amber: 'border-amber-500/50 text-amber-400',
    red: 'border-red-500/50 text-red-400',
    cyan: 'border-baikal-cyan/50 text-baikal-cyan',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono ${tons[ton]}`}>
      {children}
    </span>
  );
}

// Un site administré par le compte : la grille par module, et le retrait.
function LigneSite({ acces, onRevoke }) {
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
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2 border-t border-baikal-border">
      <span className="w-32 shrink-0 text-sm text-white pt-1">{acces.site}</span>
      <div className="flex-1 min-w-0 overflow-x-auto">
        <ModulesDroits modules={modules} onChange={changer} />
        {erreur && <p className="text-red-400 text-xs mt-1">{erreur}</p>}
      </div>
      <span className="pt-1 flex items-center gap-1">
        {sauve && <Check className="w-3.5 h-3.5 text-green-400" />}
        <button onClick={() => onRevoke(acces)} title="Retirer ce site" className="p-1.5 text-baikal-text hover:text-red-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </span>
    </div>
  );
}

// Une carte par compte : identité, sites, actions. Lisible sur un téléphone.
function CarteCompte({ compte, sites, onAction, onDonnerSite, onRetirerSite }) {
  const [siteAjout, setSiteAjout] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const superAdmin = compte.appRole === 'super_admin';
  // Un autre super admin : ni mot de passe, ni lien, ni email, ni blocage
  // (l'EF le refuse aussi) ; le rétrograder d'abord.
  const protege = superAdmin && !compte.moi;
  const dejaAdministres = new Set(compte.acces.map((a) => a.appId));
  const sitesDisponibles = sites.filter((s) => !dejaAdministres.has(s.id));

  const donner = async () => {
    if (!siteAjout) return;
    setOccupe(true);
    setErreur(null);
    const { error } = await onDonnerSite(compte, siteAjout);
    setOccupe(false);
    if (error) setErreur(error.message);
    else setSiteAjout('');
  };

  return (
    <div className={`bg-baikal-surface border rounded-md p-3 space-y-2 ${compte.bloque ? 'border-red-500/40' : 'border-baikal-border'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-sm text-white break-all">{compte.email}</span>
        {compte.nom && <span className="text-sm text-baikal-text">{compte.nom}</span>}
        {compte.moi && <Badge ton="cyan">vous</Badge>}
        {superAdmin && <Badge ton="amber"><Shield className="w-3 h-3" />super admin</Badge>}
        {compte.bloque && <Badge ton="red"><Ban className="w-3 h-3" />bloqué</Badge>}
        {!compte.derniereConnexion && <Badge><Clock className="w-3 h-3" />jamais connecté</Badge>}
        <span className="ml-auto text-xs text-baikal-text">
          créé le {dateFr(compte.creeLe)}
          {compte.derniereConnexion && ` · vu le ${dateFr(compte.derniereConnexion)}`}
        </span>
      </div>

      {/* Sites : c'est ici que se décide ce que le compte voit. */}
      <div className="rounded border border-baikal-border bg-baikal-bg/40 px-3 py-1">
        {superAdmin ? (
          <p className="py-1.5 text-xs text-baikal-text">Super admin : tous les sites, tous les modules, et cet étage.</p>
        ) : (
          <>
            {compte.acces.length === 0 && (
              <p className="py-1.5 text-xs text-amber-400">Aucun site : ce compte ne voit rien pour l'instant.</p>
            )}
            {compte.acces.map((a) => <LigneSite key={a.appId} acces={a} onRevoke={onRetirerSite} />)}
            {sitesDisponibles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 py-2 border-t border-baikal-border">
                <select
                  value={siteAjout}
                  onChange={(e) => setSiteAjout(e.target.value)}
                  className="px-2 py-1 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-xs"
                >
                  <option value="">Ajouter un site…</option>
                  {sitesDisponibles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button
                  onClick={donner}
                  disabled={occupe || !siteAjout}
                  className={`${BOUTON_ACTION} border-baikal-cyan/60 text-baikal-cyan hover:bg-baikal-cyan/10`}
                >
                  <UserPlus className="w-3.5 h-3.5" />Donner l'accès
                </button>
                <span className="text-[11px] text-baikal-text opacity-60">tout en écriture par défaut</span>
                {erreur && <span className="text-xs text-red-400">{erreur}</span>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => onAction('mdp', compte)} disabled={protege}
          title={protege ? 'Autre super admin : le rétrograder d\'abord' : 'Définir un nouveau mot de passe'}
          className={`${BOUTON_ACTION} border-baikal-cyan/60 text-baikal-cyan hover:bg-baikal-cyan/10`}>
          <KeyRound className="w-3.5 h-3.5" />Mot de passe
        </button>
        <button onClick={() => onAction('lien', compte)} disabled={protege}
          title="Générer un lien de réinitialisation à transmettre"
          className={`${BOUTON_ACTION} border-baikal-cyan/60 text-baikal-cyan hover:bg-baikal-cyan/10`}>
          <Link2 className="w-3.5 h-3.5" />Lien
        </button>
        <button onClick={() => onAction('nom', compte)} title="Renommer"
          className={`${BOUTON_ACTION} border-baikal-border text-baikal-text hover:text-white hover:bg-baikal-bg`}>
          <Pencil className="w-3.5 h-3.5" />Nom
        </button>
        <button onClick={() => onAction('email', compte)} disabled={protege} title="Changer l'adresse email"
          className={`${BOUTON_ACTION} border-baikal-border text-baikal-text hover:text-white hover:bg-baikal-bg`}>
          <AtSign className="w-3.5 h-3.5" />Email
        </button>
        {!compte.moi && (
          <button onClick={() => onAction(superAdmin ? 'retrograder' : 'promouvoir', compte)}
            title={superAdmin ? 'Retirer le statut super admin' : 'Promouvoir super admin : tous les droits, partout'}
            className={`${BOUTON_ACTION} border-amber-500/50 text-amber-400 hover:bg-amber-900/20`}>
            <UserCog className="w-3.5 h-3.5" />{superAdmin ? 'Retirer super admin' : 'Super admin'}
          </button>
        )}
        {!compte.moi && (
          <button onClick={() => onAction(compte.bloque ? 'debloquer' : 'bloquer', compte)} disabled={protege}
            title={compte.bloque ? 'Rendre la connexion possible' : 'Empêcher toute connexion, sans rien supprimer'}
            className={`${BOUTON_ACTION} ${compte.bloque
              ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/20'
              : 'border-amber-500/50 text-amber-400 hover:bg-amber-900/20'}`}>
            {compte.bloque ? <ShieldOff className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
            {compte.bloque ? 'Débloquer' : 'Bloquer'}
          </button>
        )}
        {!compte.moi && !superAdmin && (
          <button onClick={() => onAction('supprimer', compte)} title="Supprimer définitivement le compte"
            className={`${BOUTON_ACTION} border-red-500/40 text-red-400 hover:bg-red-900/20 ml-auto`}>
            <UserX className="w-3.5 h-3.5" />Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

export default function SectionComptes() {
  const [comptes, setComptes] = useState([]);
  const [droits, setDroits] = useState({ sites: [], acces: [] });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [modale, setModale] = useState(null); // { type, compte }
  const [info, setInfo] = useState(null);

  const charger = useCallback(async () => {
    const [c, d] = await Promise.all([comptesService.lister(SCOPE), droitsService.listAll()]);
    if (c.error) setErreur(c.error.message);
    else if (d.error) setErreur(d.error.message);
    else {
      setErreur(null);
      setComptes(c.data || []);
      setDroits(d.data || { sites: [], acces: [] });
    }
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!info) return undefined;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);

  // Chaque compte avec ses sites (admin.droits_sites), triés comme le registre.
  const liste = useMemo(() => {
    const ordre = new Map((droits.sites || []).map((s, i) => [s.id, i]));
    const parUser = new Map();
    for (const a of droits.acces || []) {
      if (!parUser.has(a.userId)) parUser.set(a.userId, []);
      parUser.get(a.userId).push(a);
    }
    const q = recherche.trim().toLowerCase();
    return comptes
      .map((c) => ({
        ...c,
        acces: (parUser.get(c.userId) || []).sort((x, y) => (ordre.get(x.appId) ?? 99) - (ordre.get(y.appId) ?? 99)),
      }))
      .filter((c) => !q || c.email.toLowerCase().includes(q) || (c.nom || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Super admins d'abord, puis par email.
        const sa = a.appRole === 'super_admin' ? 0 : 1;
        const sb = b.appRole === 'super_admin' ? 0 : 1;
        return sa - sb || a.email.localeCompare(b.email);
      });
  }, [comptes, droits, recherche]);

  const donnerSite = async (compte, appId) => {
    const r = await droitsService.grant(appId, compte.email);
    if (!r.error) charger();
    return r;
  };

  const confirmerRetraitSite = async () => {
    const a = modale.acces;
    setModale(null);
    const { error } = await droitsService.revoke(a.appId, a.userId);
    if (error) setErreur(error.message);
    else charger();
  };

  const confirmerSuperAdmin = async () => {
    const { type, compte } = modale;
    setModale(null);
    const { error } = await droitsService.setSuperAdmin(compte.email, type === 'promouvoir');
    if (error) setErreur(error.message);
    else { setInfo(type === 'promouvoir' ? `${compte.email} est super admin` : `${compte.email} n'est plus super admin`); charger(); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-baikal-surface border border-baikal-border rounded-md p-4 space-y-3">
        <p className="text-sm text-baikal-text">
          Les clients de Baikal : les comptes qui administrent des sites depuis cette
          console. Pour chacun, ses sites et le niveau par module (fermé : le module
          n'apparaît pas ; lecture : consultation ; écriture : toutes les actions),
          son statut super admin, et le compte lui-même. Les clients de chaque site
          se gèrent dans ce site.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="email, nom"
              className="w-full pl-8 pr-3 py-1.5 rounded border border-baikal-border bg-baikal-bg text-white placeholder-baikal-text/50 focus:border-baikal-cyan outline-none text-sm"
            />
          </div>
          <button
            onClick={() => setModale({ type: 'creer' })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Nouveau compte
          </button>
          <span className="ml-auto text-xs text-baikal-text opacity-60 font-mono">
            {liste.length}{recherche ? ` / ${comptes.length}` : ''} compte{comptes.length > 1 ? 's' : ''}
          </span>
        </div>
        {erreur && <p className="flex items-center gap-2 text-sm text-red-400"><AlertCircle className="w-4 h-4" />{erreur}</p>}
        {info && <p className="flex items-center gap-2 text-sm text-green-400"><Check className="w-4 h-4" />{info}</p>}
      </div>

      {chargement && <p className="text-baikal-text font-mono text-sm">Chargement…</p>}
      {!chargement && liste.length === 0 && (
        <p className="text-baikal-text opacity-70 text-sm">Aucun compte ne correspond.</p>
      )}
      <div className="space-y-2">
        {liste.map((c) => (
          <CarteCompte
            key={c.userId}
            compte={c}
            sites={droits.sites || []}
            onAction={(type, compte) => setModale({ type, compte })}
            onDonnerSite={donnerSite}
            onRetirerSite={(acces) => setModale({ type: 'retirer-site', acces })}
          />
        ))}
      </div>

      <ModalesCompte
        scope={SCOPE}
        modale={modale}
        onClose={() => setModale(null)}
        onFait={(message) => { if (message) setInfo(message); charger(); }}
        onErreur={setErreur}
      />
      <ConfirmModal
        isOpen={modale?.type === 'retirer-site'}
        onClose={() => setModale(null)}
        onConfirm={confirmerRetraitSite}
        title="RETIRER_LE_SITE"
        message="Cette personne ne verra plus ce site dans Baikal. Son compte et ses autres sites ne bougent pas."
        confirmLabel="RETIRER"
        variant="danger"
        icon={X}
        itemPreview={modale?.acces ? { label: modale.acces.email, sublabel: modale.acces.site } : null}
      />
      <ConfirmModal
        isOpen={modale?.type === 'promouvoir' || modale?.type === 'retrograder'}
        onClose={() => setModale(null)}
        onConfirm={confirmerSuperAdmin}
        title={modale?.type === 'promouvoir' ? 'PROMOUVOIR_SUPER_ADMIN' : 'RETIRER_SUPER_ADMIN'}
        message={modale?.type === 'promouvoir'
          ? 'Un super admin a tous les droits, sur tous les sites et sur cet étage. Chaque changement est journalisé.'
          : 'Ce compte redevient un compte ordinaire : il garde ses sites et son organisation, mais perd tous les droits Baikal. Impossible de retirer le dernier.'}
        confirmLabel={modale?.type === 'promouvoir' ? 'PROMOUVOIR' : 'RETIRER'}
        variant={modale?.type === 'promouvoir' ? 'warning' : 'danger'}
        icon={UserCog}
        itemPreview={modale?.compte ? { label: modale.compte.email, sublabel: modale.compte.nom || '' } : null}
      />
    </div>
  );
}
