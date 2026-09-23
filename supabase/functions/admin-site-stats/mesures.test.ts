import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembler, decalerJour, ligneValide, normaliserRequete } from "./mesures.ts";

const FIN = "2026-09-30";

function ligne(p: Partial<Parameters<typeof assembler>[0][number]>) {
  return {
    cle: "k",
    jour: FIN,
    valeur: 1,
    agregation: "somme",
    format: "nombre",
    libelle: "K",
    groupe: null,
    ordre: null,
    fenetre_jours: null,
    rendu: null as string | null,
    ...p,
  };
}

Deno.test("requete : chapitre hors vocabulaire refuse, fenetre bornee", () => {
  assertEquals(normaliserRequete({}), { chapitre: null, jours: 30 });
  assertEquals(normaliserRequete({ chapitre: "seo" }).chapitre, null);
  assertEquals(normaliserRequete({ chapitre: "comptes_pro" }).chapitre, "comptes_pro");
  assertEquals(normaliserRequete({ chapitre: "clients", jours: 7 }).jours, 7);
  assertEquals(normaliserRequete({ chapitre: "clients", jours: 45 }).jours, 30);
});

Deno.test("decalerJour franchit les mois et les annees", () => {
  assertEquals(decalerJour("2026-03-01", -1), "2026-02-28");
  assertEquals(decalerJour("2026-01-01", -1), "2025-12-31");
  assertEquals(decalerJour("2026-09-30", -29), "2026-09-01");
});

Deno.test("ligne incomplete ou hors vocabulaire : ecartee, pas fatale", () => {
  assertEquals(ligneValide(ligne({ libelle: "" })), false);
  assertEquals(ligneValide(ligne({ valeur: null as unknown as number })), false);
  assertEquals(ligneValide(ligne({ agregation: "moyenne" })), false);
  assertEquals(ligneValide(ligne({ format: "octets" })), false);
  assertEquals(ligneValide(ligne({ jour: "30/09/2026" })), false);

  const groupes = assembler(
    [ligne({ cle: "bonne" }), ligne({ cle: "bancale", libelle: "" })],
    FIN,
    7,
  );
  assertEquals(groupes.length, 1);
  assertEquals(groupes[0].tuiles.map((t) => t.cle), ["bonne"]);
});

Deno.test("flux : somme sur la fenetre, periode precedente sur la fenetre d'avant", () => {
  // Fenetre de 7 jours bornee a fin INCLUSE : du 24/09 au 30/09. La periode
  // precedente est les 7 jours d'avant, du 17/09 au 23/09.
  const lignes = [
    ligne({ jour: "2026-09-30", valeur: 3 }),
    ligne({ jour: "2026-09-25", valeur: 2 }),
    ligne({ jour: "2026-09-24", valeur: 10 }), // premier jour de la fenetre
    ligne({ jour: "2026-09-18", valeur: 5 }), // dans la precedente
    ligne({ jour: "2026-09-10", valeur: 99 }), // hors des deux
  ];
  const [g] = assembler(lignes, FIN, 7);
  const t = g.tuiles[0];
  assertEquals(t.valeur, 15);
  assertEquals(t.valeurPrecedente, 5);
  assertEquals(t.mesureLe, null);
  assertEquals(t.serie, [
    { jour: "2026-09-24", valeur: 10 },
    { jour: "2026-09-25", valeur: 2 },
    { jour: "2026-09-30", valeur: 3 },
  ]);
});

Deno.test("stock : derniere valeur connue, datee, sans borne de recul", () => {
  const lignes = [
    ligne({ agregation: "dernier", jour: "2026-08-01", valeur: 28 }),
  ];
  const [g] = assembler(lignes, FIN, 7);
  const t = g.tuiles[0];
  assertEquals(t.valeur, 28);
  assertEquals(t.mesureLe, "2026-08-01");
  // Une seule ligne, anterieure a la fenetre precedente : elle sert aussi de
  // reference, donc variation nulle plutot qu'inventee.
  assertEquals(t.valeurPrecedente, 28);
  assertEquals(t.serie, []);
});

Deno.test("stock : periode precedente = derniere ligne avant la fenetre, jamais zero", () => {
  const lignes = [
    ligne({ agregation: "dernier", jour: "2026-09-30", valeur: 12 }),
    ligne({ agregation: "dernier", jour: "2026-09-23", valeur: 9 }),
    ligne({ agregation: "dernier", jour: "2026-09-20", valeur: 4 }),
  ];
  const [g] = assembler(lignes, FIN, 7);
  const t = g.tuiles[0];
  assertEquals(t.valeur, 12);
  assertEquals(t.valeurPrecedente, 9); // au 23/09, fin moins 7 jours
});

