# CLAUDE.md - Baikal Platform

## Project Overview

**Baikal** is a multi-tenant SaaS platform for the construction industry (BTP - Batiment et Travaux Publics). It provides AI-powered document analysis, RAG-based Q&A, and project management tools. The platform currently runs one vertical app: **ARPET** (Assistant de Recherche de Projet et Expertise Technique).

### Positionnement produit (2026-09-07)

Baikal est né console d'administration d'ARPET, puis est devenu la console de tous
les sites de Confer. Décision d'Eric du 07/09/2026 : en faire un **produit vendable
aux fondateurs qui vibecodent un SaaS** et n'ont pas l'énergie du backend — en gardant
la règle « d'abord pour nous ». Exigence réelle : **une base Postgres, où qu'elle soit**
(connexion directe via `baikal_reader`) ; Stripe ne sert qu'au module Finances ; MySQL,
Mongo ou SQLite ne marchent pas. Ne pas présenter Baikal comme « Supabase + Stripe »
(correction d'Eric du 08/09/2026). Décision du 08/09 : la console doit être utilisable
sur un téléphone (usage « compagnon »).

- On ne vend PAS « un admin panel » (Admin Pilot, Bricks.sh, Flashboard, Forest Admin
  occupent le CRUD générique). On vend ce que personne ne fait : le **portefeuille**
  (N sites, N projets Supabase, une console), le **contrat plutôt que le schéma**
  (le site publie `baikal_dossiers` + funnel, Baikal en déduit ses capacités), la
  **jointure base + Stripe + Search Console**, et l'**onboarding par l'agent du
  client** (le contrat d'intégration livré comme prompt à coller dans Cursor / Claude
  Code).
- Séquence : contrat d'intégration public → 2-3 partenaires de conception branchés
  à la main sur le Baikal hébergé → prix annoncé → l'étage locataire (compte au-dessus
  des sites, secrets par compte, ARPET sorti en module) ne se construit que si ça paie.
- Landing publique : `src/pages/marketing/Baikal.jsx` (route `/`). Demandes d'accès :
  table `admin.demandes` + EF `baikal-demande` (verify_jwt off, honeypot, limite par
  IP), lues comme prospects du site Baikal (vue `admin.baikal_prospects`, page `/prospect` ; `/baikal?tab=demandes` y redirige). L'ancienne route marketing
  `/baikal` a été retirée : elle masquait l'étage console du même chemin.

- **Frontend:** React 18 + Vite + TailwindCSS (JSX, no TypeScript)
- **Backend:** Supabase (Postgres, Edge Functions in Deno/TypeScript, Storage, Auth)
- **Ingestion pipeline:** n8n workflows (FLUX 1-6) calling Supabase Edge Functions
- **Deployment:** Vercel (frontend) + Supabase Cloud (backend)
- **AI Models:** OpenAI (embeddings, generation), Google Gemini (file analysis, generation), Cohere (reranking - feature flagged), LlamaParse (document parsing)

## Architecture

> **Repartition des repos** : le chat RAG (consommation SSE de `baikal-retrieval`) est
> implemente dans le repo **Frontend-ARPET** (`Dashboard.tsx`,
> `src/services/chat/chat-sse.ts`). **Frontend-Baikal** porte la console
> (connaissances, admin, users) ; son onglet chat est un placeholder.

### Frontend (`src/`)
```
src/
  components/     # Reusable UI components (SmartUploader, AudioRecorder, admin/, ui/, brand/)
  config/         # App configuration (api, constants, routes, rag-layers, ingestion)
  contexts/       # React contexts (Auth, App, Toast)
  features/       # Feature modules (users)
  hooks/          # Custom hooks (useAsync, useForm, useFileUpload, useOrganization...)
  layouts/        # Page layouts
  pages/          # Route pages (Dashboard, Admin, Settings, Login, Onboarding...)
  services/       # API service layer (auth, documents, projects, organizations, storage...)
  shared/         # Shared utilities
  utils/          # Utility functions
```

### Supabase Edge Functions (`supabase/functions/`)

