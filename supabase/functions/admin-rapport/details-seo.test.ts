import { assertEquals } from "jsr:@std/assert@1";
import { chemin, concentration, disputees, ecartMoteurs, horsSitemap, opportunites, rendement } from "./details-seo.ts";

const B = "https://pre-etat-date.ai";
const stat = (clics: number, impressions: number, position: number | null) => ({ clics, impressions, position });

Deno.test("chemin : domaine retire, accents decodes, barre finale et parametres retires", () => {
  assertEquals(chemin(`${B}/`), "/");
  assertEquals(chemin(`${B}/guide/x/`), "/guide/x");
  assertEquals(chemin(`${B}/guide/modele-pre-%C3%A9tat-dat%C3%A9`), "/guide/modele-pre-état-daté");
  assertEquals(chemin("https://www.pre-etat-date.ai/tarif?a=1"), "/tarif");
});

Deno.test("opportunites : page 1, assez d'impressions, presque pas de clics", () => {
  const r = opportunites([
    { requete: "pre etat date en ligne", page: `${B}/`, clics: 1, impressions: 831, position: 7.3 },
    { requete: "modèle pré-état daté", page: `${B}/guide/modele`, clics: 42, impressions: 138, position: 2 }, // cliquee
    { requete: "pré état daté", page: `${B}/`, clics: 0, impressions: 300, position: 40 }, // hors page 1
    { requete: "rare", page: `${B}/`, clics: 0, impressions: 12, position: 3 }, // trop peu vue
  ]);
  assertEquals(r.map((x) => x.requete), ["pre etat date en ligne"]);
  assertEquals(r[0].page, "/");
});

Deno.test("disputees : deux pages qui portent chacune une vraie part de la requete", () => {
  const r = disputees([
    { requete: "pré état daté en ligne", page: `${B}/comparatif`, clics: 12, impressions: 1392, position: 6.7 },
    { requete: "pré état daté en ligne", page: `${B}/`, clics: 6, impressions: 246, position: 20.3 }, // 14 % : pas une dispute
    { requete: "pre etat date en ligne", page: `${B}/`, clics: 1, impressions: 831, position: 7.3 },
    { requete: "pre etat date en ligne", page: `${B}/comparatif`, clics: 4, impressions: 570, position: 7.3 },
    { requete: "petite", page: `${B}/a`, clics: 0, impressions: 30, position: 5 },
    { requete: "petite", page: `${B}/b`, clics: 0, impressions: 30, position: 6 },
  ]);
  assertEquals(r.map((x) => x.requete), ["pre etat date en ligne"]);
  assertEquals(r[0].pages.map((p) => p.page), ["/", "/comparatif"]);
});

Deno.test("rendement : ventes pour 100 clics, muet sous vingt clics", () => {
  const google = new Map([["/guide/modele", stat(622, 2263, 2.8)], ["/", stat(40, 1645, 11.6)], ["/guide/rapide", stat(3, 107, 18)]]);
  const r = rendement([
    { page: "/guide/modele", dossiers: 60, payes: 6 },
    { page: "/", dossiers: 12, payes: 6 },
    { page: "/guide/rapide", dossiers: 2, payes: 1 },
  ], google);
  assertEquals(r.find((x) => x.page === "/guide/modele")?.ventes_pour_100_clics, 1);
  assertEquals(r.find((x) => x.page === "/")?.ventes_pour_100_clics, 15);
  assertEquals(r.find((x) => x.page === "/guide/rapide")?.ventes_pour_100_clics, null);
});

Deno.test("ecartMoteurs : haut sur Bing, loin sur Google", () => {
  const google = new Map([["/guide/obligatoire", stat(0, 115, 31.2)], ["/guide/modele", stat(622, 2263, 2.8)]]);
  const bing = new Map([["/guide/obligatoire", stat(30, 778, 5.1)], ["/guide/modele", stat(399, 2722, 3.3)]]);
  assertEquals(ecartMoteurs(google, bing).map((x) => x.page), ["/guide/obligatoire"]);
});

Deno.test("horsSitemap : adresses vues par Google que le sitemap ne connait pas", () => {
  const google = new Map([["/guide/modele", stat(622, 2263, 2.8)], ["/guide/modele-pre-état-daté", stat(9, 50, 2.5)], ["/vue-une-fois", stat(0, 1, 9)]]);
  assertEquals(horsSitemap(google, new Set(["/guide/modele"])).map((x) => x.page), ["/guide/modele-pre-état-daté"]);
  assertEquals(horsSitemap(google, new Set()), []); // sitemap illisible : on ne conclut rien
});

Deno.test("concentration : part des clics de la premiere page", () => {
  const c = concentration(new Map([["/guide/modele", stat(622, 1, 1)], ["/", stat(326, 1, 1)]]));
  assertEquals(c, { page: "/guide/modele", clics: 622, part: 0.656 });
  assertEquals(concentration(new Map()), null);
});
