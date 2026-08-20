# CLAUDE.md - Baikal Platform

## Project Overview

**Baikal** is a multi-tenant SaaS platform for the construction industry (BTP - Batiment et Travaux Publics). It provides AI-powered document analysis, RAG-based Q&A, and project management tools. The platform currently runs one vertical app: **ARPET** (Assistant de Recherche de Projet et Expertise Technique).

- **Frontend:** React 18 + Vite + TailwindCSS (JSX, no TypeScript)
- **Backend:** Supabase (Postgres, Edge Functions in Deno/TypeScript, Storage, Auth)
- **Ingestion pipeline:** n8n workflows (FLUX 1-6) calling Supabase Edge Functions
- **Deployment:** Vercel (frontend) + Supabase Cloud (backend)
- **AI Models:** OpenAI (embeddings, generation), Google Gemini (file analysis, generation), Cohere (reranking - feature flagged), LlamaParse (document parsing)

## Architecture

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
  ├── Brain (intent detection + query rewriting, integrated)
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
- Frontend does not yet handle agentic SSE events (`agent_thinking`, `agent_searching`, `agent_found`)

### Conventions
- Edge Functions use Deno runtime with TypeScript
- Frontend is React JSX (no TypeScript)
- Database uses multi-schema architecture with RLS on all tables
- Public schema functions are SECURITY DEFINER wrappers calling schema-specific functions
- Config is DB-driven via `config.agent_prompts.parameters` (JSONB)
- French language throughout UI, prompts, and documentation

## Modules admin multi-sites (2026-08-20)

`config.apps` sert de registre des sites administres (colonnes `domaine`,
`gsc_propriete`, `env_url`, `env_secret_ref` — le secret lui-meme n'est jamais en
table). Spec et plan dans `docs/superpowers/specs/` et `docs/superpowers/plans/`
(2026-08-20-admin-multi-sites-*).

- **SEO** : page `/seo` (`src/pages/Seo.jsx`) + EF `admin-seo` — proxy Search
  Console multi-proprietes, OAuth refresh token (secrets `GOOGLE_GSC_OAUTH_*`),
  fenetres ancrees a J-3. Actions : overview, top, all-sites.
- **Partenariats** : page `/partenariats` + EF `admin-partenariats` — prospects,
  import CSV, import diagnostiqueurs (via `env_url` + secret nomme par
  `env_secret_ref`), campagnes Resend par lots de 50 avec reprise (`restants`),
  lien de desinscription HMAC (EF `admin-desinscription`, verify_jwt off, GET
  affiche / POST execute). Tables `admin.prospects|campagnes|campagne_envois`,
  RLS forcee sans policy, acces service_role uniquement.
- **Parametrage** : page `/sites` (super_admin) — edite les champs propres a
  chaque site dans `config.apps` (domaine, GSC, env, expediteur des campagnes).
  Regle de partage : les credentials mutualises de l'outil vivent dans les
  secrets Edge Functions, tout ce qui est propre au site vit dans ce parametrage,
  et une cle d'environnement de site reste un secret dont la table ne porte que
  le nom (`env_secret_ref`). La creation d'une app reste une migration.
- Secrets attendus : `GOOGLE_GSC_OAUTH_CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN`,
  `ADMIN_RESEND_API_KEY`, `ADMIN_UNSUBSCRIBE_SECRET`, `ADMIN_ENV_MONSIEURDPE_KEY`.
- Gotcha : le trigger `tr_create_documents_cles_on_app_insert` casse toute
  insertion d'app avec `is_active=true` (slug de concept constant deja pris) —
  inserer inactif puis activer par UPDATE, ou corriger le trigger.
