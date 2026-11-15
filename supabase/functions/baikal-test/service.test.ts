// baikal-test de bout en bout, sans réseau ni base : la connexion, le DNS, le
// dépôt et l'horloge sont passés en paramètre. Ce que la fonction publique
// refuse, ce qu'elle garde, et ce qu'elle ne garde jamais.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Deps, type LigneTest, traiter } from "./service.ts";
import { jetonValide, limiteur } from "./garde.ts";
import { MANIFESTES } from "../_shared/recette/contrats.gen.ts";
import { LIMITE_CATALOGUE } from "../_shared/recette/structure.ts";
import type { Lecteur, Ligne } from "../_shared/recette/controles.ts";

const PG: Record<string, string> = {
  text: "text", int: "integer", numeric: "numeric", boolean: "boolean",
  timestamptz: "timestamp with time zone", date: "date", jsonb: "jsonb",
};
const OBLIGATOIRES = MANIFESTES.flatMap((m) => m.vues.filter((v) => v.obligatoire));

// Un site conforme : ses deux vues obligatoires dans `public`, vues par le
// catalogue (diagnostic) et par la structure (recette).
const CATALOGUE: Ligne[] = OBLIGATOIRES.flatMap((v) =>
  v.colonnes.map((c, i) => ({
    schema: "public", nom: v.nom, genre: "vue", lignes: "-1", colonne: c.nom, type: PG[c.type], rang: i + 1,
    valeurs: null, checks: null,
  }))
);
const STRUCTURE: Ligne[] = OBLIGATOIRES.flatMap((v) => v.colonnes.map((c) => ({ vue: v.nom, colonne: c.nom, type: PG[c.type] })));

const CONNEXION = "postgresql://baikal_reader:s3cret@db.exemple.com:6543/app";
const T0 = Date.parse("2026-11-15T10:00:00Z");
const JOUR = 86_400_000;

interface Monde {
  deps: Deps;
  lignes: Map<string, LigneTest>;
  ouvertures: number;
  fermetures: number;
  requetes: string[];
}

function monde(p: { catalogue?: Ligne[]; structure?: Ligne[]; panne?: Error; ips?: string[] | Error; horloge?: () => number } = {}): Monde {
  const m: Monde = { deps: null as unknown as Deps, lignes: new Map(), ouvertures: 0, fermetures: 0, requetes: [] };
  const lecteur: Lecteur = (sql) => {
    const etiquette = /\/\* recette:(\S+) \*\//.exec(sql)?.[1] ?? "?";
    m.requetes.push(etiquette);
    if (p.panne) return Promise.reject(p.panne);
    if (etiquette === "catalogue") return Promise.resolve(p.catalogue ?? CATALOGUE);
    if (etiquette === "structure") return Promise.resolve(p.structure ?? STRUCTURE);
    if (etiquette === "role") return Promise.resolve([{ existe: true, utilisateur: "baikal_reader" }]);
    return Promise.resolve(etiquette.startsWith("lecture:") ? [{ n: 3 }] : []);
  };
  m.deps = {
    ouvrir: () => {
      m.ouvertures++;
      return Promise.resolve({ lecteur, fermer: () => { m.fermetures++; return Promise.resolve(); } });
    },
    resoudre: () => p.ips instanceof Error ? Promise.reject(p.ips) : Promise.resolve(p.ips ?? ["51.15.20.30"]),
    depot: {
      lire: (jeton) => Promise.resolve(m.lignes.get(jeton) ?? null),
      ecrire: (ligne) => { m.lignes.set(ligne.jeton, structuredClone(ligne)); return Promise.resolve(); },
    },
    trop: limiteur(10, 3_600_000),
    maintenant: p.horloge ?? (() => T0),
    sel: "sel-de-test",
    site: "https://withbaikal.io",
  };
  return m;
}

// deno-lint-ignore no-explicit-any
type Donnees = any;
const appel = async (m: Monde, corps: Record<string, unknown>, ip = "1.2.3.4") => {
  const r = await traiter(corps, ip, m.deps);
  return { ...r, data: r.data as Donnees };
};

