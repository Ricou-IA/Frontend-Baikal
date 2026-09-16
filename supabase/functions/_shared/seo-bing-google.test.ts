import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  comparerRequetes,
  dernierMoisComplet,
  ecartsPosition,
  serieMensuelle,
} from "./seo-bing-google.ts";

Deno.test("serieMensuelle — Google = somme des lignes du mois, Bing = somme des jours, mois sans Bing = null", () => {
  const google = [
    { period_start: "2026-08-01", clicks: 300, impressions: 5000 },
    { period_start: "2026-08-01", clicks: 200, impressions: 4000 },
    { period_start: "2026-08-01", clicks: 23, impressions: 819 },
    { period_start: "2026-09-01", clicks: 217, impressions: 4140 },
  ];
  const bing = [
    { period_start: "2026-08-03", clicks: 100 },
    { period_start: "2026-08-20", clicks: 37 },
  ];
  assertEquals(serieMensuelle(google, bing, "2026-09"), [
    {
      mois: "2026-08-01",
      google: 523,
      impressionsGoogle: 9819,
      bing: 137,
      partBingPct: 21,
      enCours: false,
    },
    {
      mois: "2026-09-01",
      google: 217,
      impressionsGoogle: 4140,
      bing: null,
      partBingPct: null,
      enCours: true,
    },
  ]);
});

Deno.test("serieMensuelle — un mois Bing sans Google reste visible, trie chronologique", () => {
  const serie = serieMensuelle(
    [{ period_start: "2026-04-01", clicks: 10, impressions: 100 }],
    [{ period_start: "2026-03-05", clicks: 4 }],
    "2026-09",
  );
  assertEquals(serie.map((m) => m.mois), ["2026-03-01", "2026-04-01"]);
  assertEquals(serie[0].google, 0);
  assertEquals(serie[0].bing, 4);
  assertEquals(serie[0].partBingPct, 100);
});

Deno.test("dernierMoisComplet — le mois en cours est ecarte, repli sur le plus recent", () => {
  assertEquals(dernierMoisComplet(["2026-09-01", "2026-07-01", "2026-08-01"], "2026-09"), "2026-08-01");
  assertEquals(dernierMoisComplet(["2026-09-01"], "2026-09"), "2026-09-01");
  assertEquals(dernierMoisComplet([], "2026-09"), null);
});

const bing = [
  { key: "pré état daté", clicks: 40, impressions: 200, position: 2.1 },
  { key: "Diagnostic Copro", clicks: 5, impressions: 60, position: 3 },
  { key: "requete bing seule", clicks: 1, impressions: 10, position: 8 },
];
const google = [
  { key: "pré état daté", clicks: 150, impressions: 2000, position: 4.6 },
  { key: "diagnostic copro", clicks: 12, impressions: 900, position: 9.4 },
  { key: "requete google seule", clicks: 30, impressions: 400, position: 5 },
  { key: "sans position", clicks: 0, impressions: 3, position: null },
];

Deno.test("comparerRequetes — union des deux moteurs, jointure insensible a la casse, tri par clics cumules", () => {
  const lignes = comparerRequetes(bing, google);
  assertEquals(lignes.map((l) => l.requete), [
    "pré état daté",
    "requete google seule",
    "diagnostic copro",
    "requete bing seule",
    "sans position",
  ]);
  assertEquals(lignes[0], {
    requete: "pré état daté",
    clicksGoogle: 150,
    impressionsGoogle: 2000,
    positionGoogle: 4.6,
    clicksBing: 40,
    impressionsBing: 200,
    positionBing: 2.1,
    delta: 2.5,
  });
  // Absent d'un moteur : null, jamais 0 (0 voudrait dire « vu, aucun clic »).
  assertEquals(lignes[1].clicksBing, null);
  assertEquals(lignes[1].positionBing, null);
  assertEquals(lignes[1].delta, null);
  assertEquals(lignes[3].clicksGoogle, null);
  // Le libelle Google (minuscules) prime quand les deux existent.
  assertEquals(lignes[2].requete, "diagnostic copro");
  assertEquals(lignes[2].delta, 6.4);
});

Deno.test("comparerRequetes — limite respectee", () => {
  assertEquals(comparerRequetes(bing, google, 2).length, 2);
});

Deno.test("ecartsPosition — seules les requetes ou Bing classe >= seuil rangs mieux, du plus grand ecart au plus petit", () => {
  const ecarts = ecartsPosition(bing, google, 5, 15);
  assertEquals(ecarts, [{
    requete: "diagnostic copro",
    positionBing: 3,
    positionGoogle: 9.4,
    delta: 6.4,
    clicksBing: 5,
    clicksGoogle: 12,
  }]);
});
