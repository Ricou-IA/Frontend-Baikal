// Resolution du site et de l'offre d'un encaissement Stripe.
// Le compte Stripe est PARTAGE par tous les produits : sans cette resolution,
// rien ne separe leur chiffre d'affaires.
//
// Ordre, premier match gagnant :
//   1. metadata[application] pose par le checkout  (cible, deja en place sur
//      les produits MonsieurDPE) ;
//   2. le product de la ligne de commande ;
//   3. le price ;
//   4. le libelle de la ligne, seul recours pour un prix construit en
//      price_data inline (Autorisation Voirie).
// Rien ne correspond -> 'inconnu'. On ne devine JAMAIS par le montant : deux
// produits a 24,99 EUR existent deja.
import type { SessionStripe } from "./stripe.ts";

export interface LigneMapping {
  cle_type: "product" | "price" | "libelle";
  cle: string;
  app_id: string;
  offre: string;
}

export interface Resolution {
  app_id: string;
  offre: string;
}

const INCONNU: Resolution = { app_id: "inconnu", offre: "inconnu" };

function chercher(
  mapping: LigneMapping[],
  type: LigneMapping["cle_type"],
  cle: string | null,
): Resolution | null {
  if (!cle) return null;
  const l = mapping.find((m) => m.cle_type === type && m.cle === cle);
  return l ? { app_id: l.app_id, offre: l.offre } : null;
}

export function resoudreSite(
  session: SessionStripe,
  mapping: LigneMapping[],
): Resolution {
  const app = session.metadata?.application;
  if (app) {
    return { app_id: app, offre: session.metadata?.cle || "inconnu" };
  }

  for (const ligne of session.produits ?? []) {
    const r = chercher(mapping, "product", ligne.product) ??
      chercher(mapping, "price", ligne.price) ??
      chercher(mapping, "libelle", ligne.libelle || null);
    if (r) return r;
  }

  return INCONNU;
}
