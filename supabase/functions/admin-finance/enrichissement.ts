// Lot 2 — enrichissement des ventes par la vue du site.
//
// Stripe dit l'argent, le site dit le reste : identifiant metier, date de
// creation, et surtout l'ATTRIBUTION figee a la capture cote site. On ne
// recalcule jamais l'origine ici : la purge RGPD du site efface referrer et
// gclid a 90 jours, et 216 dossiers organiques basculeraient en « direct ».
//
// Trois mouvements :
//   1. une vente Stripe reconnue par la vue -> on complete son attribution ;
//   2. une vente de la vue absente de Stripe -> c'est un encaissement a 0 EUR
//      (coupon 100 %), qui ne produit aucun mouvement bancaire : on l'ajoute ;
//   3. une vente B2C archivee que la vue ignore -> c'est un test filtre a la
//      source : on la MARQUE exclue, sans la supprimer (la capture Stripe la
//      recreerait au passage suivant).
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, lecteurSite } from "../_shared/sites.ts";

// La vue au contrat, site par site. Un site absent d'ici n'a pas encore
// d'attribution : ses ventes restent celles de Stripe, sans origine.
const VUE_VENTES: Record<string, string> = {
  "pack-vendeur": "public.pv_ventes_baikal",
};

/** Sites disposant d'une vue au contrat. */
export function sitesAvecVue(): string[] {
  return Object.keys(VUE_VENTES);
}

export interface ResultatEnrichissement {
  lues: number;
  enrichies: number;
  ajoutees: number;
  exclues: number;
  manques: string[];
}

const CHAMPS_ATTRIBUTION = [
  "channel",
  "referrer_domaine",
  "a_gclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "landing_page",
  "porte_entree",
  "origine_declaree",
];

/** Reconstruit le JSONB d'attribution a partir d'une ligne de la vue, en
 *  N'INSCRIVANT QUE les cles reellement presentes. Une cle absente signifie
 *  « on ne sait plus » (purge passee avant la capture cote site) ; la poser a
 *  false ou a vide la ferait passer pour une absence de signal mesuree. */
export function attributionDepuisLigne(ligne: Record<string, unknown>): Record<string, unknown> {
  const attribution: Record<string, unknown> = {};
  for (const champ of CHAMPS_ATTRIBUTION) {
    const valeur = ligne[champ];
    if (valeur === null || valeur === undefined) continue;
    if (typeof valeur === "string" && valeur === "") continue;
    attribution[champ] = valeur;
  }
  if (typeof ligne.capture === "string" && ligne.capture) {
    attribution.capture_site = ligne.capture;
  }
  return attribution;
}

export async function enrichirSite(
  admin: SupabaseClient,
  appId: string,
  debut: Date,
  fin: Date,
): Promise<ResultatEnrichissement> {
  const vue = VUE_VENTES[appId];
  if (!vue) {
    return { lues: 0, enrichies: 0, ajoutees: 0, exclues: 0, manques: [`vue_absente:${appId}`] };
  }

  const manques: string[] = [];
  const site = await chargerSite(admin, appId);
  const { data: app } = await admin.schema("config").from("apps")
    .select("tva_taux").eq("id", appId).maybeSingle();
  const tva = Number(app?.tva_taux ?? 0.20);
  const sql = lecteurSite(site);

  let lignes: any[] = [];
  try {
    lignes = await sql`
      SELECT * FROM ${sql.unsafe(vue)}
      WHERE paid_at >= ${debut.toISOString()} AND paid_at <= ${fin.toISOString()}`;
  } finally {
    await sql.end();
  }

  if (lignes.length === 0) {
    // Zero ligne sans erreur est le mode d'echec le plus probable de ce contrat
    // (GRANT manquant sur la vue). On ne marque RIEN d'exclu dans ce cas.
    return { lues: 0, enrichies: 0, ajoutees: 0, exclues: 0, manques: [`vue_vide:${appId}`] };
  }

  const { data: archivees } = await admin.schema("admin").from("ventes")
    .select("id, stripe_payment_intent_id, perimetre")
    .eq("app_id", appId)
    .gte("paid_at", debut.toISOString()).lte("paid_at", fin.toISOString());

  const parPi = new Map<string, any>();
  for (const v of archivees ?? []) {
    if (v.stripe_payment_intent_id) parPi.set(v.stripe_payment_intent_id, v);
  }

  let enrichies = 0;
  let ajoutees = 0;
  const vues = new Set<string>();

  for (const ligne of lignes) {
    const pi = ligne.stripe_payment_intent_id ?? null;
    const attribution = attributionDepuisLigne(ligne);
    if (pi) vues.add(pi);

    const existante = pi ? parPi.get(pi) : null;
    if (existante) {
      const { error } = await admin.schema("admin").from("ventes").update({
        vente_id: String(ligne.vente_id),
        created_at: ligne.created_at ?? null,
        attribution,
        capture: ligne.capture ?? "live",
        offre: ligne.offre ?? undefined,
        exclue: false,
        motif_exclusion: null,
        maj_le: new Date().toISOString(),
      }).eq("id", existante.id);
      if (error) manques.push(`maj:${pi}`);
      else enrichies++;
      continue;
    }

    // Pas d'encaissement Stripe : vente a 0 EUR. On compte la vente, pas le CA.
    const { error } = await admin.schema("admin").from("ventes").upsert({
      app_id: appId,
      vente_id: String(ligne.vente_id),
      stripe_payment_intent_id: pi,
      created_at: ligne.created_at ?? null,
      paid_at: ligne.paid_at,
      montant_ttc: Number(ligne.montant_ttc ?? 0),
      montant_ht: Number((Number(ligne.montant_ttc ?? 0) / (1 + tva)).toFixed(2)),
      devise: ligne.devise ?? "EUR",
      offre: ligne.offre ?? "inconnu",
      perimetre: ligne.perimetre ?? "b2c",
      attribution,
      capture: ligne.capture ?? "live",
      maj_le: new Date().toISOString(),
    }, { onConflict: "app_id,vente_id" });
    if (error) manques.push(`ajout:${ligne.vente_id}`);
    else ajoutees++;
  }

  // Ventes B2C archivees que la vue ignore : tests filtres a la source.
  let exclues = 0;
  for (const v of archivees ?? []) {
    if (v.perimetre !== "b2c") continue; // la vue PV est B2C uniquement
    if (!v.stripe_payment_intent_id || vues.has(v.stripe_payment_intent_id)) continue;
    const { error } = await admin.schema("admin").from("ventes").update({
      exclue: true,
      motif_exclusion: "absente de la vue du site (test filtre a la source)",
      maj_le: new Date().toISOString(),
    }).eq("id", v.id);
    if (!error) exclues++;
  }

  return { lues: lignes.length, enrichies, ajoutees, exclues, manques };
}
