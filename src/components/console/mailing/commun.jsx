/**
 * commun.jsx - Mailing
 * ============================================================================
 * Libelles, badges et formats partages par la liste, l'editeur et le suivi.
 * ============================================================================
 */
// Entonnoir commun a tous les sites (Eric, 14/10/2026) : une adresse = une
// etape, la plus avancee ; chaque etape porte une intention de mail.
export const ETAPES = [
  { id: 'a_conquerir', libelle: 'À conquérir', intention: 'Prospecter', couleur: 'slate' },
  { id: 'lead', libelle: 'Lead', intention: 'Activer', couleur: 'sky' },
  { id: 'engage', libelle: 'Engagé', intention: 'Convertir', couleur: 'amber' },
  { id: 'client', libelle: 'Client', intention: 'Fidéliser', couleur: 'emerald' },
  { id: 'recurrent', libelle: 'Récurrent', intention: 'Retenir', couleur: 'violet' },
  { id: 'perdu', libelle: 'Perdu', intention: 'Réactiver', couleur: 'red' },
];

export const POPULATIONS = {
  audience: 'Audience',
  prospects: 'Prospects',
  clients: 'Clients',
  comptes: 'Comptes',
};

export const STATUTS_CAMPAGNE = {
  brouillon: ['slate', 'Brouillon'],
  en_cours: ['blue', 'En cours'],
  suspendue: ['amber', 'Suspendue'],
  terminee: ['emerald', 'Terminée'],
};

export const STATUTS_ENVOI = {
  reserve: ['slate', 'En attente'],
  envoye: ['blue', 'Envoyé'],
  delivre: ['sky', 'Délivré'],
  ouvert: ['violet', 'Ouvert'],
  clique: ['emerald', 'Cliqué'],
  rebond: ['red', 'Rebond'],
  plainte: ['red', 'Spam'],
  erreur: ['red', 'Erreur'],
};

const COULEURS = {
  slate: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
  blue: 'border-blue-500/40 text-blue-300 bg-blue-500/10',
  sky: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
  amber: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  emerald: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  red: 'border-red-500/40 text-red-300 bg-red-500/10',
  violet: 'border-violet-500/40 text-violet-300 bg-violet-500/10',
};

export function Badge({ couleur, children }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] border whitespace-nowrap ${COULEURS[couleur] || COULEURS.slate}`}>
      {children}
    </span>
  );
}

export function BadgeCampagne({ statut }) {
  const [c, l] = STATUTS_CAMPAGNE[statut] || ['slate', statut];
  return <Badge couleur={c}>{l}</Badge>;
}

export function BadgeEnvoi({ statut }) {
  const [c, l] = STATUTS_ENVOI[statut] || ['slate', statut];
  return <Badge couleur={c}>{l}</Badge>;
}

export const fmtNombre = (n) => new Intl.NumberFormat('fr-FR').format(n ?? 0);

// Taux sur les ENVOYES (pas sur les delivres) : c'est la base que Resend et
// Pack Vendeur affichent, pour que les chiffres se comparent.
export function fmtTaux(n, base) {
  if (!base) return '—';
  return `${((100 * (n ?? 0)) / base).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export function fmtDateHeure(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function Chip({ actif, onClick, children, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40
        ${actif
          ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
          : 'border-baikal-border text-baikal-text hover:text-white'}`}
    >
      {children}
    </button>
  );
}

export function Bouton({ onClick, children, variante = 'secondaire', disabled, type = 'button', titre }) {
  const styles = {
    primaire: 'bg-baikal-cyan text-black hover:bg-baikal-cyan/90 border-baikal-cyan',
    secondaire: 'border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan',
    danger: 'border-red-500/50 text-red-300 hover:bg-red-900/20',
  };
  return (
    <button
      type={type}
      title={titre}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors disabled:opacity-40 disabled:pointer-events-none ${styles[variante]}`}
    >
      {children}
    </button>
  );
}
