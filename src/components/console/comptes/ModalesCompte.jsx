/**
 * ModalesCompte - Baikal Console
 * ============================================================================
 * Les modales d'administration d'un COMPTE (auth.users), partagées entre
 * l'onglet Comptes de l'étage Baikal (scope 'baikal') et la page Utilisateurs
 * d'un site (scope = app_id) : nouveau mot de passe, lien de réinitialisation,
 * renommer, changer l'email, bloquer/débloquer, supprimer, créer.
 *
 * Un mot de passe ou un lien n'est affiché qu'une fois, avec un bouton copier :
 * rien n'est stocké côté front. Tout passe par l'EF admin-comptes, qui refait
 * les contrôles de périmètre ; la suppression par delete-user.
 *
 * Usage : <ModalesCompte scope="baikal" modale={{ type, compte }} onClose onFait />
 * avec compte = { userId, email, nom?, bloque? } et type ∈ creer | mdp | lien |
 * nom | email | bloquer | debloquer | supprimer.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import {
  UserPlus, KeyRound, Link2, Pencil, AtSign, Ban, ShieldOff, UserX,
  Copy, Check, AlertCircle, Loader2, X, Eye, EyeOff,
} from 'lucide-react';
import { comptesService } from '../../../services/comptes.service';
import { usersService } from '../../../services/users.service';
import ConfirmModal from '../../ui/ConfirmModal';

const CHAMP = 'w-full px-3 py-2 rounded border border-baikal-border bg-baikal-bg text-white placeholder-baikal-text/50 focus:border-baikal-cyan outline-none text-sm';
const BOUTON_PRIMAIRE = 'inline-flex items-center gap-2 px-4 py-2 rounded bg-baikal-cyan text-black font-mono text-sm disabled:opacity-50';
const BOUTON_SECONDAIRE = 'px-4 py-2 rounded border border-baikal-border text-baikal-text font-mono text-sm hover:text-white';

// ---------------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------------
function Coquille({ titre, icone: Icone, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-baikal-surface border border-baikal-border rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-baikal-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-baikal-cyan/20 rounded-md">
              <Icone className="w-5 h-5 text-baikal-cyan" />
            </div>
            <h2 className="text-base font-mono font-semibold text-white">{titre}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-baikal-text hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Erreur({ message }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 text-sm text-red-400">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{message}
    </p>
  );
}

// Un secret affiché une seule fois (mot de passe, lien), avec copie.
function Secret({ libelle, valeur, aide }) {
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
      <p className="text-xs font-mono uppercase tracking-wider text-baikal-text">{libelle}</p>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 rounded border border-baikal-cyan/50 bg-baikal-bg text-baikal-cyan font-mono text-sm break-all select-all">
          {valeur}
        </code>
        <button
          onClick={copier}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 text-sm"
        >
          {copie ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="text-xs text-amber-400">
        Affiché une seule fois : copiez-le avant de fermer. {aide}
      </p>
    </div>
  );
}

function Compte({ compte }) {
  return (
    <div className="px-3 py-2 rounded border border-baikal-border bg-baikal-bg">
      <p className="font-mono text-sm text-white break-all">{compte.email}</p>
      {compte.nom && <p className="text-xs text-baikal-text">{compte.nom}</p>}
    </div>
  );
}

function ChampMotDePasse({ valeur, onChange, placeholder, autoFocus }) {
  const [voir, setVoir] = useState(false);
  return (
    <div className="relative">
      <input
        type={voir ? 'text' : 'password'}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${CHAMP} pr-10 font-mono`}
      />
      <button type="button" onClick={() => setVoir((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-baikal-text hover:text-white">
        {voir ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------------
function ModaleMotDePasse({ scope, compte, onClose, onFait }) {
  const [mode, setMode] = useState('generer');
  const [saisi, setSaisi] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null);

  const valider = async (e) => {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    const { data, error } = await comptesService.setMotDePasse(scope, compte.userId, mode === 'saisir' ? saisi : null);
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    setResultat(data.motDePasse);
    onFait?.();
  };

  return (
    <Coquille titre="NOUVEAU_MOT_DE_PASSE" icone={KeyRound} onClose={onClose}>
      <Compte compte={compte} />
      {resultat ? (
        <>
          <Secret libelle="Mot de passe" valeur={resultat} aide="Transmettez-le à la personne ; elle pourra le changer depuis son profil." />
          <div className="flex justify-end">
            <button onClick={onClose} className={BOUTON_PRIMAIRE}>FERMER</button>
          </div>
        </>
      ) : (
        <form onSubmit={valider} className="space-y-4">
          <p className="text-sm text-baikal-text">
            L'ancien mot de passe cesse de fonctionner immédiatement. Les sessions ouvertes restent valides jusqu'à expiration.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input type="radio" checked={mode === 'generer'} onChange={() => setMode('generer')} className="accent-baikal-cyan" />
              Générer un mot de passe (14 caractères, lisible)
            </label>
            <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input type="radio" checked={mode === 'saisir'} onChange={() => setMode('saisir')} className="accent-baikal-cyan" />
              Saisir un mot de passe
            </label>
            {mode === 'saisir' && (
              <ChampMotDePasse valeur={saisi} onChange={setSaisi} placeholder="8 caractères minimum" autoFocus />
            )}
          </div>
          <Erreur message={erreur} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={BOUTON_SECONDAIRE}>ANNULER</button>
            <button type="submit" disabled={occupe || (mode === 'saisir' && saisi.length < 8)} className={BOUTON_PRIMAIRE}>
              {occupe && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'generer' ? 'GÉNÉRER' : 'APPLIQUER'}
            </button>
          </div>
        </form>
      )}
    </Coquille>
  );
}

function ModaleLien({ scope, compte, onClose }) {
  const [lien, setLien] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let actif = true;
    comptesService.lienReinitialisation(scope, compte.userId).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message);
      else setLien(data.lien);
    });
    return () => { actif = false; };
  }, [scope, compte.userId]);

  return (
    <Coquille titre="LIEN_DE_REINITIALISATION" icone={Link2} onClose={onClose}>
      <Compte compte={compte} />
      <p className="text-sm text-baikal-text">
        À transmettre vous-même (mail, message). En l'ouvrant, la personne choisit
        son nouveau mot de passe. Le lien expire au bout d'une heure et ne sert qu'une fois.
      </p>
      <Erreur message={erreur} />
      {!lien && !erreur && <p className="text-sm text-baikal-text font-mono">Génération…</p>}
      {lien && <Secret libelle="Lien" valeur={lien} aide="Il n'est pas envoyé par email automatiquement." />}
      <div className="flex justify-end">
        <button onClick={onClose} className={BOUTON_PRIMAIRE}>FERMER</button>
      </div>
    </Coquille>
  );
}

// Un seul champ à saisir (nom ou email).
function ModaleSaisie({ compte, titre, icone, libelle, type = 'text', initial = '', aide, valider, onClose, onFait }) {
  const [valeur, setValeur] = useState(initial);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  const soumettre = async (e) => {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    const { error } = await valider(valeur.trim());
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    onFait?.();
    onClose();
  };

  return (
    <Coquille titre={titre} icone={icone} onClose={onClose}>
      <Compte compte={compte} />
      <form onSubmit={soumettre} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-mono uppercase tracking-wider text-baikal-text">{libelle}</label>
          <input type={type} value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus className={CHAMP} />
          {aide && <p className="text-xs text-baikal-text opacity-70">{aide}</p>}
        </div>
        <Erreur message={erreur} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BOUTON_SECONDAIRE}>ANNULER</button>
          <button type="submit" disabled={occupe} className={BOUTON_PRIMAIRE}>
            {occupe && <Loader2 className="w-4 h-4 animate-spin" />}
            ENREGISTRER
          </button>
        </div>
      </form>
    </Coquille>
  );
}

// Périmètre baikal seulement : un futur admin de sites.
function ModaleNouveauCompte({ onClose, onFait }) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [mdp, setMdp] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null);

  const soumettre = async (e) => {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    const { data, error } = await comptesService.creer({ email: email.trim(), fullName: nom, password: mdp || null });
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    setResultat(data);
    onFait?.();
  };

  return (
    <Coquille titre="NOUVEAU_COMPTE_BAIKAL" icone={UserPlus} onClose={onClose}>
      {resultat ? (
        <>
          <Compte compte={{ email: resultat.email, nom: nom.trim() || null }} />
          <Secret libelle="Mot de passe" valeur={resultat.motDePasse} aide="Le compte est confirmé : la personne peut se connecter tout de suite. Donnez-lui ensuite ses sites dans Accès par site." />
          <div className="flex justify-end">
            <button onClick={onClose} className={BOUTON_PRIMAIRE}>FERMER</button>
          </div>
        </>
      ) : (
        <form onSubmit={soumettre} className="space-y-4">
          <p className="text-sm text-baikal-text">
            Un compte pour administrer des sites depuis Baikal. Les clients d'un
            site se créent dans ce site (Utilisateurs → Nouvel user).
          </p>
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-baikal-text">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required className={`${CHAMP} font-mono`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-baikal-text">Nom</label>
            <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" className={CHAMP} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-baikal-text">Mot de passe</label>
            <ChampMotDePasse valeur={mdp} onChange={setMdp} placeholder="vide = généré et affiché après création" />
          </div>
          <Erreur message={erreur} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={BOUTON_SECONDAIRE}>ANNULER</button>
            <button type="submit" disabled={occupe || !email.includes('@') || (mdp && mdp.length < 8)} className={BOUTON_PRIMAIRE}>
              {occupe && <Loader2 className="w-4 h-4 animate-spin" />}
              CRÉER
            </button>
          </div>
        </form>
      )}
    </Coquille>
  );
}

// ---------------------------------------------------------------------------
// Aiguillage : une seule balise à poser dans la page
// ---------------------------------------------------------------------------
export default function ModalesCompte({ scope, modale, onClose, onFait, onErreur }) {
  const type = modale?.type;
  const compte = modale?.compte;

  const confirmerBlocage = async () => {
    onClose();
    const { error } = await comptesService.bloquer(scope, compte.userId, type === 'bloquer');
    if (error) onErreur?.(error.message);
    else onFait?.(type === 'bloquer' ? `${compte.email} ne peut plus se connecter` : `${compte.email} peut de nouveau se connecter`);
  };

  const confirmerSuppression = async () => {
    onClose();
    const { error } = await usersService.deleteUser(compte.userId);
    if (error) onErreur?.(error.message);
    else onFait?.(`Compte ${compte.email} supprimé`);
  };

  return (
    <>
      {type === 'creer' && <ModaleNouveauCompte onClose={onClose} onFait={() => onFait?.()} />}
      {type === 'mdp' && <ModaleMotDePasse scope={scope} compte={compte} onClose={onClose} onFait={() => onFait?.()} />}
      {type === 'lien' && <ModaleLien scope={scope} compte={compte} onClose={onClose} />}
      {type === 'nom' && (
        <ModaleSaisie
          compte={compte}
          titre="RENOMMER"
          icone={Pencil}
          libelle="Nom affiché"
          initial={compte.nom || ''}
          valider={(v) => comptesService.renommer(scope, compte.userId, v)}
          onClose={onClose}
          onFait={() => onFait?.(`${compte.email} renommé`)}
        />
      )}
      {type === 'email' && (
        <ModaleSaisie
          compte={compte}
          titre="CHANGER_EMAIL"
          icone={AtSign}
          libelle="Nouvelle adresse"
          type="email"
          initial={compte.email}
          aide="Prend effet immédiatement, sans email de confirmation. La personne se connecte ensuite avec la nouvelle adresse."
          valider={(v) => comptesService.setEmail(scope, compte.userId, v)}
          onClose={onClose}
          onFait={() => onFait?.('Adresse changée')}
        />
      )}
      <ConfirmModal
        isOpen={type === 'bloquer' || type === 'debloquer'}
        onClose={onClose}
        onConfirm={confirmerBlocage}
        title={type === 'bloquer' ? 'BLOQUER_LE_COMPTE' : 'DEBLOQUER_LE_COMPTE'}
        message={type === 'bloquer'
          ? 'La personne ne pourra plus se connecter. Rien n\'est supprimé : ses accès et ses données restent en place, le déblocage les rend de nouveau utilisables.'
          : 'La personne pourra de nouveau se connecter avec son mot de passe actuel.'}
        confirmLabel={type === 'bloquer' ? 'BLOQUER' : 'DÉBLOQUER'}
        variant={type === 'bloquer' ? 'warning' : 'info'}
        icon={type === 'bloquer' ? Ban : ShieldOff}
        itemPreview={compte ? { label: compte.email, sublabel: compte.nom || '' } : null}
      />
      <ConfirmModal
        isOpen={type === 'supprimer'}
        onClose={onClose}
        onConfirm={confirmerSuppression}
        title="SUPPRIMER_LE_COMPTE"
        message="Suppression définitive : le compte, son profil, ses appartenances et ses accès console disparaissent. Pour seulement empêcher la connexion, préférez Bloquer."
        confirmLabel="SUPPRIMER"
        variant="danger"
        icon={UserX}
        itemPreview={compte ? { label: compte.email, sublabel: compte.nom || '' } : null}
      />
    </>
  );
}