| Function | Role |
|----------|------|
| `baikal-retrieval` | **Main pipeline v2.0** - Unified retrieval with Agentic RAG (see below) |
| `baikal-brain-v3` | Legacy orchestrator (intent detection, query rewriting) - integrated in baikal-retrieval |
| `baikal-librarian-v4` | Legacy retrieval + generation - replaced by baikal-retrieval |
| `ingest-documents` | Receives chunks from n8n, stores in rag.documents with embeddings |
| `trigger-ingestion` | Triggers n8n ingestion workflow from DB events |
| `get-concepts` | Returns concept taxonomy for GraphRAG |
| `generate-document` | Document generation from RAG context |
| `meeting-transcribe` | Audio transcription (Gladia) |
| `meeting-extract` / `extract-meeting-content` | Meeting content extraction |
| `baikal-vote` | User feedback on RAG answers |
| `create-user` | User creation |
| `mcp-server` | MCP server for external integrations |

### Database Schemas

| Schema | Purpose | Key Tables |
|--------|---------|------------|
| `core` | Multi-tenant foundation | organizations, projects, organization_members, project_members, profiles, invitations |
| `config` | App configuration | apps, agent_prompts, concepts, document_categories |
| `rag` | RAG engine | documents (chunks+embeddings), document_concepts, document_tables, conversations, messages, qa_memory, citations, gemini_caches |
| `sources` | Document management | files, ingestion_queue |
| `arpet` | ARPET app-specific | meetings, saved_conversations |

### Key SQL Functions

| Schema | Function | Purpose |
|--------|----------|---------|
| `rag` | `match_documents_v13` / `v14` | Hybrid search (vector + FTS + GraphRAG + RRF fusion) |
| `rag` | `resolve_chunk_hierarchy` | Links L1 chunks to their L0 parent sections |
| `rag` | `get_agent_context` | Loads full context for LLM (prompts, project identity, concepts) |
| `rag` | `find_or_create_conversation` | Conversation management with history |
| `rag` | `search_qa_memory` | Searches validated Q&A pairs for reuse |
| `sources` | `complete_ingestion_job` | Updates ingestion queue status after processing |
| `sources` | `send_to_n8n` | Triggers n8n webhook for document ingestion |

### Ingestion Pipeline (n8n)

```
FLUX 1 (Orchestrator) → Routes by file type
  ├── FLUX 3 (Documents: PDF, DOCX, Images)
  │     LlamaParse → Gemini semantic analysis → Chunking → Edge Function ingest
  ├── FLUX 4 (Excel) → NOT IMPLEMENTED
  ├── FLUX 2 (Text) → NOT IMPLEMENTED
  └── FLUX 6 (Meeting Transcripts) → Chunking → Edge Function ingest
```

### RAG Pipeline (baikal-retrieval v2.0)

```
User query → baikal-retrieval v2.0
  ├── Analyse heuristique (intent par mots-clés, routing/analyzer.ts) + condensation des suivis (routing/condenser.ts, Gemini flash-lite)
  ├── Phase A: Fast Path
  │     → Embedding (text-embedding-3-small)
  │     → Hybrid search (match_documents_v14)
  │     │   ├── Vector search (cosine similarity)
  │     │   ├── Full-text search (French tsvector)
  │     │   └── GraphRAG (concept expansion)
  │     → RRF fusion (k=60)
  │     → [Optional: Cohere reranking - disabled for MVP]
  │     → Quality gate: enough chunks + good similarity? → Generate response (SSE)
  │
  └── Phase B: Agentic (if fast path insufficient)
        → Gemini 2.5 Flash orchestrator (tool-calling, ReAct loop)
        │   ├── Tool: search_documents (hybrid search with reformulated query)
        │   ├── Tool: list_project_files (list available documents)
        │   └── Tool: search_in_file (targeted search in specific file)
        → Max 3 iterations, 8s timeout budget
        → SSE events: agent_thinking, agent_searching, agent_found
        → Streaming final generation via Gemini
```

#### baikal-retrieval v2.0 File Structure
```
supabase/functions/baikal-retrieval/
  index.ts              ← Main handler: Phase A + quality gate + agentic decision
  config.ts             ← DB config loader (brain, librarian, features, agentic)
  types.ts              ← All TypeScript interfaces
  utils.ts              ← Timer, hashing utilities
  context.ts            ← Agent context loader (conversation, project identity)
  sources.ts            ← Source citation builder
  agentic/
    orchestrator.ts     ← ReAct loop (runAgenticLoop) + quality gate (shouldTriggerAgentic)
    tools.ts            ← 3 tool declarations + execution + file resolution
    gemini-agent.ts     ← Gemini 2.5 Flash client (tool-calling + streaming)
  search/
    retrieval.ts        ← executeSearch (calls match_documents_v14)
    embedding.ts        ← OpenAI text-embedding-3-small
    memory.ts           ← QA memory search/increment
    reranker.ts         ← Cohere reranking (feature-flagged, disabled)
  routing/
    router.ts           ← Route resolution + conversational handling
    analyzer.ts         ← Fallback analysis builder
    cross-ref.ts        ← Cross-document reference detection
    safety.ts           ← Safety checks
  generation/
    prompt.ts           ← System prompt builder + context formatting
    openai.ts           ← OpenAI streaming generation (fast path)
    gemini.ts           ← Gemini streaming generation (fast path, file-based)
```

