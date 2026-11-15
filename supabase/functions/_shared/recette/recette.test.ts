// Le moteur de recette rejoué sur un lecteur factice : chaque test reproduit
// une panne déjà vue dans les contrats (docs/contrats/*.sql). Le lecteur
// répond par l'étiquette que le moteur pose en tête de chaque requête
// (`/* recette:<famille>:<clé> */`) ; le SQL lui-même est rejoué sur un vrai
// Postgres par recette.pg.test.ts.
//
//   deno test --allow-read supabase/functions/_shared/recette/
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { recetter, typeCompatible, type Lecteur, type Ligne } from "./controles.ts";
import type { Manifeste } from "./manifeste.ts";
import type { Rapport, ResultatControle } from "./resultat.ts";

const lire = async (nom: string) =>
  JSON.parse(await Deno.readTextFile(new URL(`../../../../docs/contrats/manifestes/${nom}`, import.meta.url))) as Manifeste;
const MANIFESTES = [await lire("dossiers-v1.json"), await lire("mesures-v1.json")];

const PG: Record<string, string> = {
  text: "text", int: "integer", numeric: "numeric", boolean: "boolean",
  timestamptz: "timestamp with time zone", date: "date", jsonb: "jsonb",
};

// La structure qu'un site conforme publierait : les vues obligatoires, plus
// celles qu'on nomme ; `sauf` retire des colonnes, `types` en change le type.
function structure(
  p: { vues?: string[]; sauf?: string[]; types?: Record<string, string>; noyauSeul?: boolean } = {},
): Ligne[] {
  const lignes: Ligne[] = [];
  for (const m of MANIFESTES) {
    for (const v of m.vues) {
      if (!v.obligatoire && !(p.vues ?? []).includes(v.nom)) continue;
      for (const c of v.colonnes) {
        const cle = `${v.nom}.${c.nom}`;
        if ((p.sauf ?? []).includes(cle)) continue;
        if (p.noyauSeul && !c.obligatoire) continue;
        lignes.push({ vue: v.nom, colonne: c.nom, type: p.types?.[cle] ?? PG[c.type] });
      }
    }
  }
  return lignes;
}

interface Scene {
  structure?: Ligne[];
  role?: boolean;
  utilisateur?: string;
  reponses?: Record<string, Ligne[] | Error>;
}

function faux(scene: Scene, journal: string[] = []): Lecteur {
  return (sql: string) => {
    const etiquette = /\/\* recette:(\S+) \*\//.exec(sql)?.[1];
    if (!etiquette) throw new Error(`requête sans étiquette : ${sql}`);
    journal.push(etiquette);
    if (etiquette === "structure") return Promise.resolve(scene.structure ?? structure());
    if (etiquette === "role") {
      return Promise.resolve([{ existe: scene.role ?? true, utilisateur: scene.utilisateur ?? "baikal_reader" }]);
    }
    const reponse = scene.reponses?.[etiquette];
    if (reponse instanceof Error) return Promise.reject(reponse);
    if (reponse) return Promise.resolve(reponse);
    return Promise.resolve(etiquette.startsWith("lecture:") ? [{ n: 12 }] : []);
  };
}

const FUNNEL = ["lead", "inscrit", "paye"];

function passer(scene: Scene, options: { funnel?: string[] | null; journal?: string[] } = {}): Promise<Rapport> {
  return recetter({
    lecteur: faux(scene, options.journal),
    manifestes: MANIFESTES,
    schema: "public",
    funnel: options.funnel === undefined ? FUNNEL : options.funnel,
  });
}

function un(rapport: Rapport, id: string): ResultatControle {
  const trouve = rapport.controles.find((c) => c.id === id);
  assert(trouve, `contrôle ${id} absent du rapport : ${rapport.controles.map((c) => c.id).join(", ")}`);
  return trouve;
}

Deno.test("un site conforme passe le niveau 1 sans un échec", async () => {
  const rapport = await passer({});
  assertEquals(rapport.controles.filter((c) => c.bloquant).map((c) => c.id), []);
  assertEquals(rapport.resume.niveau1_pret, true);
  assertEquals(rapport.resume.niveau1.echecs, 0);
  assertEquals(un(rapport, "forme.baikal_dossiers").statut, "conforme");
  assertEquals(un(rapport, "lecture.baikal_mesures").statut, "conforme");
  assertEquals(rapport.schema, "public");
  assertEquals(rapport.utilisateur, "baikal_reader");
});

