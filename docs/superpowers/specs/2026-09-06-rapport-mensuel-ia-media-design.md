# Rapport mensuel IA MEDIA — design

Date : 2026-09-06. Décisions d'Eric en séance, une question à la fois.

## But

À la fin de chaque mois, un clic « Générer » produit un PDF A4 à l'attention
d'IA MEDIA, le partenaire SEO de Pack Vendeur (contrat article 7). Le rapport
formalise la communication avec le partenaire et **historise** ce qui a été
fait : chaque rapport généré est conservé avec son PDF.

Le rapport n'est PAS un document interne CONFER : rien sur les charges, le
résultat net ou les comptes du site. Il porte ce que le partenaire a besoin de
voir : le décompte du partenariat, les ventes qui le nourrissent, le SEO du
mois, des highlights, les évolutions du logiciel et un commentaire.

## Décisions actées

| Sujet | Décision |
|---|---|
| Destinataire | IA MEDIA (partenaire SEO), pas les associés de CONFER. |
| Highlights | **Faits calculés par règles**, trame identique chaque mois. Aucun modèle. |
| Textes libres | Deux blocs assistés par un modèle : « Évolutions du logiciel » (source : commits GitHub du mois) et « Commentaire du mois » (source : ébauche tapée par Eric). Eric relit et corrige les deux avant de générer. |
| Modèle | OpenAI `gpt-4o-mini`, clé `OPENAI_API_KEY` déjà présente dans les secrets EF. Le modèle ne voit que l'ébauche, les commits et les chiffres du mois ; il ne touche jamais à la trame calculée. |
| PDF | Fabriqué **dans le navigateur** avec `@react-pdf/renderer` (A4 natif, vrai fichier), envoyé à l'EF qui le dépose dans le bucket privé `rapports` et écrit la ligne d'archive. Pas de graphique Recharts : tableaux uniquement. |
| Archivage | Table `admin.rapports`, une ligne par génération. Régénérer un mois crée une nouvelle version ; l'ancienne reste lisible. |
| Envoi | Hors lot : Eric télécharge le PDF et l'envoie lui-même. |
| Actions du logiciel | Historique git du mois du dépôt du site (GitHub API), pas le dossier mémoire local, inaccessible depuis Vercel. |
| Période (ajout du 06/09 soir) | Le rapport se borne par **deux dates** (mois, trimestre ou du… au…), sélecteur maison sans calendrier natif. Comparaison avec la période précédente de même durée (mois précédent pour un mois entier). Totaux SEO exacts au jour ; top requêtes et pages cumulés sur les mois couverts, dit dans le rapport. Décompte du partenariat toujours mensuel, mois de la période surlignés ; la ligne « franchise » des highlights n'apparaît que pour un mois civil entier. Table `admin.rapports` : colonnes `debut`, `fin` (plus de `mois`), PDF `<app>/<debut>_<fin>-v<n>.pdf`. |

## Contenu du rapport, dans l'ordre

1. **En-tête** : nom du site, domaine, mois (« Août 2026 »), partenaire, date
   de génération, numéro de version.
2. **Décompte du partenariat** : les 12 derniers mois, tels que servis par
   `admin.partenariat_serie` avec l'assiette du contrat. Colonnes : mois,
   ventes, CA HT, coûts du mois, partageables, CA partageable, coûts imputés,
   résultat, quote-part. Le mois du rapport est mis en avant. Les mois d'avant
   contrat gardent leurs ventes et CA HT (tendance) et un tiret ailleurs. Sous
   le tableau, rappel des termes : franchise, part, assiette, coûts directs,
   prix unitaire.
3. **Ventes du mois** : une ligne par vente B2C encaissée (> 0 €), date, offre,
   montant TTC, montant HT. Total en pied. **Jamais de donnée nominative** :
   l'archive n'en porte pas. **Pas d'origine** : cette finesse reste
   consultable dans Baikal, le partenaire n'y descend pas (Eric, 06/09).
