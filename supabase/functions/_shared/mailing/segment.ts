// Ciblage d'une campagne : la SEULE source du WHERE. Le compteur et
// l'echantillon de la console, et le worker qui envoie, appellent tous
// requeteCandidats() : un filtre recopie ailleurs finit toujours par
// annoncer un nombre et en envoyer un autre.
//
// Une campagne vise une population, lue dans la vue contractuelle du site.
// Chaque filtre n'existe que si la colonne existe : la capacite se lit a la
// presence (docs/contrats/README.md).

export type Population = "audience" | "prospects" | "clients" | "comptes";

// Entonnoir commun (Eric, 14/10/2026) : une adresse = une etape, la plus
// avancee. Contrat docs/contrats/audience-v1.sql.
export const ETAPES = ["a_conquerir", "lead", "engage", "client", "recurrent", "perdu"] as const;

export const POPULATIONS: Record<Population, {
  vue: string;
  id: string;
  libelle: string;
}> = {
  audience: { vue: "baikal_audience", id: "email", libelle: "Audience" },
  prospects: { vue: "baikal_prospects", id: "prospect_id", libelle: "Prospects" },
  clients: { vue: "baikal_dossiers", id: "dossier_id", libelle: "Clients" },
  comptes: { vue: "baikal_comptes_pro", id: "compte_id", libelle: "Comptes" },
};

export function estPopulation(x: unknown): x is Population {
  return typeof x === "string" && x in POPULATIONS;
}

export interface Criteres {
  // audience
  etapes: string[];
  profils: string[];
  // prospects
  metiers: string[];
  statuts: string[];
  departement: string;
  exclureClients: boolean;
  jamaisContactes: boolean;
  // clients
  paye: "tous" | "payes" | "non_payes";
  // clients + comptes
  categories: string[];
  // comptes
  actifs: boolean;
  // toutes : ne jamais reecrire une adresse deja servie par une campagne Baikal
  exclureDejaEcrits: boolean;
}

// Statuts de prospection qui ne recoivent JAMAIS de mail, quel que soit le
// filtre demande (module prospects-v1 : tous les envois du site les ecartent).
export const STATUTS_EXCLUS = ["refus", "desinscrit"];

// La presse n'est jamais une cible commerciale par defaut (CLAUDE.md, metier
// presse) : elle n'est ecrite que si on la coche explicitement.
export const METIERS_EXCLUS_PAR_DEFAUT = ["presse"];

function listeTextes(x: unknown, max = 50): string[] {
  if (!Array.isArray(x)) return [];
  return [...new Set(x.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim()))].slice(0, max);
}

export function normaliserCriteres(brut: unknown): Criteres {
  const b = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const dep = typeof b.departement === "string" ? b.departement.trim().toUpperCase() : "";
  return {
    etapes: listeTextes(b.etapes).filter((e) => (ETAPES as readonly string[]).includes(e)),
    profils: listeTextes(b.profils),
    metiers: listeTextes(b.metiers),
    statuts: listeTextes(b.statuts).filter((s) => !STATUTS_EXCLUS.includes(s)),
    departement: /^(\d{2,3}|2[AB])$/.test(dep) ? dep : "",
    exclureClients: b.exclureClients !== false,
    jamaisContactes: b.jamaisContactes === true,
    paye: b.paye === "payes" || b.paye === "non_payes" ? b.paye : "tous",
    categories: listeTextes(b.categories),
    actifs: b.actifs !== false,
    exclureDejaEcrits: b.exclureDejaEcrits === true,
  };
}

// Expression SQL du nom affiche dans {{nom}} (alias v), selon les colonnes
// presentes. Constantes uniquement : elle est injectee telle quelle.
export function colonneNom(population: Population, colonnes: Set<string>): string | null {
  if (population === "audience") return colonnes.has("nom") ? "v.nom" : null;
  if (population === "prospects") return colonnes.has("nom_affiche") ? "v.nom_affiche" : null;
  if (population === "clients") return colonnes.has("contact_nom") ? "v.contact_nom" : null;
  if (colonnes.has("contact_nom") && colonnes.has("raison_sociale")) {
    return "coalesce(v.contact_nom, v.raison_sociale)";
  }
  if (colonnes.has("raison_sociale")) return "v.raison_sociale";
  return colonnes.has("contact_nom") ? "v.contact_nom" : null;
}

// deno-lint-ignore no-explicit-any
type Sql = any;

export interface OptionsRequete {
  schema: string;
  population: Population;
  colonnes: Set<string>;
  criteres: Criteres;
  // Campagne en cours d'envoi : ses adresses deja reservees sont ecartees.
  campagneId?: string;
  // Sequence (lot 3) : le mail vise. Rang 1 = ceux qui n'ont encore rien
  // recu de la campagne (et entres dans leur etape depuis delaiJours) ;
  // rang k = ceux qui ont recu le mail k-1 il y a delaiJours au moins et pas
  // encore le mail k. La cible reste appliquee a chaque mail : changer
  // d'etape ou se desinscrire fait sortir de la sequence, sans autre regle.
  touche?: { rang: number; delaiJours: number };
  // Entonnoir : montrer aussi les profils exclus par defaut (presse), pour
  // qu'on puisse les cocher explicitement.
  sansExclusionParDefaut?: boolean;
}

