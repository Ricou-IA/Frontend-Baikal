import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { grouperChamps } from "./champs.ts";

Deno.test("groupe par section, sections triees par ordre_section", () => {
  const sections = grouperChamps([
    { section: "BIEN", ordre_section: 2, libelle: "Ville", ordre: 2, valeur: "Lyon" },
    { section: "ACHETEUR", ordre_section: 1, libelle: "Email", ordre: 1, valeur: "a@b.fr" },
    { section: "BIEN", ordre_section: 2, libelle: "Adresse", ordre: 1, valeur: "12 rue X" },
  ]);
  assertEquals(sections.map((s) => s.section), ["ACHETEUR", "BIEN"]);
  assertEquals(sections[1].champs.map((c) => c.libelle), ["Adresse", "Ville"]);
});

Deno.test("ordre_section absent -> section rejetee en fin, ordre alphabetique", () => {
  const sections = grouperChamps([
    { section: "ZZZ", libelle: "a", valeur: "1" },
    { section: "AAA", libelle: "b", valeur: "2" },
    { section: "PREMIERE", ordre_section: 1, libelle: "c", valeur: "3" },
  ]);
  assertEquals(sections.map((s) => s.section), ["PREMIERE", "AAA", "ZZZ"]);
});

Deno.test("format inconnu ou absent -> texte", () => {
  const [s] = grouperChamps([
    { section: "A", libelle: "x", valeur: "1", format: "hieroglyphe" },
    { section: "A", libelle: "y", valeur: "2" },
  ]);
  assertEquals(s.champs.map((c) => c.format), ["texte", "texte"]);
});

Deno.test("format connu conserve", () => {
  const [s] = grouperChamps([{ section: "A", libelle: "x", valeur: "12", format: "euro" }]);
  assertEquals(s.champs[0].format, "euro");
});

// La liste fermee doit porter les ONZE formats que le front sait rendre : un
// format absent d'ici est silencieusement retrograde en "texte", et la valeur
// s'affiche brute (un cout d'appel IA lu tel que "0.00310000").
Deno.test("les onze formats du contrat traversent la liste fermee", () => {
  const attendus = [
    "texte",
    "euro",
    "dollar",
    "date",
    "datetime",
    "pourcent",
    "nombre",
    "octets",
    "booleen",
    "lien",
    "mono",
  ];
  const [s] = grouperChamps(
    attendus.map((format, i) => ({ section: "A", libelle: `c${i}`, valeur: "1", format })),
  );
  assertEquals(s.champs.map((c) => c.format), attendus);
});

Deno.test("niveau hors liste -> null", () => {
  const [s] = grouperChamps([
    { section: "A", libelle: "x", valeur: "1", niveau: "panique" },
    { section: "A", libelle: "y", valeur: "2", niveau: "attention" },
  ]);
  assertEquals(s.champs.map((c) => c.niveau), [null, "attention"]);
});

Deno.test("ligne sans libelle ignoree", () => {
  assertEquals(grouperChamps([{ section: "A", valeur: "1" }]), []);
});

Deno.test("section absente -> section sans titre, en tete", () => {
  const sections = grouperChamps([
    { libelle: "orphelin", valeur: "1" },
    { section: "B", ordre_section: 1, libelle: "range", valeur: "2" },
  ]);
  assertEquals(sections.map((s) => s.section), ["", "B"]);
});

Deno.test("valeur nulle conservee (le front affiche un tiret)", () => {
  const [s] = grouperChamps([{ section: "A", libelle: "x", valeur: null }]);
  assertEquals(s.champs[0].valeur, null);
});

Deno.test("liste vide -> aucune section", () => {
  assertEquals(grouperChamps([]), []);
});

Deno.test("ordre_section null explicite est traite comme absent", () => {
  const sections = grouperChamps([
    { section: "NULLE", ordre_section: null, libelle: "a", valeur: "1" },
    { section: "PREMIERE", ordre_section: 1, libelle: "b", valeur: "2" },
  ]);
  assertEquals(sections.map((s) => s.section), ["PREMIERE", "NULLE"]);
});

Deno.test("ordre null explicite est traite comme absent", () => {
  const [s] = grouperChamps([
    { section: "A", libelle: "sans ordre", ordre: null, valeur: "1" },
    { section: "A", libelle: "avec ordre", ordre: 1, valeur: "2" },
  ]);
  assertEquals(s.champs.map((c) => c.libelle), ["avec ordre", "sans ordre"]);
});

Deno.test("les trois categories de section coexistent dans le bon ordre", () => {
  const sections = grouperChamps([
    { section: "ZZZ", libelle: "a", valeur: "1" },
    { section: "PREMIERE", ordre_section: 1, libelle: "b", valeur: "2" },
    { libelle: "orphelin", valeur: "3" },
    { section: "AAA", libelle: "c", valeur: "4" },
  ]);
  assertEquals(sections.map((s) => s.section), ["", "PREMIERE", "AAA", "ZZZ"]);
});
