// Le diagnostic de structure : « ce que Baikal voit dans votre base », à
// partir de la liste des tables et des colonnes seulement — aucune donnée lue.
//
// PUR, et sans modèle d'IA : les règles de repérage sont écrites en clair
// (noms de colonnes et types), donc même entrée, même diagnostic. La structure
// vient d'où l'on veut : du catalogue Postgres (sqlCatalogue + lireCatalogue)
// ou des types fournis par Supabase.
import type { Ligne } from "./resultat.ts";

export interface Colonne {
  nom: string;
  type: string;
  // Valeurs admises quand la base les déclare (enum, contrainte check).
  valeurs: string[] | null;
}

export interface Table {
  schema: string;
  nom: string;
  genre: "table" | "vue";
  // Estimation du catalogue (reltuples) ; null = jamais analysée, ou vue.
  lignes: number | null;
  colonnes: Colonne[];
}

export type Nature = "email" | "statut" | "creation" | "paiement" | "montant" | "stripe" | "origine" | "test" | "suppression";

export interface Repere {
  nature: Nature;
  schema: string;
  table: string;
  colonne: string;
  type: string;
  valeurs: string[] | null;
}

export interface Phrase {
  cle: string;
  phrase: string;
}

export interface Diagnostic {
  compte: { tables: number; vues: number; colonnes: number };
  reperes: Repere[];
  table_principale: { schema: string; nom: string } | null;
  funnel_propose: string[] | null;
  vues_baikal: { schema: string; nom: string; contrat: string | null }[];
  // Schéma où le site publie déjà ses vues Baikal ; null = aucune.
  schema_contrat: string | null;
  manques: Phrase[];
  affichable: Phrase[];
}

// ---------------------------------------------------------------------------
// Lecture du catalogue
// ---------------------------------------------------------------------------

// Au-delà, le catalogue est coupé : à l’appelant de le dire, jamais en silence.
export const LIMITE_CATALOGUE = 8000;

// Une ligne par colonne. Les schémas de la plateforme (Supabase, extensions)
// sont écartés : ils ne disent rien du produit. `schemas` restreint la lecture
// (base partagée entre plusieurs produits) ; il entre dans le texte de la
// requête, donc il ne passe que s’il a la forme d’un identifiant.
export function sqlCatalogue(schemas?: string[]): string {
  for (const nom of schemas ?? []) {
    if (!/^[a-z_][a-z0-9_]*$/.test(nom)) throw new Error(`Schéma invalide : ${nom}`);
  }
  const filtre = schemas?.length ? `
  and n.nspname in (${schemas.map((n) => `'${n}'`).join(", ")})` : "";
  return `/* recette:catalogue */
select n.nspname as schema, c.relname as nom,
       case when c.relkind in ('r', 'p') then 'table' else 'vue' end as genre,
       c.reltuples::bigint as lignes,
       a.attname as colonne, format_type(a.atttypid, a.atttypmod) as type, a.attnum as rang,
       (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = a.atttypid) as valeurs,
       (select array_agg(pg_get_constraintdef(k.oid))
          from pg_constraint k
         where k.conrelid = c.oid and k.contype = 'c' and k.conkey = array[a.attnum]) as checks
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relkind in ('r', 'p', 'v', 'm')
  and n.nspname not like 'pg\\_%'
  and n.nspname not in ('information_schema', 'auth', 'storage', 'realtime', 'vault', 'extensions',
                        'graphql', 'graphql_public', 'pgbouncer', 'supabase_functions',
                        'supabase_migrations', 'net', 'cron', 'pgsodium', 'pgsodium_masks', 'pgmq',
                        '_realtime', '_analytics', 'topology', 'tiger')${filtre}
order by n.nspname, c.relname, a.attnum
limit ${LIMITE_CATALOGUE}`;
}