Deno.test("une vue optionnelle non publiée est absente, jamais un échec", async () => {
  const rapport = await passer({});
  const events = un(rapport, "forme.baikal_dossier_events");
  assertEquals([events.statut, events.bloquant, events.niveau], ["absent", false, 2]);
  assertEquals(rapport.controles.some((c) => c.id === "lecture.baikal_dossier_events"), false);
});

Deno.test("une vue obligatoire absente bloque le niveau 1, ses contrôles sortent absents", async () => {
  const rapport = await passer({ structure: structure().filter((l) => l.vue !== "baikal_mesures") });
  const forme = un(rapport, "forme.baikal_mesures");
  assertEquals([forme.statut, forme.bloquant], ["absent", true]);
  assertEquals(un(rapport, "mesures.sans_doublon").statut, "absent");
  assertEquals(rapport.resume.niveau1_pret, false);
});

Deno.test("colonne obligatoire manquante et type faux : la forme échoue et dit lesquels", async () => {
  const rapport = await passer({
    structure: structure({
      sauf: ["baikal_dossiers.paye_le"],
      types: { "baikal_dossiers.cree_le": "timestamp without time zone", "baikal_dossiers.dossier_id": "uuid" },
    }),
  });
  const forme = un(rapport, "forme.baikal_dossiers");
  assertEquals([forme.statut, forme.bloquant, forme.lignes], ["echec", true, 3]);
  assertEquals(forme.exemples, [
    { colonne: "dossier_id", attendu: "text", trouve: "uuid" },
    { colonne: "cree_le", attendu: "timestamptz", trouve: "timestamp without time zone" },
    { colonne: "paye_le", attendu: "timestamptz", trouve: "absente" },
  ]);
  // Le contrôle qui a besoin de paye_le ne peut pas tourner : absent, pas conforme.
  assertEquals(un(rapport, "dossiers.montant_sans_paiement").statut, "absent");
});

Deno.test("un bloc optionnel non publié n'est pas un échec, et son contrôle est absent", async () => {
  const rapport = await passer({ structure: structure({ noyauSeul: true }) });
  assertEquals(un(rapport, "forme.baikal_dossiers").statut, "conforme");
  const attribution = un(rapport, "dossiers.attribution_jamais_vide");
  assertEquals([attribution.statut, attribution.bloquant], ["absent", false]);
});

Deno.test("types : familles admises", () => {
  assertEquals(typeCompatible("int", "bigint"), true);
  assertEquals(typeCompatible("numeric", "numeric(12,2)"), true);
  assertEquals(typeCompatible("numeric", "integer"), true);
  assertEquals(typeCompatible("text", "character varying(255)"), true);
  assertEquals(typeCompatible("timestamptz", "timestamp(3) with time zone"), true);
  assertEquals(typeCompatible("timestamptz", "timestamp without time zone"), false);
  assertEquals(typeCompatible("jsonb", "json"), false);
  assertEquals(typeCompatible("text", "uuid"), false);
});

Deno.test("panne : une table source sans policy baikal_read", async () => {
  const rapport = await passer({
    reponses: {
      "acces:baikal_dossiers": [
        { source: "public.email_logs", grant_ok: true, policy_ok: false, __lignes: 1 },
      ],
    },
  });
  const acces = un(rapport, "acces.baikal_dossiers");
  assertEquals([acces.statut, acces.bloquant, acces.lignes, acces.famille], ["echec", true, 1, "acces"]);
  assertEquals(acces.exemples, [{ source: "public.email_logs", grant_ok: true, policy_ok: false }]);
  assertEquals(rapport.resume.niveau1_pret, false);
});

Deno.test("panne : un stock publié sans ses zéros", async () => {
  const rapport = await passer({
    reponses: {
      "controle:mesures.stock_continu": [
        { cle: "abonnes_actifs", fenetre_jours: 7, jours_publies: 12, jours_attendus: 30, __lignes: 1 },
      ],
    },
  });
  const stock = un(rapport, "mesures.stock_continu");
  assertEquals([stock.statut, stock.lignes], ["echec", 1]);
  assert(stock.si_echec?.includes("dernière valeur non nulle"));
  assert(stock.correction?.includes("generate_series"));
});

