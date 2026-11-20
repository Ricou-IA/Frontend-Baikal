import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  autorise,
  corpsSite,
  erreurCanal,
  lireEtat,
  messageCanal,
  niveauConsole,
  niveauExige,
  porteMotDePasse,
} from "./membres-regles.ts";

Deno.test("consulter est une lecture, tout le reste une écriture", () => {
  assertEquals(niveauExige("etat"), "lecture");
  assertEquals(niveauExige("membres"), "lecture");
  for (const a of ["creer", "role", "mot-de-passe", "lien", "renommer", "email", "bloquer", "retirer"]) {
    assertEquals(niveauExige(a), "ecriture");
  }
  assertEquals(niveauExige("membre-creer"), null);
  assertEquals(niveauExige("toString"), null);
  assertEquals(niveauExige(undefined), null);
});

Deno.test("droit de la console : super admin ou droit délégué, jamais l'appartenance", () => {
  assertEquals(niveauConsole("super_admin", null), "ecriture");
  assertEquals(niveauConsole("user", { users: "lecture" }), "lecture");
  assertEquals(niveauConsole("user", { users: "ecriture" }), "ecriture");
  assertEquals(niveauConsole("org_admin", null), null);
  assertEquals(niveauConsole("org_admin", { seo: "ecriture" }), null);
  assertEquals(niveauConsole("user", { users: "tout" }), null);
});

Deno.test("une lecture ne permet pas d'écrire", () => {
  assertEquals(autorise("lecture", "lecture"), true);
  assertEquals(autorise("ecriture", "lecture"), true);
  assertEquals(autorise("ecriture", "ecriture"), true);
  assertEquals(autorise("lecture", "ecriture"), false);
  assertEquals(autorise(null, "lecture"), false);
});

Deno.test("le mot de passe ne concerne que la création et son changement", () => {
  assertEquals(porteMotDePasse("creer"), true);
  assertEquals(porteMotDePasse("mot-de-passe"), true);
  assertEquals(porteMotDePasse("bloquer"), false);
});

Deno.test("corps du site : champs du contrat, auteur du jeton", () => {
  assertEquals(corpsSite("etat", {}, "a@b.test", null), { action: "manifeste" });
  assertEquals(corpsSite("membres", {}, "a@b.test", null), { action: "membres", org_id: null });
  assertEquals(corpsSite("membres", { orgId: "o1" }, "a@b.test", null), { action: "membres", org_id: "o1" });
  assertEquals(
    corpsSite("creer", { email: "m@x.test", nom: "M", orgId: "o1", role: "technicien", auteur: "pirate" }, "a@b.test", "secret12"),
    {
      action: "membre-creer",
      email: "m@x.test",
      mot_de_passe: "secret12",
      nom: "M",
      org_id: "o1",
      role: "technicien",
      auteur: "a@b.test",
    },
  );
  assertEquals(corpsSite("mot-de-passe", { id: "u1", password: "ignore" }, null, "secret12"), {
    action: "membre-mot-de-passe",
    id: "u1",
    mot_de_passe: "secret12",
    auteur: null,
  });
  assertEquals(corpsSite("bloquer", { id: "u1", bloque: true }, "a@b.test", null), {
    action: "membre-bloquer",
    id: "u1",
    bloque: true,
    auteur: "a@b.test",
  });
  assertEquals(corpsSite("retirer", { id: "u1" }, "a@b.test", null), {
    action: "membre-retirer",
    id: "u1",
    auteur: "a@b.test",
  });
});

Deno.test("état : le bloc membres du manifeste, sinon contrat non publié", () => {
  assertEquals(
    lireEtat({
      app: "site",
      membres: {
        version: 1,
        actions: ["membres", "membre-creer", 3],
        roles: [{ slug: "org_admin", libelle: "Administrateur" }, { slug: "tech" }, { libelle: "sans slug" }, null],
      },
    }),
    {
      disponible: true,
      actions: ["membres", "membre-creer"],
      roles: [{ slug: "org_admin", libelle: "Administrateur" }, { slug: "tech", libelle: "tech" }],
    },
  );
  assertEquals(lireEtat({ app: "site", actions: ["modules"] }), { disponible: false, motif: "contrat" });
  assertEquals(lireEtat({ membres: { actions: ["membre-creer"] } }), { disponible: false, motif: "contrat" });
  assertEquals(lireEtat(null), { disponible: false, motif: "contrat" });
});

Deno.test("erreur du site : son code, puis la phrase affichée", () => {
  const canal = erreurCanal({ statut_site: 409, corps: { error: "deja_membre" } });
  assertEquals(canal, { statut_site: 409, code: "deja_membre", detail: null });
  assertEquals(messageCanal(canal), "Cette adresse a déjà un compte chez ce site. Rien n'a été modifié.");
  assertEquals(
    messageCanal(erreurCanal({ statut_site: 400, corps: { error: "invalid_body", detail: "email invalide" } })),
    "Le site a refusé la demande : saisie invalide. (email invalide)",
  );
  assertEquals(
    messageCanal(erreurCanal({ statut_site: 418, corps: { error: "inedit" } })),
    "Le site a refusé — HTTP 418 inedit",
  );
  assertEquals(messageCanal(erreurCanal({ statut_site: 502, corps: { brut: "<html>" } })), "Le site a refusé — HTTP 502 <html>");
  assertEquals(messageCanal(erreurCanal(undefined)), "Le site a refusé — HTTP ?");
});
