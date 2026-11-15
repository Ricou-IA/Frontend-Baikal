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
