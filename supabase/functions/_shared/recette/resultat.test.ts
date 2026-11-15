import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { exemples, resumer, type ResultatControle } from "./resultat.ts";

function r(p: Partial<ResultatControle>): ResultatControle {
  return {
    id: "x", famille: "recette", niveau: 1, vue: "baikal_dossiers", titre: "X",
    statut: "conforme", bloquant: false, ...p,
  };
}

Deno.test("trois exemples au plus, emails masqués, dates en ISO, compteur technique retiré", () => {
  const lignes = [
    { email: "jean@gmail.com", cree_le: new Date("2026-11-01T10:00:00Z"), __lignes: "5" },
    { email: "anne@gmail.com", cree_le: null, __lignes: "5" },
    { email: null, cree_le: null, __lignes: "5" },
    { email: "zoe@gmail.com", cree_le: null, __lignes: "5" },
  ];
  assertEquals(exemples(lignes), [
    { email: "j***@gmail.com", cree_le: "2026-11-01T10:00:00.000Z" },
    { email: "a***@gmail.com", cree_le: null },
    { email: null, cree_le: null },
  ]);
});

Deno.test("un texte long est tronqué, un objet aussi", () => {
  const [e] = exemples([{ libelle: "a".repeat(300), detail: { t: "b".repeat(300) } }]);
  assertEquals((e.libelle as string).length, 201);
  assertEquals(typeof e.detail, "string");
  assertEquals((e.detail as string).endsWith("…"), true);
});

Deno.test("le résumé compte par niveau ; un non mesuré n'est jamais conforme", () => {
  const s = resumer([
    r({ id: "a", statut: "conforme" }),
    r({ id: "b", statut: "non_mesure", bloquant: true }),
    r({ id: "c", statut: "absent", bloquant: false, niveau: 2 }),
    r({ id: "d", statut: "echec", bloquant: true, niveau: 2 }),
  ]);
  assertEquals(s.niveau1, { total: 2, conformes: 1, echecs: 0, absents: 0, non_mesures: 1, bloquants: 1 });
  assertEquals(s.niveau2, { total: 2, conformes: 0, echecs: 1, absents: 1, non_mesures: 0, bloquants: 1 });
  assertEquals(s.niveau1_pret, false);
  assertEquals(s.niveau2_pret, false);
});

Deno.test("niveau 1 prêt quand aucun contrôle bloquant n'y reste", () => {
  const s = resumer([
    r({ id: "a" }),
    r({ id: "c", statut: "absent", bloquant: false }),
  ]);
  assertEquals(s.niveau1_pret, true);
});
