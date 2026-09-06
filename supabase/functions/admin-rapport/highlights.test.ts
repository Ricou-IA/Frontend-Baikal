import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { calculerHighlights, variation, moisPrecedent, type FaitsHighlights } from "./highlights.ts";

function base(): FaitsHighlights {
  return {
    mois: "2026-08",
    partenariat: {
      franchise: 15,
      lignes: [
        { mois: "2026-07", dans_decompte: false, ventes: 14, ventes_partageables: 0, quote_part: 0 },
        { mois: "2026-08", dans_decompte: true, ventes: 13, ventes_partageables: 0, quote_part: 0 },
      ],
    },
    seo: {
      google: {
        mois: { clics: 523, impressions: 9819, ctr: 0.053, position: 15.2 },
        precedent: { clics: 644, impressions: 10412, ctr: 0.062, position: 10.0 },
      },
      bing: { mois: { clics: 137, impressions: 2245, ctr: 0.06, position: 0 }, precedent: null },
      requetes_mois: [
        { cle: "pré état daté", clics: 120, impressions: 900, position: 2.8 },
        { cle: "pré état daté gratuit", clics: 40, impressions: 300, position: 5.1 },
        { cle: "nouvelle requête", clics: 30, impressions: 100, position: 6 },
      ],
      requetes_precedent: [
        { cle: "pré état daté", clics: 130, impressions: 950, position: 4.2 },
        { cle: "pré état daté gratuit", clics: 35, impressions: 280, position: 8.6 },
      ],
    },
    ventes: { domaines_mois: ["chatgpt.com", "google.com"], domaines_connus_avant: ["google.com"] },
  };
}

Deno.test("moisPrecedent traverse l'annee", () => {
  assertEquals(moisPrecedent("2026-01"), "2025-12");
  assertEquals(moisPrecedent("2026-08"), "2026-07");
});

Deno.test("variation : % seulement si la base est >= 20", () => {
  assertEquals(variation(523, 644), "−121, −19 %");
  assertEquals(variation(13, 14), "−1");
  assertEquals(variation(5, 0), "+5");
});

Deno.test("trame complete pour un mois ordinaire", () => {
  const h = calculerHighlights(base());
  assertEquals(h[0], "13 ventes en août 2026 contre 14 en juillet 2026 (−1).");
  assertEquals(h[1], "Seuil de 15 ventes non atteint (13 sur 15) : aucune vente partageable ce mois.");
  assertEquals(h[2], "523 clics Google contre 644 (−121, −19 %).");
  assert(h.some((p) => p.startsWith("Position moyenne Google 15,2 contre 10,0 (5,2 places perdue")));
  // Meilleure progression : « gratuit » gagne 3,5 places, « pré état daté » 1,4.
  assert(h.includes("« pré état daté gratuit » passe de la position 8,6 à 5,1."));
  assert(h.includes("1 requête entre dans le top 10 : « nouvelle requête »."));
  assert(h.includes("Première vente venue de chatgpt.com."));
  // Bing sans mois precedent : aucune phrase Bing.
  assert(!h.some((p) => p.includes("Bing")));
});

Deno.test("premier mois mesure : pas de comparaison", () => {
  const f = base();
  f.partenariat.lignes = [f.partenariat.lignes[1]];
  f.seo.google.precedent = null;
  f.seo.requetes_precedent = [];
  const h = calculerHighlights(f);
  assertEquals(h[0], "13 ventes en août 2026, premier mois mesuré.");
  assert(h.includes("523 clics et 9 819 impressions Google, premier mois mesuré."));
  assert(!h.some((p) => p.includes("top 10")));
});

Deno.test("quote-part quand le seuil est depasse", () => {
  const f = base();
  f.partenariat.lignes[1] = { mois: "2026-08", dans_decompte: true, ventes: 18, ventes_partageables: 3, quote_part: 18.2 };
  const h = calculerHighlights(f);
  assertEquals(h[1], "3 ventes au-delà du seuil de 15 : quote-part de 18,20 €.");
});
