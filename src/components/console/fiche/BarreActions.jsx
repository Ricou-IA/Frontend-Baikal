/**
 * BarreActions.jsx - Baikal Console
 * ============================================================================
 * Les boutons de la fiche sont construits a partir du manifeste renvoye par
 * le site : Baikal ne connait ni les libelles, ni les types d'email, ni les
 * bornes. Le manifeste est calcule par dossier, donc une action qui n'a pas
 * de sens ici n'apparait pas.
 *
 * super_admin filtre l'affichage ET le relais, mais l'autorisation qui fait
 * foi reste celle de l'EF du site.
 * ============================================================================
 */
import { useState } from 'react';
import {
  AlertTriangle, Check, Coins, Download, Mail, RefreshCw, Send, Trash2,
} from 'lucide-react';
import ConfirmModal from '../../ui/ConfirmModal';
import { dossiersService } from '../../../services/dossiers.service';

const ICONES = {
  send: Send,
  refresh: RefreshCw,
  coins: Coins,
  trash: Trash2,
  mail: Mail,
  download: Download,
  check: Check,
  alert: AlertTriangle,
};

// Un champ de formulaire HTML ne rend que du texte : sans cette conversion, un
// parametre `nombre` partirait au site comme la chaine "5" la ou il attend 5 --
// meme defaut que le booleen envoye comme la chaine "false", mais silencieux,
// donc plus dangereux. La chaine brute n'est conservee que pour l'etat non
// numerique du champ (vide, saisie en cours) : un NaN rendrait l'input non
// controle et bloquerait la frappe.
function nombreSaisi(brut) {
  if (brut === '') return brut;
  const n = Number(brut);
  return Number.isFinite(n) ? n : brut;
}

function ChampParametre({ parametre, valeur, onChange }) {
  const classe = 'px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs '
    + 'text-baikal-text focus:outline-none focus:border-baikal-cyan';
  if (parametre.type === 'choix') {
    // Un choix sans defaut declare n'est PAS preselectionne : le site a decide
    // que l'administrateur doit poser le choix lui-meme, et cette decision lui
    // appartient. Preselectionner la premiere option faisait partir un vrai
    // email a un vrai client sur un simple clic. L'option vide est desactivee
    // pour ne pas pouvoir etre re-choisie une fois qu'on l'a quittee.
    return (
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className={classe}
        aria-label={parametre.libelle}
      >
        {choixObligatoire(parametre) && (
          <option value="" disabled>— Choisir —</option>
        )}
        {parametre.options.map((o) => (
          <option key={o.valeur} value={o.valeur}>{o.libelle}</option>
        ))}
      </select>
    );
  }
  if (parametre.type === 'nombre') {
    return (
      <input
        type="number"
        min={parametre.min}
        max={parametre.max}
        value={valeur}
        onChange={(e) => onChange(nombreSaisi(e.target.value))}
        className={`${classe} w-16`}
        aria-label={parametre.libelle}
      />
    );
  }
  if (parametre.type === 'booleen') {
    return (
      <label className="flex items-center gap-1 text-xs text-baikal-text">
        <input
          type="checkbox"
          checked={valeur === true || valeur === 'true'}
          onChange={(e) => onChange(e.target.checked)}
        />
        {parametre.libelle}
      </label>
    );
  }
  return (
    <input
      type="text"
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      placeholder={parametre.libelle}
      className={classe}
      aria-label={parametre.libelle}
    />
  );
}

function valeurInitiale(parametre) {
  // booleen en premier, avant le repli generique sur `defaut` : le serveur
  // normalise toujours ce champ en chaine (manifeste.ts fait String(p.defaut)),
  // donc un defaut booleen `false` arrive comme la CHAINE "false" -- truthy
  // en JS. Si ce repli generique la laissait passer telle quelle, l'affichage
  // resterait correct (checked= tolere la chaine) mais la valeur envoyee au
  // site serait cette chaine truthy : une case a cocher decochee partirait
  // comme "vraie" dans le payload, sans la moindre erreur a l'ecran.
  if (parametre.type === 'booleen') return parametre.defaut === 'true';
  // Le nombre passe avant le repli generique pour la meme raison : `defaut`
  // arrive lui aussi en chaine, et le laisser filer tel quel enverrait "5"
  // au site. min/max sont garantis numeriques par le manifeste valide : 0 est
  // une borne legitime qu'un `|| 1` ecraserait a tort (0 est falsy en JS).
  if (parametre.type === 'nombre') {
    const n = Number(parametre.defaut ?? parametre.min);
    return Number.isFinite(n) ? n : parametre.min;
  }
  if (parametre.defaut !== null) return parametre.defaut;
  // Un choix sans defaut part VIDE, pas sur options[0] : c'est ce qui rend le
  // choix obligatoire cote ecran (voir choixManquant).
  return '';
}

