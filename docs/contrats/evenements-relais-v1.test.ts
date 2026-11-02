import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estRobot, GESTES, lireLot } from "./evenements-relais-v1.ts";

const V = "2d49df67-6cf3-49cb-a413-8535c655836d";
const ligne = (sup: Record<string, unknown> = {}) => ({
  visiteur_id: V,
  geste: "clic",
  libelle: "Payer",
  page: "/pro/sourcing",
  detail: { cible: "/tarifs" },
  ...sup,
});
const lu = (corps: unknown, ua = "Mozilla/5.0") => lireLot(corps, ua) as { ok: true; lignes: unknown[]; rejetees: number };

Deno.test("treize gestes, dans l'ordre de la spec", () =>
  assertEquals(GESTES, [
    "page_vue", "clic", "recherche", "resultat_ouvert", "filtre", "formulaire_envoye",
    "fichier_telecharge", "media_lu", "partage", "paiement_initie", "erreur", "identification", "autre",
  ]));

Deno.test("un lot valide est lu, les champs absents prennent leur défaut", () =>
  assertEquals(lireLot({ lignes: [ligne()] }, "Mozilla/5.0"), {
    ok: true,
    rejetees: 0,
    lignes: [{
      visiteur_id: V, geste: "clic", libelle: "Payer", page: "/pro/sourcing",
      detail: { cible: "/tarifs" }, dossier_id: null, referent: null, est_test: false,
    }],
  }));

Deno.test("une ligne qui porte email est rejetée, l'autre passe", () => {
  const r = lu({ lignes: [ligne({ email: "a@b.fr" }), ligne()] });
  assertEquals([r.ok, r.rejetees, r.lignes.length], [true, 1, 1]);
});

Deno.test("identification n'est pas acceptée du navigateur", () =>
  assertEquals(lu({ lignes: [ligne({ geste: "identification" })] }).rejetees, 1));

Deno.test("geste inconnu, visiteur_id mal formé, page avec ? : rejetés", () => {
  assertEquals(lu({ lignes: [ligne({ geste: "inconnu" })] }).rejetees, 1);
  assertEquals(lu({ lignes: [ligne({ visiteur_id: "pas-un-uuid" })] }).rejetees, 1);
  assertEquals(lu({ lignes: [ligne({ page: "/x?y=1" })] }).rejetees, 1);
  assertEquals(lu({ lignes: [ligne({ page: "x" })] }).rejetees, 1);
});

Deno.test("51 lignes : motif trop", () =>
  assertEquals(lireLot({ lignes: Array.from({ length: 51 }, () => ligne()) }, "x"), { ok: false, motif: "trop" }));

Deno.test("corps qui n'est pas un objet à lignes : motif forme", () => {
  assertEquals(lireLot("n'importe quoi", "x"), { ok: false, motif: "forme" });
  assertEquals(lireLot({ lignes: "non" }, "x"), { ok: false, motif: "forme" });
  assertEquals(lireLot({ lignes: [] }, "x"), { ok: false, motif: "forme" });
});

Deno.test("robot : motif robot, avant toute lecture", () =>
  assertEquals(lireLot({ lignes: [ligne()] }, "Googlebot/2.1"), { ok: false, motif: "robot" }));

Deno.test("user-agent vide ou absent est un robot", () => {
  assertEquals(estRobot(""), true);
  assertEquals(estRobot(null), true);
  assertEquals(estRobot("Mozilla/5.0 (Windows NT 10.0) Chrome/130"), false);
});

Deno.test("detail : 21 clés rejeté, valeur objet rejetée, texte tronqué à 200", () => {
  const vingtEtUne = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
  assertEquals(lu({ lignes: [ligne({ detail: vingtEtUne })] }).rejetees, 1);
  assertEquals(lu({ lignes: [ligne({ detail: { a: { b: 1 } } })] }).rejetees, 1);
  const r = lu({ lignes: [ligne({ detail: { long: "x".repeat(300), n: 2, b: true, z: null } })] });
  assertEquals(r.rejetees, 0);
  assertEquals((r.lignes[0] as { detail: Record<string, unknown> }).detail, { long: "x".repeat(200), n: 2, b: true, z: null });
});

Deno.test("detail absent vaut {} ; libelle et referent tronqués à 200 ; page de 301 rejetée", () => {
  const r = lu({ lignes: [ligne({ detail: undefined, libelle: "y".repeat(300), referent: "z".repeat(300) })] });
  const l = r.lignes[0] as { detail: unknown; libelle: string; referent: string };
  assertEquals([l.detail, l.libelle.length, l.referent.length], [{}, 200, 200]);
  assertEquals(lu({ lignes: [ligne({ page: "/" + "p".repeat(300) })] }).rejetees, 1);
});

Deno.test("dossier_id et est_test sont lus", () => {
  const r = lu({ lignes: [ligne({ dossier_id: "D1", est_test: true })] });
  const l = r.lignes[0] as { dossier_id: string; est_test: boolean };
  assertEquals([l.dossier_id, l.est_test], ["D1", true]);
});
