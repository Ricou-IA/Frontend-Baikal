// Capture financiere d'une journee : Stripe + couts par site -> archive.
// construireVentes est pure et testee ; captureJour fait les entrees-sorties.
//
// Regle metier posee par Eric le 25/08 : un remboursement NE DIMINUE PAS le
// chiffre d'affaires. La vente reste comptee (elle compte dans le seuil du
// partenariat), le remboursement est un cout decompose a cote.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listerSessions, listerTransactions, type SessionStripe, type TxStripe } from "../_shared/stripe.ts";
import { type LigneMapping, resoudreSite } from "../_shared/finance-mapping.ts";
import { chargerSite, lecteurSite } from "../_shared/sites.ts";

const TVA_DEFAUT = 0.20;
const TYPES_ENCAISSEMENT = new Set(["charge", "payment"]);
const TYPES_REMBOURSEMENT = new Set(["refund", "payment_refund"]);

// Ou lire le cout IA de chaque site. Un site absent d'ici n'a pas de cout IA
// suivi : sa journee reste complete, elle n'est pas approximee.
const TABLE_IA: Record<string, string> = {
  "pack-vendeur": "public.pv_ai_logs",
  "voirie": "voirie.ai_logs",
};

export interface VenteArchivee {
  app_id: string;
  stripe_payment_intent_id: string;
  paid_at: string;
  montant_ttc: number;
  montant_ht: number;
  devise: string;
  frais_stripe_eur: number;
  rembourse_le: string | null;
  montant_rembourse: number;
  offre: string;
  perimetre: string;
}

