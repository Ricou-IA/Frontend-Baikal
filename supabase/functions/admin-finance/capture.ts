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
import {
  type CompteStripe,
  comptesALire,
  rangerVente,
  refStripeValide,
  type SiteRegistre,
} from "../_shared/finance-comptes.ts";
import { chargerSite, lecteurSite } from "../_shared/sites.ts";

const TVA_DEFAUT = 0.20;
const TYPES_ENCAISSEMENT = new Set(["charge", "payment"]);
const TYPES_REMBOURSEMENT = new Set(["refund", "payment_refund"]);

// Ou lire le cout IA de chaque site. Un site absent d'ici n'a pas de cout IA
// suivi : sa journee reste complete, elle n'est pas approximee.
// On vise les TABLES, pas les vues publiques : le GRANT de baikal_reader et les
// policies baikal_read couvrent les tables, tandis qu'une vue creee ensuite
// demande un GRANT explicite (constate : permission denied for view pv_ai_logs).
const TABLE_IA: Record<string, string> = {
  "pack-vendeur": "pack_vendeur.ai_logs",
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

/** Une vente dont le site n'est pas resolu ne peut pas etre archivee : app_id
 *  porte une cle etrangere vers config.apps. On la signale plutot que de creer
 *  une pseudo-app ; le mapping complete, un rejeu de la periode la recupere.
 *  Rien n'est perdu : Stripe reste la source. */
function trierParSiteConnu(ventes: VenteArchivee[]) {
  const connues = ventes.filter((v) => v.app_id !== "inconnu");
  const nonResolues = ventes.filter((v) => v.app_id === "inconnu");
  return { connues, nonResolues };
}

/** D'ou viennent les mouvements : le compte Stripe lu et le registre des sites.
 *  Sans lui, la resolution du mapping est gardee telle quelle. */
export interface Rangement {
  compte: CompteStripe;
  sites: SiteRegistre[];
}

/** Une ligne par payment_intent encaisse sur la periode. */
export function construireVentes(
  transactions: TxStripe[],
  sessions: SessionStripe[],
  mapping: LigneMapping[],
  tvaParSite: Record<string, number>,
  rangement?: Rangement,
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
    const resolue = resoudreSite(session, mapping);
    const { app_id, offre, perimetre } = rangement
      ? rangerVente(resolue, rangement.compte, rangement.sites)
      : resolue;
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
      perimetre,
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

/** Reunit les ventes lues compte par compte. Un payment_intent n'existe que
 *  dans un compte : s'il revient deux fois, la premiere lecture est gardee
 *  (ordre des comptes stable) et le doublon se signale, pour qu'une vente ne
 *  change jamais de site d'un passage a l'autre. */
export function reunirVentes(
  lots: VenteArchivee[][],
): { ventes: VenteArchivee[]; doublons: string[] } {
  const parPi = new Map<string, VenteArchivee>();
  const doublons: string[] = [];
  for (const lot of lots) {
    for (const v of lot) {
      if (parPi.has(v.stripe_payment_intent_id)) doublons.push(v.stripe_payment_intent_id);
      else parPi.set(v.stripe_payment_intent_id, v);
    }
  }
  return { ventes: [...parPi.values()], doublons };
}

/** Lit tous les comptes Stripe de la periode et archive leurs ventes.
 *  Un compte en echec (secret absent, cle refusee) n'empeche pas d'archiver les
 *  autres, mais il est rendu dans `echecs` : l'appelant leve a la fin de son
 *  travail, pour qu'un compte manquant ne passe jamais pour un mois sans vente. */
async function archiverVentes(
  admin: SupabaseClient,
  debut: Date,
  fin: Date,
): Promise<{ ventes: VenteArchivee[]; manques: string[]; echecs: string[] }> {
  const manques: string[] = [];
  const echecs: string[] = [];

  const { data: mapping, error: errMapping } = await admin.schema("admin").from("stripe_mapping")
    .select("cle_type, cle, app_id, offre, perimetre");
  if (errMapping) throw new Error(`lecture stripe_mapping: ${errMapping.message}`);
  const { data: apps, error: errApps } = await admin.schema("config").from("apps")
    .select("id, db_schema, tva_taux, stripe_key_ref, is_active");
  if (errApps) throw new Error(`lecture config.apps: ${errApps.message}`);

  const sites = (apps ?? []) as Array<SiteRegistre & { tva_taux: number | null }>;
  const tvaParSite: Record<string, number> = {};
  for (const a of sites) tvaParSite[a.id] = Number(a.tva_taux ?? TVA_DEFAUT);

  // ADMIN_STRIPE_KEY d'abord (cle restreinte en LECTURE, a preferer), sinon la
  // cle secrete deja posee dans le projet : c'est le compte commun.
  const cleCommune = Deno.env.get("ADMIN_STRIPE_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY");
  const comptes = comptesALire(sites, Boolean(cleCommune));
  if (comptes.length === 0) {
    throw new Error("Aucune cle Stripe : posez ADMIN_STRIPE_KEY ou STRIPE_SECRET_KEY");
  }

  const lots: VenteArchivee[][] = [];
  const transactions: TxStripe[] = [];
  for (const compte of comptes) {
    const nom = compte.ref ?? "commun";
    try {
      let cle = cleCommune;
      if (compte.ref) {
        if (!refStripeValide(compte.ref)) throw new Error("nom de secret refuse");
        cle = Deno.env.get(compte.ref);
        if (!cle) throw new Error("secret absent des Edge Functions");
      }
      const tx = await listerTransactions(cle!, debut, fin);
      const sessions = await listerSessions(cle!, debut, fin);
      transactions.push(...tx);
      lots.push(
        construireVentes(tx, sessions, (mapping ?? []) as LigneMapping[], tvaParSite, { compte, sites }),
      );
    } catch (e) {
      echecs.push(`stripe_compte:${nom}`);
      console.error(`[admin-finance] compte Stripe ${nom}: ${(e as Error).message}`);
    }
  }

  const { ventes, doublons } = reunirVentes(lots);
  for (const pi of doublons) manques.push(`doublon_comptes:${pi}`);

  const { connues, nonResolues } = trierParSiteConnu(ventes);
  if (connues.length > 0) {
    const { error } = await admin.schema("admin").from("ventes")
      .upsert(connues.map((v) => ({ ...v, maj_le: new Date().toISOString() })), {
        onConflict: "stripe_payment_intent_id",
      });
    if (error) throw new Error(`upsert ventes: ${error.message}`);
  }
  for (const v of nonResolues) {
    manques.push(`site_inconnu:${v.stripe_payment_intent_id}`);
  }

  for (const o of remboursementsOrphelins(transactions, ventes)) {
    const { error } = await admin.schema("admin").from("ventes")
      .update({ montant_rembourse: o.montant, rembourse_le: o.date, maj_le: new Date().toISOString() })
      .eq("stripe_payment_intent_id", o.payment_intent);
    if (error) manques.push(`remboursement:${o.payment_intent}`);
  }

  return { ventes, manques: [...manques, ...echecs], echecs };
}

function leverSiEchec(echecs: string[]): void {
  if (echecs.length > 0) {
    throw new Error(`Comptes Stripe non lus : ${echecs.join(", ")}. Les autres comptes sont archives.`);
  }
}

/** Capture d'une journee UTC complete. Idempotente : rejouable sans doublon. */
export async function captureJour(
  admin: SupabaseClient,
  jour: Date,
): Promise<{ ventes: number; sites: string[]; manques: string[] }> {
  const debut = new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate()));
  const fin = new Date(debut.getTime() + 86_400_000 - 1000);
  const jourIso = debut.toISOString().slice(0, 10);
  const { ventes, manques, echecs } = await archiverVentes(admin, debut, fin);

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

  leverSiEchec(echecs);
  return { ventes: ventes.length, sites, manques };
}

