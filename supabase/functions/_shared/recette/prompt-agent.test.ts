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
  assert(etape0.includes("continue sans demander"), "un seul projet possible : pas de confirmation");
  assert(etape0.includes("le SEUL cas où tu poses une question"), "la seule question permise : deux projets indépartageables");
  assert(etape0.includes("ne branche que le schéma de ce site"), "base partagée : un seul schéma");
  assert(etape0.includes("Postgres"), "une autre base l'apprend tout de suite");
  // Le projet s'identifie AVANT le rôle et les vues.
  assert(p.indexOf("## Étape 0") < p.indexOf("## Étape 1"));
});

Deno.test("l'agent lance le test lui-même, sur le jeton de la page, et rend un lien", () => {
  const p = prompt();
  assert(p.includes("curl -s -X POST 'https://api.exemple.test/functions/v1/baikal-test'"));
  assert(p.includes(`"action":"tester","reponse":"courte","garder":true,"site":"monsaas.fr","jeton":"${JETON}"`));
  // L'agent sait pourquoi la connexion est gardée, et le dit au fondateur.
  assert(p.includes("Baikal la range chiffrée dès que le niveau 1 passe"));
  assert(p.includes("Ouvrir mon site dans Baikal"));
  assert(p.includes("data.ouvrable"));
  assert(p.includes(`https://withbaikal.io/tester/r/${JETON}`));
  assert(p.includes("niveau1_pret"));
  assert(p.includes("db.REFERENCE.supabase.co"), "sur Supabase, l'adresse se déduit de SUPABASE_URL");
  // Le lien vient en dernier : c'est ce que le fondateur attend.
  assert(p.lastIndexOf("Rends le lien") > p.indexOf("Lance le test toi-même"));
});

Deno.test("les deux contrats entiers, sans schéma deviné, et jamais de mot de passe", () => {
  const p = prompt();
  for (const m of MANIFESTES) {
    // Les obligatoires ont leur étape ; les optionnels sont dans l'étape commune.
    if (!m.optionnel) assert(p.includes(`Le contrat ${m.contrat}`), m.contrat);
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

Deno.test("un résultat, pas une conversation : d'une traite, sans confirmation ni questions de définition", () => {
  const p = prompt();
  const entete = p.slice(0, p.indexOf("## Étape 0"));
  assert(entete.includes("D'UNE TRAITE"));
  assert(entete.includes("pas une conversation"));
  // Ce qui faisait s'arrêter l'agent du premier essai n'est plus demandé.
  for (const arret of ["Attends son accord", "attends son accord", "pose la question au fondateur", "Montre la migration au fondateur"]) {
    assertEquals(p.includes(arret), false, arret);
  }
  // Il tranche, et le dit à la fin : le fondateur corrige après avoir vu son résultat.
  assert(p.includes("note-la"));
  assert(p.includes("Les choix que tu as faits à sa place"));
  // Rien d'existant n'est touché : c'est ce qui permet d'appliquer sans demander.
  assert(p.includes("s'AJOUTE et ne sert qu'à lire"));
  assert(p.includes("Ne modifie aucune table, aucune colonne, aucune donnée existante"));
  // La réponse finale commence par le lien, et l'agent ne tourne pas en rond.
  const fin = p.slice(p.lastIndexOf("## Étape"));
  assert(fin.indexOf(`https://withbaikal.io/tester/r/${JETON}`) < fin.indexOf("Le projet que tu as branché"));
  assert(fin.includes("après trois corrections, arrête-toi"));
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

Deno.test("Comptes : l'agent le publie si l'app a des comptes, sans toucher au niveau 1", () => {
  const p = prompt();
  assert(p.includes("Le niveau 1 tient en deux vues : `baikal_dossiers` et `baikal_mesures`."), "le niveau 1 ne cite que dossiers et mesures");
  const optionnels = p.slice(p.indexOf("## Étape 4 — Les modules optionnels"), p.indexOf("## Étape 5"));
  assert(optionnels.length > 0, "une étape pour les modules optionnels, après les contrats obligatoires");
  assert(optionnels.includes("baikal_comptes_pro") && optionnels.includes("baikal_compte_historique"));
  assert(optionnels.includes("sinon ne crée pas la vue"));
  assert(optionnels.includes("à défaut le nom, à défaut l'email"), "un compte particulier a aussi sa ligne");
  assert(optionnels.includes("comptes.identifiant_unique") || optionnels.includes("Un compte n'apparaît qu'une fois"), "ses contrôles, à jouer soi-même");
  // L'auto-vérification du niveau 1 ne mêle pas les contrôles optionnels.
  const droits = p.slice(p.indexOf("## Étape 5"), p.indexOf("## Étape 6"));
  assert(!droits.includes("baikal_comptes_pro"), "les contrôles de niveau 1 ne citent pas Comptes");
  // La réponse finale dit quels modules sont publiés ou écartés.
  assert(p.slice(p.lastIndexOf("## Étape")).includes("modules optionnels"));
});
