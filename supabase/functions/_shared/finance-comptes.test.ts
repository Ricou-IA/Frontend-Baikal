import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  comptesALire,
  type CompteStripe,
  rangerVente,
  refStripeValide,
  type SiteRegistre,
  traduireMarqueur,
} from "./finance-comptes.ts";

// Registre fictif : aucun nom de secret reel, aucun identifiant de compte.
const sites: SiteRegistre[] = [
  { id: "site-commun", db_schema: "commun", stripe_key_ref: null, is_active: true },
  { id: "site-a", db_schema: "aaa", stripe_key_ref: "ADMIN_STRIPE_A_KEY", is_active: true },
  { id: "site-b", db_schema: "bbb", stripe_key_ref: "ADMIN_STRIPE_B_KEY", is_active: true },
  { id: "site-eteint", db_schema: null, stripe_key_ref: "ADMIN_STRIPE_Z_KEY", is_active: false },
];

const commun: CompteStripe = { ref: null, sites: [], siteSeul: null };
const compteA: CompteStripe = { ref: "ADMIN_STRIPE_A_KEY", sites: ["site-a"], siteSeul: "site-a" };

Deno.test("le compte commun passe en premier, puis un compte par secret nomme", () => {
  assertEquals(comptesALire(sites, true), [
    commun,
    compteA,
    { ref: "ADMIN_STRIPE_B_KEY", sites: ["site-b"], siteSeul: "site-b" },
  ]);
});

Deno.test("sans cle commune, seuls les comptes propres sont lus", () => {
  assertEquals(comptesALire(sites, false).map((c) => c.ref), ["ADMIN_STRIPE_A_KEY", "ADMIN_STRIPE_B_KEY"]);
});

Deno.test("un site inactif ne fait lire aucun compte", () => {
  assertEquals(comptesALire(sites, true).some((c) => c.ref === "ADMIN_STRIPE_Z_KEY"), false);
});

Deno.test("un compte designe par deux sites n'a pas de site seul", () => {
  const deux: SiteRegistre[] = [
    { id: "site-a", db_schema: null, stripe_key_ref: "ADMIN_STRIPE_A_KEY", is_active: true },
    { id: "site-c", db_schema: null, stripe_key_ref: "ADMIN_STRIPE_A_KEY", is_active: true },
  ];
  assertEquals(comptesALire(deux, false), [
    { ref: "ADMIN_STRIPE_A_KEY", sites: ["site-a", "site-c"], siteSeul: null },
  ]);
});

Deno.test("le marqueur se traduit par l'id, sinon par le schema du site", () => {
  assertEquals(traduireMarqueur("site-a", sites), "site-a");
  assertEquals(traduireMarqueur("aaa", sites), "site-a");
  assertEquals(traduireMarqueur(" bbb ", sites), "site-b");
  assertEquals(traduireMarqueur("jamais-vu", sites), null);
  assertEquals(traduireMarqueur("", sites), null);
});

Deno.test("une vente marquee par le schema du site est rangee sous l'id du registre", () => {
  const r = rangerVente({ app_id: "aaa", offre: "x", perimetre: "b2c" }, commun, sites);
  assertEquals(r, { app_id: "site-a", offre: "x", perimetre: "b2c" });
});

Deno.test("non resolue dans le compte d'un seul site : elle appartient a ce site", () => {
  const r = rangerVente({ app_id: "inconnu", offre: "inconnu", perimetre: "b2c" }, compteA, sites);
  assertEquals(r.app_id, "site-a");
  assertEquals(r.offre, "inconnu");
});

Deno.test("non resolue dans le compte commun : elle reste inconnue", () => {
  const r = rangerVente({ app_id: "inconnu", offre: "inconnu", perimetre: "b2c" }, commun, sites);
  assertEquals(r.app_id, "inconnu");
});

Deno.test("non resolue dans un compte partage par deux sites : elle reste inconnue", () => {
  const partage: CompteStripe = { ref: "ADMIN_STRIPE_A_KEY", sites: ["site-a", "site-c"], siteSeul: null };
  const r = rangerVente({ app_id: "inconnu", offre: "inconnu", perimetre: "b2c" }, partage, sites);
  assertEquals(r.app_id, "inconnu");
});

Deno.test("le mapping l'emporte sur le compte : un produit d'un autre site reste a cet autre site", () => {
  const r = rangerVente({ app_id: "site-b", offre: "y", perimetre: "b2b" }, compteA, sites);
  assertEquals(r, { app_id: "site-b", offre: "y", perimetre: "b2b" });
});

Deno.test("un marqueur inconnu du registre ne s'archive jamais tel quel", () => {
  assertEquals(rangerVente({ app_id: "jamais-vu", offre: "x", perimetre: "b2c" }, commun, sites).app_id, "inconnu");
  assertEquals(rangerVente({ app_id: "jamais-vu", offre: "x", perimetre: "b2c" }, compteA, sites).app_id, "site-a");
});

Deno.test("un nom de secret Stripe : majuscules et le mot STRIPE, rien d'autre", () => {
  assertEquals(refStripeValide("ADMIN_STRIPE_A_KEY"), true);
  assertEquals(refStripeValide("SUPABASE_SERVICE_ROLE_KEY"), false);
  assertEquals(refStripeValide("admin_stripe_a_key"), false);
  assertEquals(refStripeValide("STRIPE KEY"), false);
  assertEquals(refStripeValide(""), false);
});