4. **SEO du mois** : Google et Bing côte à côte, clics, impressions, CTR,
   position, chacun avec la valeur du mois précédent et la variation en
   valeur. Puis top 10 requêtes Google (clics, impressions, position) et top
   10 pages Google (mêmes colonnes), hors bruit (`is_noise`).
5. **Highlights** : 6 à 8 phrases calculées (règles ci-dessous).
6. **Évolutions du logiciel** : texte validé par Eric.
7. **Commentaire du mois** : texte validé par Eric.
8. **Pied de page** : « Généré par Baikal le … — chiffres issus de l'archive
   quotidienne (Stripe, vue contractuelle du site, Search Console, Bing
   Webmaster) », pagination.

## Sources de données (toutes dans l'archive `admin`)

- Partenariat : `public.admin_partenariat_serie(partenariat, NULL, NULL)`,
  filtré aux 12 derniers mois jusqu'au mois du rapport inclus.
- Ventes : `admin.ventes_enrichies`, `perimetre = 'b2c'`, `NOT exclue`,
  `montant_ttc > 0`, `paid_at` dans le mois.
- SEO totaux : `admin.seo_snapshots`, `granularity = 'day'`, `dimension =
  'site'`, sommé sur le mois pour `google` et `bing`. Position = moyenne
  pondérée par les impressions. La série quotidienne du site est la
  référence : elle inclut les requêtes anonymisées que la somme des pages
  n'a pas (août 2026 : 523 clics site contre 539 pages). Bing absent avant le
  cron du 24/08 : afficher « — », jamais 0.
- SEO top : `granularity = 'month'`, `dimension in ('query','page')`,
  `source = 'google'`, `period_start = 1er du mois`, `NOT is_noise`, tri clics
  décroissants, 10 lignes.