// Les valeurs d'une contrainte « colonne = ANY (ARRAY[…]) » ou « IN (…) ».
export function valeursDeCheck(definition: string): string[] | null {
  if (!/= ANY|\bIN\b/i.test(definition)) return null;
  const valeurs = [...definition.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"));
  return valeurs.length ? valeurs : null;
}

export function lireCatalogue(lignes: Ligne[]): Table[] {
  const tables = new Map<string, Table>();
  for (const l of lignes) {
    const cle = `${l.schema}.${l.nom}`;
    if (!tables.has(cle)) {
      const estimation = Number(l.lignes);
      tables.set(cle, {
        schema: String(l.schema),
        nom: String(l.nom),
        genre: l.genre === "table" ? "table" : "vue",
        lignes: l.genre === "table" && Number.isFinite(estimation) && estimation >= 0 ? estimation : null,
        colonnes: [],
      });
    }
    const enumeration = Array.isArray(l.valeurs) && l.valeurs.length ? l.valeurs.map(String) : null;
    const check = Array.isArray(l.checks)
      ? l.checks.map((d) => valeursDeCheck(String(d))).find((v) => v !== null) ?? null
      : null;
    tables.get(cle)!.colonnes.push({ nom: String(l.colonne), type: String(l.type), valeurs: enumeration ?? check });
  }
  return [...tables.values()];
}

// ---------------------------------------------------------------------------
// Les règles de repérage : un nom ET un type
// ---------------------------------------------------------------------------

const TEXTE = /^(text|character varying|character|citext)(\(\d+\))?$/;
const DATE = /^(timestamp(\(\d\))? (with|without) time zone|date)$/;
const NOMBRE = /^(numeric(\(\d+(,\d+)?\))?|smallint|integer|bigint|real|double precision|money)$/;

const REGLES: { nature: Nature; nom: RegExp; type: (c: Colonne) => boolean }[] = [
  { nature: "email", nom: /(^|_)(e_?mail|courriel)(_address|_adresse)?$/, type: (c) => TEXTE.test(c.type) },
  {
    nature: "statut",
    nom: /^(status|statut|state|etat|stage|etape|step|funnel_\w+|\w+_(status|statut|state|etat|stage))$/,
    type: (c) => TEXTE.test(c.type) || c.valeurs !== null,
  },
  {
    nature: "creation",
    nom: /^(created_at|created_on|created|createdat|cree_le|date_creation|creation_date|inserted_at)$/,
    type: (c) => DATE.test(c.type),
  },
  {
    nature: "paiement",
    nom: /(^|_)(paid|paye|payee|purchased|achete|achat|payment|paiement)(_|$)/,
    type: (c) => DATE.test(c.type),
  },
  { nature: "montant", nom: /(^|_)(amount|montant|price|prix|total)(_|$)/, type: (c) => NOMBRE.test(c.type) },
  { nature: "stripe", nom: /stripe|payment_intent|checkout_session/, type: (c) => TEXTE.test(c.type) },
  {
    nature: "origine",
    nom: /^(utm_\w+|gclid|referrer|referer|referrer_\w+|landing_page|attribution|acquisition|acquisition_\w+|first_touch\w*)$/,
    type: () => true,
  },
  { nature: "test", nom: /^(is_test|est_test|test|is_demo|is_sandbox|test_mode)$/, type: (c) => c.type === "boolean" },
  { nature: "suppression", nom: /^(deleted_at|supprime_le|archived_at)$/, type: (c) => DATE.test(c.type) },
];

function nature(colonne: Colonne): Nature | null {
  const nom = colonne.nom.toLowerCase();
  return REGLES.find((r) => r.nom.test(nom) && r.type(colonne))?.nature ?? null;
}

const STATUT_EXACT = /^(status|statut|state|etat|stage|etape)$/;

// Ce qui fait d'une table « celle qui porte l'acte commercial ».
const POIDS: Partial<Record<Nature, number>> = { email: 3, paiement: 3, statut: 2, stripe: 2, montant: 1, creation: 1 };

const CONTRATS: [RegExp, string][] = [
  [/^baikal_dossiers$|^baikal_dossier_/, "dossiers-v1"],
  [/^baikal_mesures$/, "mesures-v1"],
  [/^baikal_comptes_pro$/, "comptes-pro-v1"],
  [/^baikal_compte_historique$/, "comptes-historique-v1"],
  [/^baikal_prospects$/, "prospects-v1"],
  [/^baikal_audience$/, "audience-v1"],
  [/^baikal_mail_stats$/, "mail-stats-v1"],
  [/^baikal_mail_optout$/, "mailing-v1"],
  [/^baikal_evenements$/, "evenements-v1"],
];

const parNom = (a: { schema: string; nom: string }, b: { schema: string; nom: string }) =>
  a.schema.localeCompare(b.schema) || a.nom.localeCompare(b.nom);

export interface OptionsDiagnostic {
  // Le rôle baikal_reader existe-t-il ? Inconnu (porte Supabase) : on n'en dit rien.
  role?: boolean;
}

export function diagnostiquer(entree: Table[], options: OptionsDiagnostic = {}): Diagnostic {
  const toutes = [...entree].sort(parNom);
  const vuesBaikal = toutes.filter((t) => t.nom.startsWith("baikal_"));
  const tables = toutes.filter((t) => t.genre === "table" && !t.nom.startsWith("baikal_"));

  const reperes: Repere[] = [];
  for (const t of tables) {
    for (const c of t.colonnes) {
      const n = nature(c);
      if (n) reperes.push({ nature: n, schema: t.schema, table: t.nom, colonne: c.nom, type: c.type, valeurs: c.valeurs });
    }
  }
  const a = (n: Nature) => reperes.some((r) => r.nature === n);

  // La table principale : le meilleur score, à condition de porter un email ou
  // un paiement ; à égalité, la plus peuplée, puis l'ordre des noms.
  const scores = tables.map((t) => {
    const natures = new Set(reperes.filter((r) => r.schema === t.schema && r.table === t.nom).map((r) => r.nature));
    const score = [...natures].reduce((s, n) => s + (POIDS[n] ?? 0), 0);
    return { t, score, eligible: natures.has("email") || natures.has("paiement") };
  }).filter((s) => s.eligible)
    .sort((x, y) => y.score - x.score || (y.t.lignes ?? 0) - (x.t.lignes ?? 0) || parNom(x.t, y.t));
  const principale = scores[0]?.t ?? null;
  const cible = principale ? `${principale.schema}.${principale.nom}` : null;

  // Le funnel : un statut aux valeurs déclarées, de la table principale
  // d’abord, et la colonne nommée « status » avant « dpe_validity_status ».
  const statuts = reperes.filter((r) => r.nature === "statut" && r.valeurs);
  const dePrincipale = statuts.filter((r) => principale && r.schema === principale.schema && r.table === principale.nom);
  const exact = (r: Repere) => STATUT_EXACT.test(r.colonne.toLowerCase());
  const statutPrincipal = dePrincipale.find(exact) ?? dePrincipale[0] ?? statuts.find(exact) ?? statuts[0] ?? null;

  const publiee = (nom: string) => vuesBaikal.some((v) => v.nom === nom);
  const manques: Phrase[] = [];
  if (options.role === false) {
    manques.push({
      cle: "role",
      phrase: "Le rôle baikal_reader n'existe pas encore : c'est sous ce rôle, en lecture seule, que Baikal lit votre base.",
    });
  }
  if (!publiee("baikal_dossiers")) {
    manques.push({
      cle: "baikal_dossiers",
      phrase: "La vue baikal_dossiers n'existe pas encore : c'est elle qui ouvre le chapitre Clients." +
        (cible ? ` Elle se construira sur ${cible}.` : ""),
    });
  }
  if (!publiee("baikal_mesures")) {
    manques.push({
      cle: "baikal_mesures",
      phrase: "La vue baikal_mesures n'existe pas encore : sans elle, pas de tuiles en tête des chapitres.",
    });
  }
  // Une fois baikal_dossiers publiée, le site a déjà dit où vivent ses
  // adresses et ses paiements : ce ne sont plus des manques.
  if (!publiee("baikal_dossiers") && !a("email")) {
    manques.push({
      cle: "email",
      phrase: "Aucune colonne d'email repérée : il faudra dire à votre agent où vivent les adresses de vos clients.",
    });
  }
  if (!publiee("baikal_dossiers") && !a("paiement")) {
    manques.push({
      cle: "paiement",
      phrase: "Aucune date de paiement repérée : Baikal compte un client payant à sa date de paiement, il faudra la dériver (Stripe, table de commandes).",
    });
  }

  const affichable: Phrase[] = [];
  if (a("email")) {
    affichable.push({ cle: "clients", phrase: "La liste de vos clients, avec leur date d'arrivée et leur fiche." });
  }
  if (a("paiement")) {
    affichable.push({
      cle: "paiements",
      phrase: a("montant") ? "Qui a payé, quand et combien." : "Qui a payé, et quand.",
    });
  }
  if (statutPrincipal?.valeurs) {
    affichable.push({
      cle: "funnel",
      phrase: `Un funnel en ${statutPrincipal.valeurs.length} étapes : ${statutPrincipal.valeurs.join(" → ")}.`,
    });
  }
  if (a("stripe")) {
    affichable.push({ cle: "stripe", phrase: "Le rapprochement de chaque vente avec Stripe (module Finances)." });
  }
  if (a("origine")) {
    affichable.push({ cle: "origine", phrase: "D'où viennent vos clients : le canal d'origine de chaque vente." });
  }
  if (a("paiement")) {
    affichable.push({ cle: "tuiles", phrase: "Des tuiles en tête de chapitre : ventes par jour, clients payants sur 7, 30 et 90 jours." });
  }

  const dossiers = vuesBaikal.find((v) => v.nom === "baikal_dossiers");
  return {
    compte: {
      tables: tables.length,
      vues: toutes.length - tables.length,
      colonnes: toutes.reduce((s, t) => s + t.colonnes.length, 0),
    },
    reperes,
    table_principale: principale ? { schema: principale.schema, nom: principale.nom } : null,
    funnel_propose: statutPrincipal?.valeurs ?? null,
    vues_baikal: vuesBaikal.map((v) => ({
      schema: v.schema,
      nom: v.nom,
      contrat: CONTRATS.find(([motif]) => motif.test(v.nom))?.[1] ?? null,
    })),
    schema_contrat: (dossiers ?? vuesBaikal[0])?.schema ?? null,
    manques,
    affichable,
  };
}
