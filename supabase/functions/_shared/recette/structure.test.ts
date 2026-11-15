// Le diagnostic de structure : mêmes tables en entrée, même diagnostic en
// sortie. Règles en clair (noms de colonnes et types), sans modèle d'IA.
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diagnostiquer, LIMITE_CATALOGUE, lireCatalogue, sqlCatalogue, type Table, valeursDeCheck } from "./structure.ts";

function table(nom: string, colonnes: Record<string, string | [string, string[]]>, p: Partial<Table> = {}): Table {
  return {
    schema: "public",
    nom,
    genre: "table",
    lignes: 100,
    colonnes: Object.entries(colonnes).map(([n, t]) =>
      Array.isArray(t) ? { nom: n, type: t[0], valeurs: t[1] } : { nom: n, type: t, valeurs: null }
    ),
    ...p,
  };
}

const TS = "timestamp with time zone";

const BOUTIQUE = [
  table("orders", {
    id: "uuid",
    customer_email: "text",
    status: ["text", ["pending", "paid", "refunded"]],
    created_at: TS,
    paid_at: TS,
    amount_total: "numeric(10,2)",
    stripe_payment_intent_id: "text",
    utm_source: "text",
    is_test: "boolean",
  }, { lignes: 420 }),
  table("profiles", { id: "uuid", email: "text", created_at: TS }, { lignes: 900 }),
  table("settings", { key: "text", value: "jsonb" }, { lignes: 12 }),
];

Deno.test("le catalogue se regroupe par table, colonnes dans l'ordre, valeurs d'enum et de check", () => {
  const tables = lireCatalogue([
    { schema: "public", nom: "orders", genre: "table", lignes: "420", colonne: "id", type: "uuid", rang: 1, valeurs: null, checks: null },
    { schema: "public", nom: "orders", genre: "table", lignes: "420", colonne: "status", type: "order_status", rang: 2, valeurs: ["pending", "paid"], checks: null },
    {
      schema: "public", nom: "orders", genre: "table", lignes: "420", colonne: "kind", type: "text", rang: 3, valeurs: null,
      checks: ["CHECK ((kind = ANY (ARRAY['b2c'::text, 'b2b'::text])))"],
    },
    { schema: "app", nom: "v_stats", genre: "vue", lignes: "-1", colonne: "n", type: "bigint", rang: 1, valeurs: null, checks: null },
  ]);
  assertEquals(tables, [
    {
      schema: "public", nom: "orders", genre: "table", lignes: 420,
      colonnes: [
        { nom: "id", type: "uuid", valeurs: null },
        { nom: "status", type: "order_status", valeurs: ["pending", "paid"] },
        { nom: "kind", type: "text", valeurs: ["b2c", "b2b"] },
      ],
    },
    { schema: "app", nom: "v_stats", genre: "vue", lignes: null, colonnes: [{ nom: "n", type: "bigint", valeurs: null }] },
  ]);
});

Deno.test("les valeurs d'une contrainte check : ANY(ARRAY[…]) et IN (…), rien sinon", () => {
  assertEquals(valeursDeCheck("CHECK ((status = ANY (ARRAY['a'::text, 'b c'::text])))"), ["a", "b c"]);
  assertEquals(valeursDeCheck("CHECK (((etat)::text = ANY ((ARRAY['x'::character varying, 'y'::character varying])::text[])))"), ["x", "y"]);
  assertEquals(valeursDeCheck("CHECK ((amount > (0)::numeric))"), null);
});

Deno.test("Baikal repère email, Stripe, paiement, montant, statut, création, origine et marqueur de test", () => {
  const d = diagnostiquer(BOUTIQUE);
  const reperes = d.reperes.filter((r) => r.table === "orders").map((r) => [r.nature, r.colonne]);
  assertEquals(reperes, [
    ["email", "customer_email"],
    ["statut", "status"],
    ["creation", "created_at"],
    ["paiement", "paid_at"],
    ["montant", "amount_total"],
    ["stripe", "stripe_payment_intent_id"],
    ["origine", "utm_source"],
    ["test", "is_test"],
  ]);
  assertEquals(d.reperes.find((r) => r.nature === "statut")?.valeurs, ["pending", "paid", "refunded"]);
});

