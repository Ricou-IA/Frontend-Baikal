/**
 * MembresSite - Baikal Console
 * ============================================================================
 * Les membres d'un site qui a sa propre base (page Utilisateurs). Tout vient
 * du site par son canal d'administration et tout s'exécute chez lui : Baikal
 * n'en garde aucune copie (spec 2026-11-20-contrat-membres-design.md).
 *
 * Le site publie ses actions et ses rôles : un geste qu'il ne publie pas n'a
 * pas de bouton ici. Un mot de passe n'est affiché qu'une fois.
 * ============================================================================
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, Check, Copy, Eye, EyeOff, KeyRound, Loader2, Plus, Search, ShieldOff, UserPlus, X,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDroitModule } from '../../../hooks/useDroitModule';
import { Chargement, Erreur, LigneVide, Vide } from '../etats';
import LectureSeule from '../LectureSeule';
import { membresSiteService } from '../../../services/membresSite.service';

const CHAMP = 'w-full px-3 py-2 rounded border border-baikal-border bg-baikal-bg text-white placeholder-baikal-text/50 focus:border-baikal-cyan outline-none text-sm';
const BOUTON_PRIMAIRE = 'inline-flex items-center gap-2 px-4 py-2 rounded bg-baikal-cyan text-black font-mono text-sm disabled:opacity-50';
const BOUTON_SECONDAIRE = 'px-4 py-2 rounded border border-baikal-border text-baikal-text font-mono text-sm hover:text-white';

const MOTIFS = {
  canal: "Ce site gère ses comptes chez lui et n'a pas de canal d'administration déclaré.",
  contrat: "Ce site gère ses comptes chez lui et n'a pas encore publié le contrat Membres.",
};

function jour(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

// ---------------------------------------------------------------------------
// Briques de modale
// ---------------------------------------------------------------------------
function Coquille({ titre, icone: Icone, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-baikal-surface border border-baikal-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-baikal-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-baikal-cyan/20 rounded-md"><Icone className="w-5 h-5 text-baikal-cyan" /></div>
            <h2 className="text-base font-mono font-semibold text-white">{titre}</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 text-baikal-text hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Motif({ message }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 text-sm text-red-400">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{message}
    </p>
  );
}

function Secret({ valeur, email }) {
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch { /* presse-papiers indisponible : la valeur reste sélectionnable */ }
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono uppercase tracking-wider text-baikal-text">Mot de passe de {email}</p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 rounded border border-baikal-cyan/50 bg-baikal-bg text-baikal-cyan font-mono text-sm break-all select-all">
          {valeur}
        </code>
        <button onClick={copier} className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 text-sm">
          {copie ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="text-xs text-amber-400">Affiché une seule fois : copiez-le avant de fermer.</p>
    </div>
  );
}

