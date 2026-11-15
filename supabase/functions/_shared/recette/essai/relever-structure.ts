// Relève UNE FOIS la structure d'un site (tables, colonnes, types, valeurs
// d'enum et de check — aucune donnée) pour en faire un jeu d'essai versionné
// du diagnostic de structure (structures/<site>.json).
//
//   deno run --allow-net --allow-env --allow-write \
//     supabase/functions/_shared/recette/essai/relever-structure.ts <ref> <sortie.json> [schema,schema]
//
// Lecture seule du catalogue par l'API de gestion Supabase
// (SUPABASE_ACCESS_TOKEN). Le filtre de schémas sert aux sites de la base
// partagée, où un projet porte plusieurs produits.
import { diagnostiquer, lireCatalogue, sqlCatalogue } from "../structure.ts";
import { diagnosticEnTexte } from "../texte.ts";

const [ref, sortie, filtre] = Deno.args;
const jeton = Deno.env.get("SUPABASE_ACCESS_TOKEN");
if (!ref || !sortie || !jeton) {
  console.error("usage : relever-structure.ts <ref> <sortie.json> [schemas] — SUPABASE_ACCESS_TOKEN requis");
  Deno.exit(1);
}

const schemas = filtre ? filtre.split(",") : null;

const reponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
  body: JSON.stringify({ query: sqlCatalogue(schemas ?? undefined), read_only: true }),
});
if (!reponse.ok) {
  console.error(`SQL refusé (${reponse.status}) : ${await reponse.text()}`);
  Deno.exit(1);
}

const tables = lireCatalogue(await reponse.json()).filter((t) => !schemas || schemas.includes(t.schema));
if (sortie === "-") {
  console.log(diagnosticEnTexte(diagnostiquer(tables)));
  Deno.exit(0);
}
// Une table par ligne : le fichier reste lisible et ses diffs aussi.
const corps = "[\n" + tables.map((t) => "  " + JSON.stringify(t)).join(",\n") + "\n]\n";
await Deno.writeTextFile(sortie, corps);
console.log(`${tables.length} relations, ${tables.reduce((s, t) => s + t.colonnes.length, 0)} colonnes → ${sortie}`);