Deno.test("panne : attribution {} — le nombre de lignes et trois exemples au plus", async () => {
  const ligne = (n: number) => ({ dossier_id: `d${n}`, attribution: {}, __lignes: "4" });
  const rapport = await passer({
    reponses: { "controle:dossiers.attribution_jamais_vide": [ligne(1), ligne(2), ligne(3)] },
  });
  const attribution = un(rapport, "dossiers.attribution_jamais_vide");
  assertEquals([attribution.statut, attribution.lignes, attribution.niveau], ["echec", 4, 2]);
  assertEquals(attribution.exemples?.length, 3);
  assertEquals(attribution.exemples?.[0], { dossier_id: "d1", attribution: "{}" });
  // Un échec de niveau 2 ne ferme pas le niveau 1.
  assertEquals(rapport.resume.niveau1_pret, true);
  assertEquals(rapport.resume.niveau2_pret, false);
});

Deno.test("panne : la catégorie change entre deux lignes d'une même personne — email masqué", async () => {
  const rapport = await passer({
    reponses: {
      "controle:dossiers.categorie_stable": [{ email: "jean.dupont@gmail.com", categories: 2, __lignes: 1 }],
    },
  });
  assertEquals(un(rapport, "dossiers.categorie_stable").exemples, [{ email: "j***@gmail.com", categories: 2 }]);
});

Deno.test("panne : un statut hors funnel", async () => {
  const rapport = await passer({
    reponses: {
      "controle:dossiers.statut_funnel": [
        { statut: "lead", lignes: 40 },
        { statut: "archive", lignes: 2 },
        { statut: "paye", lignes: 9 },
      ],
    },
  });
  const funnel = un(rapport, "dossiers.statut_funnel");
  assertEquals([funnel.statut, funnel.lignes], ["echec", 2]);
  assertEquals(funnel.exemples, [{ statut: "archive", lignes: 2 }]);
});

Deno.test("sans funnel déclaré, le contrôle du statut est absent et rend les valeurs trouvées", async () => {
  const rapport = await passer(
    { reponses: { "controle:dossiers.statut_funnel": [{ statut: "lead", lignes: 40 }, { statut: "paye", lignes: 9 }] } },
    { funnel: null },
  );
  const funnel = un(rapport, "dossiers.statut_funnel");
  assertEquals([funnel.statut, funnel.bloquant], ["absent", false]);
  assertEquals(funnel.exemples, [{ statut: "lead", lignes: 40 }, { statut: "paye", lignes: 9 }]);
});

Deno.test("panne : un montant sans paye_le", async () => {
  const rapport = await passer({
    reponses: {
      "controle:dossiers.montant_sans_paiement": [{ dossier_id: "d7", montant_ttc: "49.00", statut: "envoye", __lignes: 1 }],
    },
  });
  const montant = un(rapport, "dossiers.montant_sans_paiement");
  assertEquals([montant.statut, montant.lignes, montant.bloquant], ["echec", 1, true]);
  assert(montant.si_echec?.includes("non convertis"));
});

Deno.test("une requête trop lente sort non mesurée, jamais conforme", async () => {
  const lente = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
  const rapport = await passer({ reponses: { "controle:dossiers.identifiant_unique": lente } });
  const unique = un(rapport, "dossiers.identifiant_unique");
  assertEquals([unique.statut, unique.bloquant], ["non_mesure", true]);
  assert(unique.detail?.includes("trop lente"));
  assertEquals(rapport.resume.niveau1.non_mesures, 1);
  assertEquals(rapport.resume.niveau1_pret, false);
});

Deno.test("une requête en erreur sort non mesurée, avec le message de Postgres", async () => {
  const rapport = await passer({
    reponses: { "controle:mesures.complete": new Error('column "valeur" does not exist') },
  });
  const complete = un(rapport, "mesures.complete");
  assertEquals(complete.statut, "non_mesure");
  assert(complete.detail?.includes('column "valeur" does not exist'));
});

Deno.test("le rôle baikal_reader absent : échec, et aucun accès n'est mesuré", async () => {
  const journal: string[] = [];
  const rapport = await passer({ role: false, utilisateur: "postgres" }, { journal });
  assertEquals([un(rapport, "acces.role").statut, un(rapport, "acces.role").bloquant], ["echec", true]);
  assertEquals(un(rapport, "acces.baikal_dossiers").statut, "non_mesure");
  assertEquals(journal.some((e) => e.startsWith("acces:")), false);
});