- Évolutions : GitHub `GET /repos/{repo}/commits?since&until&per_page=100`
  (pagination jusqu'à 300), hors merges. Sujet de commit (première ligne).
  Dépôt lu dans `config.apps.repo_github` (nouvelle colonne, forme
  `owner/repo`), jeton dans le secret `ADMIN_GITHUB_TOKEN` (lecture seule).
  Sans dépôt ou sans jeton : section absente du rapport, bandeau explicatif
  dans la page, jamais une erreur.

## Highlights — règles

Chaque règle produit une phrase ou rien. M = mois du rapport, M-1 = précédent.

1. Ventes (assiette du contrat) : « 13 ventes en août contre 14 en juillet
   (−1) ». Si M-1 vide : « 13 ventes en août, premier mois mesuré ».
2. Franchise : « Seuil de 15 non atteint : aucune vente partageable » ou
   « 3 ventes au-delà du seuil : quote-part de 18,20 € ».
3. Clics Google : « 523 clics Google contre 644 (−121, −19 %) ».
4. Impressions Google : même forme.
5. Position moyenne Google : « position moyenne 15,2 contre 10,0 (+5,2) ».
6. Meilleure progression : parmi les requêtes présentes en M et M-1 avec au
   moins 20 impressions les deux mois, celle dont la position a le plus
   baissé : « « pré état daté gratuit » passe de 8,6 à 5,1 ».
7. Entrées dans le top 10 : requêtes du top 10 par clics en M absentes du top
   10 de M-1 : « 2 requêtes entrent dans le top 10 : … ».
8. Bing : « 137 clics Bing contre 174 (−37) », seulement si M-1 mesuré.

Les pourcentages ne s'affichent que si la base M-1 est ≥ 20 ; sinon la
variation en valeur seule (règle d'Eric : pas de % quand il n'a pas de sens).

## Textes assistés

- **Évolutions du logiciel** : prompt système en français, lecteur = partenaire
  SEO non technique. Entrée : liste des sujets de commit du mois. Sortie : 5 à
  8 puces, une phrase chacune, verbe à l'indicatif, sans jargon technique
  (pas de « refactor », « cron », « RLS »), regroupées par thème (SEO et
  contenu, tunnel de vente, prospection, administration). Les commits purement
  techniques sont fusionnés ou omis. Aucune invention : chaque puce doit
  correspondre à au moins un commit.
- **Commentaire du mois** : entrée = ébauche d'Eric + les highlights calculés
  comme contexte. Sortie : 1 à 3 paragraphes courts, ton professionnel et
  direct, vouvoiement, français correct avec accents. Interdit : ajouter un
  chiffre absent de l'ébauche ou des highlights.
- Les deux sorties sont des **propositions** affichées dans des champs
  éditables ; c'est le texte du champ au moment de « Générer » qui fait foi et
  qui est archivé. L'ébauche d'origine est archivée aussi.

## Données et code

### Migration `20260906130000_rapports_mensuels.sql`

```sql
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS repo_github text;

CREATE TABLE admin.rapports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  mois           date NOT NULL,                 -- 1er du mois
  version        integer NOT NULL DEFAULT 1,
  partenariat_id uuid REFERENCES admin.partenariats(id),
  contenu        jsonb NOT NULL,                -- faits figés (sections 2 à 5)
  ebauche        text,
  evolutions     text,
  commentaire    text,
  pdf_path       text NOT NULL,                 -- rapports/<app>/<mois>-v<n>.pdf
  genere_le      timestamptz NOT NULL DEFAULT now(),
  genere_par     uuid,
  UNIQUE (app_id, mois, version)
);
-- RLS forcée sans policy, service_role seul (régime des tables admin).
-- Bucket Storage `rapports`, privé, créé par la migration
-- (INSERT INTO storage.buckets). Lecture par URL signée depuis l'EF.
```

### Edge Function `admin-rapport` (verify_jwt on, droits par site)

| Action | Entrée | Sortie |
|---|---|---|
| `preparer` | `{ appId, mois }` | `{ contenu, commits, evolutions_proposees, sources_manquantes[] }`. Construit les sections 2 à 5, lit GitHub, appelle le modèle une fois pour les évolutions (si commits). |
| `rediger` | `{ appId, mois, ebauche, highlights }` | `{ commentaire }`. Un appel modèle. |
| `enregistrer` | `{ appId, mois, contenu, ebauche, evolutions, commentaire, pdf_base64 }` | `{ id, version, pdf_path }`. Calcule la version, dépose le PDF, insère la ligne. |
| `liste` | `{ appId }` | `{ lignes: [{ id, mois, version, genere_le, url }] }`, URL signée 1 h. |

Fichiers : `index.ts` (routage, droits), `faits.ts` (sections 2 à 4),
`highlights.ts` (règles, fonctions pures testables), `github.ts`,
`redaction.ts` (prompts + appel OpenAI). Tests Deno sur `highlights.ts`.

### Front

- Route `/rapports` (`AdminRoute`), page `src/pages/Rapports.jsx`, entrée
  « Rapports » dans `MODULES_TRANSVERSES` entre Finances et SEO.
- Page : sélecteur de mois (par défaut le mois précédent), bouton
  « Préparer ». Puis, dans l'ordre : aperçu des faits (tableaux HTML
  réutilisant le style de `/finances`), champ « Évolutions du logiciel »
  pré-rempli, champ « Ébauche » + bouton « Rédiger » qui remplit le champ
  « Commentaire du mois » éditable, bouton « Générer le PDF ». En bas, liste
  des rapports archivés du site avec lien de téléchargement.
- `src/components/rapports/RapportPdf.jsx` : le document `@react-pdf/renderer`
  (A4, marges 18 mm, Helvetica, tableaux). Chargé par `import()` dynamique
  pour ne pas alourdir le bundle principal.
- `src/services/rapport.service.js` : appels EF.
- `/sites` : champ « Dépôt GitHub (owner/repo) ».

### Secrets et paramétrage

- `ADMIN_GITHUB_TOKEN` : jeton GitHub à granularité fine, lecture seule
  « Contents » sur le dépôt du site. Posé par Eric (`npx supabase secrets set`).
- `config.apps.repo_github = 'Ricou-IA/Packvendeur'` pour pack-vendeur, via
  `/sites`.

## Hors lot

Envoi par email, graphiques dans le PDF, rapport pour d'autres partenaires
que celui du site (un seul contrat par site aujourd'hui), traduction.