// Fragment WHERE commun (alias v sur la vue de population).
function fragmentWhere(sql: Sql, o: OptionsRequete) {
  const { schema, population, colonnes: col, criteres: c } = o;
  const s = sql;
  const departement = /^2[AB]$/.test(c.departement) ? "20" : c.departement;
  const metiersExclus = METIERS_EXCLUS_PAR_DEFAUT.filter((m) => !c.metiers.includes(m));
  return s`
    WHERE v.email IS NOT NULL AND trim(v.email) <> ''
      AND NOT EXISTS (SELECT 1 FROM ${s(schema)}.baikal_mail_optout o
                      WHERE o.email = lower(trim(v.email)))
      ${col.has("est_test") ? s`AND v.est_test IS NOT TRUE` : s``}
      ${col.has("supprime_le") ? s`AND v.supprime_le IS NULL` : s``}
      ${o.campagneId && (o.touche?.rang ?? 1) > 1
        ? s`AND EXISTS (SELECT 1 FROM ${s(schema)}.mail_envoi e
                        WHERE e.campagne_id = ${o.campagneId}
                          AND e.email = lower(trim(v.email))
                          AND e.touche = ${o.touche!.rang - 1}
                          AND e.envoye_le IS NOT NULL
                          AND e.statut NOT IN ('erreur', 'rebond', 'plainte')
                          AND e.envoye_le <= now() - make_interval(days => ${o.touche!.delaiJours}))
            AND NOT EXISTS (SELECT 1 FROM ${s(schema)}.mail_envoi e
                            WHERE e.campagne_id = ${o.campagneId}
                              AND e.email = lower(trim(v.email))
                              AND e.touche = ${o.touche!.rang})`
        : o.campagneId
        ? s`AND NOT EXISTS (SELECT 1 FROM ${s(schema)}.mail_envoi e
                            WHERE e.campagne_id = ${o.campagneId}
                              AND e.email = lower(trim(v.email)))`
        : s``}
      ${o.touche && o.touche.rang === 1 && o.touche.delaiJours > 0 && col.has("etape_depuis")
        ? s`AND v.etape_depuis <= now() - make_interval(days => ${o.touche.delaiJours})`
        : s``}
      ${c.exclureDejaEcrits
        ? s`AND NOT EXISTS (SELECT 1 FROM ${s(schema)}.mail_envoi e2
                            WHERE e2.email = lower(trim(v.email)) AND e2.envoye_le IS NOT NULL
                              ${o.campagneId ? s`AND e2.campagne_id <> ${o.campagneId}` : s``})`
        : s``}
      ${population === "prospects" ? s`
        ${col.has("statut") ? s`AND v.statut <> ALL(${STATUTS_EXCLUS})` : s``}
        ${c.metiers.length > 0 && col.has("metier") ? s`AND v.metier = ANY(${c.metiers})` : s``}
        ${metiersExclus.length > 0 && col.has("metier") ? s`AND v.metier <> ALL(${metiersExclus})` : s``}
        ${c.statuts.length > 0 && col.has("statut") ? s`AND v.statut = ANY(${c.statuts})` : s``}
        ${departement && col.has("code_postal")
          ? s`AND left(v.code_postal, ${departement.length}) = ${departement}` : s``}
        ${c.exclureClients && col.has("client_depuis") ? s`AND v.client_depuis IS NULL` : s``}
        ${c.jamaisContactes && col.has("dernier_contact_le") ? s`AND v.dernier_contact_le IS NULL` : s``}
      ` : s``}
      ${population === "audience" ? s`
        ${c.etapes.length > 0 ? s`AND v.etape = ANY(${c.etapes})` : s``}
        ${c.profils.length > 0 && col.has("profil") ? s`AND v.profil = ANY(${c.profils})` : s``}
        ${!o.sansExclusionParDefaut && col.has("profil") && METIERS_EXCLUS_PAR_DEFAUT.filter((m) => !c.profils.includes(m)).length > 0
          ? s`AND v.profil <> ALL(${METIERS_EXCLUS_PAR_DEFAUT.filter((m) => !c.profils.includes(m))})` : s``}
        ${departement && col.has("code_postal")
          ? s`AND left(v.code_postal, ${departement.length}) = ${departement}` : s``}
      ` : s``}
      ${population === "clients" ? s`
        ${c.paye === "payes" && col.has("paye_le") ? s`AND v.paye_le IS NOT NULL` : s``}
        ${c.paye === "non_payes" && col.has("paye_le") ? s`AND v.paye_le IS NULL` : s``}
      ` : s``}
      ${population === "comptes" ? s`
        ${c.actifs && col.has("actif") ? s`AND v.actif IS TRUE` : s``}
      ` : s``}
      ${population !== "prospects" && c.categories.length > 0 && col.has("categorie")
        ? s`AND v.categorie = ANY(${c.categories})` : s``}`;
}