// Le site rend un choix obligatoire en ne declarant pas de defaut utilisable.
// Toute valeur de depart VIDE compte, pas seulement null : manifeste.ts ne
// ramene a null que `undefined` et `null`, donc un `defaut: ""` survivait tel
// quel et retombait dans la branche "defaut declare" -- menu blanc (aucune
// option ne vaut ""), bouton actif, chaine vide relayee au site. Une valeur de
// depart vide n'est pas une option valide, quelle que soit son ecriture.
function choixObligatoire(parametre) {
  return parametre.type === 'choix' && !parametre.defaut;
}

// Lit la valeur courante d'un parametre, avec repli sur sa valeur initiale
// quand la cle n'existe pas encore dans l'etat. Necessaire parce que
// `valeurs` n'est seme qu'une fois (useState paresseux) alors que le
// manifeste peut changer de forme apres coup : `onFait` fait recharger la
// fiche, et une action qui apparait alors (nouvelle action, nouveau
// parametre) n'a pas encore de cle -- sans ce repli elle partirait avec une
// valeur `undefined`.
function valeurPour(valeurs, actionId, parametre) {
  const cle = `${actionId}:${parametre.id}`;
  return valeurs[cle] !== undefined ? valeurs[cle] : valeurInitiale(parametre);
}

// Tant qu'un choix obligatoire n'est pas pose, l'action ne part pas -- et la
// valeur vide n'entre jamais dans le payload. Ne bloque QUE ce cas : ni les
// autres types, ni un choix pourvu d'un defaut.
function choixManquant(valeurs, action) {
  return action.parametres.some(
    (p) => choixObligatoire(p) && !valeurPour(valeurs, action.id, p),
  );
}

export default function BarreActions({ appId, dossierId, actions, isSuperAdmin, onFait }) {
  // Array.isArray et pas `actions || []` : l'ancienne Edge Function renvoie
  // encore `actions` sous forme de BOOLEEN (relais configure ou non). Si le
  // front est deploye avant elle, `true.filter` leverait en plein rendu et la
  // page blanchirait -- ce depot n'a aucun garde-fou d'erreur.
  const visibles = (Array.isArray(actions) ? actions : [])
    .filter((a) => !a.superAdmin || isSuperAdmin);
  const [valeurs, setValeurs] = useState(() => {
    const initial = {};
    for (const a of visibles) {
      for (const p of a.parametres) initial[`${a.id}:${p.id}`] = valeurInitiale(p);
    }
    return initial;
  });
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  if (visibles.length === 0) return null;

  const lancer = async (action) => {
    // Le bouton est deja inactif dans ce cas ; cette garde est la barriere qui
    // compte, car c'est elle qui empeche la valeur vide d'entrer dans le
    // payload quel que soit le chemin d'appel (bouton ou dialogue).
    if (choixManquant(valeurs, action)) return;
    setEnCours(action.id);
    setMessage(null);
    const parametres = {};
    for (const p of action.parametres) parametres[p.id] = valeurPour(valeurs, action.id, p);
    const { data, error } = await dossiersService.executerActionSite(
      appId, dossierId, action.id, parametres,
    );
    setEnCours(null);
    if (error) {
      setMessage({ ok: false, texte: error.message });
    } else {
      setMessage({ ok: true, texte: data?.message || 'Action exécutée.' });
      onFait();
    }
  };

  return (
    <div className="px-4 py-3 border-b border-baikal-border space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {visibles.map((action) => {
          const Icone = ICONES[action.icone] || null;
          const danger = action.variante === 'danger';
          const incomplet = choixManquant(valeurs, action);
          return (
            <span key={action.id} className={`flex items-center gap-1.5 ${danger ? 'ml-auto' : ''}`}>
              {action.parametres.map((p) => (
                <ChampParametre
                  key={p.id}
                  parametre={p}
                  valeur={valeurPour(valeurs, action.id, p)}
                  onChange={(v) => setValeurs((etat) => ({ ...etat, [`${action.id}:${p.id}`]: v }))}
                />
              ))}
              <button
                onClick={() => (action.confirmation
                  ? setConfirmation(action)
                  : lancer(action))}
                disabled={enCours !== null || incomplet}
                title={incomplet ? 'Choisissez une option avant de lancer cette action.' : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs disabled:opacity-50 ${
                  danger
                    ? 'border-red-500/50 text-red-300 hover:bg-red-900/20'
                    : 'border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan'
                }`}
              >
                {Icone && (
                  <Icone
                    className={`w-3.5 h-3.5 ${
                      enCours === action.id && action.icone === 'refresh' ? 'animate-spin' : ''
                    }`}
                  />
                )}
                {enCours === action.id ? 'En cours…' : action.libelle}
              </button>
            </span>
          );
        })}
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {message.texte}
        </p>
      )}
      {confirmation && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation;
            setConfirmation(null);
            lancer(action);
          }}
          title={confirmation.confirmation.titre}
          message={confirmation.confirmation.message}
          confirmLabel={confirmation.confirmation.bouton}
          variant={confirmation.variante === 'danger' ? 'danger' : 'info'}
          icon={ICONES[confirmation.icone] || AlertTriangle}
        />
      )}
    </div>
  );
}
