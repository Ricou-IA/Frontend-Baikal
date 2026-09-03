import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliserManifeste, trouverAction } from "./manifeste.ts";

Deno.test("action minimale valide", () => {
  const actions = normaliserManifeste({ actions: [{ id: "re-extract", libelle: "Re-extraire" }] });
  assertEquals(actions.length, 1);
  assertEquals(actions[0], {
    id: "re-extract",
    libelle: "Re-extraire",
    icone: null,
    variante: "neutre",
    superAdmin: false,
    confirmation: null,
    parametres: [],
  });
});

Deno.test("charge invalide -> aucune action, jamais d'exception", () => {
  assertEquals(normaliserManifeste(null), []);
  assertEquals(normaliserManifeste({}), []);
  assertEquals(normaliserManifeste({ actions: "oui" }), []);
  assertEquals(normaliserManifeste({ actions: [null, 3, "x"] }), []);
});

Deno.test("action sans id ou sans libelle ecartee", () => {
  const actions = normaliserManifeste({
    actions: [{ libelle: "Sans id" }, { id: "sans-libelle" }, { id: "ok", libelle: "OK" }],
  });
  assertEquals(actions.map((a) => a.id), ["ok"]);
});

Deno.test("icone hors liste -> null, icone connue conservee", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", icone: "licorne" },
      { id: "b", libelle: "B", icone: "trash" },
    ],
  });
  assertEquals(actions.map((a) => a.icone), [null, "trash"]);
});

Deno.test("variante hors liste -> neutre", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", variante: "rose" },
      { id: "b", libelle: "B", variante: "danger" },
    ],
  });
  assertEquals(actions.map((a) => a.variante), ["neutre", "danger"]);
});

Deno.test("super_admin coerce en booleen", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", super_admin: true },
      { id: "b", libelle: "B", super_admin: "oui" },
      { id: "c", libelle: "C" },
    ],
  });
  assertEquals(actions.map((a) => a.superAdmin), [true, true, false]);
});

Deno.test("confirmation incomplete -> null", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", confirmation: { titre: "T" } },
      { id: "b", libelle: "B", confirmation: { titre: "T", message: "M", bouton: "OK" } },
    ],
  });
  assertEquals(actions[0].confirmation, null);
  assertEquals(actions[1].confirmation, { titre: "T", message: "M", bouton: "OK" });
});

Deno.test("parametre de type inconnu ecarte", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [
        { id: "p1", type: "sorcellerie", libelle: "P1" },
        { id: "p2", type: "texte", libelle: "P2" },
      ],
    }],
  });
  assertEquals(action.parametres.map((p) => p.id), ["p2"]);
});

Deno.test("choix sans options non vides ecarte", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [
        { id: "vide", type: "choix", libelle: "Vide", options: [] },
        { id: "bon", type: "choix", libelle: "Bon", options: [{ valeur: "v", libelle: "L" }] },
      ],
    }],
  });
  assertEquals(action.parametres.map((p) => p.id), ["bon"]);
  assertEquals(action.parametres[0].options, [{ valeur: "v", libelle: "L" }]);
});

Deno.test("nombre: min et max par defaut quand absents ou non numeriques", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [{ id: "n", type: "nombre", libelle: "N", min: "x", max: 100 }],
    }],
  });
  assertEquals(action.parametres[0].min, 0);
  assertEquals(action.parametres[0].max, 100);
});

Deno.test("trouverAction: retrouve par id, refuse l'inconnu", () => {
  const actions = normaliserManifeste({ actions: [{ id: "purge", libelle: "Purger" }] });
  assertEquals(trouverAction(actions, "purge")?.id, "purge");
  assertEquals(trouverAction(actions, "autre"), null);
  assertEquals(trouverAction(actions, undefined), null);
});

Deno.test("nombre: min et max null explicites retombent sur les defauts", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [{ id: "n", type: "nombre", libelle: "N", min: null, max: null }],
    }],
  });
  assertEquals(action.parametres[0].min, 0);
  assertEquals(action.parametres[0].max, 100);
});