Deno.test("le piège à robots répond OK sans rien ouvrir", async () => {
  const m = monde();
  const r = await appel(m, { action: "tester", connexion: CONNEXION, site_web: "http://spam" });
  assertEquals([r.statut, r.error, m.ouvertures, m.lignes.size], [200, null, 0, 0]);
});

Deno.test("une action inconnue est refusée", async () => {
  const r = await appel(monde(), { action: "effacer" });
  assertEquals(r.statut, 400);
});

Deno.test("le onzième test de l'heure depuis la même adresse est refusé, sans connexion", async () => {
  const m = monde();
  for (let i = 0; i < 10; i++) assertEquals((await appel(m, { action: "diagnostiquer", connexion: CONNEXION })).statut, 200);
  const r = await appel(m, { action: "diagnostiquer", connexion: CONNEXION });
  assertEquals([r.statut, m.ouvertures], [429, 10]);
  assertEquals((await appel(m, { action: "diagnostiquer", connexion: CONNEXION }, "9.9.9.9")).statut, 200);
});

Deno.test("une connexion qui n'est pas Postgres est refusée avant toute ouverture", async () => {
  const m = monde();
  const r = await appel(m, { action: "diagnostiquer", connexion: "mysql://u:p@db.exemple.com/app" });
  assertEquals([r.statut, m.ouvertures], [400, 0]);
  assert(r.error!.includes("Postgres"));
});

Deno.test("un nom public qui résout vers une adresse privée est refusé avant toute ouverture", async () => {
  const m = monde({ ips: ["51.15.20.30", "10.0.0.7"] });
  const r = await appel(m, { action: "tester", connexion: CONNEXION });
  assertEquals([r.statut, m.ouvertures], [400, 0]);
  const introuvable = monde({ ips: new Error("getaddrinfo ENOTFOUND db.exemple.com") });
  const r2 = await appel(introuvable, { action: "tester", connexion: CONNEXION });
  assertEquals([r2.statut, introuvable.ouvertures], [400, 0]);
  assertEquals(r2.error!.includes("exemple"), false);
});

Deno.test("diagnostiquer : le diagnostic, un jeton, le prompt — et la connexion nulle part", async () => {
  const m = monde();
  const r = await appel(m, { action: "diagnostiquer", connexion: CONNEXION });
  assertEquals([r.statut, r.error], [200, null]);
  assertEquals(jetonValide(r.data.jeton), true);
  assertEquals(r.data.diagnostic.vues_baikal.map((v: { nom: string }) => v.nom), ["baikal_dossiers", "baikal_mesures"]);
  assertEquals(r.data.rapport, null);
  assertEquals(r.data.tronque, false);
  assert(r.data.prompt.includes(`https://withbaikal.io/tester/r/${r.data.jeton}`));
  assertEquals(r.data.expire_le, new Date(T0 + 30 * JOUR).toISOString());

  const ligne = m.lignes.get(r.data.jeton)!;
  assertEquals([ligne.tests, ligne.resultat, ligne.niveau1_pret, ligne.teste_le], [0, null, null, null]);
  assertEquals(/^[0-9a-f]{64}$/.test(ligne.hote_empreinte), true);
  // Ni la ligne gardée ni la réponse ne portent l'hôte, l'utilisateur ou le mot de passe.
  const tout = JSON.stringify(ligne) + JSON.stringify(r.data);
  for (const fuite of ["s3cret", "db.exemple.com", "6543/app"]) assertEquals(tout.includes(fuite), false, fuite);
  assertEquals([m.ouvertures, m.fermetures], [1, 1]);
  // Le diagnostic ne lit que le catalogue : aucune requête de recette.
  assertEquals(m.requetes, ["catalogue", "role"]);
});

