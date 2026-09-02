import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ONGLETS, paginationOnglet, resoudreOnglet, triEffectif } from "./onglets.ts";

Deno.test("resoudreOnglet: nom connu -> definition", () => {
  assertEquals(resoudreOnglet("documents")?.vue, "baikal_dossier_documents");
  assertEquals(resoudreOnglet("chat")?.ordre, "ASC");
});

Deno.test("resoudreOnglet: nom inconnu ou hostile -> null", () => {
  assertEquals(resoudreOnglet("champs"), null);
  assertEquals(resoudreOnglet("baikal_dossiers"), null);
  assertEquals(resoudreOnglet("../../etc/passwd"), null);
  assertEquals(resoudreOnglet(undefined), null);
  assertEquals(resoudreOnglet(42), null);
  assertEquals(resoudreOnglet("constructor"), null);
});

Deno.test("ONGLETS: la table de correspondance est verrouillee", () => {
  assertEquals(ONGLETS, {
    documents: { vue: "baikal_dossier_documents", tri: "depose_le", ordre: "DESC" },
    resultats: { vue: "baikal_dossier_resultats", tri: "produit_le", ordre: "DESC" },
    emails: { vue: "baikal_dossier_emails", tri: "envoye_le", ordre: "DESC" },
    chat: { vue: "baikal_dossier_messages", tri: "survenu_le", ordre: "ASC" },
    ia: { vue: "baikal_dossier_ia", tri: "survenu_le", ordre: "DESC" },
    donnees: { vue: "baikal_dossier_donnees", tri: "ordre", ordre: "ASC" },
    events: { vue: "baikal_dossier_events", tri: "survenu_le", ordre: "DESC" },
  });
});

Deno.test("triEffectif: colonne de tri presente -> clause", () => {
  const def = ONGLETS.documents;
  assertEquals(triEffectif(def, new Set(["dossier_id", "depose_le"])), "depose_le DESC");
});

Deno.test("triEffectif: colonne de tri absente -> null (pas de ORDER BY)", () => {
  const def = ONGLETS.documents;
  assertEquals(triEffectif(def, new Set(["dossier_id", "libelle"])), null);
});

Deno.test("paginationOnglet: defauts", () => {
  assertEquals(paginationOnglet({}), { page: 1, parPage: 50 });
});

Deno.test("paginationOnglet: bornes", () => {
  assertEquals(paginationOnglet({ parPage: 1 }).parPage, 5);
  assertEquals(paginationOnglet({ parPage: 5000 }).parPage, 200);
  assertEquals(paginationOnglet({ page: 0 }).page, 1);
  assertEquals(paginationOnglet({ page: -3 }).page, 1);
  assertEquals(paginationOnglet({ page: "2" }).page, 2);
});
