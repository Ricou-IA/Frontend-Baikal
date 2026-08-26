import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliserCriteres } from "./filtres.ts";

Deno.test("body vide -> valeurs par defaut", () => {
  const c = normaliserCriteres({});
  assertEquals(c, {
    recherche: "",
    periodeJours: null,
    statuts: [],
    perimetre: null,
    inclureMasquees: false,
    exclureTests: true,
    inclureSupprimes: false,
    tri: "cree_le",
    ordre: "desc",
    page: 1,
    parPage: 25,
  });
});
Deno.test("periode hors liste blanche -> null", () => {
  assertEquals(normaliserCriteres({ periodeJours: 15 }).periodeJours, null);
  assertEquals(normaliserCriteres({ periodeJours: 30 }).periodeJours, 30);
});
Deno.test("parPage borne a 5..100", () => {
  assertEquals(normaliserCriteres({ parPage: 1 }).parPage, 5);
  assertEquals(normaliserCriteres({ parPage: 500 }).parPage, 100);
  assertEquals(normaliserCriteres({ parPage: 50 }).parPage, 50);
});
Deno.test("page invalide -> 1", () => {
  assertEquals(normaliserCriteres({ page: -3 }).page, 1);
  assertEquals(normaliserCriteres({ page: "abc" }).page, 1);
});
Deno.test("tri et ordre en liste blanche", () => {
  assertEquals(normaliserCriteres({ tri: "montant_ttc" }).tri, "cree_le");
  assertEquals(normaliserCriteres({ tri: "paye_le", ordre: "asc" }).tri, "paye_le");
  assertEquals(normaliserCriteres({ ordre: "asc" }).ordre, "asc");
});
Deno.test("perimetre en liste blanche", () => {
  assertEquals(normaliserCriteres({ perimetre: "b2b" }).perimetre, "b2b");
  assertEquals(normaliserCriteres({ perimetre: "pro" }).perimetre, null);
});
Deno.test("statuts filtres aux chaines non vides", () => {
  assertEquals(normaliserCriteres({ statuts: ["paye", "", 3, "lead"] }).statuts, ["paye", "lead"]);
});
Deno.test("recherche tronquee et nettoyee", () => {
  assertEquals(normaliserCriteres({ recherche: "  scafi  " }).recherche, "scafi");
  assertEquals(normaliserCriteres({ recherche: "x".repeat(300) }).recherche.length, 200);
});
Deno.test("exclureTests false explicite respecte", () => {
  assertEquals(normaliserCriteres({ exclureTests: false }).exclureTests, false);
});
