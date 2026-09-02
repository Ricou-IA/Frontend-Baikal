# Pré-état-daté — publier les vues de la fiche commune Baikal

Baikal (le back-office unique) affiche désormais la fiche d'un dossier avec
huit onglets identiques pour tous les produits, lus dans des vues SQL que
chaque produit publie. Pré-état-daté expose déjà `baikal_dossiers`,
`baikal_dossier_emails` et `baikal_dossier_events` : il manque six vues et
deux actions d'Edge Function.

Toutes les vues sont en lecture seule pour le rôle `baikal_reader`, dans le
schéma `public` (projet dédié). Seule la colonne `dossier_id` est obligatoire
dans chacune : toute colonne absente est simplement non affichée côté Baikal.

## 1. `public.baikal_dossier_champs`

Les champs métier de l'onglet Vue (le bloc « BIEN » de l'ancien /admin).
Colonnes : `dossier_id text`, `section text`, `ordre_section int`,
`libelle text`, `ordre int`, `valeur text`, `format text`, `niveau text`.

- `format` ∈ `texte` (défaut) `euro` `date` `datetime` `pourcent` `nombre`
  `octets` `booleen` `lien` `mono` — donne la valeur BRUTE dans `valeur`,
  Baikal applique le formatage.
- `niveau` ∈ `attention` / `danger` (sinon NULL) — surligne le champ.
  L'ancien encart « écart de X % sur les tantièmes » devient un champ de
  section `COPROPRIETE` avec `niveau = 'attention'` quand
  `charges_discrepancy_pct >= 20`.
- Attendu : une section `BIEN` (adresse, ville, lot, surface, copropriété,
  syndic) et une section `COPROPRIETE` (charges, tantièmes) construites en
  dépliant les colonnes du dossier — typiquement par un `LATERAL` sur une
  liste de `VALUES`.

## 2. `public.baikal_dossier_documents`

Les pièces déposées. Source : la table des documents du dossier.
Colonnes : `dossier_id text`, `document_id text`, `libelle text`,
`nature text`, `type text`, `mime text`, `taille_octets bigint`,
`pages int`, `depose_le timestamptz`, `source text`, `statut text`,
`ouvrable boolean`, `details jsonb`.

