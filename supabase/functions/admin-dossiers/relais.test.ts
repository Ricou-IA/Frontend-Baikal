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
