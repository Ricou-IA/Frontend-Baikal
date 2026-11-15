// Le prompt d'onboarding : ce que le prospect colle dans son agent de code
// (Cursor, Claude Code…) pour brancher son site à Baikal.
//
// PUR. Le prompt se suffit à lui-même : les contrats vivent dans un dépôt
// privé, leur texte entier est donc recopié ici, avec la structure repérée,
// le script du rôle en lecture seule, les échecs du dernier test et la
// consigne de relancer le test.
import type { Manifeste } from "./manifeste.ts";
import type { Rapport } from "./resultat.ts";
import type { Diagnostic } from "./structure.ts";
import { diagnosticEnTexte, rapportEnTexte } from "./texte.ts";

// Le mot de passe du rôle n'est jamais connu de Baikal avant le test, et
// jamais écrit dans un prompt : la page le tire au hasard dans le navigateur.
export const MOT_DE_PASSE = "<MOT_DE_PASSE_A_CHOISIR>";

export function scriptRole(schema: string, motDePasse: string = MOT_DE_PASSE): string {
  return `-- 1. Le rôle de Baikal : lecture seule, forcée côté serveur.
create role baikal_reader login password '${motDePasse}';
alter role baikal_reader set default_transaction_read_only = on;
alter role baikal_reader set statement_timeout = '30s';
grant usage on schema ${schema} to baikal_reader;

-- 2. Les vues Baikal, une fois créées.
grant select on ${schema}.baikal_dossiers to baikal_reader;
grant select on ${schema}.baikal_mesures to baikal_reader;

-- 3. CHAQUE table source d'une vue Baikal : son grant ET sa policy.
--    Une table oubliée ne fait pas échouer la vue : elle la sert amputée.
grant select on ${schema}.<table> to baikal_reader;
create policy baikal_read on ${schema}.<table> for select to baikal_reader using (true);`;
}

export interface OptionsPrompt {
  diagnostic: Diagnostic;
  manifestes: Manifeste[];
  // Le texte entier de chaque contrat, par nom (« dossiers-v1 »).
  contrats: Record<string, string>;
  // Le dernier test, s'il y en a eu un.
  rapport: Rapport | null;
  // Où relancer le test.
  urlTest: string;
}