### Document Hierarchy

Chunks have two levels:
- **Level 0 (sections):** AI-generated summaries of document sections
- **Level 1 (details):** Original text content, linked to parent L0 via `parent_chunk_id`

Each chunk can have:
- `embedding` (vector 1536d) for semantic search
- `fts` (tsvector) for full-text search
- `qqoqccp` (JSONB) for structured BTP metadata (Qui/Quoi/Ou/Quand/Comment/Combien/Pourquoi)
- `document_concepts` links for GraphRAG expansion
- Denormalized columns: `quand_phase`, `quand_date`, `qui_lots`, `comment_normes`, `contenu_types`

## Configuration

RAG behavior is configured in `config.agent_prompts` (DB table), JSONB `parameters`:
- `brain_v3`: Intent detection config (model, routing, analysis)
- `librarian_v3`: Retrieval + generation config (search, scoring, generation, prompts, agentic)

Key parameters (current values):
- `parameters.search`: match_count, intent_config, max_context_length (30000)
- `parameters.generation`: model, temperature, max_tokens, intent_overrides
- `parameters.prompts`: identity, behavior, restrictions
- `parameters.features`: enable_reranking (false), cohere_model, adaptive_threshold
- `parameters.agentic`: Agentic RAG configuration (see below)

#### Agentic Config (`parameters.agentic`)
| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Enable/disable agentic mode |
| `model` | `gemini-2.5-flash` | LLM for orchestration (tool-calling) |
| `max_iterations` | `3` | Maximum tool calls per query |
| `timeout_ms` | `8000` | Total time budget for agentic loop |
| `temperature` | `0.2` | Orchestrator reasoning temperature |
| `quality_threshold` | `3` | Min chunks to use fast path (skip agentic) |
| `similarity_threshold` | `0.45` | Min avg similarity to use fast path |

## Development Notes

### Commands
```bash
npm run dev          # Start Vite dev server
npm run build        # Production build
npx supabase functions deploy <name>  # Deploy edge function
```

### Known Issues / Tech Debt
- FLUX 4 (Excel ingestion) not implemented - Excel files routed to FLUX 3 will fail
- `baikal-brain-v3` and `baikal-librarian-v4` are legacy - use `baikal-retrieval` v2.0 instead
- Some older chunks (pre v5.0.0 pipeline) lack QQOQCCP enrichment
- `processing_status` in `sources.files` may not update if n8n node 3.8b has errors
- Cohere reranking is implemented but disabled for MVP (`enable_reranking: false`)
- Frontend admin settings page not yet updated for baikal-retrieval agentic config
- Les evenements SSE agentiques (`agent_thinking`, `agent_searching`, `agent_found`) arrivent
  comme des evenements `step` generiques et sont affiches par ARPET ; il manque un traitement
  UI dedie. L'evenement SSE `analysis` (intent, rewritten_query) n'est pas consomme cote front.

### Conventions
- Edge Functions use Deno runtime with TypeScript
- Frontend is React JSX (no TypeScript)
- Database uses multi-schema architecture with RLS on all tables
- Public schema functions are SECURITY DEFINER wrappers calling schema-specific functions
- Config is DB-driven via `config.agent_prompts.parameters` (JSONB)
- French language throughout UI, prompts, and documentation

## Modules admin multi-sites (2026-08-20, consolidé le 2026-09-17)

