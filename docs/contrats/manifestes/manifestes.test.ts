// Parité manifeste ↔ contrat : chaque vue et chaque colonne citées dans un
// manifeste figurent dans le .sql du même contrat, et chaque contrôle ne
// requiert que des colonnes de sa vue. Les deux fichiers ne peuvent pas
// diverger sans que ce test le voie.
//
//   deno test --allow-read docs/contrats/manifestes/manifestes.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

interface Colonne { nom: string; type: string; obligatoire: boolean }
interface Vue { nom: string; obligatoire: boolean; niveau: number; colonnes: Colonne[] }
interface Controle { id: string; vue: string; niveau: number; requiert: string[]; sql: string; si_echec: string; correction: string }
interface Manifeste { contrat: string; source: string; vues: Vue[]; controles: Controle[]; concordances: { id: string }[] }

const TYPES = ["text", "int", "numeric", "boolean", "timestamptz", "date", "jsonb"];
const ici = new URL(".", import.meta.url);
const racine = new URL("../../../", import.meta.url);

function mot(nom: string): RegExp {
  return new RegExp(`(^|[^a-z0-9_])${nom}([^a-z0-9_]|$)`);
}

export function ecarts(m: Manifeste, sql: string): string[] {
  const sortie: string[] = [];
  const texte = sql.toLowerCase();
  const ids = new Set<string>();
  for (const v of m.vues) {
    if (!mot(v.nom).test(texte)) sortie.push(`vue ${v.nom} absente du contrat`);
    for (const c of v.colonnes) {
      if (!mot(c.nom).test(texte)) sortie.push(`colonne ${v.nom}.${c.nom} absente du contrat`);
      if (!TYPES.includes(c.type)) sortie.push(`type inconnu ${v.nom}.${c.nom}: ${c.type}`);
    }
  }
  for (const k of m.controles) {
    if (ids.has(k.id)) sortie.push(`identifiant en double ${k.id}`);
    ids.add(k.id);
    const vue = m.vues.find((v) => v.nom === k.vue);
    if (!vue) { sortie.push(`contrôle ${k.id} : vue ${k.vue} inconnue`); continue; }
    for (const r of k.requiert) {
      if (!vue.colonnes.some((c) => c.nom === r)) sortie.push(`contrôle ${k.id} : colonne ${r} hors de ${k.vue}`);
    }
    if (!k.sql.includes(`@SCHEMA@.${k.vue}`)) sortie.push(`contrôle ${k.id} : sa requête ne lit pas @SCHEMA@.${k.vue}`);
    if (!k.si_echec || !k.correction) sortie.push(`contrôle ${k.id} : phrase d'échec ou correction manquante`);
  }
  for (const c of m.concordances) {
    if (ids.has(c.id)) sortie.push(`identifiant en double ${c.id}`);
    ids.add(c.id);
  }
  return sortie;
}

async function charger(nom: string): Promise<{ m: Manifeste; sql: string }> {
  const m = JSON.parse(await Deno.readTextFile(new URL(nom, ici))) as Manifeste;
  const sql = await Deno.readTextFile(new URL(m.source, racine));
  return { m, sql };
}

Deno.test("le contrôle de parité voit une colonne inventée", async () => {
  const { m, sql } = await charger("dossiers-v1.json");
  const faux = structuredClone(m);
  faux.vues[0].colonnes.push({ nom: "colonne_inventee", type: "text", obligatoire: false });
  faux.controles[0].requiert.push("autre_inventee");
  assertEquals(ecarts(faux, sql), [
    "colonne baikal_dossiers.colonne_inventee absente du contrat",
    "contrôle dossiers.noyau_complet : colonne autre_inventee hors de baikal_dossiers",
  ]);
});

for (const nom of ["dossiers-v1.json", "mesures-v1.json"]) {
  Deno.test(`${nom} : chaque vue et chaque colonne figurent dans le contrat`, async () => {
    const { m, sql } = await charger(nom);
    assertEquals(ecarts(m, sql), []);
    assert(m.vues.some((v) => v.obligatoire), "au moins une vue obligatoire");
  });
}
