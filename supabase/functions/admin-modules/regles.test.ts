import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corpsSite, erreurCanal, niveauExige } from "./regles.ts";

Deno.test("niveauExige: consulter = lecture, ecrire = ecriture", () => {
  assertEquals(niveauExige("catalogue"), "lecture");
  assertEquals(niveauExige("organisations"), "lecture");
  assertEquals(niveauExige("modules"), "ecriture");
});
Deno.test("niveauExige: action inconnue ou non textuelle -> null", () => {
  assertEquals(niveauExige("manifeste"), null);
  assertEquals(niveauExige("toString"), null);
  assertEquals(niveauExige(undefined), null);
});

Deno.test("corpsSite: lectures sans parametre", () => {
  assertEquals(corpsSite("catalogue", { org_id: "x" }, "a@b.fr"), { action: "catalogue" });
});
Deno.test("corpsSite: modules relaye org_id et modules, auteur = celui du jeton", () => {
  const body = { org_id: "o1", modules: { crm: false }, auteur: "pirate@x.fr" };
  assertEquals(corpsSite("modules", body, "eric@confer.fr"), {
    action: "modules",
    org_id: "o1",
    modules: { crm: false },
    auteur: "eric@confer.fr",
  });
});

Deno.test("erreurCanal: 400 unknown_module remonte statut, code et detail", () => {
  const e = erreurCanal({
    statut_site: 400,
    corps: { error: "unknown_module", detail: ["solaire2"] },
  });
  assertEquals(e, { statut_site: 400, code: "unknown_module", detail: ["solaire2"] });
});
Deno.test("erreurCanal: 404 org_not_found sans detail", () => {
  assertEquals(
    erreurCanal({ statut_site: 404, corps: { error: "org_not_found" } }),
    { statut_site: 404, code: "org_not_found", detail: null },
  );
});
Deno.test("erreurCanal: 401 unauthorized (secret faux ou absent cote site)", () => {
  assertEquals(
    erreurCanal({ statut_site: 401, corps: { error: "unauthorized" } }).code,
    "unauthorized",
  );
});
Deno.test("erreurCanal: reponse non JSON (brut) -> code tronque", () => {
  const e = erreurCanal({ statut_site: 503, corps: { brut: "x".repeat(600) } });
  assertEquals(e.statut_site, 503);
  assertEquals(e.code?.length, 200);
});
Deno.test("erreurCanal: detail absent (timeout) -> tout a null", () => {
  assertEquals(erreurCanal(undefined), { statut_site: null, code: null, detail: null });
});