function ChoixMotDePasse({ mode, setMode, saisi, setSaisi }) {
  const [voir, setVoir] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-sm text-baikal-text">
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={mode === 'generer'} onChange={() => setMode('generer')} className="accent-baikal-cyan" />
          Générer
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={mode === 'saisir'} onChange={() => setMode('saisir')} className="accent-baikal-cyan" />
          Saisir
        </label>
      </div>
      {mode === 'saisir' && (
        <div className="relative">
          <input
            type={voir ? 'text' : 'password'}
            value={saisi}
            onChange={(e) => setSaisi(e.target.value)}
            placeholder="8 caractères minimum"
            autoComplete="new-password"
            className={`${CHAMP} pr-10 font-mono`}
          />
          <button type="button" onClick={() => setVoir((v) => !v)} aria-label={voir ? 'Masquer' : 'Afficher'} className="absolute right-2 top-1/2 -translate-y-1/2 text-baikal-text hover:text-white">
            {voir ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------------
function ModaleCreer({ appId, nomSite, organisations, roles, orgInitiale, onClose, onFait }) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [orgId, setOrgId] = useState(orgInitiale || organisations[0]?.id || '');
  const [role, setRole] = useState(roles[roles.length - 1]?.slug || '');
  const [mode, setMode] = useState('generer');
  const [saisi, setSaisi] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null);

  const pret = email.trim() && orgId && role && (mode === 'generer' || saisi.length >= 8);

  const valider = async (e) => {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    const { data, error } = await membresSiteService.creer(appId, {
      email: email.trim(), nom: nom.trim(), orgId, role, password: mode === 'saisir' ? saisi : null,
    });
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    // Seule la réponse du site fait foi : pas de membre rendu = pas de succès.
    if (!data?.membre?.id) { setErreur('Réponse du site sans membre : création non confirmée.'); return; }
    onFait(`${data.membre.email} peut se connecter à ${nomSite}.`);
    if (data.motDePasse) setResultat({ email: data.membre.email, motDePasse: data.motDePasse });
    else onClose();
  };

  if (resultat) {
    return (
      <Coquille titre="Membre créé" icone={UserPlus} onClose={onClose}>
        <Secret valeur={resultat.motDePasse} email={resultat.email} />
        <div className="flex justify-end"><button onClick={onClose} className={BOUTON_PRIMAIRE}>Fermer</button></div>
      </Coquille>
    );
  }

  return (
    <Coquille titre={`Nouveau membre de ${nomSite}`} icone={UserPlus} onClose={onClose}>
      <form onSubmit={valider} className="space-y-4">
        <p className="text-xs text-baikal-text">Le compte est créé chez {nomSite} : il s'y connecte tout de suite.</p>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse email" autoFocus className={CHAMP} />
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom complet (facultatif)" className={CHAMP} />
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-baikal-text">
            Organisation
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={CHAMP}>
              {organisations.map((o) => <option key={o.id} value={o.id}>{o.nom || o.id}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-baikal-text">
            Rôle
            <select value={role} onChange={(e) => setRole(e.target.value)} className={CHAMP}>
              {roles.map((r) => <option key={r.slug} value={r.slug}>{r.libelle}</option>)}
            </select>
          </label>
        </div>
        <ChoixMotDePasse mode={mode} setMode={setMode} saisi={saisi} setSaisi={setSaisi} />
        <Motif message={erreur} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BOUTON_SECONDAIRE}>Annuler</button>
          <button type="submit" disabled={!pret || occupe} className={BOUTON_PRIMAIRE}>
            {occupe && <Loader2 className="w-4 h-4 animate-spin" />}Créer
          </button>
        </div>
      </form>
    </Coquille>
  );
}

function ModaleMotDePasse({ appId, membre, onClose, onFait }) {
  const [mode, setMode] = useState('generer');
  const [saisi, setSaisi] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null);

  const valider = async (e) => {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    const { data, error } = await membresSiteService.setMotDePasse(appId, membre.id, mode === 'saisir' ? saisi : null);
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    if (!data?.ok) { setErreur('Réponse du site sans confirmation : mot de passe non confirmé.'); return; }
    onFait(`Mot de passe de ${membre.email} changé.`);
    if (data.motDePasse) setResultat(data.motDePasse);
    else onClose();
  };

  return (
    <Coquille titre="Nouveau mot de passe" icone={KeyRound} onClose={onClose}>
      {resultat ? (
        <>
          <Secret valeur={resultat} email={membre.email} />
          <div className="flex justify-end"><button onClick={onClose} className={BOUTON_PRIMAIRE}>Fermer</button></div>
        </>
      ) : (
        <form onSubmit={valider} className="space-y-4">
          <p className="font-mono text-sm text-white break-all">{membre.email}</p>
          <p className="text-xs text-baikal-text">Ses sessions ouvertes sont fermées : il devra se reconnecter.</p>
          <ChoixMotDePasse mode={mode} setMode={setMode} saisi={saisi} setSaisi={setSaisi} />
          <Motif message={erreur} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={BOUTON_SECONDAIRE}>Annuler</button>
            <button type="submit" disabled={occupe || (mode === 'saisir' && saisi.length < 8)} className={BOUTON_PRIMAIRE}>
              {occupe && <Loader2 className="w-4 h-4 animate-spin" />}Changer
            </button>
          </div>
        </form>
      )}
    </Coquille>
  );
}

function ModaleBloquer({ appId, membre, onClose, onFait }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const bloquer = !membre.bloque;

  const valider = async () => {
    setOccupe(true);
    setErreur(null);
    const { data, error } = await membresSiteService.bloquer(appId, membre.id, bloquer);
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    if (data?.membre?.bloque !== bloquer) { setErreur("Le site n'a pas confirmé le changement."); return; }
    onFait(bloquer ? `${membre.email} ne peut plus se connecter.` : `${membre.email} peut de nouveau se connecter.`);
    onClose();
  };

  return (
    <Coquille titre={bloquer ? 'Bloquer ce membre' : 'Débloquer ce membre'} icone={bloquer ? Ban : ShieldOff} onClose={onClose}>
      <p className="font-mono text-sm text-white break-all">{membre.email}</p>
      <p className="text-sm text-baikal-text">
        {bloquer
          ? 'Il ne pourra plus se connecter au site. Ses données restent en place et le blocage se lève à tout moment.'
          : 'Il pourra de nouveau se connecter au site avec son mot de passe.'}
      </p>
      <Motif message={erreur} />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={BOUTON_SECONDAIRE}>Annuler</button>
        <button onClick={valider} disabled={occupe} className={BOUTON_PRIMAIRE}>
          {occupe && <Loader2 className="w-4 h-4 animate-spin" />}{bloquer ? 'Bloquer' : 'Débloquer'}
        </button>
      </div>
    </Coquille>
  );
}

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------
export default function MembresSite({ appId, nomSite }) {
  const { isSuperAdmin } = useAuth();
  const droit = useDroitModule('users');
  const ecriture = isSuperAdmin || droit.ecriture;

  const [etat, setEtat] = useState({ chargement: true, erreur: null, contrat: null });
  const [liste, setListe] = useState({ organisations: [], membres: [] });
  const [recherche, setRecherche] = useState('');
  const [orgFiltre, setOrgFiltre] = useState('');
  const [modale, setModale] = useState(null);
  const [retour, setRetour] = useState(null);

  const charger = useCallback(async () => {
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    const contrat = await membresSiteService.etat(appId);
    if (contrat.error) { setEtat({ chargement: false, erreur: contrat.error.message, contrat: null }); return; }
    if (!contrat.data?.disponible) { setEtat({ chargement: false, erreur: null, contrat: contrat.data }); return; }
    const membres = await membresSiteService.lister(appId);
    if (membres.error) { setEtat({ chargement: false, erreur: membres.error.message, contrat: contrat.data }); return; }
    setListe({
      organisations: Array.isArray(membres.data?.organisations) ? membres.data.organisations : [],
      membres: Array.isArray(membres.data?.membres) ? membres.data.membres : [],
    });
    setEtat({ chargement: false, erreur: null, contrat: contrat.data });
  }, [appId]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!retour) return undefined;
    const t = setTimeout(() => setRetour(null), 6000);
    return () => clearTimeout(t);
  }, [retour]);

  const nomOrg = useMemo(
    () => Object.fromEntries(liste.organisations.map((o) => [o.id, o.nom || o.id])),
    [liste.organisations],
  );
  const libelleRole = useMemo(
    () => Object.fromEntries((etat.contrat?.roles || []).map((r) => [r.slug, r.libelle])),
    [etat.contrat],
  );
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return liste.membres.filter((m) =>
      (!orgFiltre || m.org_id === orgFiltre) &&
      (!q || `${m.email} ${m.nom || ''}`.toLowerCase().includes(q)));
  }, [liste.membres, recherche, orgFiltre]);

  if (etat.chargement && !etat.contrat) return <Chargement />;
  if (etat.erreur && !etat.contrat) return <Erreur message={etat.erreur} />;
  if (!etat.contrat?.disponible) return <Vide message={MOTIFS[etat.contrat?.motif] || MOTIFS.contrat} />;

  const publie = (action) => etat.contrat.actions.includes(action);
  const peutCreer = ecriture && publie('membre-creer') && liste.organisations.length > 0 && etat.contrat.roles.length > 0;
  const peutMdp = ecriture && publie('membre-mot-de-passe');
  const peutBloquer = ecriture && publie('membre-bloquer');
  const colonnes = 5 + (peutMdp || peutBloquer ? 1 : 0);
  const fait = (message) => { setRetour(message); charger(); };

  return (
    <div className="space-y-4">
      {!ecriture && <LectureSeule module="Utilisateurs" />}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un membre…"
            className={`${CHAMP} pl-9`}
          />
        </div>
        {liste.organisations.length > 1 && (
          <select value={orgFiltre} onChange={(e) => setOrgFiltre(e.target.value)} className={`${CHAMP} sm:w-56`}>
            <option value="">Toutes les organisations</option>
            {liste.organisations.map((o) => <option key={o.id} value={o.id}>{o.nom || o.id}</option>)}
          </select>
        )}
        {peutCreer && (
          <button onClick={() => setModale({ type: 'creer' })} className={BOUTON_PRIMAIRE}>
            <Plus className="w-4 h-4" />Nouveau membre
          </button>
        )}
      </div>

      {retour && (
        <p className="flex items-center gap-2 px-3 py-2 rounded border border-green-500/50 bg-green-900/20 text-sm text-green-300">
          <Check className="w-4 h-4 shrink-0" />{retour}
        </p>
      )}
      {etat.erreur && <Erreur message={etat.erreur} />}

      <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
        <table className="tableau-large w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-xs border-b border-baikal-border text-left">
              <th className="px-4 py-2 opacity-70">Membre</th>
              <th className="px-4 py-2 opacity-70">Organisation</th>
              <th className="px-4 py-2 opacity-70">Rôle</th>
              <th className="px-4 py-2 opacity-70">Créé le</th>
              <th className="px-4 py-2 opacity-70">Dernière connexion</th>
              {colonnes === 6 && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <LigneVide colonnes={colonnes} message={liste.membres.length === 0 ? 'Aucun membre sur ce site.' : 'Aucun membre ne correspond.'} />
            )}
            {visibles.map((m) => (
              <tr key={`${m.id}-${m.org_id}`} className="border-t border-baikal-border/50">
                <td className="px-4 py-3">
                  <p className="text-white">{m.nom || m.email}</p>
                  {m.nom && <p className="text-xs font-mono break-all">{m.email}</p>}
                  {m.bloque && (
                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-xs bg-red-900/30 text-red-300">
                      <Ban className="w-3 h-3" />Bloqué
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{nomOrg[m.org_id] || '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap">{libelleRole[m.role] || m.role}</td>
                <td className="px-4 py-3 whitespace-nowrap">{jour(m.cree_le)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{m.derniere_connexion ? jour(m.derniere_connexion) : 'Jamais'}</td>
                {colonnes === 6 && (
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="inline-flex gap-1">
                      {peutMdp && (
                        <button onClick={() => setModale({ type: 'mdp', membre: m })} title="Nouveau mot de passe" aria-label={`Nouveau mot de passe pour ${m.email}`} className="p-2 rounded border border-baikal-border hover:text-white">
                          <KeyRound className="w-4 h-4" />
                        </button>
                      )}
                      {peutBloquer && (
                        <button onClick={() => setModale({ type: 'bloquer', membre: m })} title={m.bloque ? 'Débloquer' : 'Bloquer'} aria-label={`${m.bloque ? 'Débloquer' : 'Bloquer'} ${m.email}`} className="p-2 rounded border border-baikal-border hover:text-white">
                          {m.bloque ? <ShieldOff className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-baikal-text">
        {visibles.length} membre{visibles.length > 1 ? 's' : ''} · lus chez {nomSite} à l'instant.
        Rôle, nom et retrait d'un membre se règlent dans {nomSite}.
      </p>

      {modale?.type === 'creer' && (
        <ModaleCreer
          appId={appId}
          nomSite={nomSite}
          organisations={liste.organisations}
          roles={etat.contrat.roles}
          orgInitiale={orgFiltre}
          onClose={() => setModale(null)}
          onFait={fait}
        />
      )}
      {modale?.type === 'mdp' && (
        <ModaleMotDePasse appId={appId} membre={modale.membre} onClose={() => setModale(null)} onFait={fait} />
      )}
      {modale?.type === 'bloquer' && (
        <ModaleBloquer appId={appId} membre={modale.membre} onClose={() => setModale(null)} onFait={fait} />
      )}
    </div>
  );
}