Deno.test("la table principale est celle qui porte l'acte : email, paiement, statut", () => {
  const d = diagnostiquer(BOUTIQUE);
  assertEquals(d.table_principale, { schema: "public", nom: "orders" });
  assertEquals(d.funnel_propose, ["pending", "paid", "refunded"]);
});

Deno.test("un type qui ne convient pas n'est pas repéré : une date de paiement en texte reste invisible", () => {
  const d = diagnostiquer([table("orders", { email: "text", paid_at: "text", created_at: "date" })]);
  assertEquals(d.reperes.map((r) => r.nature), ["email", "creation"]);
});

Deno.test("sans vues Baikal : ce qui manque pour le niveau 1, en phrases simples", () => {
  const d = diagnostiquer(BOUTIQUE, { role: false });
  assertEquals(d.vues_baikal, []);
  assertEquals(d.schema_contrat, null);
  assertEquals(d.manques.map((m) => m.cle), ["role", "baikal_dossiers", "baikal_mesures"]);
  assert(d.manques[1].phrase.includes("public.orders"));
});

Deno.test("sans date de paiement ni email, le diagnostic le dit au lieu de deviner", () => {
  const d = diagnostiquer([table("notes", { id: "uuid", body: "text", created_at: TS })]);
  assertEquals(d.table_principale, null);
  assertEquals(d.manques.map((m) => m.cle), ["baikal_dossiers", "baikal_mesures", "email", "paiement"]);
});

Deno.test("ce que la console pourrait afficher suit ce qui est repéré", () => {
  const d = diagnostiquer(BOUTIQUE);
  assertEquals(d.affichable.map((a) => a.cle), ["clients", "paiements", "funnel", "stripe", "origine", "tuiles"]);
  assert(d.affichable.find((a) => a.cle === "funnel")!.phrase.includes("pending → paid → refunded"));
  const nu = diagnostiquer([table("profiles", { id: "uuid", email: "text", created_at: TS })]);
  assertEquals(nu.affichable.map((a) => a.cle), ["clients"]);
});

Deno.test("les vues Baikal déjà publiées sont reconnues, avec leur contrat et leur schéma", () => {
  const d = diagnostiquer([
    ...BOUTIQUE,
    table("baikal_dossiers", { dossier_id: "text" }, { genre: "vue", lignes: null }),
    table("baikal_mesures", { jour: "date" }, { genre: "vue", lignes: null }),
    table("baikal_truc", { x: "text" }, { genre: "vue", lignes: null }),
  ]);
  assertEquals(d.vues_baikal, [
    { schema: "public", nom: "baikal_dossiers", contrat: "dossiers-v1" },
    { schema: "public", nom: "baikal_mesures", contrat: "mesures-v1" },
    { schema: "public", nom: "baikal_truc", contrat: null },
  ]);
  assertEquals(d.schema_contrat, "public");
  assertEquals(d.manques.map((m) => m.cle), []);
  // Une vue Baikal n'est jamais prise pour une table du site.
  assertEquals(d.reperes.some((r) => r.table.startsWith("baikal_")), false);
});

Deno.test("même entrée, même diagnostic", () => {
  assertEquals(diagnostiquer(BOUTIQUE), diagnostiquer(structuredClone(BOUTIQUE).reverse()));
});

Deno.test("la requête de catalogue se restreint à des schémas, et refuse un nom douteux", () => {
  assertEquals(sqlCatalogue().includes("n.nspname in ("), false);
  assert(sqlCatalogue(["voirie", "public"]).includes("and n.nspname in ('voirie', 'public')"));
  assertThrows(() => sqlCatalogue(["public'; drop table x; --"]), Error, "Schéma invalide");
  assert(sqlCatalogue().includes(`limit ${LIMITE_CATALOGUE}`));
});

