// Ciblage d'une campagne : la SEULE source du WHERE. Le compteur et
// l'echantillon de la console, et le worker qui envoie, appellent tous
// requeteCandidats() : un filtre recopie ailleurs finit toujours par
// annoncer un nombre et en envoyer un autre.
//
// Une campagne vise une population, lue dans la vue contractuelle du site.
// Chaque filtre n'existe que si la colonne existe : la capacite se lit a la
// presence (docs/contrats/README.md).

export type Population = "prospects" | "clients" | "comptes";

export const POPULATIONS: Record<Population, {
  vue: string;
  id: string;
  libelle: string;
}> = {
  prospects: { vue: "baikal_prospects", id: "prospect_id", libelle: "Prospects" },
  clients: { vue: "baikal_dossiers", id: "dossier_id", libelle: "Clients" },
  comptes: { vue: "baikal_comptes_pro", id: "compte_id", libelle: "Comptes" },
};

export function estPopulation(x: unknown): x is Population {
  return typeof x === "string" && x in POPULATIONS;
}

export interface Criteres {
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
      ${o.campagneId
        ? s`AND NOT EXISTS (SELECT 1 FROM ${s(schema)}.mail_envoi e
                            WHERE e.campagne_id = ${o.campagneId}
                              AND e.email = lower(trim(v.email)))`
        : s``}
      ${c.exclureDejaEcrits
        ? s`AND NOT EXISTS (SELECT 1 FROM ${s(schema)}.mail_envoi e2
                            WHERE e2.email = lower(trim(v.email)) AND e2.envoye_le IS NOT NULL)`
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