`config.apps` est le **registre des sites administrés** (12 produits déclarés, zelty
inactif ; Baikal lui-même y figure : `id = 'baikal'`, withbaikal.io, modèle « clients »,
`sort_order` 0 — SEO dès que `gsc_propriete` est renseigné, Finances au Stripe, pas de
vue `baikal_dossiers` donc Clients fermé jusqu'à l'étage locataire). Colonnes propres au
site : `domaine`, `gsc_propriete`, `env_url`, `env_secret_ref` (NOM du secret, jamais la
valeur), `env_anon_key`, `env_dossiers_fn`, `db_schema` (schéma des données du produit),
`db_ro_secret_ref` (nom du secret DSN lecture seule des produits sur base dédiée :
`ADMIN_RO_MAJORDHOME_DSN`, `ADMIN_RO_PACKVENDEUR_DSN`), `funnel_etapes`,
`categories_client`, `modele_comptes`, `repo_github`. Créer une app = un simple INSERT,
fait par migration (le trigger `tr_create_documents_cles_on_app_insert` a été supprimé
par `20260824150000_registre_sites_hub.sql`). La vue `public.apps` expose `domaine`,
`db_schema`, `heberge_dedie` — jamais `db_ro_secret_ref`. Règle de partage : les
credentials mutualisés de l'outil vivent dans les secrets Edge Functions, tout ce qui est
propre au site vit dans le registre. Specs et plans : `docs/superpowers/specs/` et
`docs/superpowers/plans/` (2026-08-20-admin-multi-sites-*, 2026-08-24-hub-baikal-acces-
sites-design.md).

- **Lecture des données d'un site** : `supabase/functions/_shared/sites.ts` (`chargerSite`
  + `lecteurSite`, SQL lecture seule via postgres-js — DSN `baikal_reader` sur base dédiée,
  `SUPABASE_DB_URL` en local). Règle d'exploitation : dans chaque projet dédié, le rôle
  `baikal_reader` n'a que des policies SELECT posées par migration — rejouer la boucle
  `CREATE POLICY baikal_read` quand une nouvelle table apparaît. Hosts pooler :
  `aws-1-eu-west-3` (org principale), `aws-0-eu-west-3` (org Pré-état-daté).
- **Console** : enveloppée par `src/components/console/ConsoleLayout.jsx` (header +
  sélecteur de site global `AppProvider`/`AppSelector` + navigation). Onglets contextuels :
  modules ARPET (Dashboard, Connaissances, Prompts, Indexation — `/admin?tab=…`) visibles
  seulement quand le site sélectionné est arpet ; SEO / Partenariats / Utilisateurs / Sites
  sont transverses ; `ConsoleLayout` masque les modules fermés par les droits. Les RPC
  `get_pending_users` / `get_users_for_admin` prennent `p_app_id`.
- **Vue d'ensemble par site** : EF `admin-site-stats` (super_admin) — KPIs par site définis
  dans `admin-site-stats/stats-sites.ts` (pack-vendeur, voirie, majordhome), repli
  générique tables/volumes pour les autres. Affichée sur `/admin` quand le site sélectionné
  n'est pas ARPET. Ajouter un site = une fonction dans `stats-sites.ts`, redéploiement.

### Comptes, droits, étages

- **Deux populations de comptes, jamais mélangées.** `config.apps.modele_comptes` ∈
  organisations|clients (éditable dans `/sites`). *organisations* (arpet, majordhome,
  linktrack) : les comptes sont des membres d'organisations, vivent dans `core.profiles`,
  page Utilisateurs. *clients* (monsieurdpe, voirie, pack-vendeur) : les comptes sont les
  clients du site, vivent dans le schéma du site, page Clients — `handle_new_user` ne crée
  AUCUN `core.profiles` pour eux. Résolution du site d'un compte : `core.resoudre_app(meta)`
  traduit `raw_user_meta_data.source` ou `.application` en id du registre (par l'id ou par
  `db_schema` : 'dpe' → monsieurdpe) ; `core.app_du_profil(app_id, meta)` = `app_id`
  explicite, sinon marqueur résolu, sinon 'arpet'. Les RPC users excluent les sites en
  modèle clients. Un nouveau site à clients = une ligne du registre + son marqueur
  d'inscription (`source` ou `application` = son id ou son `db_schema`), aucun code Baikal.
