import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attributionDepuisLigne } from "./enrichissement.ts";

// Ligne telle que la publie la vue du site (docs/contrats/ventes-v1.sql) :
// le canal s'y appelle `acquisition_channel`, les champs inconnus sont ''.
const ligne = {
  vente_id: "vente-exemple",
  acquisition_channel: "direct",
  referrer_domaine: "",
  a_gclid: false,
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
  landing_page: "/",
  porte_entree: "/",
  capture: "live",
  origine_declaree: "",
};

Deno.test("le canal publie sous acquisition_channel entre dans l'archive sous channel", () => {
  assertEquals(attributionDepuisLigne(ligne), {
    channel: "direct",
    a_gclid: false,
    landing_page: "/",
    porte_entree: "/",
    capture_site: "live",
  });
});

Deno.test("une vue qui publie deja `channel` garde sa valeur", () => {
  assertEquals(attributionDepuisLigne({ ...ligne, channel: "organic_search" }).channel, "organic_search");
});

Deno.test("canal vide : la cle reste absente (on ne sait pas, ce n'est pas « direct »)", () => {
  assertEquals("channel" in attributionDepuisLigne({ ...ligne, acquisition_channel: "" }), false);
});
