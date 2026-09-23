// admin-site-stats : vue d'ensemble d'un site du registre (KPIs + dernieres
// entrees), lue par le canal lecture seule du connecteur _shared/sites.ts.
// Reserve aux super_admin : un org_admin d'un site n'a pas a voir les
// chiffres des autres.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite, type Site } from "../_shared/sites.ts";
import {
  droitsModules,
  ErreurAcces,
  exigerModule,
  exigerSite,
  sitesAutorises,
} from "../_shared/droits.ts";
import { statsParSite } from "./stats-sites.ts";
import { assembler, decalerJour, normaliserRequete } from "./mesures.ts";

// deno-lint-ignore no-explicit-any
type Sql = any;

// Lecture du contrat de mesures pour UN chapitre.
//
// La resolution du schema est propre aux mesures : admin-dossiers resout le
// sien sur la presence de baikal_dossiers, mais un site peut publier des
// mesures sans publier de clients -- Baikal lui-meme est dans ce cas. Pas de
// vue, pas de tuiles, jamais une erreur.
async function lireMesures(
  sql: Sql,
  site: Site,
  chapitre: string,
  jours: number,
) {
  const candidats = [site.db_schema, "public"].filter((s): s is string => Boolean(s));
  let schemaVues: string | null = null;
  for (const s of candidats) {
    const [r] = await sql`SELECT to_regclass(${s + ".baikal_mesures"}) IS NOT NULL AS ok`;
    if (r.ok) {
      schemaVues = s;
      break;
    }
  }
  if (!schemaVues) return { disponible: false, chapitre, jours };

  // `rendu` est venu apres la premiere version du contrat : un site installe
  // avant ne l'a pas, et le lire sans verifier ferait tomber toutes ses
  // tuiles. Sa presence se lit, comme toute capacite ; absent, il vaut NULL,
  // donc des tuiles ordinaires.
  const [{ aRendu }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = ${schemaVues} AND table_name = 'baikal_mesures'
        AND column_name = 'rendu'
    ) AS "aRendu"`;

  // Le jour de fin est le jour LOCAL du site, celui-la meme que ses vues
  // publient. Le calculer en UTC decalerait la journee en cours d'un jour en
  // fin de soiree, silencieusement.
  const [{ fin }] = await sql`
    SELECT (now() AT TIME ZONE ${site.fuseau})::date::text AS fin`;

  // Les bornes se calculent ICI, en TypeScript, et voyagent en texte. Les
  // calculer en SQL a coute un 500 sur chaque appel le 23/09 : postgres.js
  // envoie ses parametres sans type, et Postgres resolvait `$1::date - $2` en
  // soustraction de DEUX DATES, qui rend un entier — d'ou `operator does not
  // exist: date > integer`. Une borne deja datee ne laisse rien a deviner, et
  // c'est exactement ce que decalerJour() calcule pour l'assemblage : une
  // seule definition des fenetres pour la requete et pour les totaux.
  const borneBasse = decalerJour(fin, -(2 * jours - 1));
  const finPrecedente = decalerJour(fin, -jours);

  // Trois ensembles, parce qu'un stock n'a pas de borne de recul : les lignes
  // des deux dernieres fenetres (serie, sommes, periode precedente), la
  // derniere ligne connue de chaque stock quel que soit son age, et celle qui
  // precede la fenetre. Sans les deux dernieres, un stock mesure il y a trois
  // semaines n'aurait aucune valeur a afficher.
  const lignes = await sql`
    WITH src AS (
      SELECT cle, jour::text AS jour, valeur::float8 AS valeur, agregation, format,
             libelle, groupe, ordre::int AS ordre, fenetre_jours::int AS fenetre_jours,
             ${aRendu ? sql`rendu` : sql`NULL::text`} AS rendu
      FROM ${sql(schemaVues)}.baikal_mesures
      WHERE chapitre = ${chapitre}
        AND (fenetre_jours IS NULL OR fenetre_jours = ${jours})
        AND jour IS NOT NULL
        AND jour::text <= ${fin}
    ),
    recentes AS (
      SELECT * FROM src WHERE jour >= ${borneBasse}
    ),
    connues AS (
      SELECT DISTINCT ON (cle) * FROM src
      WHERE agregation = 'dernier'
      ORDER BY cle, jour DESC
    ),
    precedentes AS (
      SELECT DISTINCT ON (cle) * FROM src
      WHERE agregation = 'dernier' AND jour <= ${finPrecedente}
      ORDER BY cle, jour DESC
    )
    SELECT DISTINCT * FROM (
      SELECT * FROM recentes
      UNION ALL SELECT * FROM connues
      UNION ALL SELECT * FROM precedentes
    ) t`;

  // Premier jour publie par chaque cle, sur tout son historique : c'est ce qui
  // dit depuis quand une etape d'entonnoir est mesuree, et donc sur quelle
  // periode commune ses taux ont un sens (voir etablirEntonnoir).
  const debutsLignes = await sql`
    SELECT cle, min(jour)::text AS debut
    FROM ${sql(schemaVues)}.baikal_mesures
    WHERE chapitre = ${chapitre}
      AND (fenetre_jours IS NULL OR fenetre_jours = ${jours})
      AND jour IS NOT NULL
    GROUP BY cle`;
  const debuts: Record<string, string> = Object.fromEntries(
    debutsLignes.map((l: { cle: string; debut: string }) => [l.cle, l.debut]),
  );

  // L'unicite est une promesse du site : une vue ne contraint rien. Un doublon
  // sur un stock est inoffensif, un doublon sur un flux double le nombre
  // affiche sans un bruit. On le nomme plutot que de sommer en silence, avec
  // sa cle ET son jour, sinon le site doit rejouer la requete pour trouver ou
  // chercher.
  const doublons = await sql`
    SELECT cle, jour::text AS jour, fenetre_jours::int AS fenetre_jours,
           count(*)::int AS lignes
    FROM ${sql(schemaVues)}.baikal_mesures
    WHERE chapitre = ${chapitre}
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
    ORDER BY jour DESC
    LIMIT 5`;

  return {
    disponible: true,
    chapitre,
    jours,
    fin,
    fuseau: site.fuseau,
    groupes: assembler(lignes, fin, jours, debuts),
    doublons,
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Non authentifie" }, 401);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Non authentifie" }, 401);
    // super_admin, ou admin delegue du site demande (verifie plus bas).
    const { data: profile } = await caller
      .from("profiles").select("app_role").eq("id", user.id).single();
    const sites = await sitesAutorises(caller);
    if (profile?.app_role !== "super_admin" && sites.length === 0) {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId } = body;
    if (action !== "overview" && action !== "mesures") {
      return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    exigerSite(sites, appId);
    const jours = Number.isInteger(body.jours) && body.jours > 0 && body.jours <= 365
      ? body.jours
      : 30;

    const site = await chargerSite(admin, appId);
    if (!site.db_schema) {
      return json({ data: null, error: "Site sans base configuree (db_schema)" }, 400);
    }

    const sql = lecteurSite(site);
    try {
      if (action === "mesures") {
        const { chapitre, jours: fenetre } = normaliserRequete(body);
        if (!chapitre) {
          return json({ data: null, error: "chapitre inconnu" }, 400);
        }
        // Le chapitre EST un module de la console : lire les mesures de
        // Finances suppose le module Finances, sans quoi un delegue verrait
        // par la tuile ce que la page lui refuse.
        exigerModule(await droitsModules(caller), appId, chapitre, "lecture");
        return json({
          data: await lireMesures(sql, site, chapitre, fenetre),
          error: null,
        });
      }
      const config = statsParSite[site.id];
      if (config) {
        const stats = await config(sql, jours);
        return json({ data: { mode: "kpis", jours, ...stats }, error: null });
      }
      // Fallback generique : tables du schema et volumes estimes, aucune
      // lecture des donnees elles-memes.
      const tables = await sql`
        SELECT relname AS "table", n_live_tup::bigint AS lignes_estimees
        FROM pg_stat_user_tables
        WHERE schemaname = ${site.db_schema}
        ORDER BY n_live_tup DESC, relname`;
      return json({ data: { mode: "generique", jours, tables }, error: null });
    } finally {
      await sql.end();
    }
  } catch (e) {
    console.error("[admin-site-stats]", e);
    if (e instanceof ErreurAcces) {
      return json({ data: null, error: e.message }, 403);
    }
    if (e instanceof ErreurSite) {
      return json({ data: null, error: e.message }, 400);
    }
    const message = e instanceof Error
      ? e.message
      : (typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e));
    return json({ data: null, error: message }, 500);
  }
});