function iso(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

function arrondi(n: number): number {
  return Number(n.toFixed(2));
}

/** Une ligne par payment_intent encaisse sur la periode. */
export function construireVentes(
  transactions: TxStripe[],
  sessions: SessionStripe[],
  mapping: LigneMapping[],
  tvaParSite: Record<string, number>,
): VenteArchivee[] {
  const parPi = new Map<string, SessionStripe>();
  for (const s of sessions) {
    if (s.payment_intent) parPi.set(s.payment_intent, s);
  }

  const ventes = new Map<string, VenteArchivee>();

  for (const t of transactions) {
    if (!t.payment_intent || !TYPES_ENCAISSEMENT.has(t.type)) continue;
    const session = parPi.get(t.payment_intent) ??
      { payment_intent: t.payment_intent, metadata: {}, produits: [] };
    const { app_id, offre } = resoudreSite(session, mapping);
    const tva = tvaParSite[app_id] ?? TVA_DEFAUT;

    ventes.set(t.payment_intent, {
      app_id,
      stripe_payment_intent_id: t.payment_intent,
      paid_at: iso(t.created),
      montant_ttc: arrondi(t.amount_eur),
      // Meme formule que pv-admin-financial-summary, pour que les deux chiffres
      // coincident au centime tant que les deux ecrans coexistent.
      montant_ht: arrondi(t.amount_eur / (1 + tva)),
      devise: "EUR",
      frais_stripe_eur: arrondi(t.fee_eur),
      rembourse_le: null,
      montant_rembourse: 0,
      offre,
      perimetre: "b2c",
    });
  }

  for (const t of transactions) {
    if (!t.payment_intent || !TYPES_REMBOURSEMENT.has(t.type)) continue;
    const vente = ventes.get(t.payment_intent);
    if (!vente) continue; // remboursement d'une vente anterieure : voir remboursementsOrphelins
    vente.montant_rembourse = arrondi(vente.montant_rembourse + Math.abs(t.amount_eur));
    vente.rembourse_le = iso(t.created);
  }

  return [...ventes.values()];
}

/** Remboursements dont la vente n'est pas dans la periode : a appliquer en
 *  mise a jour sur l'archive existante, sinon ils disparaissent. */
export function remboursementsOrphelins(
  transactions: TxStripe[],
  ventes: VenteArchivee[],
): Array<{ payment_intent: string; montant: number; date: string }> {
  const connus = new Set(ventes.map((v) => v.stripe_payment_intent_id));
  const orphelins: Array<{ payment_intent: string; montant: number; date: string }> = [];

  for (const t of transactions) {
    if (!t.payment_intent || !TYPES_REMBOURSEMENT.has(t.type)) continue;
    if (connus.has(t.payment_intent)) continue;
    orphelins.push({
      payment_intent: t.payment_intent,
      montant: arrondi(Math.abs(t.amount_eur)),
      date: iso(t.created),
    });
  }
  return orphelins;
}

/** Capture d'une journee UTC complete. Idempotente : rejouable sans doublon. */
export async function captureJour(
  admin: SupabaseClient,
  jour: Date,
): Promise<{ ventes: number; sites: string[]; manques: string[] }> {
  const cle = Deno.env.get("ADMIN_STRIPE_KEY");
  if (!cle) throw new Error("ADMIN_STRIPE_KEY absent des Edge Function Secrets");

  const debut = new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate()));
  const fin = new Date(debut.getTime() + 86_400_000 - 1000);
  const jourIso = debut.toISOString().slice(0, 10);
  const manques: string[] = [];

  const { data: mapping } = await admin.schema("admin").from("stripe_mapping")
    .select("cle_type, cle, app_id, offre");
  const { data: apps } = await admin.schema("config").from("apps").select("id, tva_taux");
  const tvaParSite: Record<string, number> = {};
  for (const a of apps ?? []) tvaParSite[a.id] = Number(a.tva_taux ?? TVA_DEFAUT);

  const transactions = await listerTransactions(cle, debut, fin);
  const sessions = await listerSessions(cle, debut, fin);
  const ventes = construireVentes(transactions, sessions, (mapping ?? []) as LigneMapping[], tvaParSite);

  if (ventes.length > 0) {
    const { error } = await admin.schema("admin").from("ventes")
      .upsert(ventes.map((v) => ({ ...v, maj_le: new Date().toISOString() })), {
        onConflict: "stripe_payment_intent_id",
      });
    if (error) throw new Error(`upsert ventes: ${error.message}`);
  }

  for (const o of remboursementsOrphelins(transactions, ventes)) {
    const { error } = await admin.schema("admin").from("ventes")
      .update({ montant_rembourse: o.montant, rembourse_le: o.date, maj_le: new Date().toISOString() })
      .eq("stripe_payment_intent_id", o.payment_intent);
    if (error) manques.push(`remboursement:${o.payment_intent}`);
  }

  // Couts IA, site par site. Une source en echec n'interrompt pas la capture :
  // elle rend la journee incomplete et se signale dans `manques`.
  const sites = [...new Set(ventes.map((v) => v.app_id))].filter((s) => s !== "inconnu");
  for (const appId of [...new Set([...sites, ...Object.keys(TABLE_IA)])]) {
    const table = TABLE_IA[appId];
    if (!table) continue;
    let coutUsd = 0;
    let echec = false;
    try {
      const site = await chargerSite(admin, appId);
      const sql = lecteurSite(site);
      try {
        const [row] = await sql`
          SELECT coalesce(sum(cost_usd), 0)::float AS cout
          FROM ${sql.unsafe(table)}
          WHERE created_at >= ${debut.toISOString()} AND created_at <= ${fin.toISOString()}`;
        coutUsd = Number(row?.cout ?? 0);
      } finally {
        await sql.end();
      }
    } catch (e) {
      echec = true;
      manques.push(`ai_logs:${appId}`);
      console.warn(`[admin-finance] cout IA ${appId}: ${(e as Error).message}`);
    }

    const taux = Number(Deno.env.get("ADMIN_TAUX_USD_EUR") ?? "0.92");
    const { error } = await admin.schema("admin").from("finance_jours").upsert({
      app_id: appId,
      jour: jourIso,
      cout_ia_usd: coutUsd,
      cout_ia_eur: arrondi(coutUsd * taux),
      taux_usd: taux,
      ads_eur: null, // Google Ads non branche : absence de configuration, pas un echec
      complet: !echec,
      manques: echec ? [`ai_logs:${appId}`] : [],
      calcule_le: new Date().toISOString(),
    }, { onConflict: "app_id,jour" });
    if (error) manques.push(`finance_jours:${appId}`);
  }

  return { ventes: ventes.length, sites, manques };
}
