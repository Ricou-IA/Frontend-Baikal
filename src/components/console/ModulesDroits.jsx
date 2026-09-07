/**
 * ModulesDroits - Baikal Console
 * ============================================================================
 * La grille d'acces d'une personne sur un site : pour chaque module, un
 * groupe de trois boutons (ferme / lecture / ecriture), un seul enfonce —
 * comme un interrupteur, pas une liste deroulante. Meme liste que
 * core.modules_console() cote base ; « users » ne connait que ferme/lecture,
 * ses actions restant super/org admin.
 *
 * `modules` : {module: 'lecture'|'ecriture'} (absent = ferme).
 * `onChange(modulesSuivants)` recoit l'objet complet, deja normalise.
 * ============================================================================
 */

import { Ban, Eye, Pencil } from 'lucide-react';

export const MODULES_CONSOLE = [
  { id: 'clients', label: 'Clients' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'finances', label: 'Finances' },
  { id: 'rapports', label: 'Rapports' },
  { id: 'seo', label: 'SEO' },
  { id: 'partenariats', label: 'Partenariats' },
  { id: 'users', label: 'Utilisateurs', lectureSeule: true },
];

export const NIVEAUX = [
  ['ferme', 'Fermé'],
  ['lecture', 'Lecture'],
  ['ecriture', 'Écriture'],
];

export function libelleNiveau(niveau) {
  return NIVEAUX.find(([v]) => v === (niveau || 'ferme'))?.[1] || 'Fermé';
}

// Un bouton par position : icone, libelle au survol, couleur quand enfonce.
const POSITIONS = [
  { valeur: 'ferme', label: 'Fermé', Icone: Ban,
    actif: 'bg-baikal-border/60 text-white border-baikal-border' },
  { valeur: 'lecture', label: 'Lecture', Icone: Eye,
    actif: 'bg-amber-500/20 text-amber-300 border-amber-500/60' },
  { valeur: 'ecriture', label: 'Écriture', Icone: Pencil,
    actif: 'bg-baikal-cyan/20 text-baikal-cyan border-baikal-cyan/70' },
];

const INACTIF = 'text-baikal-text/50 border-transparent hover:text-white hover:bg-baikal-bg';

function niveauDe(modules, id) {
  return modules[id] === 'lecture' || modules[id] === 'ecriture' ? modules[id] : 'ferme';
}

function Interrupteur({ module, niveau, onChange, disabled }) {
  const positions = POSITIONS.filter((p) => !(module.lectureSeule && p.valeur === 'ecriture'));
  return (
    <div
      role="radiogroup"
      aria-label={module.label}
      className="inline-flex items-center rounded-md border border-baikal-border bg-baikal-bg/60 p-0.5"
    >
      {positions.map(({ valeur, label, Icone, actif }) => {
        const enfonce = niveau === valeur;
        return (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={enfonce}
            disabled={disabled}
            title={`${module.label} · ${label}`}
            onClick={() => { if (!enfonce) onChange(valeur); }}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-mono transition-colors disabled:opacity-50
              ${enfonce ? actif : INACTIF}`}
          >
            <Icone className="w-3.5 h-3.5" />
            <span className={enfonce ? '' : 'sr-only'}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ModulesDroits({ modules = {}, onChange, disabled = false }) {
  const changer = (id, valeur) => {
    const suivant = { ...modules };
    if (valeur === 'ferme') delete suivant[id];
    else suivant[id] = valeur;
    onChange?.(suivant);
  };

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {MODULES_CONSOLE.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <span className="text-xs text-baikal-text opacity-70 w-20 text-right">{m.label}</span>
          <Interrupteur
            module={m}
            niveau={niveauDe(modules, m.id)}
            onChange={(v) => changer(m.id, v)}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}
