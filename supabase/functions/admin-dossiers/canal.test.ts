import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canalVente } from "./canal.ts";

Deno.test("gclid vrai -> paid", () => {
  assertEquals(canalVente({ a_gclid: true }), "paid");
});
Deno.test("utm_medium cpc (casse ignoree) -> paid", () => {
  assertEquals(canalVente({ utm_medium: "CPC" }), "paid");
});
Deno.test("referrer moteur -> organic", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com" }), "organic");
});
Deno.test("referrer autre site -> referral", () => {
  assertEquals(canalVente({ referrer_domaine: "leboncoin.fr" }), "referral");
});
Deno.test("utm_source en forme de domaine, sans referrer -> referral", () => {
  // domaine_vente replie sur utm_source quand il contient un point
  assertEquals(canalVente({ utm_source: "chatgpt.com" }), "referral");
});
Deno.test("utm_source simple seul -> campaign", () => {
  assertEquals(canalVente({ utm_source: "newsletter" }), "campaign");
});
Deno.test("capture_site backfill_partiel sans autre signal -> indetermine", () => {
  assertEquals(canalVente({ capture_site: "backfill_partiel" }), "indetermine");
});
Deno.test("aucun signal -> unattributed", () => {
  assertEquals(canalVente({}), "unattributed");
});
Deno.test("attribution null -> unattributed", () => {
  assertEquals(canalVente(null), "unattributed");
});
Deno.test("le referrer moteur gagne sur utm_source", () => {
  assertEquals(canalVente({ referrer_domaine: "bing.com", utm_source: "newsletter" }), "organic");
});
