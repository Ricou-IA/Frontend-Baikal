import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliserCriteres } from "./filtres.ts";

Deno.test("body vide -> valeurs par defaut", () => {
  assertEquals(normaliserCriteres({}), {
    recherche: "",
    metiers: [],
    statuts: [],
    provenances: [],
    departement: "",
    avecTelephone: false,
    exclureTests: true,
    exclureClients: true,
    page: 1,
    parPage: 25,
    tri: "cree_le",
    ordre: "desc",
  });
});

Deno.test("les tests et les clients sont exclus par defaut, desactivables", () => {
  assertEquals(normaliserCriteres({}).exclureTests, true);
  assertEquals(normaliserCriteres({ exclureTests: false }).exclureTests, false);
  assertEquals(normaliserCriteres({}).exclureClients, true);
  assertEquals(normaliserCriteres({ exclureClients: false }).exclureClients, false);
});

Deno.test("metiers hors taxonomie ecartes", () => {
  assertEquals(
    normaliserCriteres({ metiers: ["notaire", "plombier", "", 42, "syndic"] }).metiers,
    ["notaire", "syndic"],
  );
});

Deno.test("statuts hors funnel ecartes, partenaire compris", () => {
  assertEquals(
    normaliserCriteres({ statuts: ["contacte", "partenaire", "refus"] }).statuts,
    ["contacte", "refus"],
  );
});

Deno.test("departement : deux ou trois caracteres, sinon vide", () => {
  assertEquals(normaliserCriteres({ departement: "31" }).departement, "31");
  assertEquals(normaliserCriteres({ departement: "2A" }).departement, "2A");
  assertEquals(normaliserCriteres({ departement: "974" }).departement, "974");
  assertEquals(normaliserCriteres({ departement: "3" }).departement, "");
  assertEquals(normaliserCriteres({ departement: "31000" }).departement, "");
});

Deno.test("parPage borne a 5..100, page minimale 1", () => {
  assertEquals(normaliserCriteres({ parPage: 1 }).parPage, 5);
  assertEquals(normaliserCriteres({ parPage: 5000 }).parPage, 100);
  assertEquals(normaliserCriteres({ page: -3 }).page, 1);
  assertEquals(normaliserCriteres({ page: "abc" }).page, 1);
});

Deno.test("tri et ordre en liste blanche", () => {
  assertEquals(normaliserCriteres({ tri: "email" }).tri, "cree_le");
  assertEquals(normaliserCriteres({ tri: "dernier_contact_le" }).tri, "dernier_contact_le");
  assertEquals(normaliserCriteres({ ordre: "asc" }).ordre, "asc");
  assertEquals(normaliserCriteres({ ordre: "n'importe" }).ordre, "desc");
});

Deno.test("recherche tronquee a 200 caracteres et trimmee", () => {
  assertEquals(normaliserCriteres({ recherche: "  toulouse " }).recherche, "toulouse");
  assertEquals(normaliserCriteres({ recherche: "x".repeat(500) }).recherche.length, 200);
});
