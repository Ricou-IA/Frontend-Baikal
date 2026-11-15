// baikal-test : « Tester mon site », le test public de la page /tester.
//
// POST sans session (verify_jwt off, ancré dans config.toml) :
//   {action:'diagnostiquer', connexion, jeton?, site_web?}
//     -> lit le CATALOGUE de la base (aucune donnée) et rend « ce que Baikal
//        voit dans votre base », un jeton et le prompt à coller dans un agent.
//   {action:'tester', connexion, jeton?, site_web?}
//     -> le diagnostic, plus la recette des contrats (dossiers-v1, mesures-v1)
//        sous le rôle fourni ; le résultat est gardé 30 jours sous le jeton.
//   {action:'resultat', jeton}
//     -> le dernier passage, sans connexion.
//
// Ce fichier ne fait que brancher : les refus sont dans garde.ts, le déroulé
// dans service.ts, la recette dans _shared/recette — tous testés sans réseau.
//
// La connexion du prospect n'est JAMAIS écrite en base ni dans les journaux :
// ce fichier ne journalise ni le corps de la requête ni une erreur brute.
// `site_web` est un piège à robots, comme sur baikal-demande.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import type { Lecteur } from "../_shared/recette/controles.ts";
import { type Connexion, limiteur } from "./garde.ts";
import { type Deps, type LigneTest, traiter } from "./service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tout le passage tient dans ce délai, répondu par NOUS, avant celui de la
// plateforme.
const DELAI_TOTAL_MS = 58_000;

// Le pilote Postgres peut rejeter une promesse hors de tout appel en cours
// (une connexion coupée après la réponse). Sans ce garde, le rejet fait tomber
// l'instance et la requête en cours n'a aucune réponse.
globalThis.addEventListener("unhandledrejection", (evenement) => {
  evenement.preventDefault();
  const raison = (evenement as PromiseRejectionEvent).reason;
  const code = typeof raison?.code === "string" && /^[A-Z0-9_]{2,30}$/.test(raison.code) ? raison.code : "sans code";
  console.error(`[baikal-test] rejet hors appel (${code})`);
});

// Dix tests par adresse IP et par heure ; vit le temps de l'instance.
const trop = limiteur(10, 3_600_000);

// Lecture seule forcée au niveau de la session, 10 s pour se connecter, 5 s
// par requête, SSL exigé : les mêmes canaux que _shared/sites.ts.
function ouvrir(c: Connexion): Promise<{ lecteur: Lecteur; fermer(): Promise<void> }> {
  const sql = postgres({
    host: c.hote,
    port: c.port,
    username: c.utilisateur,
    password: c.motDePasse,
    database: c.base,
    ssl: "require",
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 2,
    onnotice: () => {},
    connection: {
      application_name: "baikal-test",
      default_transaction_read_only: "on",
      statement_timeout: "5000",
    },
  });
  const lecteur: Lecteur = (requete) => sql.unsafe(requete) as unknown as Promise<Record<string, unknown>[]>;
  return Promise.resolve({ lecteur, fermer: () => sql.end({ timeout: 2 }) });
}

async function resoudre(hote: string): Promise<string[]> {
  // Une adresse littérale a déjà été jugée par garde.ts.
  if (hote.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hote)) return [hote];
  const reponses = await Promise.allSettled([Deno.resolveDns(hote, "A"), Deno.resolveDns(hote, "AAAA")]);
  const adresses = reponses.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!adresses.length) throw new Error("hôte introuvable");
  return adresses;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > 10_000) {
    return json({ data: null, error: "Requête trop longue" }, 413);
  }

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ data: null, error: "Corps JSON attendu" }, 400);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const table = () => admin.schema("admin").from("tests_site");

  const deps: Deps = {
    ouvrir,
    resoudre,
    depot: {
      async lire(jeton) {
        const { data, error } = await table().select("*").eq("jeton", jeton).maybeSingle();
        if (error) throw new Error(`lecture de tests_site : ${error.code ?? "?"}`);
        return data as LigneTest | null;
      },
      async ecrire(ligne) {
        const { error } = await table().upsert(ligne, { onConflict: "jeton" });
        if (error) throw new Error(`écriture de tests_site : ${error.code ?? "?"}`);
      },
    },
    trop,
    maintenant: Date.now,
    sel: Deno.env.get("BAIKAL_TEST_SEL") ?? serviceKey,
    site: Deno.env.get("BAIKAL_SITE_URL") ?? "https://withbaikal.io",
  };

  // Où en est le passage : une étape nommée, sans secret. Elle est écrite
  // dans le journal avec son temps, et redite au prospect si le passage ne va
  // pas au bout — sans elle, une panne après une connexion réussie ne laisse
  // rien pour la comprendre (essai d'Eric sur le solaire, 15/11/2026).
  const debut = Date.now();
  let etape = "départ";
  deps.trace = (nom) => {
    etape = nom;
    console.log(`[baikal-test] ${nom} · ${Date.now() - debut} ms`);
  };

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  // Une réponse arrive TOUJOURS, et avant que la plateforme ne coupe : une
  // coupure rend une erreur sans en-têtes, que le navigateur lit comme une
  // panne de réseau.
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<"delai">((resolve) => {
    minuterie = setTimeout(() => resolve("delai"), DELAI_TOTAL_MS);
  });
  try {
    const passage = traiter(corps, ip, deps);
    // Si le délai gagne, le passage continue seul : son échec éventuel ne
    // doit pas rester sans gestionnaire.
    passage.catch(() => {});
    const issue = await Promise.race([passage, delai]);
    if (issue === "delai") {
      console.error(`[baikal-test] délai dépassé à l'étape « ${etape} »`);
      return json({
        data: null,
        error: `Le test a dépassé ${DELAI_TOTAL_MS / 1000} secondes à l'étape « ${etape} ». Réessayez ; si cela se répète, la base répond trop lentement.`,
      }, 504);
    }
    return json({ data: issue.data, error: issue.error }, issue.statut);
  } catch (e) {
    // Jamais l'erreur brute d'une connexion : elle peut citer l'hôte. Les
    // seules erreurs qui arrivent ici sont celles du dépôt, déjà sobres.
    console.error(`[baikal-test] échec à l'étape « ${etape} » :`, e instanceof Error && /tests_site/.test(e.message) ? e.message : "erreur interne");
    return json({ data: null, error: `Le test s'est arrêté à l'étape « ${etape} ». Réessayez.` }, 500);
  } finally {
    clearTimeout(minuterie);
  }
});
