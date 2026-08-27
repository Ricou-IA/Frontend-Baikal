/**
 * badges-prospects.jsx - Baikal Console
 * ============================================================================
 * Badges metier, statut et provenance de la page /prospect. La couleur du
 * metier vient de admin.metier (donnee, pas code) : un slug absent de la
 * table s'affiche en gris avec sa valeur brute plutot que de casser la page.
 * ============================================================================
 */
const COULEURS = {
  slate: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
  blue: 'border-blue-500/40 text-blue-300 bg-blue-500/10',
  amber: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  emerald: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  red: 'border-red-500/40 text-red-300 bg-red-500/10',
  violet: 'border-violet-500/40 text-violet-300 bg-violet-500/10',
};

const STATUTS = {
  nouveau: ['slate', 'Nouveau'],
  contacte: ['blue', 'Contacté'],
  relance: ['amber', 'Relancé'],
  repondu: ['emerald', 'A répondu'],
  refus: ['red', 'Refus'],
  desinscrit: ['red', 'Désinscrit'],
};

function Badge({ couleur, children }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] border ${COULEURS[couleur] || COULEURS.slate}`}>
      {children}
    </span>
  );
}

export function BadgeMetier({ slug, metiers }) {
  const m = (metiers || []).find((x) => x.slug === slug);
  return <Badge couleur={m?.couleur}>{m?.libelle || slug || '—'}</Badge>;
}

export function BadgeStatut({ statut }) {
  const [couleur, libelle] = STATUTS[statut] || ['slate', statut || '—'];
  return <Badge couleur={couleur}>{libelle}</Badge>;
}

export function BadgeClient({ depuis }) {
  if (!depuis) return null;
  return <Badge couleur="emerald">Client</Badge>;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtNombre(n) {
  return new Intl.NumberFormat('fr-FR').format(n ?? 0);
}