Deno.test("tester : la recette passe, le résultat est gardé sous le jeton", async () => {
  const m = monde();
  const r = await appel(m, { action: "tester", connexion: CONNEXION });
  assertEquals(r.statut, 200);
  assertEquals(r.data.rapport.resume.niveau1_pret, true);
  assertEquals(r.data.rapport.schema, "public");
  const ligne = m.lignes.get(r.data.jeton)!;
  assertEquals([ligne.tests, ligne.niveau1_pret, ligne.teste_le], [1, true, new Date(T0).toISOString()]);
  assertEquals(ligne.resultat?.resume.niveau1_pret, true);
  assertEquals([m.ouvertures, m.fermetures], [1, 1]);
});

Deno.test("le même jeton sert d'un passage à l'autre ; un diagnostic ne perd pas le dernier résultat", async () => {
  const m = monde();
  const premier = await appel(m, { action: "tester", connexion: CONNEXION });
  const jeton = premier.data.jeton;
  const second = await appel(m, { action: "tester", connexion: CONNEXION, jeton });
  assertEquals(second.data.jeton, jeton);
  assertEquals(m.lignes.get(jeton)!.tests, 2);
  const diagnostic = await appel(m, { action: "diagnostiquer", connexion: CONNEXION, jeton });
  assertEquals(diagnostic.data.jeton, jeton);
  assertEquals(diagnostic.data.rapport.resume.niveau1_pret, true);
  assertEquals(m.lignes.size, 1);
});

Deno.test("le jeton tiré par la page est adopté : le test de l'agent s'y range ; mal formé, un nouveau est tiré", async () => {
  const m = monde();
  const deLaPage = "0123456789abcdef0123456789abcdef";
  // Rien n'existe encore sous ce jeton : le lien privé ne rend rien.
  assertEquals((await appel(m, { action: "resultat", jeton: deLaPage })).statut, 404);
  const r = await appel(m, { action: "tester", connexion: CONNEXION, jeton: deLaPage });
  assertEquals(r.data.jeton, deLaPage);
  // La page, qui attendait, retrouve le résultat sous SON jeton.
  const relu = await appel(m, { action: "resultat", jeton: deLaPage });
  assertEquals([relu.statut, relu.data.rapport.resume.niveau1_pret], [200, true]);
  const r2 = await appel(m, { action: "diagnostiquer", connexion: CONNEXION, jeton: "../../etc" });
  assert(r2.data.jeton !== "../../etc" && jetonValide(r2.data.jeton));
});

Deno.test("réponse courte, pour un agent : le lien, le verdict, ce qu'il reste à corriger — pas le prompt", async () => {
  const m = monde();
  const r = await appel(m, { action: "tester", connexion: CONNEXION, reponse: "courte" });
  assertEquals(r.statut, 200);
  assertEquals(r.data.lien, `https://withbaikal.io/tester/r/${r.data.jeton}`);
  assertEquals([r.data.niveau1_pret, r.data.niveau2_pret], [true, r.data.resume.niveau2_pret]);
  assertEquals(r.data.a_corriger, []);
  assertEquals(r.data.diagnostic.vues_baikal, ["public.baikal_dossiers", "public.baikal_mesures"]);
  assertEquals("prompt" in r.data, false);
  assertEquals("rapport" in r.data, false);
  assert(JSON.stringify(r.data).length < 4000, "la réponse courte reste courte");
  // La ligne gardée, elle, est entière : la page affichera tout le rapport.
  assertEquals(m.lignes.get(r.data.jeton)!.resultat?.controles.length! > 5, true);

  // Un site auquel il manque une vue : l'agent lit quoi corriger, avec la correction.
  const incomplet = monde({
    catalogue: CATALOGUE.filter((l) => l.nom !== "baikal_mesures"),
    structure: STRUCTURE.filter((l) => l.vue !== "baikal_mesures"),
  });
  const k = await appel(incomplet, { action: "tester", connexion: CONNEXION, reponse: "courte" });
  assertEquals(k.data.niveau1_pret, false);
  assert(k.data.a_corriger.length > 0);
  assert(k.data.a_corriger.every((c: { id: string; titre: string }) => c.id && c.titre));
  for (const fuite of ["s3cret", "db.exemple.com", "6543/app"]) assertEquals(JSON.stringify(k.data).includes(fuite), false, fuite);
});

