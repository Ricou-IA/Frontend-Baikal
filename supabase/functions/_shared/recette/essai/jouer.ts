// Joue la recette sur un vrai Postgres : installe le site d'essai conforme,
// le passe, y injecte les pannes, le repasse. Sert au test d'intégration
// (recette.pg.test.ts) et, lancé seul, écrit les deux rapports :
//
//   $env:RECETTE_PG_DSN = "postgres://postgres@127.0.0.1:54329/postgres"
//   deno run --allow-net --allow-env --allow-read supabase/functions/_shared/recette/essai/jouer.ts
//
// La base est JETABLE : le schéma `recette_essai` y est détruit et recréé, et
// le rôle baikal_reader y est créé. Jamais sur une base de production.
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { type Lecteur, recetter } from "../controles.ts";
import type { Manifeste } from "../manifeste.ts";
import type { Rapport } from "../resultat.ts";
import { rapportEnTexte } from "../texte.ts";

export const SCHEMA = "recette_essai";
export const FUNNEL = ["lead", "inscrit", "paye"];

const ici = new URL(".", import.meta.url);
const lireTexte = (chemin: string) => Deno.readTextFile(new URL(chemin, ici));

export async function manifestes(): Promise<Manifeste[]> {
  return await Promise.all(
    ["dossiers-v1.json", "mesures-v1.json"].map(async (nom) =>
      JSON.parse(await lireTexte(`../../../../../docs/contrats/manifestes/${nom}`)) as Manifeste
    ),
  );
}

// Le lecteur du test en ligne : lecture seule forcée, 5 s par requête.
function lecteurDe(dsn: string, utilisateur: string) {
  const url = new URL(dsn);
  url.username = utilisateur;
  url.password = "essai";
  const sql = postgres(url.toString(), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
    connection: { default_transaction_read_only: "on", statement_timeout: "5000" },
  });
  const lecteur: Lecteur = (requete) => sql.unsafe(requete) as unknown as Promise<Record<string, unknown>[]>;
  return { lecteur, fermer: () => sql.end() };
}

export async function jouer(dsnAdmin: string): Promise<{ conforme: Rapport; pannes: Rapport }> {
  const admin = postgres(dsnAdmin, { max: 1, prepare: false, onnotice: () => {} });
  const installer = async (fichier: string) => {
    await admin.unsafe((await lireTexte(fichier)).replaceAll("@SCHEMA@", SCHEMA));
  };
  const passer = async () => {
    const { lecteur, fermer } = lecteurDe(dsnAdmin, "baikal_reader");
    try {
      return await recetter({ lecteur, manifestes: await manifestes(), schema: SCHEMA, funnel: FUNNEL });
    } finally {
      await fermer();
    }
  };
  try {
    await installer("site-conforme.sql");
    const conforme = await passer();
    await installer("pannes.sql");
    const pannes = await passer();
    return { conforme, pannes };
  } finally {
    await admin.end();
  }
}

if (import.meta.main) {
  const dsn = Deno.env.get("RECETTE_PG_DSN");
  if (!dsn) {
    console.error("RECETTE_PG_DSN absent : donner le DSN admin d'un Postgres jetable.");
    Deno.exit(1);
  }
  const { conforme, pannes } = await jouer(dsn);
  console.log("<!-- Site d'essai conforme -->\n");
  console.log(rapportEnTexte(conforme));
  console.log("\n<!-- Le même site, pannes injectées -->\n");
  console.log(rapportEnTexte(pannes));
}
