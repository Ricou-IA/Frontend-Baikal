// ---------------------------------------------------------------------------
// Module Événements v1 — le passage de bout en bout, sur un schéma jetable.
//
// Pas un test : il touche une base réelle. Il enchaîne la bibliothèque
// navigateur (faux window), le relais (traiterBalise), la fonction SQL et la
// vue standard, et affiche les gestes qu'une fiche Baikal verrait.
//
// Avant : créer le schéma et y installer le module.
//   create schema evt_e2e; grant usage on schema evt_e2e to service_role, baikal_reader;
//   .\scripts\sql-api.ps1 -Ref <ref> -Fichier docs/contrats/evenements-v1.sql -Schema evt_e2e
// Puis :
//   deno run --allow-net --allow-env docs/contrats/evenements-v1.bout-en-bout.ts
// Après : select cron.unschedule('evt_e2e-evenements-purge'); drop schema evt_e2e cascade;
//
// Le SQL passe par l'API de gestion Supabase (SUPABASE_ACCESS_TOKEN, SUPABASE_REF),
// pas par PostgREST : un schéma jetable n'est pas exposé par pgrst.db_schemas,
// et l'exposer reviendrait à réécrire la configuration API de tous les
// produits du projet. Chez un site, le relais appelle la RPC par supabase-js
// sur un schéma exposé ; c'est le contrôle 3 de la recette qui le couvre.
// ---------------------------------------------------------------------------
import { creerMouchard } from "./evenements-v1.js";
import { traiterBalise, type Ligne } from "./evenements-relais-v1.ts";

const SCHEMA = "evt_e2e";
const jeton = Deno.env.get("SUPABASE_ACCESS_TOKEN");
const ref = Deno.env.get("SUPABASE_REF") ?? "odspcxgafcqxjzrarsqf";
if (!jeton) {
  console.error("SUPABASE_ACCESS_TOKEN absent de l'environnement");
  Deno.exit(1);
}

async function sql<T = unknown>(requete: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
    body: JSON.stringify({ query: requete }),
  });
  if (!r.ok) throw new Error(`SQL refusé (${r.status}) : ${await r.text()}`);
  return (await r.json()) as T[];
}

const litteral = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;

// 0. Le module est installé ?
const tables = await sql<{ n: number }>(
  `select count(*)::int as n from pg_tables where schemaname = '${SCHEMA}' and tablename = 'evenement'`,
);
if (tables[0]?.n !== 1) {
  console.error(`le module n'est pas installé sous ${SCHEMA} : jouer sql-api.ps1 d'abord`);
  Deno.exit(1);
}

// 1. Un faux navigateur, dont les envois passent par le relais, dont l'écriture
//    passe par la fonction SQL.
const journal: string[] = [];
const envoyer = (url: string, corps: string) => {
  const req = new Request(`https://x.fr${url}`, { method: "POST", body: corps, headers: { "user-agent": "Mozilla/5.0" } });
  envois.push(traiterBalise(req, {
    enregistrer: async (lignes: Ligne[]) => {
      const r = await sql<{ r: { ok: boolean; ecrits: number; rejetes: number } }>(
        `select ${SCHEMA}.evenement_enregistrer(${litteral(lignes)}) as r`,
      );
      console.log("enregistrer →", JSON.stringify(r[0].r));
      return { error: r[0].r.ok ? null : "refus" };
    },
    journal: (m) => journal.push(m),
  }));
};
const envois: Promise<Response>[] = [];
const stock = new Map<string, string>();
const fenetre = {
  location: { href: "https://x.fr/pro/sourcing?q=lezardrieux", hostname: "x.fr", search: "" },
  document: { title: "Sourcing", referrer: "https://www.google.fr/", cookie: "" },
};
const mouchard = creerMouchard({
  relais: "/api/evenements",
  nomCookie: "evt_visiteur",
  fenetre,
  stockage: { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) },
  envoyer,
});

// 2. Deux gestes anonymes, envoyés.
mouchard.pageVue();
mouchard.geste("resultat_ouvert", "10 Rue de Lan Goc", { rang: 1 }, null);
mouchard.vider();
await Promise.all(envois);
const visiteur = mouchard.visiteur();

// 3. Le serveur du site identifie le visiteur.
const ident = await sql<{ r: unknown }>(
  `select ${SCHEMA}.evenement_identifier('${visiteur}'::uuid, 'test@evt.fr', null, 'formulaire') as r`,
);
console.log("identifier →", JSON.stringify(ident[0].r));

// 4. Ce que Baikal lit.
const gestes = await sql<{ geste: string; libelle: string | null; page: string; email: string | null; detail: unknown }>(
  `select geste, libelle, page, email, detail from ${SCHEMA}.baikal_evenements
   where email = 'test@evt.fr' order by survenu_le, geste`,
);
for (const g of gestes) console.log(`  ${g.geste.padEnd(16)} ${g.page.padEnd(14)} ${g.libelle ?? ""}  ${JSON.stringify(g.detail)}`);
if (journal.length > 0) console.log("journal du relais :", journal);

// 5. Nettoyage de ce que ce passage a écrit.
await sql(`delete from ${SCHEMA}.evenement where visiteur_id = '${visiteur}'`);
await sql(`delete from ${SCHEMA}.evenement_visiteur where visiteur_id = '${visiteur}'`);

const attendu = ["page_vue", "resultat_ouvert", "identification"];
const obtenu = gestes.map((g) => g.geste);
if (JSON.stringify(obtenu) !== JSON.stringify(attendu) || gestes.some((g) => g.email !== "test@evt.fr")) {
  console.error(`attendu ${attendu.join(", ")} ; obtenu ${obtenu.join(", ")}`);
  Deno.exit(1);
}
console.log("bout en bout : ok");
