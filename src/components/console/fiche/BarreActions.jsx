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

function ChampParametre({ parametre, valeur, onChange }) {
  const classe = 'px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs '
    + 'text-baikal-text focus:outline-none focus:border-baikal-cyan';
  if (parametre.type === 'choix') {
    return (
      <select value={valeur} onChange={(e) => onChange(e.target.value)} className={classe}>
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
        onChange={(e) => onChange(e.target.value)}
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
  if (parametre.defaut !== null) return parametre.defaut;
  if (parametre.type === 'choix') return parametre.options[0].valeur;
  // min/max sont garantis numeriques par le manifeste valide : 0 est une
  // borne legitime qu'un `|| 1` ecraserait a tort (0 est falsy en JS).
  if (parametre.type === 'nombre') return String(parametre.min);
  if (parametre.type === 'booleen') return false;
  return '';
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

export default function BarreActions({ appId, dossierId, actions, isSuperAdmin, onFait }) {
  const visibles = (actions || []).filter((a) => !a.superAdmin || isSuperAdmin);
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
                disabled={enCours !== null}
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
