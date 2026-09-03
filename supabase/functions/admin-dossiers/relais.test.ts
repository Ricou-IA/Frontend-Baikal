import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ErreurRelais, preparerRelais, relaisConfigure } from "./relais.ts";
import type { Site } from "../_shared/sites.ts";

const siteComplet: Site = {
  id: "pack-vendeur",
  name: "Pack Vendeur",
  is_active: true,
  domaine: null,
  db_schema: "pack_vendeur",
  db_ro_secret_ref: null,
  env_url: "https://exemple.supabase.co/",
  env_secret_ref: "RELAIS_TEST_CLE",
  env_anon_key: "anon-jwt",
  env_dossiers_fn: "pv-admin-dossiers",
  env_prospects_fn: null,
};

Deno.test("relaisConfigure: vrai quand les 4 champs sont presents", () => {
  assertEquals(relaisConfigure(siteComplet), true);
});
Deno.test("relaisConfigure: faux si env_dossiers_fn manque", () => {
  assertEquals(relaisConfigure({ ...siteComplet, env_dossiers_fn: null }), false);
});
Deno.test("relaisConfigure: faux si env_url manque", () => {
  assertEquals(relaisConfigure({ ...siteComplet, env_url: null }), false);
});
Deno.test("preparerRelais: null quand non configure", () => {
  assertEquals(preparerRelais({ ...siteComplet, env_anon_key: null }), null);
});
Deno.test("preparerRelais: ErreurRelais si le secret n'est pas pose", () => {
  Deno.env.delete("RELAIS_TEST_CLE");
  assertThrows(() => preparerRelais(siteComplet), ErreurRelais, "RELAIS_TEST_CLE");
});
Deno.test("preparerRelais: cible complete, slash final rogne", () => {
  Deno.env.set("RELAIS_TEST_CLE", "s3cret");
  const cible = preparerRelais(siteComplet)!;
  assertEquals(cible.url, "https://exemple.supabase.co/functions/v1/pv-admin-dossiers");
  assertEquals(cible.headers["apikey"], "anon-jwt");
  assertEquals(cible.headers["Authorization"], "Bearer anon-jwt");
  assertEquals(cible.headers["X-Baikal-Key"], "s3cret");
  Deno.env.delete("RELAIS_TEST_CLE");
});

// statutSortie est le code que Baikal renvoie a la console, pas le statut du
// site : 502 pour une reponse en erreur du site (avec son detail), 504 pour
// une absence de reponse, rien (donc 500 au niveau du catch general) pour un
// canal mal configure cote Baikal.
Deno.test("ErreurRelais: reponse du site en erreur -> statutSortie 502 avec detail", () => {
  const e = new ErreurRelais(
    "Site x: HTTP 403",
    502,
    { statut_site: 403, corps: { motif: "credits insuffisants" } },
  );
  assertEquals(e.statutSortie, 502);
  assertEquals(e.detail, { statut_site: 403, corps: { motif: "credits insuffisants" } });
});
Deno.test("ErreurRelais: timeout -> statutSortie 504 sans detail", () => {
  const e = new ErreurRelais("Site x: pas de reponse en 8s", 504);
  assertEquals(e.statutSortie, 504);
  assertEquals(e.detail, undefined);
});
Deno.test("ErreurRelais: canal mal configure -> statutSortie et detail absents", () => {
  const e = new ErreurRelais("Site sans canal d'administration configure");
  assertEquals(e.statutSortie, undefined);
  assertEquals(e.detail, undefined);
});