// Nombre d'adresses distinctes ciblees.
export async function compterCandidats(sql: Sql, o: OptionsRequete): Promise<number> {
  const vue = POPULATIONS[o.population].vue;
  const [r] = await sql`
    SELECT count(DISTINCT lower(trim(v.email)))::int AS n
    FROM ${sql(o.schema)}.${sql(vue)} v
    ${fragmentWhere(sql, o)}`;
  return Number(r?.n ?? 0);
}

export interface Candidat {
  email: string;
  destinataire_id: string | null;
  nom: string | null;
  commune: string | null;
}

// Une ligne par adresse (la premiere par ordre d'adresse : deterministe, donc
// deux lots successifs ne se recouvrent jamais).
export async function requeteCandidats(
  sql: Sql,
  o: OptionsRequete,
  limite: number,
): Promise<Candidat[]> {
  const { vue, id } = POPULATIONS[o.population];
  const nom = colonneNom(o.population, o.colonnes);
  const rows = await sql`
    SELECT DISTINCT ON (lower(trim(v.email)))
           lower(trim(v.email)) AS email,
           ${o.colonnes.has(id) ? sql`v.${sql(id)}::text` : sql`NULL::text`} AS destinataire_id,
           ${nom ? sql.unsafe(nom) : sql`NULL::text`} AS nom,
           ${o.colonnes.has("commune") ? sql`v.commune` : sql`NULL::text`} AS commune
    FROM ${sql(o.schema)}.${sql(vue)} v
    ${fragmentWhere(sql, o)}
    ORDER BY lower(trim(v.email))
    LIMIT ${limite}`;
  return rows as Candidat[];
}

// Variables ({{nom}}, {{commune}}) d'adresses deja reservees : un lot
// interrompu est rejoue avec les memes valeurs que s'il etait parti.
export async function relireDestinataires(
  sql: Sql,
  schema: string,
  population: Population,
  colonnes: Set<string>,
  emails: string[],
): Promise<Candidat[]> {
  if (emails.length === 0) return [];
  const { vue, id } = POPULATIONS[population];
  const nom = colonneNom(population, colonnes);
  return await sql`
    SELECT DISTINCT ON (lower(trim(v.email)))
           lower(trim(v.email)) AS email,
           ${colonnes.has(id) ? sql`v.${sql(id)}::text` : sql`NULL::text`} AS destinataire_id,
           ${nom ? sql.unsafe(nom) : sql`NULL::text`} AS nom,
           ${colonnes.has("commune") ? sql`v.commune` : sql`NULL::text`} AS commune
    FROM ${sql(schema)}.${sql(vue)} v
    WHERE lower(trim(v.email)) = ANY(${emails})
    ORDER BY lower(trim(v.email))` as Candidat[];
}

// L'entonnoir de la cible : effectif par etape et par profil, sous les MEMES
// exclusions que l'envoi (optout, tests, deja ecrits), mais sans le filtre
// d'etape/profil lui-meme (semantique de facette, comme les chips de
// /prospect) — sinon cliquer une etape ecraserait les cinq autres a zero.
export async function entonnoir(
  sql: Sql,
  o: OptionsRequete,
): Promise<{ etape: string; profil: string | null; n: number }[]> {
  const sansFacettes = { ...o, criteres: { ...o.criteres, etapes: [], profils: [] }, sansExclusionParDefaut: true };
  return await sql`
    SELECT v.etape, ${o.colonnes.has("profil") ? sql`v.profil` : sql`NULL::text`} AS profil,
           count(DISTINCT lower(trim(v.email)))::int AS n
    FROM ${sql(o.schema)}.baikal_audience v
    ${fragmentWhere(sql, sansFacettes)}
    GROUP BY 1, 2`;
}

// ------ Sequences ------

export interface Relance {
  delai_jours: number;
  objet: string;
  corps_html: string;
}

export const RELANCES_MAX = 5;

// Relances telles que l'editeur les envoie : delai entier de 0 a 90 jours,
// au plus cinq. Le contenu est nettoye par l'appelant (nettoyerCorps).
export function normaliserRelances(brut: unknown): Relance[] {
  return (Array.isArray(brut) ? brut : []).slice(0, RELANCES_MAX).map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const d = Math.round(Number(o.delai_jours));
    return {
      delai_jours: Number.isFinite(d) ? Math.min(90, Math.max(0, d)) : 3,
      objet: String(o.objet ?? ""),
      corps_html: String(o.corps_html ?? ""),
    };
  });
}

// Les mails d'une campagne dans l'ordre ou le worker les sert : les relances
// d'abord, de la derniere a la premiere (finir les sequences en cours avant
// d'en ouvrir de nouvelles), puis le mail 1.
export function ordreDeService(
  campagne: { objet: string; corps_html: string; relances?: unknown },
): { rang: number; delaiJours: number; objet: string; corps_html: string }[] {
  const relances = normaliserRelances(campagne.relances);
  const mails = [
    { rang: 1, delaiJours: 0, objet: campagne.objet, corps_html: campagne.corps_html },
    ...relances.map((r, i) => ({ rang: i + 2, delaiJours: r.delai_jours, objet: r.objet, corps_html: r.corps_html })),
  ];
  return mails.reverse();
}
