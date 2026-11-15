// Le prompt d'onboarding : ce que le prospect colle dans son agent de code.
// Il doit se suffire à lui-même — les contrats vivent dans un dépôt privé.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fabriquerPrompt, MOT_DE_PASSE, scriptRole } from "./prompt.ts";
import { diagnosticEnTexte } from "./texte.ts";
import { diagnostiquer, type Table } from "./structure.ts";
import type { Manifeste } from "./manifeste.ts";
import { type Rapport, type ResultatControle, resumer } from "./resultat.ts";

const TS = "timestamp with time zone";
const TABLES: Table[] = [{
  schema: "app",
  nom: "orders",
  genre: "table",
  lignes: 420,
  colonnes: [
    { nom: "id", type: "uuid", valeurs: null },
    { nom: "customer_email", type: "text", valeurs: null },
    { nom: "status", type: "text", valeurs: ["pending", "paid"] },
    { nom: "created_at", type: TS, valeurs: null },
    { nom: "paid_at", type: TS, valeurs: null },
  ],
}];

const lire = async (nom: string) =>
  JSON.parse(await Deno.readTextFile(new URL(`../../../../docs/contrats/manifestes/${nom}`, import.meta.url))) as Manifeste;
const MANIFESTES = [await lire("dossiers-v1.json"), await lire("mesures-v1.json")];
const CONTRATS = { "dossiers-v1": "-- TEXTE DU CONTRAT DOSSIERS", "mesures-v1": "-- TEXTE DU CONTRAT MESURES" };
const URL_TEST = "https://withbaikal.io/tester/r/abc123";

function r(p: Partial<ResultatControle>): ResultatControle {
  return {
    id: "x", famille: "recette", niveau: 1, vue: "baikal_dossiers", titre: "X",
    statut: "conforme", bloquant: false, ...p,
  };
}
const rapport = (controles: ResultatControle[]): Rapport => ({
  schema: "app", utilisateur: "baikal_reader", resume: resumer(controles), controles,
});

const prompt = (rapportDernier: Rapport | null = null) =>
  fabriquerPrompt({
    diagnostic: diagnostiquer(TABLES, { role: false }),
    manifestes: MANIFESTES,
    contrats: CONTRATS,
    rapport: rapportDernier,
    urlTest: URL_TEST,
  });

Deno.test("le script du rôle : lecture seule, schéma du site, jamais de mot de passe en dur", () => {
  const script = scriptRole("app");
  assert(script.includes(`create role baikal_reader login password '${MOT_DE_PASSE}'`));
  assert(script.includes("alter role baikal_reader set default_transaction_read_only = on;"));
  assert(script.includes("grant usage on schema app to baikal_reader;"));
  assert(script.includes("create policy baikal_read on app.<table> for select to baikal_reader using (true);"));
  assertEquals(scriptRole("app", "s3cret").includes("password 's3cret'"), true);
});

Deno.test("le diagnostic en texte dit ce que Baikal voit, ce qui manque, ce qu'il afficherait", () => {
  const texte = diagnosticEnTexte(diagnostiquer(TABLES, { role: false }));
  assert(texte.includes("## Ce que Baikal voit dans votre base"));
  assert(texte.includes("Table principale : `app.orders`"));
  assert(texte.includes("- email : `app.orders.customer_email` (text)"));
  assert(texte.includes("- statut : `app.orders.status` (text) — valeurs : pending, paid"));
  assert(texte.includes("## Ce qui manque pour le niveau 1"));
  assert(texte.includes("La vue baikal_dossiers n'existe pas encore"));
  assert(texte.includes("## Ce que la console pourrait afficher"));
  assert(texte.includes("Un funnel en 2 étapes : pending → paid."));
});

Deno.test("le prompt se suffit à lui-même : structure repérée, contrats entiers, script du rôle", () => {
  const texte = prompt();
  assert(texte.includes("Table principale : `app.orders`"));
  assert(texte.includes("-- TEXTE DU CONTRAT DOSSIERS"));
  assert(texte.includes("-- TEXTE DU CONTRAT MESURES"));
  assert(texte.includes("grant usage on schema app to baikal_reader;"));
  assert(texte.includes(MOT_DE_PASSE));
  // Le schéma des vues est celui de la table principale.
  assert(texte.includes("`app.baikal_dossiers`"));
});

Deno.test("le prompt borne l'agent : lire, créer des vues, ne rien modifier d'existant", () => {
  const texte = prompt();
  assert(texte.includes("Ne modifie aucune table, aucune colonne, aucune donnée existante"));
  assert(texte.includes("N'écris jamais le mot de passe"));
  assert(texte.includes("Une colonne que tu ne sais pas remplir est ABSENTE"));
});

Deno.test("le prompt porte chaque contrôle de niveau 1, pour que l'agent se vérifie avant de rendre", () => {
  const texte = prompt();
  for (const m of MANIFESTES) {
    for (const k of m.controles.filter((k) => k.niveau === 1 && !k.type)) {
      assert(texte.includes(k.sql.replaceAll("@SCHEMA@", "app")), `contrôle ${k.id} absent du prompt`);
    }
  }
  assertEquals(texte.includes("@SCHEMA@"), false);
});

Deno.test("au premier passage, pas de section d'échecs ; ensuite, les échecs du dernier test et eux seuls", () => {
  assertEquals(prompt().includes("## Le dernier test"), false);
  const texte = prompt(rapport([
    r({ id: "ok", titre: "Contrôle témoin conforme" }),
    r({
      id: "dossiers.montant_sans_paiement", titre: "Un montant payé a toujours sa date de paiement",
      statut: "echec", bloquant: true, lignes: 4, si_echec: "Non convertis.", correction: "Renseigner paye_le.",
    }),
  ]));
  assert(texte.includes("## Le dernier test"));
  assert(texte.includes("### Un montant payé a toujours sa date de paiement"));
  assert(texte.includes("Correction : Renseigner paye_le."));
  assertEquals(texte.includes("Contrôle témoin conforme"), false);
});

Deno.test("la consigne finale : relancer le test, jusqu'à zéro échec", () => {
  const texte = prompt();
  assert(texte.includes(URL_TEST));
  assert(texte.includes("jusqu'à zéro échec"));
});

Deno.test("même entrée, même prompt", () => {
  assertEquals(prompt(), prompt());
});

Deno.test("« Ailleurs » ne garde que les tables qui portent un email, un paiement ou Stripe, douze au plus", () => {
  const autre = (nom: string, colonne: string, type = "text"): Table => ({
    schema: "app", nom, genre: "table", lignes: 1, colonnes: [{ nom: colonne, type, valeurs: null }],
  });
  const texte = diagnosticEnTexte(diagnostiquer([
    ...TABLES,
    autre("journal", "created_at", TS),
    ...Array.from({ length: 14 }, (_, i) => autre(`liste_${String(i).padStart(2, "0")}`, "email")),
  ]));
  assertEquals(texte.includes("`app.journal`"), false);
  assert(texte.includes("- `app.liste_00` : email"));
  assert(texte.includes("- `app.liste_11` : email"));
  assertEquals(texte.includes("`app.liste_12`"), false);
  assert(texte.includes("… et 2 autre(s) table(s)."));
});