Deno.test("le passage dit où il en est, étape par étape, sans rien qui identifie la base", async () => {
  const m = monde();
  const etapes: string[] = [];
  m.deps.trace = (e) => etapes.push(e);
  await appel(m, { action: "tester", connexion: CONNEXION });
  assertEquals(etapes, [
    "résolution du nom", "connexion à la base", "lecture de la structure", "diagnostic", "contrôles",
    "fermeture de la connexion", "enregistrement du résultat", "réponse",
  ]);
  for (const fuite of ["s3cret", "db.exemple.com", "baikal_reader"]) assertEquals(etapes.join(" ").includes(fuite), false, fuite);
  // Une base qui lâche pendant la lecture : la dernière étape dite est la bonne.
  const panne = monde({ panne: Object.assign(new Error("boom"), { code: "ECONNREFUSED" }) });
  const vues: string[] = [];
  panne.deps.trace = (e) => vues.push(e);
  await appel(panne, { action: "diagnostiquer", connexion: CONNEXION });
  assertEquals(vues.at(-2), "lecture de la structure");
});

Deno.test("une base qui ne répond pas : erreur sobre, connexion refermée, rien de gardé", async () => {
  const panne = Object.assign(new Error('password authentication failed for user "baikal_reader" at db.exemple.com'), { code: "28P01" });
  const m = monde({ panne });
  const r = await appel(m, { action: "tester", connexion: CONNEXION });
  assertEquals([r.statut, m.fermetures, m.lignes.size], [502, 1, 0]);
  assert(r.error!.includes("mot de passe incorrect"));
  for (const fuite of ["exemple", "baikal_reader", "s3cret"]) assertEquals(r.error!.includes(fuite), false);
});

Deno.test("un catalogue coupé au plafond est signalé, jamais passé sous silence", async () => {
  const gros = Array.from({ length: LIMITE_CATALOGUE }, (_, i) => ({
    schema: "public", nom: `t${Math.floor(i / 10)}`, genre: "table", lignes: "1", colonne: `c${i % 10}`, type: "text",
    rang: (i % 10) + 1, valeurs: null, checks: null,
  }));
  const r = await appel(monde({ catalogue: gros }), { action: "diagnostiquer", connexion: CONNEXION });
  assertEquals(r.data.tronque, true);
});

Deno.test("resultat : le lien privé rend le dernier passage, sans connexion", async () => {
  const m = monde();
  const { data } = await appel(m, { action: "tester", connexion: CONNEXION });
  const avant = m.ouvertures;
  const r = await appel(m, { action: "resultat", jeton: data.jeton });
  assertEquals([r.statut, m.ouvertures], [200, avant]);
  assertEquals(r.data.rapport, data.rapport);
  assertEquals(r.data.diagnostic, data.diagnostic);
  assert(r.data.prompt.includes(`/tester/r/${data.jeton}`));
  assertEquals(r.data.teste_le, new Date(T0).toISOString());
});

Deno.test("resultat : jeton mal formé 400, inconnu 404, expiré 404", async () => {
  let maintenant = T0;
  const m = monde({ horloge: () => maintenant });
  assertEquals((await appel(m, { action: "resultat", jeton: "abc" })).statut, 400);
  assertEquals((await appel(m, { action: "resultat", jeton: "0123456789abcdef0123456789abcdef" })).statut, 404);
  const { data } = await appel(m, { action: "tester", connexion: CONNEXION });
  maintenant = T0 + 31 * JOUR;
  assertEquals((await appel(m, { action: "resultat", jeton: data.jeton })).statut, 404);
  // Un jeton expiré ne se réutilise pas non plus pour un nouveau test.
  const neuf = await appel(m, { action: "tester", connexion: CONNEXION, jeton: data.jeton });
  assert(neuf.data.jeton !== data.jeton);
});
