// Le moteur de recette : il confronte ce qu'un site publie (ses vues
// baikal_*) aux manifestes de contrat, et rend un statut par contrôle.
//
// PUR : aucune connexion ici. La lecture est passée en paramètre (`lecteur`),
// ce qui rend le module testable sur un lecteur factice et réutilisable par la
// fonction en ligne comme par le futur mode hors ligne. Le moteur ne fait que
// LIRE : des SELECT sur les vues du site et sur le catalogue.
//
// Quatre familles :
//   forme        la vue est là, ses colonnes et leurs types sont ceux du contrat
//   recette      les requêtes du contrat, qui doivent rendre zéro ligne
//   acces        le rôle baikal_reader existe, chaque table source a son grant
//                et sa policy, la lecture passe sous ce rôle
//   concordance  une donnée présente dans deux vues s'accorde ligne à ligne
//
// Chaque requête porte une étiquette en tête (`/* recette:<famille>:<clé> */`) :
// elle se retrouve dans les journaux du site, et le lecteur factice des tests
// répond par elle.
import type { ConcordanceContrat, ControleContrat, Manifeste, TypeContrat, VueContrat } from "./manifeste.ts";
import { exemples, type Ligne, type Rapport, type ResultatControle, resumer } from "./resultat.ts";

export type { Ligne } from "./resultat.ts";
export type Lecteur = (sql: string) => Promise<Ligne[]>;

export const ROLE = "baikal_reader";

export interface OptionsRecette {
  lecteur: Lecteur;
  manifestes: Manifeste[];
  // Schéma où le site publie ses vues (`public` sur un projet dédié).
  schema: string;
  // Slugs du funnel déclaré ; null = pas de funnel, le statut reste libre.
  funnel: string[] | null;
  // Budget de tout le test. Dépassé, le reste sort non mesuré.
  delaiTotalMs?: number;
  maintenant?: () => number;
}

const FAMILLES: Record<TypeContrat, RegExp> = {
  text: /^(text|character varying|character|"char"|name|citext)(\(\d+\))?$/,
  int: /^(smallint|integer|bigint)$/,
  numeric: /^(numeric(\(\d+(,\d+)?\))?|smallint|integer|bigint|real|double precision)$/,
  boolean: /^boolean$/,
  timestamptz: /^timestamp(\(\d\))? with time zone$/,
  date: /^date$/,
  jsonb: /^jsonb$/,
};