/** Reprise d'historique : une seule requete Stripe pour toute la periode et un
 *  groupement par jour pour les couts, au lieu d'un aller-retour par journee.
 *  Les journees sans cout IA n'ont pas de ligne finance_jours : l'agregation
 *  traite leur absence comme un cout nul. */
export async function capturePeriode(
  admin: SupabaseClient,
  debut: Date,
  fin: Date,
): Promise<{ ventes: number; sites: string[]; jours_couts: number; manques: string[] }> {
  const { ventes, manques, echecs } = await archiverVentes(admin, debut, fin);

  const taux = Number(Deno.env.get("ADMIN_TAUX_USD_EUR") ?? "0.92");
  let joursCouts = 0;
  for (const [appId, table] of Object.entries(TABLE_IA)) {
    try {
      const site = await chargerSite(admin, appId);
      const sql = lecteurSite(site);
      try {
        const rows = await sql`
          SELECT created_at::date AS jour, coalesce(sum(cost_usd), 0)::float AS cout
          FROM ${sql.unsafe(table)}
          WHERE created_at >= ${debut.toISOString()} AND created_at <= ${fin.toISOString()}
          GROUP BY 1 ORDER BY 1`;
        if (rows.length > 0) {
          const { error } = await admin.schema("admin").from("finance_jours").upsert(
            rows.map((r: any) => ({
              app_id: appId,
              // postgres-js rend un objet Date pour une colonne date :
              // String() donnerait « Thu Jul 30 2026 … », pas une date ISO.
              jour: new Date(r.jour).toISOString().slice(0, 10),
              cout_ia_usd: Number(r.cout),
              cout_ia_eur: arrondi(Number(r.cout) * taux),
              taux_usd: taux,
              ads_eur: null,
              complet: true,
              manques: [],
              calcule_le: new Date().toISOString(),
            })),
            { onConflict: "app_id,jour" },
          );
          if (error) manques.push(`finance_jours:${appId}`);
          else joursCouts += rows.length;
        }
      } finally {
        await sql.end();
      }
    } catch (e) {
      manques.push(`ai_logs:${appId}`);
      console.warn(`[admin-finance] couts IA ${appId}: ${(e as Error).message}`);
    }
  }

  leverSiEchec(echecs);
  return {
    ventes: ventes.length,
    sites: [...new Set(ventes.map((v) => v.app_id))],
    jours_couts: joursCouts,
    manques,
  };
}
