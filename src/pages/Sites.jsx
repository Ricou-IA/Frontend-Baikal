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
import { Save, UserPlus, X, Plus, Trash2 } from 'lucide-react';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { useApp } from '../contexts/AppContext';
import { sitesService } from '../services/sites.service';
import { droitsService } from '../services/droits.service';
import ConfirmModal from '../components/ui/ConfirmModal';

// Bloc « Admins delegues » d'une fiche site : liste, ajout par email d'un
// compte existant, retrait. Les droits vivent dans admin.droits_sites.
function AdminsSite({ appId }) {
  const [admins, setAdmins] = useState([]);
  const [email, setEmail] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await droitsService.list(appId);
    if (error) setErreur(error.message);
    else setAdmins(data || []);
  }, [appId]);

  useEffect(() => { charger(); }, [charger]);

  const ajouter = async () => {
    if (!email.includes('@')) return;
    setOccupe(true);
    setErreur(null);
    const { error } = await droitsService.grant(appId, email.trim());
    setOccupe(false);
    if (error) setErreur(error.message);
    else { setEmail(''); charger(); }
  };

  const retirer = async (userId) => {
    setErreur(null);
    const { error } = await droitsService.revoke(appId, userId);
    if (error) setErreur(error.message);
    else charger();
  };

  return (
    <div className="border-t border-baikal-border pt-3 space-y-2">
      <p className="text-sm text-baikal-text opacity-70">Admins delegues</p>
      {admins.length === 0 && (
        <p className="text-xs text-baikal-text opacity-50">Aucun — seul le super admin voit ce site.</p>
      )}
      <ul className="space-y-1">
        {admins.map((a) => (
          <li key={a.userId} className="flex items-center gap-2 text-sm text-baikal-text font-mono">
            <span>{a.email}</span>
            {a.nom && <span className="opacity-60">({a.nom})</span>}
            <button
              onClick={() => retirer(a.userId)}
              title="Retirer le droit"
              className="p-1 text-baikal-text hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ajouter(); }}
          placeholder="email d'un compte existant"
          className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm w-64"
        />
        <button
          onClick={ajouter}
          disabled={occupe || !email.includes('@')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Ajouter
        </button>
      </div>
      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
    </div>
  );
}

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

      <AdminsSite appId={site.id} />
    </div>
  );
}

// Les six couleurs autorisees pour un metier (admin.metier.couleur) — memes
// valeurs que les badges de /prospect et /clients (badges-prospects.jsx,
// badges-clients.jsx) : une septieme couleur choisie ici s'afficherait en
// gris partout ailleurs, faute de classe Tailwind associee.
const COULEURS_METIER = [
  ['slate', 'Ardoise'],
  ['blue', 'Bleu'],
  ['amber', 'Ambre'],
  ['emerald', 'Émeraude'],
  ['red', 'Rouge'],
  ['violet', 'Violet'],
];

// Une ligne de metier existant. Le slug est immuable : affiche en lecture
// seule, jamais dans un champ modifiable — le reecrire orphelinerait les
// vues des sites qui l'exposent deja.
function LigneMetier({ metier, onSaved, onDelete }) {
  const [libelle, setLibelle] = useState(metier.libelle);
  const [couleur, setCouleur] = useState(metier.couleur);
  const [ordre, setOrdre] = useState(metier.ordre);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState(null);

  const enregistrer = async () => {
    setEnregistrement(true);
    setErreur(null);
    const { error } = await sitesService.saveMetier({
      slug: metier.slug, libelle, couleur, ordre: Number(ordre),
    });
    setEnregistrement(false);
    if (error) setErreur(error.message || String(error));
    else onSaved?.();
  };

  return (
    <div className="py-2 border-b border-baikal-border last:border-0 space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-32 font-mono text-sm text-baikal-text opacity-70 truncate" title={metier.slug}>
          {metier.slug}
        </span>
        <input
          type="text"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
        />
        <select
          value={couleur}
          onChange={(e) => setCouleur(e.target.value)}
          className="px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
        >
          {COULEURS_METIER.map(([valeur, label]) => (
            <option key={valeur} value={valeur}>{label}</option>
          ))}
        </select>
        <input
          type="number"
          value={ordre}
          onChange={(e) => setOrdre(e.target.value)}
          className="w-20 px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
        />
        <button
          onClick={enregistrer}
          disabled={enregistrement}
          title="Enregistrer"
          className="p-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(metier)}
          title="Supprimer"
          className="p-1.5 rounded border border-baikal-border text-baikal-text hover:text-red-400 hover:border-red-500/50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {erreur && <p className="text-red-400 text-xs">{erreur}</p>}
    </div>
  );
}

// Ligne d'ajout : slug + libelle uniquement, couleur et ordre par defaut
// cote Edge Function (slate, 100) — modifiables ensuite via LigneMetier.
function AjoutMetier({ onAdded }) {
  const [slug, setSlug] = useState('');
  const [libelle, setLibelle] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState(null);

  const ajouter = async () => {
    setEnregistrement(true);
    setErreur(null);
    const { error } = await sitesService.saveMetier({ slug: slug.trim().toLowerCase(), libelle });
    setEnregistrement(false);
    if (error) {
      setErreur(error.message || String(error));
    } else {
      setSlug('');
      setLibelle('');
      onAdded?.();
    }
  };

  return (
    <div className="pt-3 space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug (ex: courtier)"
          className="w-32 px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none font-mono text-sm"
        />
        <input
          type="text"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Libellé"
          className="flex-1 px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm"
        />
        <button
          onClick={ajouter}
          disabled={enregistrement || !slug.trim() || !libelle.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 transition-colors disabled:opacity-50 text-sm"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>
      {erreur && <p className="text-red-400 text-xs">{erreur}</p>}
    </div>
  );
}

// Edition de admin.metier, le vocabulaire commun a tous les sites (voir
// l'encart affiche dans le rendu). Independante du site selectionne dans le
// header : toujours visible sous la fiche du site courant.
function SectionMetiers() {
  const [metiers, setMetiers] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  // Metier vise par une suppression, le temps de la confirmation — jamais
  // window.confirm, regle du projet.
  const [aSupprimer, setASupprimer] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await sitesService.listMetiers();
    if (error) setErreur(error.message || String(error));
    setMetiers(data?.metiers || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const confirmerSuppression = async () => {
    const slug = aSupprimer?.slug;
    setASupprimer(null);
    if (!slug) return;
    const { error } = await sitesService.deleteMetier(slug);
    if (error) setErreur(error.message || String(error));
    else charger();
  };

  return (
    <div className="border border-baikal-border rounded-lg p-4 bg-baikal-surface space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-baikal-text">Métiers</h2>
        <p className="text-sm text-baikal-text opacity-70 mt-1">
          Ces métiers sont le vocabulaire commun de tous les sites. Un site qui
          expose un slug absent de cette liste l'affiche en gris — ajoutez-le
          ici plutôt que de le renommer chez le site.
        </p>
      </div>

      {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
      {chargement && <p className="text-baikal-text">Chargement…</p>}

      {!chargement && (
        <div>
          {metiers.map((m) => (
            <LigneMetier key={m.slug} metier={m} onSaved={charger} onDelete={setASupprimer} />
          ))}
          <AjoutMetier onAdded={charger} />
        </div>
      )}

      <ConfirmModal
        isOpen={!!aSupprimer}
        onClose={() => setASupprimer(null)}
        onConfirm={confirmerSuppression}
        title="SUPPRIMER_METIER"
        message="Ce métier sera supprimé du vocabulaire commun. Les sites qui exposent encore ce slug l'affichent en gris."
        confirmLabel="SUPPRIMER"
        variant="danger"
        icon={Trash2}
        itemPreview={aSupprimer ? { label: aSupprimer.libelle, sublabel: aSupprimer.slug } : null}
      />
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-baikal-text">
          Parametrage du site{site ? ` — ${site.name}` : ''}
        </h1>
        <p className="text-sm text-baikal-text opacity-70 mt-1">
          Registre config.apps : domaine, Search Console, environnement, expediteur
          des campagnes et admins delegues. Changer de site via le selecteur du
          header. La creation d'un site reste une migration.
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

      <SectionMetiers />
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
