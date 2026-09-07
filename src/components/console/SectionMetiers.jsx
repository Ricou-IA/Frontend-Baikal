/**
 * SectionMetiers - Baikal Console
 * ============================================================================
 * Edition de admin.metier, le vocabulaire commun a tous les sites. Vit dans
 * l'etage Baikal (page /baikal, bloc Metiers) : ce n'est pas un reglage de
 * site. Extrait de Sites.jsx le 07/09/2026.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { sitesService } from '../../services/sites.service';
import ConfirmModal from '../ui/ConfirmModal';

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
    // creer=true : le serveur refuse un slug deja pris au lieu de l'ecraser
    // (voir admin-sites/index.ts) — seule cette ligne le passe, jamais
    // LigneMetier ci-dessus, dont l'edition doit toujours pouvoir aboutir.
    const { error } = await sitesService.saveMetier(
      { slug: slug.trim().toLowerCase(), libelle },
      true,
    );
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
export default function SectionMetiers() {
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