- **Règle « utilisateur = client »** (décision d'Eric du 08/09/2026) : un compte appartient
  à celui qui le vend. Les clients de Baikal = ceux qui administrent des sites depuis la
  console (super admins, admins délégués de `admin.droits_sites`, comptes créés dans Comptes
  avec `core.profiles.app_id = 'baikal'`) : étage Baikal, onglet Comptes. Les clients de
  chaque site se gèrent dans ce site, jamais dans l'étage : page Clients (modèle
  « clients ») ou page Utilisateurs (modèle « organisations »), où l'org_admin ne voit que
  son organisation (jamais un autre org_admin) et le propriétaire (super admin ou module
  `users` en écriture) tout le site. Le sélecteur « voir comme » (ProfileSwitcher) ne liste
  que les profils du site courant et n'apparaît pas dans l'étage.
- **Droits par site et par module** : table `admin.droits_sites` (service_role only),
  colonne `modules` jsonb `{module: lecture|ecriture}`, absent = fermé (modules :
  `core.modules_console()` = clients, prospects, finances, rapports, seo, partenariats,
  users). Source de vérité `core.droits_modules(uid)` / `public.mes_droits_modules()`
  (sites : `core.sites_autorises(uid)` / `public.mes_droits_sites()`), consommée par
  `AuthContext` (`sitesAdmin`, `niveauModule`, `peutEcrire`), le hook `useDroitModule(module)`,
  le bandeau `LectureSeule`, et par les EF via `_shared/droits.ts` (`sitesAutorises`,
  `exigerSite`, `droitsModules`, `exigerModule(droits, appId, module, 'lecture'|'ecriture')`
  appliqué dans chaque EF admin-* — lecture = consultation, écriture = tout ce qui modifie,
  envoie, génère ou coûte). Deux notions étanches : appartenance org = modules du site ;
  droit délégué = modules transverses. Les org_admin sans droit délégué n'accèdent pas à
  SEO/Partenariats. Défaut à la création : tout en écriture. super_admin = tout, basé sur
  le profil réel ; les super admins n'appartiennent à aucun site (`get_users_for_admin`
  les exclut dès qu'un site est demandé). EF `admin-droits` : list/grant/revoke, grant par
  email d'un compte existant.
- **Deux étages.** Étage site (par site) : modules métier + Utilisateurs + Paramétrage
  (`/sites` : domaine, GSC, env, expéditeur des campagnes, modèle de comptes, accès console
  du site — page super_admin). Étage Baikal (`/baikal`, super_admin, entrée « Baikal » en
  tête du sélecteur, page `src/pages/ConsoleBaikal.jsx`) = étage locataire, deux onglets :
  `/baikal?tab=comptes` (`SectionComptes.jsx` : tout le compte client de Baikal en une
  carte — création, ses sites et le niveau par module via `admin-droits`, statut super admin,
  mot de passe/lien/email/blocage via `admin-comptes` ; « c'est la gestion des comptes qui
  dit quel site on voit ») et `/baikal?tab=sites` (`SectionSites.jsx` : tableau de bord du
  portefeuille, action `sites` d'`admin-comptes` — comptes, organisations, admins délégués,
  SEO/Stripe branchés ; métiers repliés en bas). Anciens onglets redirigés ;
  `/baikal?tab=demandes` redirige vers `/prospect` sur le site Baikal (demandes = prospects
  du site Baikal : vue `admin.baikal_prospects` sur `admin.demandes` + `admin.prospect_action`,
  migration `20260908130000`, métier `fondateur`). Promotion/rétrogradation super admin
  journalisées dans `core.role_changes_log`, jamais soi-même ni le dernier.
