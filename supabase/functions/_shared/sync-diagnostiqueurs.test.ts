import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ErreurSync, exigerLignes, type LigneDiag, prospectsDepuisDiag } from "./sync-diagnostiqueurs.ts";

// Meme mapping que la fonction SQL admin.sync_diagnostiqueurs (migration
// 20260825010000) : email normalise, dedoublonnage par email, entreprise =
// nom_affiche du site, commune dans donnees. La fonction TS la remplace parce
// qu'un site sur base dediee ne se lit pas en SQL depuis la base de Baikal.

function ligne(partiel: Partial<LigneDiag>): LigneDiag {
  return {
    email: "a@exemple.fr",
    nom: "Durand",
    prenom: "Anne",
    telephone: "0600000000",
    nom_affiche: "Cabinet Durand",
    code_postal: "31000",
    commune: "Toulouse",
    ...partiel,
  };
}

Deno.test("normalise l'email : minuscules, sans espaces autour", () => {
  const [p] = prospectsDepuisDiag("monsieurdpe", [ligne({ email: "  Jean@X.FR " })]);
  assertEquals(p.email, "jean@x.fr");
});

Deno.test("ne retire que les espaces, comme trim() de Postgres", () => {
  // String.prototype.trim enleverait aussi l'espace insecable : la fonction
  // SQL l'a garde, et normaliser autrement creerait un second prospect a cote
  // d'un premier peut-etre desinscrit.
  const [p] = prospectsDepuisDiag("monsieurdpe", [ligne({ email: " a@x.fr " })]);
  assertEquals(p.email, "a@x.fr ");
});

Deno.test("une lecture vide leve au lieu de passer pour un site sans diagnostiqueur", () => {
  assertThrows(() => exigerLignes("monsieurdpe", []), ErreurSync, "aucune ligne");
});

Deno.test("une lecture non vide passe", () => {
  exigerLignes("monsieurdpe", [ligne({})]);
});

Deno.test("ecarte un email nul et un email sans arobase", () => {
  const prospects = prospectsDepuisDiag("monsieurdpe", [
    ligne({ email: null }),
    ligne({ email: "pas-un-email" }),
    ligne({ email: "ok@x.fr" }),
  ]);
  assertEquals(prospects.map((p) => p.email), ["ok@x.fr"]);
});

Deno.test("un seul prospect par email : le premier par nom_affiche, nom, prenom", () => {
  const prospects = prospectsDepuisDiag("monsieurdpe", [
    ligne({ email: "x@x.fr", nom_affiche: "Zeta", nom: "A" }),
    ligne({ email: "X@x.fr", nom_affiche: "Alpha", nom: "B", prenom: "Z" }),
    ligne({ email: "x@x.fr ", nom_affiche: "Alpha", nom: "B", prenom: "A" }),
  ]);
  assertEquals(prospects.length, 1);
  assertEquals(prospects[0].entreprise, "Alpha");
  assertEquals(prospects[0].prenom, "A");
});

Deno.test("forme exacte d'un prospect", () => {
  assertEquals(prospectsDepuisDiag("monsieurdpe", [ligne({})]), [{
    app_id: "monsieurdpe",
    type: "diagnostiqueur",
    email: "a@exemple.fr",
    nom: "Durand",
    prenom: "Anne",
    entreprise: "Cabinet Durand",
    telephone: "0600000000",
    code_postal: "31000",
    source: "diag_certifie",
    donnees: { commune: "Toulouse" },
  }]);
});

Deno.test("les valeurs nulles du site passent nulles, jamais en chaine vide", () => {
  const [p] = prospectsDepuisDiag("monsieurdpe", [
    ligne({ nom_affiche: null, commune: null, telephone: null }),
  ]);
  assertEquals(p.entreprise, null);
  assertEquals(p.telephone, null);
  assertEquals(p.donnees, { commune: null });
});
