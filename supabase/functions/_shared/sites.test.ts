import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chargerSite, ErreurSite, lecteurSite, type Site } from "./sites.ts";

// Faux client supabase-js : seul le chemin schema().from().select().eq().maybeSingle()
// est utilise par chargerSite.
function fauxAdmin(reponse: { data: unknown; error: { message: string } | null }) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve(reponse) }),
        }),
      }),
    }),
  } as never;
}

const siteLocal: Site = {
  id: "monsieurdpe",
  name: "MonsieurDPE",
  is_active: true,
  domaine: null,
  db_schema: "dpe",
  db_ro_secret_ref: null,
  env_url: null,
  env_secret_ref: null,
  env_anon_key: null,
  env_dossiers_fn: null,
  env_prospects_fn: null,
};
const siteDedie: Site = {
  ...siteLocal,
  id: "majordhome",
  db_schema: "majordhome",
  db_ro_secret_ref: "ADMIN_RO_TEST_DSN",
};

Deno.test("chargerSite: site inconnu -> ErreurSite", async () => {
  await assertRejects(
    () => chargerSite(fauxAdmin({ data: null, error: null }), "nexiste-pas"),
    ErreurSite,
    "Site inconnu",
  );
});

Deno.test("chargerSite: erreur registre -> ErreurSite", async () => {
  await assertRejects(
    () => chargerSite(fauxAdmin({ data: null, error: { message: "boom" } }), "x"),
    ErreurSite,
    "registre",
  );
});

Deno.test("chargerSite: renvoie la ligne du registre", async () => {
  const site = await chargerSite(
    fauxAdmin({ data: siteLocal, error: null }),
    "monsieurdpe",
  );
  assertEquals(site.db_schema, "dpe");
});

Deno.test("lecteurSite: secret dedie absent -> ErreurSite", () => {
  Deno.env.delete("ADMIN_RO_TEST_DSN");
  assertThrows(() => lecteurSite(siteDedie), ErreurSite, "ADMIN_RO_TEST_DSN");
});

Deno.test("lecteurSite: dedie avec secret -> instance sql", async () => {
  Deno.env.set("ADMIN_RO_TEST_DSN", "postgresql://u:p@localhost:6543/postgres");
  const sql = lecteurSite(siteDedie);
  assertEquals(typeof sql, "function"); // postgres-js: l'instance est une fonction taggee
  await sql.end({ timeout: 0 });
  Deno.env.delete("ADMIN_RO_TEST_DSN");
});

// statement_timeout borne l'execution d'une requete, connect_timeout ne borne
// que l'ouverture : c'est la seule protection de Baikal contre une vue lente
// publiee par un site tiers. Le defaut doit rester genereux -- admin-prospects
// et admin-site-stats font des agregats qu'un plafond serre casserait.
Deno.test("lecteurSite: delai d'execution par defaut a 30s", async () => {
  Deno.env.set("ADMIN_RO_TEST_DSN", "postgresql://u:p@localhost:6543/postgres");
  const sql = lecteurSite(siteDedie);
  assertEquals(sql.options.connection.statement_timeout, "30000");
  assertEquals(sql.options.connection.default_transaction_read_only, "on");
  await sql.end({ timeout: 0 });
  Deno.env.delete("ADMIN_RO_TEST_DSN");
});

Deno.test("lecteurSite: delai d'execution resserre par l'appelant", async () => {
  Deno.env.set("ADMIN_RO_TEST_DSN", "postgresql://u:p@localhost:6543/postgres");
  const sql = lecteurSite(siteDedie, 5000);
  assertEquals(sql.options.connection.statement_timeout, "5000");
  await sql.end({ timeout: 0 });
  Deno.env.delete("ADMIN_RO_TEST_DSN");
});

Deno.test("lecteurSite: local sans SUPABASE_DB_URL -> ErreurSite", () => {
  const sauvegarde = Deno.env.get("SUPABASE_DB_URL");
  Deno.env.delete("SUPABASE_DB_URL");
  assertThrows(() => lecteurSite(siteLocal), ErreurSite, "SUPABASE_DB_URL");
  if (sauvegarde) Deno.env.set("SUPABASE_DB_URL", sauvegarde);
});
