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

## [2026-08-24 23:45] Droits par site (admins délégués)
**Statut** : PENDING
**Commit** : 0363e2f..3aff555
**Contexte** : Les droits d'admin délégué par site sont en place ; le CLAUDE.md ne documente pas le modèle d'accès.
**Proposition** : Ajouter dans « Modules admin multi-sites » : « Droits par site : table admin.droits_sites (service_role only), source de vérité core.sites_autorises(uuid) exposée par public.mes_droits_sites() — consommée par AuthContext (sitesAdmin) et par les EF via _shared/droits.ts (client caller). Deux notions étanches : appartenance org = modules du site ; droit délégué = modules transverses (SEO, Partenariats, stats, users en consultation). Les org_admin sans droit délégué n'accèdent plus à SEO/Partenariats. Gestion : page Sites → bloc Admins délégués (EF admin-droits : list/grant/revoke, grant par email d'un compte existant). super_admin = tout, basé sur le profil réel. »
---

## [2026-08-24 23:55] Partenariats : sync nocturne des diagnostiqueurs
**Statut** : PENDING
**Commit** : b380c2c..431c8b3
**Dépendance** : appliquer d'abord la proposition du [2026-08-24 16:00] — elle
modifie la même phrase du CLAUDE.md (l'ancre ci-dessous n'existera plus telle
quelle après son application ; viser alors la mention du connecteur SQL).
**Contexte** : L'import manuel des diagnostiqueurs est remplacé par
admin.sync_diagnostiqueurs() (fonction SQL, INSERT...SELECT depuis
dpe.diag_certifie, ON CONFLICT DO NOTHING), appelée par le cron
admin-sync-diag-prospects à 03h30 (après la sync annuaire DPE de 02h30) et par
le bouton « Synchroniser les diagnostiqueurs » (RPC via admin-partenariats).
**Proposition** : Dans la section Partenariats du CLAUDE.md, remplacer
« import diagnostiqueurs (via env_url + secret nomme par env_secret_ref) » par
« sync diagnostiqueurs (fonction SQL admin.sync_diagnostiqueurs, cron
admin-sync-diag-prospects 03h30 + bouton console ; source amont :
dpe.diag_certifie, synchronisée à 02h30 par le projet DPE) ».
---

## [2026-08-25 01:30] SEO v2 : parité Pack Vendeur + archive Google/Bing
**Statut** : PENDING
**Commit** : (serie seo v2 jusqu'a 5fee480)
**Contexte** : Le module SEO est passé en v2 (vue riche, comparatif, Bing vs Google) avec archivage multi-sites.
**Proposition** : Dans « Modules admin multi-sites », remplacer la description du module SEO par : « SEO : page /seo en 4 blocs (vue d'ensemble avec buckets de position cliquables et top 50, comparatif période/période avec statuts régression/disparue/nouvelle/progression/stable — logique PV ±1 rang, bruit <10 impressions écarté —, Bing vs Google, tous-sites). EF admin-seo (actions overview/compare/bing-vs-google/all-sites, droits par site) sur helpers _shared/gsc.ts (OAuth via GOOGLE_GSC_OAUTH_* avec repli GOOGLE_ADS_OAUTH_* — un seul client Google, projet GCP pre-etat-date-ads) et _shared/bing-webmaster.ts (clé BING_WEBMASTER_API_KEY, propriété = https://domaine/ vérifiée dans Bing). Archive admin.seo_snapshots (unique app_id+source+période+dimension+clé, is_noise = phrases exactes) alimentée par l'EF admin-seo-snapshot (X-Cron-Secret = ADMIN_SEO_CRON_SECRET, aussi dans Vault) via 2 crons pg_cron : quotidien 04h15 (série Bing datée + refresh mois courant Google), mensuel le 4 à 05h00 (mois civil précédent + tops Bing non datés). Backfill : POST {start,end}. Limites Bing : aucun historique interrogeable, positions = relevé ponctuel. »
---

## [2026-08-15 12:00] Le « Brain » LLM (analyzeQuery) n'est jamais appelé en production
**Statut** : PENDING
**Commit** : (audit de session, hors commit)
**Contexte** : CLAUDE.md décrit « Brain (intent detection + query rewriting, integrated) ». Dans le code déployé, baikal-retrieval/routing/analyzer.ts:16 (analyzeQuery, analyse LLM) n'est jamais importé ; seul buildFallbackAnalysis (heuristiques regex) tourne, donc rewritten_query === query dans 100 % des cas (confirmé par rag.query_logs). La réécriture de requête et la résolution d'anaphores documentées n'existent pas en pratique.
**Proposition** : Soit corriger la doc (« l'analyse est heuristique, analyzeQuery LLM existe mais est débranché »), soit décider de rebrancher analyzeQuery (en parallèle de l'embedding) et le noter comme tâche. Question ouverte : quel comportement est voulu ?
---

## [2026-09-02 12:00] Clients : catégorie de client par site et grain « événement commercial »
**Statut** : PENDING
**Commit** : (feat(clients): catégorie de client par site)
**Contexte** : La colonne « Type » (B2C/B2B) de /clients est remplacée par une « Catégorie » propre au site, et la vue MonsieurDPE est passée au grain de l'événement commercial. Le CLAUDE.md décrit le funnel mais pas les catégories ni la règle de grain.
**Proposition** : Dans « Modules admin multi-sites › Clients », après le paragraphe Funnel, ajouter :
« **Catégorie de client** : `config.apps.categories_client` (jsonb, `[{slug, libelle, couleur}]`, même mécanique que le funnel) ; la vue du site porte le slug dans la colonne optionnelle `categorie`. Registre rempli mais colonne absente -> la console retombe sur B2C/B2B. `perimetre` reste au contrat (Financier). Branché : monsieurdpe (particulier, agent_immo, diagnostiqueur, entreprise_rge), pack-vendeur (particulier, pro), voirie (particulier, entreprise).
**Grain de la liste = l'événement commercial**, pas la personne : un compte qui évolue (inscrit -> abonné), un achat (toujours un acte, même chez un abonné), un lead absorbé par le premier compte ou achat de la même adresse. La catégorie est celle de la PERSONNE, identique sur toutes ses lignes ; `libelle` porte le produit de la ligne. Côté MonsieurDPE, un achat à 0 € est un testeur (code TESTEURDPE) et sort en `est_test`. »
---
