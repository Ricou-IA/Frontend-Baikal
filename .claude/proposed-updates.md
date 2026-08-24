# Propositions de mise à jour du CLAUDE.md

## [2026-08-15 12:00] Le chat RAG vit dans Frontend-ARPET, pas Frontend-Baikal
**Statut** : RESOLU
**Commit** : (audit de session, hors commit)
**Contexte** : L'audit a montré que l'UI de chat qui consomme baikal-retrieval (SSE) est implémentée dans C:\Dev\Frontend-ARPET (Dashboard.tsx + src/services/chat/chat-sse.ts). L'onglet chat de Frontend-Baikal est un placeholder. Le CLAUDE.md ne mentionne pas cette répartition entre les deux repos.
**Proposition** : Ajouter dans « Project Overview » ou « Architecture » : « Le chat RAG (consommation SSE de baikal-retrieval) est implémenté dans le repo Frontend-ARPET (Dashboard.tsx, services/chat/chat-sse.ts). Frontend-Baikal porte la console (connaissances, admin, users). »
---

## [2026-08-15 12:00] L'entrée tech-debt sur les événements SSE agentiques est obsolète
**Statut** : RESOLU
**Commit** : (audit de session, hors commit)
**Contexte** : CLAUDE.md dit « Frontend does not yet handle agentic SSE events (agent_thinking, agent_searching, agent_found) ». En réalité ces événements arrivent comme des événements `step` génériques et sont affichés par le Dashboard ARPET (chat-sse.ts + Dashboard.tsx:161-168). Ce qui manque : un traitement UI dédié, et l'événement `analysis` qui lui est réellement ignoré.
**Proposition** : Remplacer la ligne par : « Les événements SSE agentiques sont affichés comme steps génériques dans ARPET ; il manque un traitement UI dédié. L'événement SSE `analysis` (intent, rewritten_query) n'est pas consommé côté front. »
---

## [2026-08-24 16:00] Fondation hub : registre config.apps, baikal_reader, connecteur _shared/sites.ts
**Statut** : PENDING
**Commit** : 787c68c, 37bee75, cdac042
**Contexte** : La fondation d'accès aux données du hub est en place (spec docs/superpowers/specs/2026-08-24-hub-baikal-acces-sites-design.md). Le CLAUDE.md contient un gotcha obsolète (le trigger tr_create_documents_cles_on_app_insert a été supprimé par la migration registre_sites_hub) et ne documente ni les nouvelles colonnes ni le connecteur.
**Proposition** : Dans « Modules admin multi-sites », remplacer le gotcha du trigger par :
« Le registre config.apps porte aussi db_schema (schéma des données du produit) et db_ro_secret_ref (nom du secret DSN lecture seule pour les produits sur base dédiée : ADMIN_RO_MAJORDHOME_DSN, ADMIN_RO_PACKVENDEUR_DSN). 12 produits déclarés, zelty inactif. Le trigger tr_create_documents_cles_on_app_insert a été supprimé (créer une app = simple INSERT). Lecture des données d'un site : module supabase/functions/_shared/sites.ts (chargerSite + lecteurSite, SQL lecture seule via postgres-js — DSN baikal_reader sur base dédiée, SUPABASE_DB_URL en local). Règle d'exploitation : dans chaque projet dédié, le rôle baikal_reader n'a que des policies SELECT posées par migration — rejouer la boucle CREATE POLICY baikal_read quand une nouvelle table apparaît. Hosts pooler : aws-1-eu-west-3 (org principale), aws-0-eu-west-3 (org Pré-état-daté). Secrets attendus corrigés : l'emailing admin lit RESEND_API_KEY (la clé commune du projet — ADMIN_RESEND_API_KEY n'existe plus dans le code) ; ADMIN_UNSUBSCRIBE_SECRET est posé ; ADMIN_ENV_MONSIEURDPE_KEY n'est plus nécessaire (connecteur SQL). verify_jwt est ancré dans config.toml pour admin-partenariats (true) et admin-desinscription (false, lien public HMAC). »
---

## [2026-08-24 21:00] UI console hub : ConsoleLayout, onglets contextuels, users par site
**Statut** : PENDING
**Commit** : b178e2b..d611739
**Contexte** : La console est passée sous un layout partagé avec sélecteur de site global. Le CLAUDE.md décrit encore l'ancienne structure (onglets à plat dans Admin.jsx).
**Proposition** : Ajouter dans « Modules admin multi-sites » : « La console est enveloppée par src/components/console/ConsoleLayout.jsx (header + sélecteur de site global AppProvider/AppSelector + navigation). Onglets contextuels : modules ARPET (Dashboard, Connaissances, Prompts, Indexation — pilotés par /admin?tab=…) visibles seulement quand le site sélectionné est arpet ; SEO/Partenariats/Utilisateurs/Sites sont transverses. La vue public.apps expose domaine, db_schema, heberge_dedie (jamais db_ro_secret_ref). Les RPC get_pending_users/get_users_for_admin prennent p_app_id ; le site d'un profil se résout par COALESCE(profiles.app_id, auth.users.raw_user_meta_data->>'source', 'arpet') — les inscriptions hors console (ex. voirie) ne posent pas profiles.app_id. »
---

## [2026-08-24 22:30] Vue d'ensemble par site : EF admin-site-stats
**Statut** : PENDING
**Commit** : 5975c07
**Contexte** : Premier module métier du hub sur le connecteur lecture seule.
**Proposition** : Ajouter dans « Modules admin multi-sites » : « Vue d'ensemble par site : EF admin-site-stats (super_admin uniquement) — KPIs par site définis dans admin-site-stats/stats-sites.ts (pack-vendeur, voirie, majordhome), fallback générique tables/volumes pour les autres. Affichée sur /admin quand le site sélectionné n'est pas ARPET. Ajouter un site = une fonction dans stats-sites.ts, redéploiement. »
---

## [2026-08-15 12:00] Le « Brain » LLM (analyzeQuery) n'est jamais appelé en production
**Statut** : PENDING
**Commit** : (audit de session, hors commit)
**Contexte** : CLAUDE.md décrit « Brain (intent detection + query rewriting, integrated) ». Dans le code déployé, baikal-retrieval/routing/analyzer.ts:16 (analyzeQuery, analyse LLM) n'est jamais importé ; seul buildFallbackAnalysis (heuristiques regex) tourne, donc rewritten_query === query dans 100 % des cas (confirmé par rag.query_logs). La réécriture de requête et la résolution d'anaphores documentées n'existent pas en pratique.
**Proposition** : Soit corriger la doc (« l'analyse est heuristique, analyzeQuery LLM existe mais est débranché »), soit décider de rebrancher analyzeQuery (en parallèle de l'embedding) et le noter comme tâche. Question ouverte : quel comportement est voulu ?
---