- **EF `admin-comptes`** (`scope: 'baikal' | <app_id>`, modales partagées
  `src/components/console/comptes/ModalesCompte.jsx`) : mot de passe (généré 14 car.
  lisibles ou saisi, affiché une fois), lien de réinitialisation `generateLink(recovery)` à
  transmettre soi-même (ne dépend pas de l'email Supabase), renommer, changer l'email
  (confirmé d'office), bloquer/débloquer (`ban_duration` 100 ans / none), créer (périmètre
  baikal seulement). Suppression : EF `delete-user`. Jamais soi-même pour bloquer, jamais
  mot de passe/lien/email d'un autre super admin. Journal `core.role_changes_log`
  (`change_type = account_*`).
- Gotcha `auth.users` : des comptes insérés en SQL avec `confirmation_token` /
  `recovery_token` / `email_change*` NULL font échouer `auth.admin.listUsers` (« Database
  error finding users ») ; corrigé le 08/09 en mettant `''` sur les 5 comptes `@test.com`.

### Modules métier

- **SEO** : page `/seo` (`src/pages/Seo.jsx`) en 4 blocs (vue d'ensemble avec buckets de
  position cliquables et top 50, comparatif période/période avec statuts
  régression/disparue/nouvelle/progression/stable — logique PV ±1 rang, bruit
  < 10 impressions écarté —, Bing vs Google, tous-sites) + EF `admin-seo` — proxy Search
  Console multi-propriétés, droits par site, fenêtres ancrées à J-3. Actions : overview
  (top 50 requêtes par clics ET par impressions, top pages, buckets), compare (période vs
  période), serie (série quotidienne site depuis l'archive), serie-requete (historique
  quotidien d'UNE requête en direct de l'API GSC, filtre query equals — l'archive par
  requête est mensuelle), bing-vs-google (archive `admin.seo_snapshots`), all-sites.
  Helpers `_shared/gsc.ts` (OAuth via `GOOGLE_GSC_OAUTH_*` avec repli `GOOGLE_ADS_OAUTH_*` —
  un seul client Google, projet GCP pre-etat-date-ads) et `_shared/bing-webmaster.ts` (clé
  `BING_WEBMASTER_API_KEY`, propriété = `https://domaine/` vérifiée dans Bing). Archive
  `admin.seo_snapshots` (unique app_id+source+période+dimension+clé, `is_noise` = phrases
  exactes) alimentée par l'EF `admin-seo-snapshot` (`X-Cron-Secret` = `ADMIN_SEO_CRON_SECRET`,
  aussi dans Vault) via 2 crons pg_cron : quotidien 04h15 (série Bing datée + refresh mois
  courant Google), mensuel le 4 à 05h00 (mois civil précédent + tops Bing non datés).
  Backfill : POST `{start,end}`. Limites Bing : aucun historique interrogeable, positions =
  relevé ponctuel. L'archive est l'export : analysable en SQL.
- **Partenariats** : page `/partenariats` + EF `admin-partenariats` — prospects, import
  CSV, sync diagnostiqueurs (fonction SQL `admin.sync_diagnostiqueurs`, INSERT…SELECT depuis
  `dpe.diag_certifie` ON CONFLICT DO NOTHING, cron `admin-sync-diag-prospects` 03h30 +
  bouton console ; source amont synchronisée à 02h30 par le projet DPE), campagnes Resend
  par lots de 50 avec reprise (`restants`), lien de désinscription HMAC (EF
  `admin-desinscription`, verify_jwt off, GET affiche / POST exécute). Tables
  `admin.prospects|campagnes|campagne_envois`, RLS forcée sans policy, accès service_role
  uniquement. `verify_jwt` est ancré dans `config.toml` (admin-partenariats true,
  admin-desinscription false).
