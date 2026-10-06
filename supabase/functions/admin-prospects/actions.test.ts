import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { preparerActionProspect } from "./actions.ts";

Deno.test("statut avec valeur", () => {
  assertEquals(preparerActionProspect({ actionSite: "statut", email: "A@b.fr", valeur: "refus" }), {
    ok: true, genre: "action", actionSite: "statut", email: "A@b.fr", valeur: "refus",
  });
});

Deno.test("valeur non textuelle -> null", () => {
  assertEquals(preparerActionProspect({ actionSite: "note", email: "a@b.fr", valeur: 42 }), {
    ok: true, genre: "action", actionSite: "note", email: "a@b.fr", valeur: null,
  });
});

Deno.test("creer devient une ligne d'import, metier et nom par defaut", () => {
  assertEquals(preparerActionProspect({ actionSite: "creer", email: "a@b.fr", commune: "Toulouse" }), {
    ok: true, genre: "creer", email: "a@b.fr",
    ligne: {
      email: "a@b.fr", metier: "autre", provenance: "import", nom_affiche: "a@b.fr",
      commune: "Toulouse", code_postal: null, telephone: null, site_web: null,
    },
  });
});

Deno.test("action inconnue et email manquant refuses", () => {
  assertEquals(preparerActionProspect({ actionSite: "importer", email: "a@b.fr" }), { ok: false, erreur: "Action inconnue: importer" });
  assertEquals(preparerActionProspect({ actionSite: "statut" }), { ok: false, erreur: "email requis" });
});