// ---------------------------------------------------------------------------
// Les structures réelles, relevées une fois (essai/relever-structure.ts) et
// versionnées : ce que les règles disent de deux sites qu'on connaît.
// ---------------------------------------------------------------------------

const reelle = async (site: string) =>
  JSON.parse(await Deno.readTextFile(new URL(`./essai/structures/${site}.json`, import.meta.url))) as Table[];

Deno.test("Pack vendeur : la table des dossiers, son funnel, ses vues publiées", async () => {
  const tables = await reelle("pack-vendeur");
  const d = diagnostiquer(tables);
  assertEquals(d.table_principale, { schema: "pack_vendeur", nom: "dossiers" });
  // Le funnel est celui de la colonne `status`, pas de `dpe_validity_status`
  // qui la précède dans la table.
  const status = tables.find((t) => t.schema === "pack_vendeur" && t.nom === "dossiers")!
    .colonnes.find((c) => c.nom === "status")!;
  assert(status.valeurs && status.valeurs.length > 2);
  assertEquals(d.funnel_propose, status.valeurs);
  const deDossiers = (n: string) =>
    d.reperes.filter((r) => r.table === "dossiers" && r.schema === "pack_vendeur" && r.nature === n).map((r) => r.colonne);
  assertEquals(deDossiers("paiement"), ["paid_at"]);
  assertEquals(deDossiers("test"), ["is_test"]);
  assertEquals(deDossiers("suppression"), ["deleted_at"]);
  assert(deDossiers("email").includes("email"));
  assert(deDossiers("stripe").includes("stripe_payment_intent_id"));
  assert(deDossiers("origine").includes("attribution") && deDossiers("origine").includes("utm_source"));
  // Les vues pv_* de public ne sont pas des tables du site : aucun repère.
  assertEquals(d.reperes.some((r) => r.table.startsWith("pv_")), false);
});

Deno.test("Pack vendeur : quinze vues Baikal dans public, les mesures manquent", async () => {
  const d = diagnostiquer(await reelle("pack-vendeur"));
  assertEquals(d.schema_contrat, "public");
  assertEquals(d.vues_baikal.length, 15);
  assertEquals(d.vues_baikal.filter((v) => v.contrat === "dossiers-v1").length, 9);
  assertEquals(d.vues_baikal.filter((v) => v.contrat === null).map((v) => v.nom), []);
  assertEquals(d.manques.map((m) => m.cle), ["baikal_mesures"]);
  assertEquals(d.affichable.map((a) => a.cle), ["clients", "paiements", "funnel", "stripe", "origine", "tuiles"]);
});

Deno.test("Voirie : la table des demandes, pas de date de paiement en colonne", async () => {
  const tables = await reelle("voirie");
  const d = diagnostiquer(tables);
  assertEquals(d.table_principale, { schema: "voirie", nom: "demandes" });
  assertEquals(d.funnel_propose, tables.find((t) => t.nom === "demandes")!.colonnes.find((c) => c.nom === "status")!.valeurs);
  assertEquals(d.reperes.filter((r) => r.nature === "paiement"), []);
  // `email_mairie_cible` n'est pas l'adresse d'un client.
  assertEquals(d.reperes.filter((r) => r.table === "demandes" && r.nature === "email").map((r) => r.colonne), ["email"]);
  assertEquals(d.schema_contrat, "voirie");
  // baikal_dossiers est déjà publiée : la date de paiement a été dérivée par
  // le site, ce n'est plus un manque. Restent les mesures.
  assertEquals(d.manques.map((m) => m.cle), ["baikal_mesures"]);
  assertEquals(d.affichable.map((a) => a.cle), ["clients", "funnel", "stripe"]);
});
