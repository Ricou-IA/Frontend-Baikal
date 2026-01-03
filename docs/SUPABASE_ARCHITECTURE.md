# BAIKAL - Architecture Supabase

> Documentation complète de l'architecture base de données, sécurité et Edge Functions

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Schémas de base de données](#schémas-de-base-de-données)
3. [Tables principales](#tables-principales)
4. [Hiérarchie des rôles](#hiérarchie-des-rôles)
5. [Row Level Security (RLS)](#row-level-security-rls)
6. [Fonctions Helper](#fonctions-helper)
7. [Edge Functions](#edge-functions)
8. [Layers de documents](#layers-de-documents)
9. [Bonnes pratiques](#bonnes-pratiques)
10. [Scripts de maintenance](#scripts-de-maintenance)

---

## Vue d'ensemble

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Edge Functions | Deno (TypeScript) |
| IA | OpenAI + Google Gemini |

### Identifiants projet

```
Project Ref: odspcxgafcqxjzrarsqf
URL: https://odspcxgafcqxjzrarsqf.supabase.co
Region: (à compléter)
```

---

## Schémas de base de données

La base utilise une architecture multi-schémas pour séparer les responsabilités :

```
┌─────────────────────────────────────────────────────────────┐
│                      BASE DE DONNÉES                         │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     core     │     rag      │    config    │   legifrance   │
│              │              │              │                │
│ - profiles   │ - documents  │ - apps       │ - codes        │
│ - orgs       │ - messages   │ - concepts   │ - code_domains │
│ - projects   │ - citations  │ - categories │                │
│ - members    │ - tables     │ - prompts    │                │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

### Schéma `core` - Données métier

Gestion des utilisateurs, organisations et projets.

### Schéma `rag` - Retrieval Augmented Generation

Stockage des documents vectorisés, conversations et mémoire IA.

### Schéma `config` - Configuration

Paramétrage de l'application, concepts, catégories.

### Schéma `legifrance` - Données juridiques

Codes et articles de loi synchronisés depuis Légifrance.

---

## Tables principales

### `core.profiles`

Profils utilisateurs liés à `auth.users`.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK, lié à auth.users.id |
| `email` | text | Email de l'utilisateur |
| `full_name` | text | Nom complet |
| `org_id` | uuid | FK vers organizations |
| `app_role` | text | Rôle applicatif (super_admin, org_admin, null) |
| `business_role` | text | Rôle métier (provider, client) |
| `app_id` | text | Application par défaut |
| `avatar_url` | text | URL de l'avatar |
| `bio` | text | Biographie |
| `created_at` | timestamptz | Date de création |
| `updated_at` | timestamptz | Date de mise à jour |

### `core.organizations`

Organisations/entreprises.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `name` | text | Nom de l'organisation |
| `plan` | text | Plan tarifaire (free, team, enterprise) |
| `credits_balance` | integer | Solde de crédits |
| `stripe_customer_id` | text | ID client Stripe |
| `app_id` | text | Application principale |
| `created_at` | timestamptz | Date de création |
| `updated_at` | timestamptz | Date de mise à jour |

### `core.projects`

Projets au sein des organisations.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `org_id` | uuid | FK vers organizations |
| `name` | text | Nom du projet |
| `slug` | text | Identifiant URL |
| `description` | text | Description |
| `status` | text | Statut du projet |
| `identity` | jsonb | Métadonnées du projet |
| `created_by` | uuid | Créateur |
| `created_at` | timestamptz | Date de création |
| `updated_at` | timestamptz | Date de mise à jour |

### `core.project_members`

Membres des projets.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `project_id` | uuid | FK vers projects |
| `user_id` | uuid | FK vers profiles |
| `role` | text | Rôle dans le projet (leader, member) |
| `status` | text | Statut (active, invited) |
| `invited_email` | text | Email si invitation en attente |
| `invited_by` | uuid | Invitant |
| `invited_at` | timestamptz | Date d'invitation |
| `created_at` | timestamptz | Date de création |
| `updated_at` | timestamptz | Date de mise à jour |

### `core.organization_members`

Membres des organisations.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `org_id` | uuid | FK vers organizations |
| `user_id` | uuid | FK vers profiles |
| `role` | text | Rôle (owner, admin, member) |
| `status` | text | Statut (active, invited) |
| `invited_email` | text | Email si invitation |
| `invited_by` | uuid | Invitant |
| `created_at` | timestamptz | Date de création |
| `updated_at` | timestamptz | Date de mise à jour |

### `rag.documents`

Documents vectorisés pour le RAG.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | bigint | PK |
| `content` | text | Contenu textuel du chunk |
| `embedding` | vector(1536) | Vecteur OpenAI text-embedding-3-small |
| `metadata` | jsonb | Métadonnées (titre, page, etc.) |
| `target_apps` | text[] | Applications ciblées |
| `target_projects` | uuid[] | Projets ciblés |
| `org_id` | uuid | Organisation propriétaire |
| `created_by` | uuid | Créateur |
| `source_file_id` | uuid | Fichier source |
| `layer` | document_layer | Niveau de visibilité (app, org, project, user) |
| `status` | document_status | Statut du document |
| `quality_level` | quality_level | Niveau de qualité |
| `fts` | tsvector | Index full-text search |
| `created_at` | timestamptz | Date de création |
| `updated_at` | timestamptz | Date de mise à jour |

### `rag.conversations`

Conversations avec l'IA.

### `rag.messages`

Messages dans les conversations.

### `config.concepts`

Concepts/tags pour classifier les documents.

### `config.document_categories`

Catégories de documents.

### `config.agent_prompts`

Prompts système pour les agents IA.

---

## Hiérarchie des rôles

```
┌─────────────────────────────────────────────────────────────┐
│                      SUPER_ADMIN                             │
│                    (God Mode - Tout)                         │
├─────────────────────────────────────────────────────────────┤
│                       ORG_ADMIN                              │
│              (Tout dans son organisation)                    │
├─────────────────────────────────────────────────────────────┤
│                        LEADER                                │
│        (Voit/modifie son projet + ses données)              │
├─────────────────────────────────────────────────────────────┤
│                         USER                                 │
│          (Voit le projet, modifie ses données)              │
└─────────────────────────────────────────────────────────────┘
```

### Détail des permissions

| Rôle | Voir | Modifier | Supprimer |
|------|------|----------|-----------|
| **super_admin** | Tout | Tout | Tout |
| **org_admin** | Son org + tous ses projets | Son org + tous ses projets | Son org + tous ses projets |
| **leader** | Son projet + ses données | Son projet + ses données | Son projet + ses données |
| **user** | Son projet + ses données | Ses données uniquement | Ses données uniquement |

### Stockage des rôles

| Rôle | Table | Colonne | Valeur |
|------|-------|---------|--------|
| super_admin | `core.profiles` | `app_role` | `'super_admin'` |
| org_admin | `core.profiles` | `app_role` | `'org_admin'` |
| leader | `core.project_members` | `role` | `'leader'` |
| user | `core.project_members` | `role` | `'member'` ou NULL |

---

## Row Level Security (RLS)

### Principe

Toutes les tables sensibles ont RLS activé. Les policies utilisent des fonctions helper `SECURITY DEFINER` pour éviter la récursion.

### Fonctions Helper

```sql
-- Vérifie si l'utilisateur est super_admin
core.rls_is_super_admin(uid uuid) → boolean

-- Vérifie si l'utilisateur est org_admin
core.rls_is_org_admin(uid uuid) → boolean

-- Récupère l'org_id de l'utilisateur
core.rls_get_user_org_id(uid uuid) → uuid

-- Récupère les project_ids de l'utilisateur
core.rls_get_user_project_ids(uid uuid) → uuid[]

-- Récupère les project_ids où l'utilisateur est leader
core.rls_get_user_leader_project_ids(uid uuid) → uuid[]

-- Récupère les user_ids des co-membres de projets
core.rls_get_project_coworker_ids(uid uuid) → uuid[]
```

### Policies par table

#### `core.profiles`

```sql
-- SELECT : super_admin OU org_admin de son org OU co-membres de projets OU soi-même
CREATE POLICY "profiles_select_secure" ON core.profiles
    FOR SELECT USING (
        core.rls_is_super_admin(auth.uid())
        OR (core.rls_is_org_admin(auth.uid()) AND org_id = core.rls_get_user_org_id(auth.uid()))
        OR id = ANY(core.rls_get_project_coworker_ids(auth.uid()))
        OR auth.uid() = id
    );

-- UPDATE : super_admin OU org_admin de son org OU soi-même
CREATE POLICY "profiles_update_secure" ON core.profiles
    FOR UPDATE USING (
        core.rls_is_super_admin(auth.uid())
        OR (core.rls_is_org_admin(auth.uid()) AND org_id = core.rls_get_user_org_id(auth.uid()))
        OR auth.uid() = id
    );
```

#### `core.organizations`

```sql
-- SELECT : super_admin OU membre de l'org
CREATE POLICY "orgs_select_secure" ON core.organizations
    FOR SELECT USING (
        core.rls_is_super_admin(auth.uid())
        OR id = core.rls_get_user_org_id(auth.uid())
    );

-- UPDATE : super_admin OU org_admin de cette org
CREATE POLICY "orgs_update_secure" ON core.organizations
    FOR UPDATE USING (
        core.rls_is_super_admin(auth.uid())
        OR (id = core.rls_get_user_org_id(auth.uid()) AND core.rls_is_org_admin(auth.uid()))
    );
```

#### `rag.documents`

```sql
-- SELECT : avec logique des layers
CREATE POLICY "documents_select_secure" ON rag.documents
    FOR SELECT USING (
        core.rls_is_super_admin(auth.uid())
        OR (core.rls_is_org_admin(auth.uid()) AND org_id = core.rls_get_user_org_id(auth.uid()))
        OR (layer = 'app' AND auth.uid() IS NOT NULL)
        OR (layer = 'org' AND org_id = core.rls_get_user_org_id(auth.uid()))
        OR (layer = 'project' AND target_projects && core.rls_get_user_project_ids(auth.uid()))
        OR (layer = 'user' AND created_by = auth.uid())
    );
```

### Tables avec accès authentifié uniquement

Ces tables sont accessibles en lecture à tous les utilisateurs authentifiés :

- `config.concepts`
- `rag.citations`
- `rag.document_concepts`
- `rag.document_tables`

```sql
CREATE POLICY "table_select_auth" ON schema.table
    FOR SELECT TO authenticated USING (true);
```

---

## Fonctions Helper

### Création des fonctions RLS

```sql
-- Template pour créer une fonction helper RLS
CREATE OR REPLACE FUNCTION core.rls_function_name(uid uuid)
RETURNS return_type
LANGUAGE sql
SECURITY DEFINER  -- IMPORTANT: bypass RLS pour éviter récursion
STABLE            -- Optimisation: résultat constant pour une transaction
SET search_path = core  -- Sécurité: évite injection de schéma
AS $$
    SELECT ... FROM core.table WHERE id = uid;
$$;
```

### Pourquoi SECURITY DEFINER ?

Sans `SECURITY DEFINER`, une policy sur `profiles` qui fait `SELECT FROM profiles` créerait une récursion infinie. Avec `SECURITY DEFINER`, la fonction s'exécute avec les droits du créateur (bypass RLS).

---

## Edge Functions

### Liste des fonctions

| Fonction | Description | Authentification |
|----------|-------------|------------------|
| `baikal-brain` | Query Analyzer + Proxy vers Librarian | Bearer token |
| `baikal-librarian` | RAG principal (recherche + génération) | Bearer token |
| `baikal-vote` | Feedback utilisateur (👍/👎) | Bearer token |
| `get-concepts` | Récupération des concepts | Bearer token |
| `ingest-documents` | Ingestion de documents avec embeddings | Service role |
| `generate-concept-embeddings` | Génération d'embeddings pour concepts | Service role |
| `transcribe-dictation` | Transcription audio → texte | Bearer token |
| `meeting-transcribe` | Transcription de réunions | Bearer token |
| `extract-meeting-content` | Extraction de contenu de réunion | Service role |
| `trigger-legifrance-sync` | Synchronisation Légifrance | Service role |
| `sync-ademe` | Synchronisation ADEME | Service role |

### Architecture des Edge Functions

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Client    │────▶│  baikal-brain   │────▶│ baikal-librarian │
│  (Frontend) │     │ (Query Analyzer)│     │   (RAG + LLM)    │
└─────────────┘     └─────────────────┘     └──────────────────┘
                            │                        │
                            ▼                        ▼
                    ┌───────────────┐        ┌──────────────┐
                    │   Supabase    │        │   OpenAI /   │
                    │   Database    │        │   Gemini     │
                    └───────────────┘        └──────────────┘
```

### Variables d'environnement requises

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
SUPABASE_ANON_KEY=eyJhbG...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### CORS Configuration

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
```

### Déploiement

```bash
# Déployer une fonction
npx supabase functions deploy nom-fonction

# Déployer toutes les fonctions
npx supabase functions deploy --all

# Voir les logs
npx supabase functions logs nom-fonction
```

---

## Layers de documents

Le système utilise 4 niveaux de visibilité pour les documents :

```
┌─────────────────────────────────────────────────────────────┐
│                          APP                                 │
│         Visible par tous les utilisateurs authentifiés       │
│                      (497 documents)                         │
├─────────────────────────────────────────────────────────────┤
│                          ORG                                 │
│           Visible par les membres de l'organisation          │
├─────────────────────────────────────────────────────────────┤
│                        PROJECT                               │
│            Visible par les membres du projet                 │
│                      (75 documents)                          │
├─────────────────────────────────────────────────────────────┤
│                          USER                                │
│              Visible uniquement par le créateur              │
└─────────────────────────────────────────────────────────────┘
```

### Type ENUM

```sql
CREATE TYPE document_layer AS ENUM ('app', 'org', 'project', 'user');
```

### Logique RLS

```sql
-- Layer APP : tous les authentifiés
(layer = 'app' AND auth.uid() IS NOT NULL)

-- Layer ORG : membres de l'org
(layer = 'org' AND org_id = core.rls_get_user_org_id(auth.uid()))

-- Layer PROJECT : membres du projet
(layer = 'project' AND target_projects && core.rls_get_user_project_ids(auth.uid()))

-- Layer USER : créateur uniquement
(layer = 'user' AND created_by = auth.uid())
```

---

## Bonnes pratiques

### 1. Toujours activer RLS

```sql
ALTER TABLE schema.table ENABLE ROW LEVEL SECURITY;
```

### 2. Éviter USING (true)

❌ Mauvais :
```sql
CREATE POLICY "bad_policy" ON table FOR SELECT USING (true);
```

✅ Bon :
```sql
CREATE POLICY "good_policy" ON table FOR SELECT USING (auth.uid() IS NOT NULL);
```

### 3. Utiliser SECURITY DEFINER pour les fonctions helper

```sql
CREATE FUNCTION helper()
RETURNS boolean
SECURITY DEFINER  -- Bypass RLS
SET search_path = schema  -- Éviter injection
AS $$ ... $$;
```

### 4. Tester les policies

```sql
-- Simuler un accès anonyme
SET ROLE anon;
SELECT * FROM table; -- Doit échouer
RESET ROLE;

-- Simuler un utilisateur authentifié
SET LOCAL "request.jwt.claims" = '{"sub": "user-uuid-here"}';
SELECT * FROM table;
```

### 5. Edge Functions : toujours valider l'auth

```typescript
const authHeader = req.headers.get('Authorization')
if (!authHeader) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
}
```

### 6. Utiliser SERVICE_ROLE_KEY uniquement côté serveur

- `ANON_KEY` : Frontend, accès limité par RLS
- `SERVICE_ROLE_KEY` : Edge Functions, bypass RLS

---

## Scripts de maintenance

### Vérifier l'état RLS

```sql
-- Tables avec RLS activé
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname IN ('core', 'rag', 'config')
ORDER BY schemaname, tablename;
```

### Lister les policies

```sql
-- Toutes les policies
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname IN ('core', 'rag', 'config')
ORDER BY schemaname, tablename, cmd;
```

### Voir le détail d'une policy

```sql
SELECT
    schemaname,
    tablename,
    policyname,
    qual as "USING clause",
    with_check as "WITH CHECK clause"
FROM pg_policies
WHERE tablename = 'nom_table';
```

### Tester l'accès anonyme

```sql
SET ROLE anon;
SELECT COUNT(*) FROM core.profiles; -- Doit échouer
RESET ROLE;
```

### Recréer les fonctions helper

```sql
-- Si besoin de recréer les fonctions RLS
-- Voir section "Fonctions Helper" ci-dessus
```

---

## Historique des modifications

| Date | Version | Description |
|------|---------|-------------|
| 2026-01-03 | 1.0 | Audit initial + correction RLS |

---

## Contacts

- **Projet** : BAIKAL
- **Repository** : Frontend-Baikal
- **Supabase Dashboard** : https://supabase.com/dashboard/project/odspcxgafcqxjzrarsqf