- **Clients** : page `/clients` (`src/pages/Clients.jsx`) + EF `admin-dossiers` —
  liste et fiche des clients d'un site, lues EN DIRECT (jamais d'archive : aucune
  donnée nominative n'entre dans `admin`) dans les vues contractuelles du site :
  `baikal_dossiers` (obligatoire), `baikal_dossier_emails`, `baikal_dossier_events`
  (optionnelles). L'EF cherche `<db_schema>.baikal_dossiers` puis `public` en repli
  (les projets dédiés exposent dans `public`, les schémas de la base partagée chez
  eux). **La capacité d'un site se lit à la PRÉSENCE des vues et des colonnes** :
  pas de vue → pas de module (`disponible:false`, jamais une erreur) ; pas de
  colonnes `abo_*` → pas d'abonnement affiché. Branchés à ce jour : pack-vendeur
  (complet), monsieurdpe, voirie. Ajouter un site = publier sa vue + poser son
  funnel, aucun code Baikal.
  - **Funnel** : `config.apps.funnel_etapes` (jsonb, NULL = pas de funnel, la vue
    dérive alors Payé/— de `paye_le`). Forme :
    `[{slug, libelle, couleur, masquee_par_defaut, apres_paiement}]`. `couleur` ∈
    slate|blue|amber|emerald|red|violet. `apres_paiement: true` marque un état
    d'APRÈS-VENTE (voirie `envoye`/`a_traiter`, dpe `abonne`) : la liste affiche
    alors `Payé` + l'état, sinon un client payant se lit comme non converti.
  - **Client payant = `paye_le` renseigné, JAMAIS un slug d'étape** (filtre
    « Ont payé » de la liste). Même règle pour les KPI : `admin-site-stats` se
    joint à `baikal_dossiers` pour exclure tests et supprimés au lieu de
    redéfinir ses filtres — c'est ce qui évite que deux écrans annoncent deux
    nombres (voirie affichait 5 payées pour 2 réelles, sessions `TEST_SKIP_`).
  - **Catégorie de client** : `config.apps.categories_client` (jsonb,
    `[{slug, libelle, couleur}]`, même mécanique que le funnel) ; la vue du site porte le
    slug dans la colonne optionnelle `categorie`. Registre rempli mais colonne absente →
    la console retombe sur B2C/B2B. `perimetre` reste au contrat (Financier). Branché :
    monsieurdpe (particulier, agent_immo, diagnostiqueur, entreprise_rge), pack-vendeur
    (particulier, pro), voirie (particulier, entreprise).
  - **Grain de la liste = l'événement commercial**, pas la personne : un compte qui
    évolue (inscrit → abonné), un achat (toujours un acte, même chez un abonné), un lead
    absorbé par le premier compte ou achat de la même adresse. La catégorie est celle de
    la PERSONNE, identique sur toutes ses lignes ; `libelle` porte le produit de la
    ligne. Définitions (Eric, 02/09/2026) : Lead = service gratuit consommé contre un
    email, Inscrit = fiche partenaire, Payé = service payant consommé — coupon 100 %
    compris (un achat à 0 € est un « Payé », pas un test).
  - **Actions et onglets par site** (actif pour pack-vendeur) : canal relais vers l'EF
    d'administration du site (`config.apps.env_dossiers_fn` = nom de l'EF, NULL =
    interrupteur ouvert, ni boutons ni onglets). Auth : `env_anon_key` (clé PUBLIQUE en
    clair, pour passer `verify_jwt` du site) + en-tête `X-Baikal-Key` = secret nommé par
    `env_secret_ref`. Actions : resend-email, re-extract, reset-extractions,
    add-pro-credits et purge-documents (ces deux dernières super_admin, vérifié côté EF).
    Extensions de fiche : `src/components/console/extensions/<site>.jsx` branchées par
    `EXTENSIONS_FICHE` ; elles consomment le `detail` du site, chargé une fois par fiche.
  - « Supprimer » n'existe pas : c'est **purge documentaire** (documents et données
    extraites détruits ; email, emails envoyés et transaction conservés au titre de
    l'obligation comptable).
  - Cascade d'attribution portée en TS dans `admin-dossiers/canal.ts` — à maintenir en
    parité avec la fonction SQL `admin.canal_vente`.
  - Spec : `docs/superpowers/specs/2026-08-26-baikal-clients-design.md`.
- **Rapports** : page `/rapports` (`src/pages/Rapports.jsx`) + EF `admin-rapport` —
  rapport mensuel PDF au partenaire SEO du site (décompte du partenariat, ventes du mois
  sans donnée nominative, SEO Google/Bing, highlights par règles fixes, évolutions du
  logiciel depuis les commits GitHub, commentaire assisté par OpenAI et relu avant
  génération). PDF fabriqué côté navigateur (@react-pdf/renderer, chargé à la demande),
  archivé versionné dans `admin.rapports` + bucket privé `rapports`. Dépôt du site dans
  `config.apps.repo_github`, jeton `ADMIN_GITHUB_TOKEN` (lecture seule Contents). Spec :
  `docs/superpowers/specs/2026-09-06-rapport-mensuel-ia-media-design.md`.

### Secrets attendus

`GOOGLE_GSC_OAUTH_CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN` (repli `GOOGLE_ADS_OAUTH_*`),
`BING_WEBMASTER_API_KEY`, `ADMIN_SEO_CRON_SECRET`, `RESEND_API_KEY` (clé commune du projet
— `ADMIN_RESEND_API_KEY` n'existe plus), `ADMIN_UNSUBSCRIBE_SECRET`, `ADMIN_GITHUB_TOKEN`,
`ADMIN_RO_MAJORDHOME_DSN`, `ADMIN_RO_PACKVENDEUR_DSN`, `ADMIN_ENV_PACKVENDEUR_KEY` (même
valeur que `BAIKAL_ADMIN_KEY` côté projet Pré-état-daté : c'est le secret partagé du canal
d'administration). `ADMIN_ENV_MONSIEURDPE_KEY` n'est plus nécessaire (connecteur SQL).
