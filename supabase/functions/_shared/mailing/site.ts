// Ce que le mailing sait d'un site : sa config d'envoi (registre), ou vit son
// module mailing-v1, quelles populations il expose, comment ecrire chez lui,
// et les compteurs de ses campagnes (lus dans son journal).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Site } from "../sites.ts";
import { appelerRelais, relaisConfigure } from "../relais.ts";
import { POPULATIONS, type Population } from "./segment.ts";

export interface ConfigMailing {
  expediteur_nom: string | null;
  expediteur_email: string | null;
  reply_to: string | null;
  resend_key_ref: string | null;
  resend_webhook_secret_ref: string | null;
  mailing_plafond_jour: number | null;
  env_mailing_fn: string | null;
}

export async function chargerConfigMailing(admin: SupabaseClient, appId: string): Promise<ConfigMailing> {
  const { data, error } = await admin.schema("config").from("apps")
    .select("expediteur_nom, expediteur_email, reply_to, resend_key_ref, " +
      "resend_webhook_secret_ref, mailing_plafond_jour, env_mailing_fn")
    .eq("id", appId).maybeSingle();
  if (error) throw new Error(`Lecture du registre impossible: ${error.message}`);
  return (data ?? {}) as ConfigMailing;
}

// "Nom <adresse>" : l'expediteur du site, sinon le domaine de repli de
// Baikal (MAILING_EXPEDITEUR_REPLI), sinon null (envoi impossible).
export function expediteur(site: Site, cfg: ConfigMailing): string | null {
  const nom = (cfg.expediteur_nom || site.name).replace(/[<>"]/g, "");
  const adresse = cfg.expediteur_email || Deno.env.get("MAILING_EXPEDITEUR_REPLI") || null;
  return adresse ? `${nom} <${adresse}>` : null;
}

export function cleResend(cfg: ConfigMailing): { cle: string | null; source: string } {
  if (cfg.resend_key_ref) {
    return { cle: Deno.env.get(cfg.resend_key_ref) ?? null, source: cfg.resend_key_ref };
  }
  return { cle: Deno.env.get("RESEND_API_KEY") ?? null, source: "RESEND_API_KEY" };
}

// deno-lint-ignore no-explicit-any
type Sql = any;

// Schema ou le site a installe le module (mail_envoi + baikal_mail_optout) :
// db_schema sur la base partagee, public sur un projet dedie.
export async function schemaMailing(sql: Sql, site: Site): Promise<string | null> {
  for (const s of [site.db_schema, "public"].filter((x): x is string => Boolean(x))) {
    const [r] = await sql`
      SELECT to_regclass(${s + ".mail_envoi"}) IS NOT NULL
         AND to_regclass(${s + ".baikal_mail_optout"}) IS NOT NULL AS ok`;
    if (r.ok) return s;
  }
  return null;
}

export async function colonnesVue(sql: Sql, schema: string, vue: string): Promise<Set<string> | null> {
  const rows = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = ${schema} AND table_name = ${vue}`;
  return rows.length ? new Set(rows.map((r: { column_name: string }) => r.column_name)) : null;
}

// Populations exposees par le site : celles dont la vue existe et a un email.
export async function populationsDisponibles(
  sql: Sql,
  schema: string,
): Promise<Partial<Record<Population, Set<string>>>> {
  const dispo: Partial<Record<Population, Set<string>>> = {};
  for (const p of Object.keys(POPULATIONS) as Population[]) {
    const col = await colonnesVue(sql, schema, POPULATIONS[p].vue);
    if (col?.has("email")) dispo[p] = col;
  }
  return dispo;
}

// ------ Ecriture chez le site ------
//
// Base partagee : dispatchers public.baikal_mail_* (p_app_id). Base dediee :
// relais HTTP vers env_mailing_fn (passe-plat mailing-relais-v1.ts).

export function ecritureConfiguree(site: Site, cfg: ConfigMailing): boolean {
  return site.db_ro_secret_ref ? relaisConfigure(site, cfg.env_mailing_fn) : true;
}

export function ecrivain(admin: SupabaseClient, site: Site, cfg: ConfigMailing) {
  const dediee = Boolean(site.db_ro_secret_ref);
  async function rpc(fn: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(fn, { p_app_id: site.id, ...args });
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as Record<string, unknown>;
  }
  async function relais(action: string, args: Record<string, unknown>) {
    return await appelerRelais(site, cfg.env_mailing_fn, { action, ...args }, 30000) as Record<string, unknown>;
  }
  return {
    async reserver(campagneId: string, lignes: unknown[]): Promise<string[]> {
      const r = dediee
        ? await relais("reserver", { campagne_id: campagneId, lignes })
        : await rpc("baikal_mail_reserver", { p_campagne_id: campagneId, p_lignes: lignes });
      return Array.isArray(r?.reserves) ? r.reserves as string[] : [];
    },
    async marquer(campagneId: string, lignes: unknown[]) {
      return dediee
        ? await relais("marquer", { campagne_id: campagneId, lignes })
        : await rpc("baikal_mail_marquer", { p_campagne_id: campagneId, p_lignes: lignes });
    },
    async evenement(resendId: string, type: string, le: string, detail: Record<string, unknown>) {
      return dediee
        ? await relais("evenement", { resend_id: resendId, type, le, detail })
        : await rpc("baikal_mail_evenement", {
          p_resend_id: resendId, p_type: type, p_le: le, p_detail: detail,
        });
    },
    async desinscrire(email: string, motif: string, campagneId: string | null) {
      return dediee
        ? await relais("desinscrire", { email, motif, campagne_id: campagneId })
        : await rpc("baikal_mail_desinscrire", {
          p_email: email, p_motif: motif, p_campagne_id: campagneId,
        });
    },
  };
}

// ------ Compteurs ------

export interface Compteurs {
  reserves: number;
  envoyes: number;
  delivres: number;
  ouverts: number;
  cliques: number;
  rebonds: number;
  rebonds_durs: number;
  plaintes: number;
  desinscrits: number;
  erreurs: number;
  en_attente: number;
}

export async function compteursCampagnes(
  sql: Sql,
  schema: string,
  ids: string[],
): Promise<Record<string, Compteurs>> {
  if (ids.length === 0) return {};
  const rows = await sql`
    SELECT campagne_id::text AS id,
           count(*)::int                                              AS reserves,
           count(envoye_le)::int                                      AS envoyes,
           count(delivre_le)::int                                     AS delivres,
           count(ouvert_le)::int                                      AS ouverts,
           count(clique_le)::int                                      AS cliques,
           count(rebond_le)::int                                      AS rebonds,
           count(*) FILTER (WHERE rebond_type = 'Permanent')::int     AS rebonds_durs,
           count(plainte_le)::int                                     AS plaintes,
           count(desinscrit_le)::int                                  AS desinscrits,
           count(*) FILTER (WHERE statut = 'erreur')::int             AS erreurs,
           count(*) FILTER (WHERE statut = 'reserve')::int            AS en_attente
    FROM ${sql(schema)}.mail_envoi
    WHERE campagne_id = ANY(${ids}::uuid[])
    GROUP BY campagne_id`;
  return Object.fromEntries(rows.map(({ id, ...c }: { id: string } & Compteurs) => [id, c]));
}

export async function envoyesDepuis(sql: Sql, schema: string, depuis: Date): Promise<number> {
  const [r] = await sql`
    SELECT count(*)::int AS n FROM ${sql(schema)}.mail_envoi
    WHERE envoye_le >= ${depuis.toISOString()}::timestamptz`;
  return Number(r?.n ?? 0);
}