- `nature` = `'fichier'` pour tous les documents PED.
- `libelle` = `COALESCE(normalized_filename, original_filename)`.
- `type` = `document_type` (le type métier, affiché tel quel).
- `taille_octets` = `file_size_bytes`, `pages` = `page_count`.
- `ouvrable` = `true` (l'Edge Function sait signer une URL).
- `details` = `jsonb_build_object('Confiance IA', round(ai_confidence * 100) || ' %')`
  quand `ai_confidence` n'est pas NULL, sinon NULL.

## 3. `public.baikal_dossier_resultats`

Ce que l'outil a produit. Une ligne par livrable.
Colonnes : `dossier_id text`, `resultat_id text`, `libelle text`,
`nature text`, `produit_le timestamptz`, `version int`, `statut text`,
`url_publique text`, `consulte_le timestamptz`, `telechargements int`,
`ouvrable boolean`, `details jsonb`.

Deux lignes attendues par dossier, en `UNION ALL` :

- le PDF : `resultat_id = 'pdf'`, `libelle = 'Pré-état-daté (PDF)'`,
  `nature = 'document'`, `ouvrable = true`, `telechargements = download_count` ;
- le lien notaire : `resultat_id = 'partage'`,
  `libelle = 'Lien de partage notaire'`, `nature = 'lien_partage'`,
  `url_publique` = l'URL de partage, `consulte_le = notary_accessed_at`,
  `ouvrable = false`.

## 4. `public.baikal_dossier_messages`

Le chat. La table PED stocke question et réponse sur une même ligne : la vue
doit les **dégrouper en deux lignes** avec `UNION ALL`.
Colonnes : `dossier_id text`, `message_id text`, `survenu_le timestamptz`,
`role text`, `contenu text`, `canal text`, `contexte text`, `details jsonb`.

- ligne 1 : `role = 'client'`, `contenu = question` ;
- ligne 2 : `role = 'assistant'`, `contenu = answer` ;
- `contexte = page_path`, `survenu_le = created_at` (ajoute quelques
  millisecondes à la réponse si tu veux garantir l'ordre d'affichage).

## 5. `public.baikal_dossier_ia`

Les appels IA. Source : la table des logs IA.
Colonnes : `dossier_id text`, `survenu_le timestamptz`, `operation text`,
`modele text`, `tokens_entree int`, `tokens_sortie int`, `tokens_total int`,
`cout_usd numeric`, `latence_ms int`, `statut text`, `erreur text`,
`details jsonb`.

- `operation` = `prompt_type`, `modele` = `COALESCE(model_used, model)`.
- `statut` = `'erreur'` si la colonne d'erreur est renseignée, sinon `'ok'`.
- Ne fournis PAS de total : Baikal somme `cout_usd` lui-même.

## 6. `public.baikal_dossier_donnees`

Le brut. Une ligne par bloc.
Colonnes : `dossier_id text`, `bloc text`, `libelle text`, `ordre int`,
`contenu jsonb`, `maj_le timestamptz`.

Blocs attendus : `extracted_data` (« Données extraites »), `validated_data`
(« Données validées »). N'inclus une ligne que si le JSON n'est pas NULL.

## 7. Droits

```sql
GRANT SELECT ON public.baikal_dossier_champs,
                public.baikal_dossier_documents,
                public.baikal_dossier_resultats,
                public.baikal_dossier_messages,
                public.baikal_dossier_ia,
                public.baikal_dossier_donnees
  TO baikal_reader;
```

## 8. Deux actions dans `pv-admin-dossiers`

### `manifeste`

Entrée : `{ action: "manifeste", dossier_id }`. Sortie :
`{ actions: [ … ] }`. Chaque action :
`{ id, libelle, icone, variante, super_admin, confirmation, parametres }`.

- `icone` ∈ `send` `refresh` `coins` `trash` `mail` `download` `check` `alert`
  (tout autre nom est ignoré par Baikal).
- `variante` ∈ `neutre` (défaut) / `danger`.
- `confirmation` = `{ titre, message, bouton }` ou `null`.
- `parametres[]` = `{ id, type, libelle, options?, min?, max?, defaut? }`,
  `type` ∈ `choix` `nombre` `texte` `booleen`. Un `choix` doit fournir
  `options: [{valeur, libelle}]` non vide.

**Le manifeste est calculé pour CE dossier** : n'expose `add-pro-credits`
que si le dossier est B2B. C'est ce qui évite d'écrire des règles métier
dans Baikal.

Actions à déclarer : `resend-email` (paramètre `choix` `emailAction` avec les
cinq types d'email), `re-extract`, `reset-extractions`, `add-pro-credits`
(paramètre `nombre` `credits`, min 1, max 100, `super_admin: true`),
`purge-documents` (`variante: danger`, `super_admin: true`, confirmation
renseignée).

### `fichier`

Entrée : `{ action: "fichier", dossier_id, cible, id }` où `cible` vaut
`document` ou `resultat` et `id` est le `document_id` / `resultat_id` de la
vue. Sortie : `{ url, expire_le }` — une URL signée, même TTL qu'aujourd'hui.
Vérifie que l'identifiant appartient bien au dossier demandé.

## 9. Règles inchangées

- L'autorisation reste le secret partagé `X-Baikal-Key`, et l'Edge Function
  **revérifie elle-même** les actions réservées : le `super_admin` du
  manifeste sert à construire l'interface, il ne fait pas autorité.
- L'action `detail` reste en place jusqu'à la bascule de Baikal ; elle sera
  retirée ensuite.
