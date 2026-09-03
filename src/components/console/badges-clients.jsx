/**
 * badges-clients.jsx - Baikal Console
 * ============================================================================
 * Badges et formats partages entre la liste /clients et la fiche dossier.
 * Le badge d'etape se resout via funnel_etapes (registre) : slug inconnu ou
 * funnel absent -> repli neutre (Paye/— derive de payeLe).
 * ============================================================================
 */

const COULEURS_ETAPES = {
  slate: 'bg-slate-800/60 text-slate-300 border-slate-600',
  blue: 'bg-blue-900/40 text-blue-300 border-blue-700',
  amber: 'bg-amber-900/40 text-amber-300 border-amber-700',
  emerald: 'bg-emerald-900/40 text-emerald-200 border-emerald-700',
  red: 'bg-red-900/30 text-red-300 border-red-800',
  violet: 'bg-violet-900/40 text-violet-300 border-violet-700',
};
const COULEUR_DEFAUT = 'bg-baikal-bg text-baikal-text border-baikal-border';

// Buckets de la cascade canalVente (admin-dossiers/canal.ts), meme ordre de
// priorite que son en-tete (portail_pro > paid > geo > campaign > organic >
// referral > direct > indetermine > unattributed). Libelles adaptes a
// l'affichage (organic affiche 'SEO', unattributed masque — choix assume,
// different de /finances qui garde sa propre liste CANAUX). Depuis le
// 2026-09-03 cette cascade n'est plus un portage du SQL admin.canal_vente
// (divergence deliberee, voir l'en-tete de canal.ts) : direct et geo n'ont
// pas d'equivalent cote archive financiere.
export const CANAUX = {
  portail_pro: ['Portail-Pro', 'text-baikal-cyan'],
  paid: ['Publicité', 'text-amber-400'],
  geo: ['GEO', 'text-fuchsia-400'],
  campaign: ['Campagne', 'text-violet-400'],
  organic: ['SEO', 'text-emerald-400'],
  referral: ['Référent', 'text-blue-400'],
  direct: ['Direct', 'text-sky-400'],
  indetermine: ['Origine perdue', 'text-red-400/80'],
  unattributed: [null, 'text-baikal-text'],
};

export function BadgeEtape({ statut, payeLe, funnel }) {
  const etape = (funnel || []).find((e) => e.slug === statut) || null;
  if (etape) {
    const badge = (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEURS_ETAPES[etape.couleur] || COULEUR_DEFAUT}`}>
        {etape.libelle}
      </span>
    );
    // Une etape post-paiement (envoye, a traiter, abonne...) decrit l'apres-vente :
    // le badge Paye passe devant, identique a celui des autres lignes, et
    // l'etat d'apres-vente le suit. Sans lui, un client payant se lirait
    // comme un dossier non converti.
    if (etape.apres_paiement && payeLe) {
      return (
        <span className="inline-flex items-center gap-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEURS_ETAPES.emerald}`}>
            Payé
          </span>
          {badge}
        </span>
      );
    }
    return badge;
  }
  // Site sans funnel (statut null) ou slug hors registre : repli.
  if (statut) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEUR_DEFAUT}`}>
        {statut}
      </span>
    );
  }
  return payeLe ? (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEURS_ETAPES.emerald}`}>
      Payé
    </span>
  ) : (
    <span className="text-baikal-text opacity-50">—</span>
  );
}

// Categorie de client : slug porte par la vue du site, libelle et couleur par
// config.apps.categories_client. Sans categories (site sans la colonne), on
// retombe sur B2C/B2B derive de perimetre.
export function BadgeCategorie({ categorie, perimetre, categories }) {
  const cat = categorie && (categories || []).find((c) => c.slug === categorie);
  if (cat) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEURS_ETAPES[cat.couleur] || COULEUR_DEFAUT}`}>
        {cat.libelle}
      </span>
    );
  }
  if (categorie) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEUR_DEFAUT}`}>
        {categorie}
      </span>
    );
  }
  return <span className="text-xs opacity-70">{perimetre === 'b2b' ? 'B2B' : 'B2C'}</span>;
}

// Domaines de paiement a ne jamais afficher comme origine (retour du tunnel
// du site lui-meme, jamais une visite) : meme principe que
// DOMAINES_PAIEMENT_EXCLUS cote admin-dossiers/canal.ts, duplique ici car ce
// fichier tourne cote navigateur (pas d'import cross-runtime Deno/Vite).
// Sans ce filtre, un dossier classe 'direct' par exclusion afficherait quand
// meme "Direct · checkout.stripe.com" a partir de l'attribution brute.
const DOMAINES_PAIEMENT_MASQUES = ['checkout.stripe.com'];

export function BadgeCanal({ canal, attribution }) {
  const [libelle, classe] = CANAUX[canal] || [canal, 'text-baikal-text'];
  if (!libelle) return null;
  const domaineBrut = attribution?.referrer_domaine || null;
  const domaine = domaineBrut && !DOMAINES_PAIEMENT_MASQUES.includes(domaineBrut) ? domaineBrut : null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-baikal-border text-[11px] ${classe}`}>
      {libelle}
      {domaine && <span className="opacity-70">· {domaine}</span>}
    </span>
  );
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function fmtDateHeure(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// postgres-js renvoie les numeric en chaines : on coerce avant de formater.
export function fmtEur(n) {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return '—';
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`;
}
