// Génère la copie embarquée des contrats pour les Edge Functions :
// supabase/functions/_shared/recette/contrats.gen.ts (manifestes + texte
// entier des .sql). Une fonction déployée n'embarque que supabase/functions ;
// la référence reste ici, dans docs/contrats, et manifestes.test.ts échoue
// dès que la copie n'est plus à jour.
//
//   deno run --allow-read --allow-write docs/contrats/manifestes/generer.ts
const ici = new URL(".", import.meta.url);
const racine = new URL("../../../", import.meta.url);

export const MANIFESTES = ["dossiers-v1.json", "mesures-v1.json", "comptes-pro-v1.json", "comptes-historique-v1.json"];
export const SORTIE = new URL("supabase/functions/_shared/recette/contrats.gen.ts", racine);

const lire = async (url: URL) => (await Deno.readTextFile(url)).replaceAll("\r\n", "\n");

export async function contenuGenere(): Promise<string> {
  const manifestes = [];
  const contrats: Record<string, string> = {};
  for (const nom of MANIFESTES) {
    const manifeste = JSON.parse(await lire(new URL(nom, ici)));
    manifestes.push(manifeste);
    contrats[manifeste.contrat] = await lire(new URL(manifeste.source, racine));
  }
  return [
    "// GÉNÉRÉ par docs/contrats/manifestes/generer.ts — ne pas modifier à la main.",
    "// La référence est docs/contrats : manifestes/*.json et les .sql des contrats.",
    "// deno-fmt-ignore-file",
    'import type { Manifeste } from "./manifeste.ts";',
    "",
    `export const MANIFESTES = ${JSON.stringify(manifestes, null, 1)} as Manifeste[];`,
    "",
    `export const CONTRATS: Record<string, string> = ${JSON.stringify(contrats, null, 1)};`,
    "",
  ].join("\n");
}

if (import.meta.main) {
  await Deno.writeTextFile(SORTIE, await contenuGenere());
  console.log(`écrit : ${SORTIE.pathname}`);
}