Deno.test("stock sans anteriorite : pas de variation inventee", () => {
  const [g] = assembler(
    [ligne({ agregation: "dernier", jour: "2026-09-29", valeur: 3 })],
    FIN,
    7,
  );
  assertEquals(g.tuiles[0].valeurPrecedente, null);
});

Deno.test("une ligne du futur est ignoree", () => {
  const [g] = assembler(
    [
      ligne({ jour: "2026-09-30", valeur: 1 }),
      ligne({ jour: "2026-10-05", valeur: 100 }),
    ],
    FIN,
    7,
  );
  assertEquals(g.tuiles[0].valeur, 1);
});

Deno.test("metadonnees : la derniere ligne publiee fait foi", () => {
  const [g] = assembler(
    [
      ligne({ jour: "2026-09-01", libelle: "Ancien nom", groupe: "A", ordre: 9 }),
      ligne({ jour: "2026-09-30", libelle: "Nouveau nom", groupe: "B", ordre: 1 }),
    ],
    FIN,
    30,
  );
  assertEquals(g.groupe, "B");
  assertEquals(g.tuiles[0].libelle, "Nouveau nom");
});

Deno.test("groupes et tuiles ordonnes par ordre, NULL en dernier", () => {
  const groupes = assembler(
    [
      ligne({ cle: "z", groupe: "Ventes", ordre: 2 }),
      ligne({ cle: "a", groupe: "Ventes", ordre: 1 }),
      ligne({ cle: "sans_ordre", groupe: "Ventes", ordre: null }),
      ligne({ cle: "compte", groupe: "Comptes", ordre: 5 }),
    ],
    FIN,
    7,
  );
  assertEquals(groupes.map((g) => g.groupe), ["Ventes", "Comptes"]);
  assertEquals(groupes[0].tuiles.map((t) => t.cle), ["a", "z", "sans_ordre"]);
});

Deno.test("deux fenetres de la meme cle ne se melangent pas dans la serie", () => {
  // L'EF ne remonte que les lignes dont fenetre_jours vaut NULL ou la fenetre
  // demandee : ce test fige le fait qu'aucun repli n'est fait ici non plus.
  const [g] = assembler(
    [
      ligne({ cle: "distincts", agregation: "dernier", fenetre_jours: 7, jour: "2026-09-30", valeur: 3 }),
    ],
    FIN,
    7,
  );
  assertEquals(g.tuiles[0].fenetreJours, 7);
  assertEquals(g.tuiles[0].valeur, 3);
});

Deno.test("entonnoir : rendu declare partout, taux entre etapes consecutives", () => {
  const e = (cle: string, ordre: number, valeur: number) =>
    ligne({ cle, ordre, valeur, groupe: "Parcours", rendu: "entonnoir" });
  const [g] = assembler([e("ouverts", 2, 40), e("emails", 3, 10), e("payes", 4, 2)], FIN, 7);
  assertEquals(g.rendu, "entonnoir");
  assertEquals(g.tuiles.map((t) => t.cle), ["ouverts", "emails", "payes"]);
  assertEquals(g.tuiles.map((t) => t.tauxPassage), [null, 0.25, 0.2]);
});

Deno.test("entonnoir : une etape a zero ne produit pas de taux depuis zero", () => {
  const e = (cle: string, ordre: number, valeur: number) =>
    ligne({ cle, ordre, valeur, groupe: "Parcours", rendu: "entonnoir" });
  const [g] = assembler([e("emails", 1, 0), e("payes", 2, 0)], FIN, 7);
  assertEquals(g.tuiles[1].tauxPassage, null);
});

Deno.test("groupe panache : retombe sur des tuiles, sans taux", () => {
  const [g] = assembler(
    [
      ligne({ cle: "a", ordre: 1, groupe: "G", rendu: "entonnoir" }),
      ligne({ cle: "b", ordre: 2, groupe: "G", rendu: null }),
    ],
    FIN,
    7,
  );
  assertEquals(g.rendu, "tuiles");
  assertEquals(g.tuiles.every((t) => t.tauxPassage === undefined), true);
});

Deno.test("colonne rendu absente : tuiles", () => {
  const [g] = assembler([ligne({ cle: "a" }), ligne({ cle: "b" })], FIN, 7);
  assertEquals(g.rendu, "tuiles");
});
