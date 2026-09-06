import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { calculerHighlights, type FaitsHighlights, variation } from "./highlights.ts";
import { estMoisEntier, libellePeriode, moisCouverts, periodePrecedente } from "./periode.ts";

function base(): FaitsHighlights {
  return {
    libelle: "en août 2026",
    libelle_precedent: "en juillet 2026",
    ventes: { periode: 13, precedent: 14 },
    franchise: { seuil: 15, ventes: 13, partageables: 0, quote_part: 0 },
    seo: {
      google: {
        periode: { clics: 523, impressions: 9819, impressions_hors_bruit: 11846, ctr: 0.053, position: 15.2 },
        precedent: { clics: 644, impressions: 10412, impressions_hors_bruit: 11600, ctr: 0.062, position: 10.0 },
      },
      bing: { periode: { clics: 137, impressions: 2245, impressions_hors_bruit: null, ctr: 0.06, position: 0 }, precedent: null },
      requetes_periode: [
        { cle: "pré état daté", clics: 120, impressions: 900, position: 2.8 },
        { cle: "pré état daté gratuit", clics: 40, impressions: 300, position: 5.1 },
        { cle: "nouvelle requête", clics: 30, impressions: 100, position: 6 },
      ],
      requetes_precedent: [
        { cle: "pré état daté", clics: 130, impressions: 950, position: 4.2 },
        { cle: "pré état daté gratuit", clics: 35, impressions: 280, position: 8.6 },
      ],
    },
  };
}

Deno.test("periode : mois entier, precedent, mois couverts, libelle", () => {
  const aout = { debut: "2026-08-01", fin: "2026-08-31" };
  assert(estMoisEntier(aout));
  assert(!estMoisEntier({ debut: "2026-08-01", fin: "2026-08-15" }));
  assertEquals(periodePrecedente(aout), { debut: "2026-07-01", fin: "2026-07-31" });
  assertEquals(periodePrecedente({ debut: "2026-08-01", fin: "2026-08-10" }), { debut: "2026-07-22", fin: "2026-07-31" });
  assertEquals(moisCouverts({ debut: "2026-07-15", fin: "2026-09-02" }), ["2026-07", "2026-08", "2026-09"]);
  assertEquals(libellePeriode(aout), "août 2026");
  assertEquals(libellePeriode({ debut: "2026-07-01", fin: "2026-09-30" }), "du 1er juillet au 30 septembre 2026");
  assertEquals(libellePeriode({ debut: "2025-12-15", fin: "2026-01-10" }), "du 15 décembre 2025 au 10 janvier 2026");
});

Deno.test("variation : % seulement si la base est >= 20", () => {
  assertEquals(variation(523, 644), "−121, −19 %");
  assertEquals(variation(13, 14), "−1");
  assertEquals(variation(5, 0), "+5");
});

Deno.test("chaque highlight porte un theme", () => {
  const themes = calculerHighlights(base()).map((x) => x.theme);
  assertEquals(themes.slice(0, 2), ["ventes", "ventes"]);
  assert(themes.includes("google") && themes.includes("requetes"));
});

Deno.test("trame complete pour un mois ordinaire", () => {
  const h = calculerHighlights(base()).map((x) => x.texte);
  assertEquals(h[0], "13 ventes en août 2026 contre 14 en juillet 2026 (−1).");
  assertEquals(h[1], "Seuil de 15 ventes non atteint (13 sur 15) : aucune vente partageable ce mois.");
  assertEquals(h[2], "523 clics Google contre 644 (−121, −19 %).");
  assertEquals(h[3], "11 846 impressions Google hors bruit contre 11 600 (+246, +2 %).");
  assertEquals(h[4], "CTR Google hors bruit 4,4 % contre 5,6 % (−1,1 point).");
  // Jamais de position moyenne globale ni d'impressions brutes (annexe 2, B.2).
  assert(!h.some((p) => p.includes("Position moyenne")));
  assert(!h.some((p) => p.includes("9 819")));
  // Meilleure progression : « gratuit » gagne 3,5 places, « pré état daté » 1,4.
  assert(h.includes("« pré état daté gratuit » passe de la position 8,6 à 5,1 (3,5 places gagnées)."));
  assert(h.includes("1 requête entre dans le top 10 : « nouvelle requête »."));
  // Bing sans periode precedente : aucune phrase Bing.
  assert(!h.some((p) => p.includes("Bing")));
});

Deno.test("premiere periode mesuree : pas de comparaison", () => {
  const f = base();
  f.ventes.precedent = null;
  f.seo.google.precedent = null;
  f.seo.requetes_precedent = [];
  const h = calculerHighlights(f).map((x) => x.texte);
  assertEquals(h[0], "13 ventes en août 2026, première période mesurée.");
  assert(h.includes("523 clics Google, première période mesurée."));
  assert(!h.some((p) => p.includes("top 10")));
});

Deno.test("periode libre : pas de franchise, libelles de periode", () => {
  const f = base();
  f.libelle = "du 1er au 15 août 2026";
  f.libelle_precedent = "sur la période précédente";
  f.franchise = null;
  f.ventes = { periode: 6, precedent: 9 };
  const h = calculerHighlights(f).map((x) => x.texte);
  assertEquals(h[0], "6 ventes du 1er au 15 août 2026 contre 9 sur la période précédente (−3).");
  assert(!h.some((p) => p.includes("Seuil")));
});

Deno.test("quote-part quand le seuil est depasse", () => {
  const f = base();
  f.franchise = { seuil: 15, ventes: 18, partageables: 3, quote_part: 18.2 };
  const h = calculerHighlights(f).map((x) => x.texte);
  assertEquals(h[1], "3 ventes au-delà du seuil de 15 : quote-part de 18,20 €.");
});
