// Le prompt d'entrée : servi dès que le prospect a tapé l'adresse de son site.
// L'agent identifie le bon projet, fait le travail, lance le test lui-même et
// rend un lien. Aucun diagnostic préalable : le prompt se suffit.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fabriquerPromptAgent } from "./prompt.ts";
import { CONTRATS, MANIFESTES } from "./contrats.gen.ts";

const JETON = "0123456789abcdef0123456789abcdef";
const prompt = () =>
  fabriquerPromptAgent({
    site: { url: "https://www.monsaas.fr", domaine: "monsaas.fr" },
    jeton: JETON,
    urlApi: "https://api.exemple.test/functions/v1/baikal-test",
    urlResultat: `https://withbaikal.io/tester/r/${JETON}`,
    manifestes: MANIFESTES,
    contrats: CONTRATS,
  });

Deno.test("il nomme le site et fait identifier le bon projet avant tout", () => {
  const p = prompt();
  assert(p.startsWith("# Brancher monsaas.fr à Baikal"));
  assert(p.includes("https://www.monsaas.fr"));
  const etape0 = p.slice(p.indexOf("## Étape 0"), p.indexOf("## Les règles"));
  assert(etape0.includes("« monsaas.fr »"), "l'agent cherche le domaine dans le code");
  assert(etape0.includes("Attends son accord"), "rien n'est créé avant l'accord du fondateur");
  assert(etape0.includes("Postgres"), "une autre base l'apprend tout de suite");
  // Le projet s'identifie AVANT le rôle et les vues.
  assert(p.indexOf("## Étape 0") < p.indexOf("## Étape 1"));
});

Deno.test("l'agent lance le test lui-même, sur le jeton de la page, et rend un lien", () => {
  const p = prompt();
  assert(p.includes("curl -s -X POST 'https://api.exemple.test/functions/v1/baikal-test'"));
  assert(p.includes(`"action":"tester","reponse":"courte","jeton":"${JETON}"`));
  assert(p.includes(`https://withbaikal.io/tester/r/${JETON}`));
  assert(p.includes("niveau1_pret"));
  assert(p.includes("db.REFERENCE.supabase.co"), "sur Supabase, l'adresse se déduit de SUPABASE_URL");
  // Le lien vient en dernier : c'est ce que le fondateur attend.
  assert(p.lastIndexOf("Rends le lien") > p.indexOf("Lance le test toi-même"));
});

Deno.test("les deux contrats entiers, sans schéma deviné, et jamais de mot de passe", () => {
  const p = prompt();
  for (const m of MANIFESTES) {
    assert(p.includes(`Le contrat ${m.contrat}`), m.contrat);
    assert(p.includes(CONTRATS[m.contrat].trimEnd().slice(0, 200)), `texte de ${m.contrat}`);
  }
  // Le schéma n'est pas connu : il reste à substituer, et le prompt le dit.
  assert(p.includes("`@SCHEMA@` est le schéma où tu publies les vues"));
  assert(p.includes("create role baikal_reader login password '<MOT_DE_PASSE_A_CHOISIR>'"));
  assert(p.includes("n'apparaît dans AUCUN fichier"));
  assert(p.includes("JAMAIS dans une migration"));
  // Les droits sont une étape à part, avec le grant ET la policy.
  assert(p.includes("create policy baikal_read on @SCHEMA@.<table>"));
  // Le script du rôle n'est pas doublé : sa partie « droits » n'est pas dans l'étape 1.
  const etape1 = p.slice(p.indexOf("## Étape 1"), p.indexOf("## Étape 2"));
  assertEquals(etape1.includes("create policy"), false);
  // Les étapes se suivent sans trou.
  const numeros = [...p.matchAll(/^## Étape (\d+) —/gm)].map((m) => Number(m[1]));
  assertEquals(numeros, numeros.map((_, i) => i));
});

Deno.test("même entrée, même prompt ; un autre site, un autre prompt", () => {
  assertEquals(prompt(), prompt());
  const autre = fabriquerPromptAgent({
    site: { url: "https://app-devis.io", domaine: "app-devis.io" },
    jeton: JETON,
    urlApi: "https://api.exemple.test/functions/v1/baikal-test",
    urlResultat: `https://withbaikal.io/tester/r/${JETON}`,
    manifestes: MANIFESTES,
    contrats: CONTRATS,
  });
  assert(autre.includes("« app-devis.io »"));
  assertEquals(autre.includes("monsaas"), false);
});