export function fabriquerPrompt(options: OptionsPrompt): string {
  const { diagnostic: d, manifestes, contrats, rapport, urlTest } = options;
  const schema = d.schema_contrat ?? d.table_principale?.schema ?? "public";
  const vues = manifestes.flatMap((m) => m.vues.filter((v) => v.obligatoire).map((v) => `\`${schema}.${v.nom}\``));

  const controles = manifestes.flatMap((m) =>
    m.controles.filter((k) => k.niveau === 1 && !k.type).map((k) =>
      `-- ${k.titre} (${m.contrat} ${k.ref}). Doit rendre zéro ligne.\n${k.sql.replaceAll("@SCHEMA@", schema)};`
    )
  );
  const manuelles = manifestes.flatMap((m) => m.verifications_manuelles.map((v) => `- ${v.texte} (${m.contrat} ${v.ref})`));

  const parties = [
    `# Brancher ce site à Baikal

Tu vas brancher ce site à Baikal, la console d'administration de son fondateur. Baikal ne lit que des VUES que ce site publie, sous un rôle en lecture seule. Ton travail : écrire ces vues, par une migration de ce dépôt, puis faire passer le test en ligne.

Le niveau 1 tient en deux vues : ${vues.join(" et ")}. Le niveau 2 (les onglets de la fiche client, l'origine des clients) vient après, et il est optionnel.`,

    `## Les règles

- Ne modifie aucune table, aucune colonne, aucune donnée existante. Tu ne crées que des vues, des grants et des policies de lecture, dans une migration nouvelle.
- N'écris jamais le mot de passe du rôle dans le dépôt, dans une migration ni dans un journal. Le script ci-dessous porte un emplacement : c'est le fondateur qui le remplit, à la main, au moment de le jouer.
- Le contrat fige la FORME (noms des vues, colonnes, types). Le corps de chaque vue t'appartient : toi seul sais ce qu'est un dossier, un achat ou un abonné dans ce code. Lis le code du site avant d'écrire.
- Une colonne que tu ne sais pas remplir est ABSENTE, jamais présente et nulle : Baikal lit la capacité à la présence de la colonne.
- Les tests et les supprimés se définissent dans la vue (\`est_test\`, \`supprime_le\`), pas ailleurs.
- Une donnée présente dans deux vues se dérive de celle qui fait autorité : \`baikal_mesures\` lit \`baikal_dossiers\`, elle ne recompte pas les tables.
- Si une information manque pour décider (où vit la date de paiement, ce qu'est un compte de test), pose la question au fondateur plutôt que de deviner.`,

    diagnosticEnTexte(d).trimEnd() +
    "\n\nCe relevé vient de la structure seule (noms et types des colonnes). Il peut se tromper : vérifie-le dans le code avant de t'y fier.",

    `## Étape 1 — Le rôle en lecture seule

À jouer par le fondateur dans l'éditeur SQL de sa base, après avoir choisi un mot de passe :

\`\`\`sql
${scriptRole(schema)}
\`\`\`

Les lignes 2 et 3 se rejouent après la création des vues : écris-les dans ta migration, pour chaque table que tes vues lisent.`,

    ...manifestes.map((m, i) =>
      `## Étape ${i + 2} — Le contrat ${m.contrat}\n\n${m.titre}. Le schéma \`${schema}\` est déjà substitué dans le texte.\n\n` +
      "```sql\n" + (contrats[m.contrat] ?? `-- Texte du contrat ${m.contrat} indisponible.`).replaceAll("@SCHEMA@", schema).trimEnd() + "\n```"
    ),

    `## Avant de rendre — vérifie-toi

Ces requêtes sont celles que le test en ligne jouera. Chacune doit rendre zéro ligne.

\`\`\`sql
${controles.join("\n\n")}
\`\`\`

Et ce que le SQL ne vérifie pas à ta place :

${manuelles.join("\n")}`,
  ];

  if (rapport) {
    parties.push(
      "## Le dernier test\n\nVoici ce que le dernier test a trouvé. Corrige chaque point, dans l'ordre.\n\n" +
        rapportEnTexte(rapport, { echecsSeuls: true }).replace(/^# .*\n\n/, "").replaceAll(/^(#{2,3}) /gm, "#$1 ").trimEnd(),
    );
  }

  parties.push(
    `## Relancer le test

Quand la migration est appliquée, demande au fondateur de relancer le test : ${urlTest}

Le test rend un statut par contrôle. Reprends chaque échec, corrige, et fais relancer — jusqu'à zéro échec au niveau 1. Un contrôle « non mesuré » (requête trop lente) n'est pas un succès : allège la vue ou indexe la colonne de jointure.`,
  );

  return parties.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Le prompt d'ENTRÉE : celui que la page sert dès que le prospect a tapé
// l'adresse de son site, avant tout diagnostic.
//
// Vision d'Eric (15/11/2026) : ceux à qui Baikal s'adresse travaillent toute
// la journée avec un agent et des connecteurs. Ils ne veulent ni éditeur SQL,
// ni adresse de connexion à assembler. Ils collent un prompt ; l'agent
// identifie le bon projet, fait le travail, lance lui-même le test, et rend
// UN lien. Ce prompt-là ne peut pas s'appuyer sur un diagnostic : il nomme le
// site, et laisse à l'agent le soin de trouver le dépôt et la base.
// ---------------------------------------------------------------------------

export interface OptionsPromptAgent {
  // Le site à brancher, tel que lireSite l'a rendu.
  site: { url: string; domaine: string };
  // Le jeton tiré par la page : le test de l'agent s'y range, la page l'attend.
  jeton: string;
  // L'adresse de la fonction de test (POST, JSON, sans authentification).
  urlApi: string;
  // Le lien privé du résultat, celui que l'agent rend au fondateur.
  urlResultat: string;
  manifestes: Manifeste[];
  contrats: Record<string, string>;
}

export function fabriquerPromptAgent(options: OptionsPromptAgent): string {
  const { site, jeton, urlApi, urlResultat, manifestes, contrats } = options;
  const vues = manifestes.flatMap((m) => m.vues.filter((v) => v.obligatoire).map((v) => `\`${v.nom}\``));
  const controles = manifestes.flatMap((m) =>
    m.controles.filter((k) => k.niveau === 1 && !k.type).map((k) => `-- ${k.titre} (${m.contrat} ${k.ref}). Doit rendre zéro ligne.\n${k.sql};`)
  );
  const manuelles = manifestes.flatMap((m) => m.verifications_manuelles.map((v) => `- ${v.texte} (${m.contrat} ${v.ref})`));
  const [role, droits] = scriptRole("@SCHEMA@").split("\n\n-- 2.");
  const appel = (connexion: string) =>
    `curl -s -X POST '${urlApi}' \\\n  -H 'content-type: application/json' \\\n  -d '{"action":"tester","reponse":"courte","jeton":"${jeton}","connexion":"${connexion}"}'`;
  const n = manifestes.length;

  const parties = [
    `# Brancher ${site.domaine} à Baikal

Tu vas brancher le site ${site.url} à Baikal, la console d'administration de son fondateur. Baikal ne lit que des VUES que le site publie, sous un rôle Postgres en lecture seule. Tu fais tout le travail, D'UNE TRAITE : identifier le projet, créer le rôle, écrire les vues, lancer le test en ligne, corriger jusqu'à zéro échec. À la fin, tu rends UN lien au fondateur.

Le fondateur attend un résultat, pas une conversation. Ne fais pas de point d'étape, ne demande pas de confirmation, ne pose pas de questions de définition : tranche d'après le code, et écris tes choix dans ta réponse finale. Tu ne l'interromps que si tu ne peux vraiment pas continuer.

Le niveau 1 tient en deux vues : ${vues.join(" et ")}. Le niveau 2 (les onglets de la fiche client, l'origine des clients) vient après, et il est optionnel.`,

    `## Étape 0 — Identifie le bon projet

Le site à brancher est ${site.url}. Tu as peut-être plusieurs dépôts et plusieurs bases sous la main : ne te trompe pas de projet.

- Trouve le dépôt de CE site : cherche « ${site.domaine} » dans le code, la configuration de déploiement et les variables d'environnement.
- Trouve SA base de données : \`DATABASE_URL\`, \`SUPABASE_URL\` ou équivalent dans ce dépôt. Si tu as un connecteur (MCP) vers l'hébergeur, c'est le projet dont l'adresse correspond à ces variables, pas un autre.
- Baikal ne lit que Postgres (Supabase, Neon, un serveur à soi : peu importe). Si la base n'en est pas une, dis-le et arrête-toi là.
- Un seul projet correspond : continue sans demander, tu le nommeras dans ta réponse finale. Deux projets correspondent et rien dans le code ne les départage : c'est le SEUL cas où tu poses une question, une seule, avant d'aller plus loin.
- Une base partagée entre plusieurs produits : ne branche que le schéma de ce site.`,

    `## Les règles

- Ne modifie aucune table, aucune colonne, aucune donnée existante. Tu ne crées qu'un rôle, des vues, des grants et des policies de lecture.
- Le mot de passe du rôle n'apparaît dans AUCUN fichier : ni dépôt, ni migration, ni journal, ni message de commit. Tu le tires au hasard, tu le gardes en mémoire le temps de ce travail, et tu le donnes au fondateur à la fin s'il le demande.
- Tout ce que tu crées s'AJOUTE et ne sert qu'à lire : applique-le sans demander. Si un changement devait modifier ou supprimer quelque chose d'existant, ne le fais pas, et dis-le dans ta réponse finale.
- Le contrat fige la FORME (noms des vues, colonnes, types). Le corps de chaque vue t'appartient : toi seul sais ce qu'est un dossier, un achat ou un abonné dans ce code. Lis le code du site avant d'écrire.
- Une colonne que tu ne sais pas remplir est ABSENTE, jamais présente et nulle : Baikal lit la capacité à la présence de la colonne.
- Les tests et les supprimés se définissent dans la vue (\`est_test\`, \`supprime_le\`), pas ailleurs.
- Une donnée présente dans deux vues se dérive de celle qui fait autorité : \`baikal_mesures\` lit \`baikal_dossiers\`, elle ne recompte pas les tables.
- Quand le code laisse un choix (ce qu'est un dossier, où vit la date de paiement, ce qu'est un compte de test), prends la lecture la plus fidèle au code et note-la : le fondateur la corrigera après avoir vu son résultat, pas avant.`,

    `## Étape 1 — Le rôle en lecture seule

Crée-le directement en base (ton connecteur, \`psql\`, l'éditeur SQL), JAMAIS dans une migration. Tire un mot de passe de 24 lettres minuscules et chiffres, et mets-le à la place de ${MOT_DE_PASSE}. Dans tout ce prompt, \`@SCHEMA@\` est le schéma où tu publies les vues : \`public\` le plus souvent.

\`\`\`sql
${role}
\`\`\`

Si le rôle existe déjà, ne le recrée pas : \`alter role baikal_reader password '…';\` suffit.`,

    ...manifestes.map((m, i) =>
      `## Étape ${i + 2} — Le contrat ${m.contrat}\n\n${m.titre}. Écris la vue dans une migration nouvelle de ce dépôt, en remplaçant \`@SCHEMA@\`.\n\n` +
      "```sql\n" + (contrats[m.contrat] ?? `-- Texte du contrat ${m.contrat} indisponible.`).trimEnd() + "\n```"
    ),

    `## Étape ${n + 2} — Les droits

Dans la même migration, après les vues, pour CHAQUE table que tes vues lisent :

\`\`\`sql
-- 2.${droits}
\`\`\`

Puis vérifie-toi avant de lancer le test. Ces requêtes sont celles qu'il jouera ; chacune doit rendre zéro ligne.

\`\`\`sql
${controles.join("\n\n")}
\`\`\`

Et ce que le SQL ne vérifie pas à ta place :

${manuelles.join("\n")}`,

    `## Étape ${n + 3} — Lance le test toi-même

Le test se lance par un appel HTTP, sans compte ni clé. Il ne fait que lire, sous le rôle \`baikal_reader\`.

L'adresse de la base est celle du rôle, sur l'hôte PUBLIC de la base :

- Supabase : \`postgresql://baikal_reader:MOT_DE_PASSE@db.REFERENCE.supabase.co:5432/postgres\`, où REFERENCE est le début de \`SUPABASE_URL\` (\`https://REFERENCE.supabase.co\`).
- Ailleurs : l'hôte, le port et la base de \`DATABASE_URL\`, avec \`baikal_reader\` et son mot de passe.

\`\`\`bash
${appel("postgresql://baikal_reader:MOT_DE_PASSE@HOTE:5432/BASE")}
\`\`\`

Ne mets cette adresse dans aucun fichier. La réponse est un JSON :

- \`error\` non nul : la connexion ou l'adresse est en cause. Le message dit quoi ; corrige et relance.
- \`data.a_corriger\` : un élément par contrôle en échec, avec ce qui est faux (\`si_echec\`), la correction attendue (\`correction\`) et jusqu'à trois exemples. Corrige la vue ou les droits, réapplique, relance le MÊME appel.
- \`data.non_mesures\` : un contrôle non mesuré n'est pas un succès. Si c'est une requête trop lente, allège la vue ou indexe la colonne de jointure.
- \`data.niveau1_pret\` : ton objectif est \`true\`.

Dix tests par heure : corrige tout ce que le rapport montre avant de relancer.`,

    `## Étape ${n + 4} — Rends le lien

Quand \`niveau1_pret\` vaut \`true\`, écris ta seule réponse au fondateur. Elle commence par le lien, seul sur sa ligne :

${urlResultat}

Puis, en dix lignes au plus :

1. Le projet que tu as branché : le dépôt, la base, le schéma.
2. Ce que tu as créé : le rôle, les vues, la migration.
3. Les choix que tu as faits à sa place : ce que tu as pris pour un dossier, pour un paiement, pour un compte de test.

Ce lien est privé et reste valable trente jours. C'est la seule chose qu'il a besoin d'ouvrir : dis-le-lui.

Si tu n'arrives pas à \`niveau1_pret\` après trois corrections, arrête-toi : donne le même lien, et dis en trois lignes ce qui bloque.`,
  ];

  return parties.join("\n\n") + "\n";
}
