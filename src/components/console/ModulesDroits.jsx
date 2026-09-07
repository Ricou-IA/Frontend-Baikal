/**
 * ModulesDroits - Baikal Console
 * ============================================================================
 * La grille d'acces d'une personne sur un site : un selecteur a trois
 * positions par module (ferme / lecture / ecriture). Meme liste que
 * core.modules_console() cote base ; « users » ne connait que ferme/lecture,
 * ses actions restant super/org admin.
 *
 * `modules` : {module: 'lecture'|'ecriture'} (absent = ferme).
 * `onChange(modulesSuivants)` recoit l'objet complet, deja normalise.
 * ============================================================================
 */

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

const CLASSES_NIVEAU = {
  ferme: 'border-baikal-border text-baikal-text/60',
  lecture: 'border-amber-500/60 text-amber-300',
  ecriture: 'border-baikal-cyan/70 text-baikal-cyan',
};

export default function ModulesDroits({ modules = {}, onChange, disabled = false, compact = false }) {
  const changer = (id, valeur) => {
    const suivant = { ...modules };
    if (valeur === 'ferme') delete suivant[id];
    else suivant[id] = valeur;
    onChange?.(suivant);
  };

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {MODULES_CONSOLE.map((m) => {
        const niveau = modules[m.id] === 'lecture' || modules[m.id] === 'ecriture' ? modules[m.id] : 'ferme';
        return (
          <label key={m.id} className="flex items-center gap-1 text-xs text-baikal-text">
            <span className={compact ? 'sr-only' : 'opacity-70'}>{m.label}</span>
            <select
              value={niveau}
              disabled={disabled}
              onChange={(e) => changer(m.id, e.target.value)}
              title={m.label}
              aria-label={m.label}
              className={`px-1.5 py-1 rounded border bg-baikal-bg text-xs font-mono focus:border-baikal-cyan outline-none disabled:opacity-50 ${CLASSES_NIVEAU[niveau]}`}
            >
              {NIVEAUX.filter(([v]) => !(m.lectureSeule && v === 'ecriture')).map(([v, l]) => (
                <option key={v} value={v}>{compact ? `${m.label} · ${l}` : l}</option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