export function typeCompatible(attendu: TypeContrat, trouve: string): boolean {
  return FAMILLES[attendu].test(trouve.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Les requêtes de catalogue
// ---------------------------------------------------------------------------

function sqlStructure(schema: string): string {
  return `/* recette:structure */
select c.relname as vue, a.attname as colonne, format_type(a.atttypid, a.atttypmod) as type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where n.nspname = '${schema}' and c.relkind in ('v', 'm', 'r', 'p', 'f') and c.relname like 'baikal\\_%'
order by c.relname, a.attnum`;
}

const SQL_ROLE = `/* recette:role */
select exists (select 1 from pg_roles where rolname = '${ROLE}') as existe, current_user as utilisateur`;

// Les sources d'une vue se lisent dans le catalogue (mesures-v1 §3 (5)), en
// descendant dans les vues qu'elle lit : une table qui entre dans la vue six
// mois plus tard n'a aucune chance d'être repérée à la main. Une vue
// matérialisée arrête la descente : ses données sont stockées chez elle.
// Rend les sources FAUTIVES, la vue elle-même comprise.
function sqlAcces(schema: string, vue: string): string {
  return `with recursive sources as (
  select c.oid, c.relkind, c.relrowsecurity as rls
  from pg_class c where c.oid = '${schema}.${vue}'::regclass
  union
  select c.oid, c.relkind, c.relrowsecurity
  from sources s
  join pg_rewrite r on r.ev_class = s.oid
  join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
  join pg_class c on c.oid = d.refobjid
  join pg_namespace n on n.oid = c.relnamespace
  where s.relkind = 'v' and c.oid <> s.oid and c.relkind in ('r', 'v', 'm', 'p', 'f')
    and n.nspname not in ('pg_catalog', 'information_schema')
), bilan as (
  select n.nspname || '.' || c.relname as source,
         has_table_privilege('${ROLE}', s.oid, 'SELECT') as grant_ok,
         (not s.rls or exists (
            select 1 from pg_policy p
            where p.polrelid = s.oid and p.polcmd in ('r', '*')
              and (0 = any (p.polroles)
                   or (select oid from pg_roles where rolname = '${ROLE}') = any (p.polroles))
         )) as policy_ok
  from sources s
  join pg_class c on c.oid = s.oid
  join pg_namespace n on n.oid = c.relnamespace
)
select source, grant_ok, policy_ok from bilan where not grant_ok or not policy_ok order by source`;
}

// Une requête de contrôle rend les lignes fautives ; on en garde trois et le
// compte total, en un seul aller-retour.
function fautives(etiquette: string, sql: string): string {
  return `/* recette:${etiquette} */\nselect t.*, count(*) over () as __lignes from (\n${sql}\n) t limit 3`;
}

// ---------------------------------------------------------------------------
// L'exécution : une erreur n'arrête jamais la recette, elle rend non mesuré
// ---------------------------------------------------------------------------

type Mesure = { lignes: Ligne[] } | { erreur: string; lente: boolean };

class Budget {
  private debut: number;
  constructor(private delaiMs: number, private maintenant: () => number) {
    this.debut = maintenant();
  }
  epuise(): boolean {
    return this.maintenant() - this.debut > this.delaiMs;
  }
  get message(): string {
    return `Budget de ${Math.round(this.delaiMs / 1000)} s épuisé avant ce contrôle : non mesuré.`;
  }
}

async function mesurer(lecteur: Lecteur, budget: Budget, sql: string): Promise<Mesure> {
  if (budget.epuise()) return { erreur: budget.message, lente: true };
  try {
    return { lignes: await lecteur(sql) };
  } catch (e) {
    const erreur = e as { code?: string; message?: string };
    // 57014 = query_canceled : le statement_timeout du lecteur a coupé la requête.
    if (erreur.code === "57014") {
      return { erreur: "Requête trop lente : interrompue par le délai par requête, contrôle non mesuré.", lente: true };
    }
    return { erreur: `Requête en erreur : ${erreur.message ?? String(e)}`, lente: false };
  }
}

function total(lignes: Ligne[]): number {
  return lignes.length ? Number(lignes[0].__lignes ?? lignes.length) : 0;
}

// ---------------------------------------------------------------------------
// Les familles
// ---------------------------------------------------------------------------

type Colonnes = Map<string, string>; // colonne -> type Postgres
type Structure = Map<string, Colonnes>; // vue -> colonnes

function lireStructure(lignes: Ligne[]): Structure {
  const structure: Structure = new Map();
  for (const l of lignes) {
    const vue = String(l.vue);
    if (!structure.has(vue)) structure.set(vue, new Map());
    structure.get(vue)!.set(String(l.colonne), String(l.type));
  }
  return structure;
}

function forme(vue: VueContrat, trouvees: Colonnes | undefined): ResultatControle {
  const base = {
    id: `forme.${vue.nom}`,
    famille: "forme" as const,
    niveau: vue.niveau,
    vue: vue.nom,
    titre: `${vue.nom} : la vue est publiée, ses colonnes et leurs types sont ceux du contrat`,
  };
  if (!trouvees) {
    return {
      ...base,
      statut: "absent",
      bloquant: vue.obligatoire,
      detail: `Vue non publiée. ${vue.role}`,
      ...(vue.obligatoire
        ? {
          si_echec: "Sans cette vue, Baikal n'a rien à lire : le chapitre reste fermé, sans erreur.",
          correction: `Créer la vue ${vue.nom} selon le contrat.`,
        }
        : {}),
    };
  }
  const problemes: Ligne[] = [];
  const nonPubliees: string[] = [];
  for (const c of vue.colonnes) {
    const type = trouvees.get(c.nom);
    if (type === undefined) {
      if (c.obligatoire) problemes.push({ colonne: c.nom, attendu: c.type, trouve: "absente" });
      else nonPubliees.push(c.nom);
    } else if (!typeCompatible(c.type, type)) {
      problemes.push({ colonne: c.nom, attendu: c.type, trouve: type });
    }
  }
  const horsContrat = [...trouvees.keys()].filter((nom) => !vue.colonnes.some((c) => c.nom === nom));
  const detail = [
    nonPubliees.length ? `Colonnes optionnelles non publiées : ${nonPubliees.join(", ")}.` : "",
    horsContrat.length ? `Colonnes hors contrat (ignorées par Baikal) : ${horsContrat.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  if (!problemes.length) return { ...base, statut: "conforme", bloquant: false, ...(detail ? { detail } : {}) };
  return {
    ...base,
    statut: "echec",
    bloquant: true,
    lignes: problemes.length,
    exemples: problemes.slice(0, 20),
    si_echec:
      "Une colonne absente ou d'un autre type fait échouer la lecture ou fausse l'affichage : une date sans fuseau se décale d'une à deux heures, un identifiant non texte casse les jointures de la fiche.",
    correction: "Publier chaque colonne obligatoire au type du contrat, par un cast explicite (::text, ::timestamptz, ::numeric).",
    ...(detail ? { detail } : {}),
  };
}

function nonMesure(base: Omit<ResultatControle, "statut" | "bloquant">, detail: string): ResultatControle {
  return { ...base, statut: "non_mesure", bloquant: true, detail };
}

function absent(base: Omit<ResultatControle, "statut" | "bloquant">, detail: string): ResultatControle {
  return { ...base, statut: "absent", bloquant: false, detail };
}

function verdict(
  base: Omit<ResultatControle, "statut" | "bloquant">,
  mesure: Mesure,
  textes: { si_echec: string; correction: string },
): ResultatControle {
  if ("erreur" in mesure) return nonMesure(base, mesure.erreur);
  if (!mesure.lignes.length) return { ...base, statut: "conforme", bloquant: false };
  return {
    ...base,
    statut: "echec",
    bloquant: true,
    lignes: total(mesure.lignes),
    exemples: exemples(mesure.lignes),
    ...textes,
  };
}

function manquantes(requises: string[], trouvees: Colonnes): string[] {
  return requises.filter((nom) => !trouvees.has(nom));
}

async function controleRecette(
  k: ControleContrat,
  trouvees: Colonnes | undefined,
  ctx: Contexte,
): Promise<ResultatControle> {
  const base = { id: k.id, famille: "recette" as const, niveau: k.niveau, vue: k.vue, titre: k.titre, ref: k.ref };
  if (!trouvees) return absent(base, "Vue non publiée.");
  const absentes = manquantes(k.requiert, trouvees);
  if (absentes.length) return absent(base, `Colonne(s) non publiée(s) : ${absentes.join(", ")}.`);
  const sql = k.sql.replaceAll("@SCHEMA@", ctx.schema);
  const textes = { si_echec: k.si_echec, correction: k.correction };

  if (k.type === "funnel") {
    const mesure = await mesurer(ctx.lecteur, ctx.budget, `/* recette:controle:${k.id} */\nselect * from (\n${sql}\n) t limit 50`);
    if ("erreur" in mesure) return nonMesure(base, mesure.erreur);
    if (!ctx.funnel) {
      return {
        ...absent(base, "Aucun funnel déclaré : le statut reste libre. Voici les valeurs publiées, à déclarer comme étapes."),
        exemples: exemples(mesure.lignes, 20),
      };
    }
    const hors = mesure.lignes.filter((l) => l.statut !== null && !ctx.funnel!.includes(String(l.statut)));
    if (!hors.length) return { ...base, statut: "conforme", bloquant: false };
    return {
      ...base,
      statut: "echec",
      bloquant: true,
      lignes: hors.reduce((somme, l) => somme + Number(l.lignes ?? 0), 0),
      exemples: exemples(hors),
      ...textes,
    };
  }

  return verdict(base, await mesurer(ctx.lecteur, ctx.budget, fautives(`controle:${k.id}`, sql)), textes);
}

async function controleJointure(vue: VueContrat, liste: VueContrat, ctx: Contexte): Promise<ResultatControle> {
  const j = vue.jointure!;
  const base = {
    id: `jointure.${vue.nom}`,
    famille: "recette" as const,
    niveau: vue.niveau,
    vue: vue.nom,
    titre: `${vue.nom} : chaque ${j} cité existe dans ${liste.nom}`,
    ref: "§4 (6)",
  };
  const sql = `select v.${j} from ${ctx.schema}.${vue.nom} v
where not exists (select 1 from ${ctx.schema}.${liste.nom} d where d.${j} = v.${j})`;
  return verdict(base, await mesurer(ctx.lecteur, ctx.budget, fautives(`controle:${base.id}`, sql)), {
    si_echec: "Ces lignes citent un dossier absent de la liste : elles n'apparaissent sur aucune fiche, sans erreur.",
    correction: `Construire ${j} exactement comme dans ${liste.nom} (même préfixe, même cast ::text).`,
  });
}

async function controlesAcces(vue: VueContrat, ctx: Contexte): Promise<ResultatControle[]> {
  const acces = {
    id: `acces.${vue.nom}`,
    famille: "acces" as const,
    niveau: vue.niveau,
    vue: vue.nom,
    titre: `${vue.nom} : chaque table source a son grant et sa policy pour ${ROLE}`,
    ref: "mesures-v1 §3 (5)",
  };
  const lecture = {
    id: `lecture.${vue.nom}`,
    famille: "acces" as const,
    niveau: vue.niveau,
    vue: vue.nom,
    titre: `${vue.nom} : la lecture passe sous le rôle ${ROLE}`,
  };
  const sortie: ResultatControle[] = [];

  if (!ctx.roleExiste) {
    sortie.push(nonMesure(acces, `Le rôle ${ROLE} n'existe pas : ses droits ne peuvent pas être lus.`));
  } else {
    const mesure = await mesurer(ctx.lecteur, ctx.budget, fautives(`acces:${vue.nom}`, sqlAcces(ctx.schema, vue.nom)));
    sortie.push(verdict(acces, mesure, {
      si_echec:
        "Une table source sans grant ou sans policy ne fait pas échouer la vue : elle la sert AMPUTÉE. Baikal lit moins de lignes que vous, sans une erreur.",
      correction:
        `Pour chaque source rendue : grant select on <source> to ${ROLE}; create policy baikal_read on <source> for select to ${ROLE} using (true);`,
    }));
  }

  if (ctx.utilisateur !== ROLE) {
    sortie.push(nonMesure(
      lecture,
      `Test lancé sous le rôle ${ctx.utilisateur ?? "inconnu"}, pas sous ${ROLE} : la lecture effective n'est pas prouvée.`,
    ));
    return sortie;
  }
  const mesure = await mesurer(ctx.lecteur, ctx.budget, `/* recette:lecture:${vue.nom} */\nselect count(*) as n from ${ctx.schema}.${vue.nom}`);
  if ("erreur" in mesure) {
    if (mesure.lente) sortie.push(nonMesure(lecture, mesure.erreur));
    else {
      sortie.push({
        ...lecture,
        statut: "echec",
        bloquant: true,
        detail: mesure.erreur,
        si_echec: "Baikal ne peut pas lire cette vue : le chapitre affiche une erreur ou reste vide.",
        correction: `grant usage on schema ${ctx.schema} to ${ROLE}; grant select on ${ctx.schema}.${vue.nom} to ${ROLE};`,
      });
    }
  } else {
    sortie.push({
      ...lecture,
      statut: "conforme",
      bloquant: false,
      detail: `${Number(mesure.lignes[0]?.n ?? 0)} ligne(s) lue(s) sous ${ROLE}.`,
    });
  }
  return sortie;
}

async function controleConcordance(c: ConcordanceContrat, structure: Structure, ctx: Contexte): Promise<ResultatControle> {
  const base = {
    id: c.id,
    famille: "concordance" as const,
    niveau: c.niveau,
    vue: c.gauche.vue,
    titre: c.titre,
    ref: c.ref,
  };
  for (const cote of [c.gauche, c.droite]) {
    const trouvees = structure.get(cote.vue);
    if (!trouvees) return absent(base, `Vue ${cote.vue} non publiée : rien à accorder.`);
    const absentes = manquantes([cote.colonne, c.cle], trouvees);
    if (absentes.length) return absent(base, `${cote.vue} ne publie pas ${absentes.join(", ")} : rien à accorder.`);
  }
  const sql = `select distinct g.${c.cle}, g.${c.gauche.colonne} as gauche, d.${c.droite.colonne} as droite
from ${ctx.schema}.${c.gauche.vue} g
join ${ctx.schema}.${c.droite.vue} d on d.${c.cle} = g.${c.cle}
where g.${c.gauche.colonne} is distinct from d.${c.droite.colonne}`;
  return verdict(base, await mesurer(ctx.lecteur, ctx.budget, fautives(`concordance:${c.id}`, sql)), {
    si_echec: c.si_echec,
    correction: c.correction,
  });
}

// ---------------------------------------------------------------------------
// La recette
// ---------------------------------------------------------------------------

interface Contexte {
  lecteur: Lecteur;
  budget: Budget;
  schema: string;
  funnel: string[] | null;
  roleExiste: boolean;
  utilisateur: string | null;
}

const SCHEMA_VALIDE = /^[a-z_][a-z0-9_]*$/;

export async function recetter(options: OptionsRecette): Promise<Rapport> {
  // Le schéma entre dans le texte des requêtes : il ne passe que s'il a la
  // forme d'un identifiant.
  if (!SCHEMA_VALIDE.test(options.schema)) throw new Error(`Schéma invalide : ${options.schema}`);
  const budget = new Budget(options.delaiTotalMs ?? 60_000, options.maintenant ?? Date.now);

  // Ces deux lectures-là ne sont pas rattrapées : sans catalogue, il n'y a pas
  // de recette, et c'est à l'appelant de dire que la connexion ne répond pas.
  const structure = lireStructure(await options.lecteur(sqlStructure(options.schema)));
  const [role] = await options.lecteur(SQL_ROLE);
  const ctx: Contexte = {
    lecteur: options.lecteur,
    budget,
    schema: options.schema,
    funnel: options.funnel,
    roleExiste: role?.existe === true,
    utilisateur: role?.utilisateur ? String(role.utilisateur) : null,
  };

  const controles: ResultatControle[] = [{
    id: "acces.role",
    famille: "acces",
    niveau: 1,
    vue: null,
    titre: `Le rôle ${ROLE} existe`,
    ...(ctx.roleExiste ? { statut: "conforme" as const, bloquant: false } : {
      statut: "echec" as const,
      bloquant: true,
      si_echec: `Baikal lit votre base sous le rôle ${ROLE}, en lecture seule : sans lui, aucune lecture.`,
      correction: `Créer le rôle par le script fourni (create role ${ROLE} login password '…'; grant usage on schema ${options.schema} to ${ROLE};).`,
    }),
  }];

  for (const manifeste of options.manifestes) {
    const liste = manifeste.vues.find((v) => v.obligatoire);
    for (const vue of manifeste.vues) {
      const trouvees = structure.get(vue.nom);
      controles.push(forme(vue, trouvees));
      if (trouvees) controles.push(...await controlesAcces(vue, ctx));
      for (const k of manifeste.controles.filter((k) => k.vue === vue.nom)) {
        controles.push(await controleRecette(k, trouvees, ctx));
      }
      if (trouvees && vue.jointure && liste && structure.has(liste.nom) && trouvees.has(vue.jointure)) {
        controles.push(await controleJointure(vue, liste, ctx));
      }
    }
    for (const c of manifeste.concordances) controles.push(await controleConcordance(c, structure, ctx));
  }

  return { schema: options.schema, utilisateur: ctx.utilisateur, resume: resumer(controles), controles };
}