Deno.test("lu sous un autre rôle que baikal_reader, la lecture effective n'est pas prouvée", async () => {
  const rapport = await passer({ utilisateur: "postgres" });
  const lecture = un(rapport, "lecture.baikal_dossiers");
  assertEquals(lecture.statut, "non_mesure");
  assert(lecture.detail?.includes("postgres"));
});

Deno.test("la lecture refusée à baikal_reader est un échec", async () => {
  const rapport = await passer({
    reponses: { "lecture:baikal_mesures": new Error("permission denied for view baikal_mesures") },
  });
  const lecture = un(rapport, "lecture.baikal_mesures");
  assertEquals([lecture.statut, lecture.bloquant], ["echec", true]);
  assert(lecture.detail?.includes("permission denied"));
});

Deno.test("une vue de la fiche qui cite un dossier inconnu échoue au niveau 2", async () => {
  const rapport = await passer({
    structure: structure({ vues: ["baikal_dossier_events"] }),
    reponses: { "controle:jointure.baikal_dossier_events": [{ dossier_id: "fantome", __lignes: 6 }] },
  });
  const jointure = un(rapport, "jointure.baikal_dossier_events");
  assertEquals([jointure.statut, jointure.lignes, jointure.niveau], ["echec", 6, 2]);
  assertEquals(un(rapport, "forme.baikal_dossier_events").statut, "conforme");
});

Deno.test("concordance : absente tant que l'autre vue n'est pas publiée", async () => {
  const rapport = await passer({});
  const concordance = un(rapport, "dossiers.categorie_comptes_pro");
  assertEquals([concordance.statut, concordance.bloquant, concordance.famille], ["absent", false, "concordance"]);
});

Deno.test("concordance : deux vues qui ne s'accordent pas ligne à ligne", async () => {
  const comptes = ["compte_id", "email", "categorie"].map((colonne) => ({ vue: "baikal_comptes_pro", colonne, type: "text" }));
  const rapport = await passer({
    structure: [...structure(), ...comptes],
    reponses: {
      "concordance:dossiers.categorie_comptes_pro": [
        { email: "agent@immo.fr", gauche: "agent_immo", droite: "inscrit", __lignes: 1 },
      ],
    },
  });
  const concordance = un(rapport, "dossiers.categorie_comptes_pro");
  assertEquals([concordance.statut, concordance.lignes], ["echec", 1]);
  assertEquals(concordance.exemples, [{ email: "a***@immo.fr", gauche: "agent_immo", droite: "inscrit" }]);
});

Deno.test("le budget de temps épuisé : le reste sort non mesuré, sans une requête de plus", async () => {
  const journal: string[] = [];
  let t = 0;
  const rapport = await recetter({
    lecteur: faux({}, journal),
    manifestes: MANIFESTES,
    schema: "public",
    funnel: FUNNEL,
    delaiTotalMs: 60_000,
    // Chaque lecture de l'horloge avance de 9 s : le budget tombe en cours de route.
    maintenant: () => (t += 9_000),
  });
  const nonMesures = rapport.controles.filter((c) => c.statut === "non_mesure");
  assert(nonMesures.length > 0);
  assert(nonMesures.every((c) => c.detail?.includes("60 s")));
  assert(journal.length < 10, `trop de requêtes : ${journal.length}`);
  assertEquals(rapport.resume.niveau1_pret, false);
});

Deno.test("le schéma est substitué dans chaque requête, et un nom douteux est refusé", async () => {
  const vues: string[] = [];
  const lecteur: Lecteur = (sql) => {
    vues.push(sql);
    return faux({})(sql);
  };
  await recetter({ lecteur, manifestes: MANIFESTES, schema: "pack_vendeur", funnel: null });
  assertEquals(vues.some((s) => s.includes("@SCHEMA@")), false);
  assert(vues.some((s) => s.includes("pack_vendeur.baikal_dossiers")));
  await assertRejects(
    () => recetter({ lecteur, manifestes: MANIFESTES, schema: "public; drop table x", funnel: null }),
    Error,
    "Schéma invalide",
  );
});
