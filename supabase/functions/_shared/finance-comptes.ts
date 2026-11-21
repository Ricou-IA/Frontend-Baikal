// Un compte Stripe par site : quels comptes lire, et a quel site ranger une
// vente lue dans l'un d'eux. Tout est pur ; la capture fait les entrees-sorties.
//
// Deux sortes de comptes :
//   - le compte COMMUN (cle ADMIN_STRIPE_KEY ou STRIPE_SECRET_KEY), partage par
//     plusieurs produits : seul le mapping y dit a qui est une vente ;
//   - le compte PROPRE a un site, designe par config.apps.stripe_key_ref (le
//     NOM du secret, jamais la cle).
//
// Regle de repli (plan facturation, § 9.1) : une vente que rien ne resout
// appartient au site du compte SEULEMENT si ce compte ne sert qu'un site. Dans
// le compte commun, ou dans un compte designe par deux sites, elle reste
// « inconnu » et se signale.
import type { Resolution } from "./finance-mapping.ts";

export interface SiteRegistre {
  id: string;
  db_schema: string | null;
  stripe_key_ref: string | null;
  is_active: boolean;
}

export interface CompteStripe {
  /** Nom du secret qui porte la cle. null = compte commun. */
  ref: string | null;
  /** Sites qui designent ce compte au registre (vide pour le compte commun). */
  sites: string[];
  /** Le site du compte quand il n'en sert qu'un, sinon null. */
  siteSeul: string | null;
}

/** Un nom de secret Stripe : majuscules, chiffres, tirets bas, et le mot STRIPE.
 *  La contrainte n'est pas cosmetique : la valeur du secret nomme part vers
 *  api.stripe.com, donc le registre ne doit pas pouvoir designer une autre cle
 *  du projet (cle de service, jeton d'un tiers). */
export function refStripeValide(ref: string): boolean {
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(ref) && ref.includes("STRIPE");
}

/** Les comptes a lire, dans un ordre stable : le commun d'abord (s'il a une
 *  cle), puis les comptes propres par nom de secret. Un site inactif ne fait
 *  lire aucun compte. */
export function comptesALire(sites: SiteRegistre[], communDisponible: boolean): CompteStripe[] {
  const parRef = new Map<string, string[]>();
  for (const s of sites) {
    const ref = (s.stripe_key_ref ?? "").trim();
    if (!ref || !s.is_active) continue;
    parRef.set(ref, [...(parRef.get(ref) ?? []), s.id]);
  }

  const comptes: CompteStripe[] = [];
  if (communDisponible) comptes.push({ ref: null, sites: [], siteSeul: null });
  for (const ref of [...parRef.keys()].sort()) {
    const ids = parRef.get(ref)!.sort();
    comptes.push({ ref, sites: ids, siteSeul: ids.length === 1 ? ids[0] : null });
  }
  return comptes;
}

/** Traduit le marqueur pose par un site (metadata.application) en id du
 *  registre : par l'id, sinon par db_schema ('dpe' -> monsieurdpe). Meme regle
 *  que core.resoudre_app cote SQL. null = marqueur inconnu du registre. */
export function traduireMarqueur(marqueur: string, sites: SiteRegistre[]): string | null {
  const m = marqueur.trim();
  if (!m) return null;
  const parId = sites.find((s) => s.id === m);
  if (parId) return parId.id;
  const parSchema = sites.find((s) => s.db_schema === m);
  return parSchema ? parSchema.id : null;
}

/** Le site definitif d'une vente : la resolution du mapping, traduite vers le
 *  registre, puis le repli sur le site du compte quand il n'en sert qu'un. */
export function rangerVente(
  resolution: Resolution,
  compte: CompteStripe,
  sites: SiteRegistre[],
): Resolution {
  if (resolution.app_id !== "inconnu") {
    const id = traduireMarqueur(resolution.app_id, sites);
    if (id) return { ...resolution, app_id: id };
    // Marqueur que le registre ne connait pas : l'archiver tel quel casserait
    // la cle etrangere de admin.ventes et ferait echouer tout le lot.
  }
  if (compte.siteSeul) return { ...resolution, app_id: compte.siteSeul };
  return { ...resolution, app_id: "inconnu" };
}
