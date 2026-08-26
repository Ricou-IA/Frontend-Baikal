# Module Clients multi-sites — lot 1 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le lot 1 du module Clients : vues contractuelles `baikal_dossiers` côté Pré-état-daté, colonne `funnel_etapes` au registre, Edge Function `admin-dossiers` (liste + fiche en lecture directe), page `/clients` dans la console.

**Architecture:** Lecture directe dans la base du site via `baikal_reader` (`_shared/sites.ts`), contrat de vue avec capacité par présence de colonnes, funnel paramétrable dans `config.apps.funnel_etapes`, fiche socle + registre d'extensions par site (vide au lot 1). Aucune archive nominative côté Baikal.

**Tech Stack:** React 18 JSX (pas de TypeScript côté `src/`), TailwindCSS thème `baikal-*`, Edge Functions Deno (std 0.168, postgres-js via `_shared/sites.ts`), migrations appliquées via MCP Supabase (`apply_migration`).

**Spec:** `docs/superpowers/specs/2026-08-26-baikal-clients-design.md`

## Global Constraints

- Projets Supabase : Pré-état-daté = `ycmavnmtyvodqawvwrrd` (migrations via MCP `apply_migration` UNIQUEMENT — le SQL hors DDL y tourne en `supabase_read_only_user`) ; projet partagé Baikal = `odspcxgafcqxjzrarsqf`.
- `baikal_reader` est en lecture seule ; jamais d'écriture par ce canal.
- Textes d'UI en français AVEC accents (« Payé », « Créé ») ; commentaires de code en ASCII sans accents (convention du repo : voir `sites.ts`, `etats.jsx`).
- Pas de TypeScript dans `src/` (JSX uniquement) ; Edge Functions en TypeScript Deno.
- Messages de commit : `feat(clients): …` en français, terminés par `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Ne JAMAIS éditer `CLAUDE.md` sans accord explicite d'Eric (règle auto-doc du projet).
- Chiffres de parité mesurés le 2026-08-26 (ils bougeront avec l'activité — comparer les ordres de grandeur, l'égalité exacte n'est garantie qu'à données constantes) : hors visiteurs et supprimés, **59** dossiers tests compris, **53** tests exclus (payé 46, lead 3, avant_paiement 4). Le « 59 dossiers » du /admin PED compte les tests dans son total (son EF les filtre après pagination — assumé dans son code).

---

### Task 1 : Vues contractuelles côté Pré-état-daté

**Files:**
- Aucun fichier local : migration distante sur le projet `ycmavnmtyvodqawvwrrd` via MCP `apply_migration`. Pas de commit pour cette tâche (la migration est tracée dans l'historique du projet PED).

**Interfaces:**
- Produces: vues `public.baikal_dossiers`, `public.baikal_dossier_emails`, `public.baikal_dossier_events`, lisibles par `baikal_reader`. Colonnes de `baikal_dossiers` : `dossier_id` text, `email` text, `contact_nom` text, `statut` text (slugs `visiteur|lead|avant_paiement|paye|autre`), `perimetre` text (`b2c|b2b`), `cree_le`/`paye_le` timestamptz, `est_test` bool, `supprime_le` timestamptz, `montant_ttc` numeric, `devise` text, `stripe_payment_intent_id` text, `attribution` jsonb, `emails_envoyes`/`emails_ouverts` int, `libelle` text, `apporteur` text, `documents_purges_le` timestamptz, `maj_le` timestamptz.

- [ ] **Step 1 : Appliquer la migration**

Appeler `mcp__…__apply_migration` avec `project_id: ycmavnmtyvodqawvwrrd`, `name: baikal_dossiers_vues_hub`, et ce SQL :

```sql
-- Contrat Clients du hub Baikal (spec 2026-08-26) : trois vues normalisees
-- lues par baikal_reader. security_invoker : ce sont les policies baikal_read
-- des tables sous-jacentes qui portent le droit (deja en place).
CREATE OR REPLACE VIEW public.baikal_dossiers
WITH (security_invoker = true) AS
SELECT
  d.id::text                                   AS dossier_id,
  COALESCE(d.email, d.client_email)            AS email,
  COALESCE(d.seller_name, d.client_name)       AS contact_nom,
  -- Reprise exacte de computeBucket (pv-admin-dossiers/index.ts) : parite
  -- chiffre a chiffre avec le /admin PED (59 tests compris, 53 sans).
  CASE
    WHEN d.status = 'draft' AND d.email IS NULL THEN 'visiteur'
    WHEN d.status = 'draft' AND COALESCE(d.docs_count, 0) = 0 THEN 'lead'
    WHEN d.status = 'draft' THEN 'avant_paiement'
    WHEN d.status IN ('analyzing','pending_validation','validated','paid','generating','completed')
      THEN CASE WHEN d.stripe_payment_status = 'paid' THEN 'paye' ELSE 'avant_paiement' END
    ELSE 'autre'
  END                                          AS statut,
  CASE WHEN d.pro_account_id IS NULL THEN 'b2c' ELSE 'b2b' END AS perimetre,
  d.created_at                                 AS cree_le,
  d.paid_at                                    AS paye_le,
  -- Meme regle de test que l'EF PED (isTestDossier) + la colonne DB.
  (d.is_test IS TRUE
    OR COALESCE(d.email, d.client_email) ~* 'pudebat|confer-sas|test|demo|example\.com'
    OR lower(COALESCE(d.utm_source, '')) IN ('test','dev','qa'))  AS est_test,
  d.deleted_at                                 AS supprime_le,
  d.amount_paid                                AS montant_ttc,
  'EUR'::text                                  AS devise,
  d.stripe_payment_intent_id,
  d.attribution,
  COALESCE(e.envoyes, 0)                       AS emails_envoyes,
  COALESCE(e.ouverts, 0)                       AS emails_ouverts,
  d.property_address                           AS libelle,
  p.company_name                               AS apporteur,
  d.anonymized_at                              AS documents_purges_le,
  d.updated_at                                 AS maj_le
FROM pack_vendeur.dossiers d
LEFT JOIN pack_vendeur.pro_accounts p ON p.id = d.pro_account_id
LEFT JOIN LATERAL (
  SELECT count(*) AS envoyes, count(l.opened_at) AS ouverts
  FROM pack_vendeur.email_logs l
  WHERE l.dossier_id = d.id AND l.status = 'sent'
) e ON true;

CREATE OR REPLACE VIEW public.baikal_dossier_emails
WITH (security_invoker = true) AS
SELECT
  l.dossier_id::text AS dossier_id,
  l.sent_at          AS envoye_le,
  l.email_type       AS sujet,
  l.status           AS statut,
  l.opened_at        AS ouvert_le
FROM pack_vendeur.email_logs l
WHERE l.dossier_id IS NOT NULL;

CREATE OR REPLACE VIEW public.baikal_dossier_events
WITH (security_invoker = true) AS
SELECT
  ev.dossier_id::text AS dossier_id,
  ev.created_at       AS survenu_le,
  ev.event_name       AS type,
  jsonb_strip_nulls(jsonb_build_object('categorie', ev.event_category, 'page', ev.page_url))
    || COALESCE(ev.properties, '{}'::jsonb)   AS detail
FROM pack_vendeur.events ev
WHERE ev.dossier_id IS NOT NULL;

-- Ces vues portent des donnees nominatives : seul baikal_reader les lit.
REVOKE ALL ON public.baikal_dossiers, public.baikal_dossier_emails, public.baikal_dossier_events
  FROM anon, authenticated;
GRANT SELECT ON public.baikal_dossiers, public.baikal_dossier_emails, public.baikal_dossier_events
  TO baikal_reader;
```

Note : le second compteur d'emails est `emails_ouverts` (colonne `opened_at`, webhook Resend). Le /admin PED affiche lui le nombre de CLICS déduits des events — sophistication qui restera dans l'extension PED du lot 3. Écart assumé, à mentionner au rapport final.

- [ ] **Step 2 : Vérifier la parité des chiffres**

Exécuter via `execute_sql` sur `ycmavnmtyvodqawvwrrd` :

```sql
SELECT statut, count(*) AS n
FROM public.baikal_dossiers
WHERE statut <> 'visiteur' AND supprime_le IS NULL AND est_test IS NOT TRUE
GROUP BY statut
UNION ALL
SELECT 'TOTAL_sans_tests', count(*) FROM public.baikal_dossiers
WHERE statut <> 'visiteur' AND supprime_le IS NULL AND est_test IS NOT TRUE
UNION ALL
SELECT 'TOTAL_avec_tests', count(*) FROM public.baikal_dossiers
WHERE statut <> 'visiteur' AND supprime_le IS NULL;
```

Attendu (mesuré le 2026-08-26, à données constantes) : `paye 46, lead 3, avant_paiement 4, TOTAL_sans_tests 53, TOTAL_avec_tests 59`. Si l'activité a bougé depuis, vérifier seulement que TOTAL_avec_tests = le compteur affiché par le /admin PED avec les filtres par défaut.

- [ ] **Step 3 : Vérifier les droits**

```sql
SELECT c.relname, c.relacl::text FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'baikal_dossier%';
```

Attendu : `baikal_reader=r/postgres` présent sur les trois vues, aucune entrée `anon=` ni `authenticated=` (ou entrées vides), et `security_invoker=true` dans `reloptions` (visible via `SELECT relname, reloptions FROM pg_class WHERE relname LIKE 'baikal_dossier%'`).

---

### Task 2 : Colonne `funnel_etapes` au registre

**Files:**
- Aucun fichier local : migration distante sur le projet partagé `odspcxgafcqxjzrarsqf` via MCP `apply_migration`. Pas de commit.

**Interfaces:**
- Produces: `config.apps.funnel_etapes` jsonb nullable — liste ordonnée `{slug, libelle, couleur, masquee_par_defaut}`. Renseignée pour `pack-vendeur`, NULL ailleurs. Consommée par l'EF de la Task 5.

- [ ] **Step 1 : Appliquer la migration**

`apply_migration` avec `project_id: odspcxgafcqxjzrarsqf`, `name: config_apps_funnel_etapes`, SQL :

```sql
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS funnel_etapes jsonb;
COMMENT ON COLUMN config.apps.funnel_etapes IS
  'Etapes ordonnees du funnel clients du site: [{slug, libelle, couleur, masquee_par_defaut}]. NULL = pas de funnel (la vue Clients derive Paye/— de paye_le).';

UPDATE config.apps SET funnel_etapes = '[
  {"slug": "visiteur",       "libelle": "Visiteur", "couleur": "slate",   "masquee_par_defaut": true},
  {"slug": "lead",           "libelle": "Lead",     "couleur": "blue",    "masquee_par_defaut": false},
  {"slug": "avant_paiement", "libelle": "Engagé",   "couleur": "amber",   "masquee_par_defaut": false},
  {"slug": "paye",           "libelle": "Payé",     "couleur": "emerald", "masquee_par_defaut": false},
  {"slug": "autre",          "libelle": "Autre",    "couleur": "red",     "masquee_par_defaut": false}
]'::jsonb
WHERE id = 'pack-vendeur';
```

- [ ] **Step 2 : Vérifier**

`execute_sql` sur `odspcxgafcqxjzrarsqf` : `SELECT id, funnel_etapes IS NOT NULL AS a_funnel FROM config.apps ORDER BY id;` — attendu : `a_funnel = true` pour `pack-vendeur` uniquement.

---

### Task 3 : Cascade d'attribution portée en TS (TDD)

**Files:**
- Create: `supabase/functions/admin-dossiers/canal.ts`
- Test: `supabase/functions/admin-dossiers/canal.test.ts`

**Interfaces:**
- Produces: `canalVente(attribution: Record<string, unknown> | null): string` — renvoie `paid | organic | referral | campaign | indetermine | unattributed`. Portage fidèle de `admin.canal_vente(jsonb)` + `admin.domaine_vente(jsonb)` du projet partagé (définitions reproduites en commentaire du fichier). Consommée par `index.ts` (Task 5).

- [ ] **Step 1 : Écrire les tests (qui échouent)**

```ts
// canal.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canalVente } from "./canal.ts";

Deno.test("gclid vrai -> paid", () => {
  assertEquals(canalVente({ a_gclid: true }), "paid");
});
Deno.test("utm_medium cpc (casse ignoree) -> paid", () => {
  assertEquals(canalVente({ utm_medium: "CPC" }), "paid");
});
Deno.test("referrer moteur -> organic", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com" }), "organic");
});
Deno.test("referrer autre site -> referral", () => {
  assertEquals(canalVente({ referrer_domaine: "leboncoin.fr" }), "referral");
});
Deno.test("utm_source en forme de domaine, sans referrer -> referral", () => {
  // domaine_vente replie sur utm_source quand il contient un point
  assertEquals(canalVente({ utm_source: "chatgpt.com" }), "referral");
});
Deno.test("utm_source simple seul -> campaign", () => {
  assertEquals(canalVente({ utm_source: "newsletter" }), "campaign");
});
Deno.test("capture_site backfill_partiel sans autre signal -> indetermine", () => {
  assertEquals(canalVente({ capture_site: "backfill_partiel" }), "indetermine");
});
Deno.test("aucun signal -> unattributed", () => {
  assertEquals(canalVente({}), "unattributed");
});
Deno.test("attribution null -> unattributed", () => {
  assertEquals(canalVente(null), "unattributed");
});
Deno.test("le referrer moteur gagne sur utm_source", () => {
  assertEquals(canalVente({ referrer_domaine: "bing.com", utm_source: "newsletter" }), "organic");
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run: `deno test supabase/functions/admin-dossiers/canal.test.ts`
Expected: FAIL (module `./canal.ts` introuvable).

- [ ] **Step 3 : Implémenter canal.ts**

```ts
// Cascade d'attribution du module Clients : portage TS de admin.canal_vente
// et admin.domaine_vente (projet partage). La fonction SQL ne peut pas etre
// appelee ici : la requete liste tourne sur la base du SITE via baikal_reader.
// Toute evolution de la cascade SQL doit etre reportee ici (et inversement).
//
// SQL de reference (2026-08-26) :
//   admin.domaine_vente : coalesce(nullif(referrer_domaine,''),
//     CASE WHEN utm_source LIKE '%.%' THEN utm_source END, '')
//   admin.canal_vente : a_gclid -> paid ; utm_medium in (cpc,ppc,paid,
//     paidsearch,display) -> paid ; domaine ~ moteurs -> organic ;
//     domaine <> '' -> referral ; utm_source <> '' -> campaign ;
//     capture_site = 'backfill_partiel' -> indetermine ; sinon unattributed.

const MEDIUMS_PAYANTS = new Set(["cpc", "ppc", "paid", "paidsearch", "display"]);
const MOTEURS = /(google|bing|yahoo|duckduckgo|qwant|ecosia|lilo|brave)\./;

function texte(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function domaineVente(attribution: Record<string, unknown> | null): string {
  const a = attribution ?? {};
  const referrer = texte(a["referrer_domaine"]);
  if (referrer !== "") return referrer;
  const utm = texte(a["utm_source"]);
  if (utm.includes(".")) return utm;
  return "";
}

export function canalVente(attribution: Record<string, unknown> | null): string {
  const a = attribution ?? {};
  if (a["a_gclid"] === true || a["a_gclid"] === "true") return "paid";
  if (MEDIUMS_PAYANTS.has(texte(a["utm_medium"]).toLowerCase())) return "paid";
  const domaine = domaineVente(attribution);
  if (MOTEURS.test(domaine)) return "organic";
  if (domaine !== "") return "referral";
  if (texte(a["utm_source"]) !== "") return "campaign";
  if (a["capture_site"] === "backfill_partiel") return "indetermine";
  return "unattributed";
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `deno test supabase/functions/admin-dossiers/canal.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/admin-dossiers/canal.ts supabase/functions/admin-dossiers/canal.test.ts
git commit -m "feat(clients): cascade d'attribution portee en TS (parite admin.canal_vente)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : Normalisation des critères de liste (TDD)

**Files:**
- Create: `supabase/functions/admin-dossiers/filtres.ts`
- Test: `supabase/functions/admin-dossiers/filtres.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Criteres {
  recherche: string;                 // "" si absente, 200 chars max
  periodeJours: number | null;       // 7 | 30 | 90 | null (tout)
  statuts: string[];                 // slugs demandes explicitement, 20 max
  perimetre: "b2c" | "b2b" | null;
  inclureMasquees: boolean;          // defaut false
  exclureTests: boolean;             // defaut true
  inclureSupprimes: boolean;         // defaut false
  tri: "cree_le" | "paye_le";        // defaut cree_le
  ordre: "asc" | "desc";             // defaut desc
  page: number;                      // >= 1, defaut 1
  parPage: number;                   // borne 5..100, defaut 25
}
export function normaliserCriteres(body: Record<string, unknown>): Criteres;
```

Consommée par `index.ts` (Task 5) ; le front (Task 6) envoie les mêmes clés à plat dans le body.

- [ ] **Step 1 : Écrire les tests (qui échouent)**

```ts
// filtres.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliserCriteres } from "./filtres.ts";

Deno.test("body vide -> valeurs par defaut", () => {
  const c = normaliserCriteres({});
  assertEquals(c, {
    recherche: "",
    periodeJours: null,
    statuts: [],
    perimetre: null,
    inclureMasquees: false,
    exclureTests: true,
    inclureSupprimes: false,
    tri: "cree_le",
    ordre: "desc",
    page: 1,
    parPage: 25,
  });
});
Deno.test("periode hors liste blanche -> null", () => {
  assertEquals(normaliserCriteres({ periodeJours: 15 }).periodeJours, null);
  assertEquals(normaliserCriteres({ periodeJours: 30 }).periodeJours, 30);
});
Deno.test("parPage borne a 5..100", () => {
  assertEquals(normaliserCriteres({ parPage: 1 }).parPage, 5);
  assertEquals(normaliserCriteres({ parPage: 500 }).parPage, 100);
  assertEquals(normaliserCriteres({ parPage: 50 }).parPage, 50);
});
Deno.test("page invalide -> 1", () => {
  assertEquals(normaliserCriteres({ page: -3 }).page, 1);
  assertEquals(normaliserCriteres({ page: "abc" }).page, 1);
});
Deno.test("tri et ordre en liste blanche", () => {
  assertEquals(normaliserCriteres({ tri: "montant_ttc" }).tri, "cree_le");
  assertEquals(normaliserCriteres({ tri: "paye_le", ordre: "asc" }).tri, "paye_le");
  assertEquals(normaliserCriteres({ ordre: "asc" }).ordre, "asc");
});
Deno.test("perimetre en liste blanche", () => {
  assertEquals(normaliserCriteres({ perimetre: "b2b" }).perimetre, "b2b");
  assertEquals(normaliserCriteres({ perimetre: "pro" }).perimetre, null);
});
Deno.test("statuts filtres aux chaines non vides", () => {
  assertEquals(normaliserCriteres({ statuts: ["paye", "", 3, "lead"] }).statuts, ["paye", "lead"]);
});
Deno.test("recherche tronquee et nettoyee", () => {
  assertEquals(normaliserCriteres({ recherche: "  scafi  " }).recherche, "scafi");
  assertEquals(normaliserCriteres({ recherche: "x".repeat(300) }).recherche.length, 200);
});
Deno.test("exclureTests false explicite respecte", () => {
  assertEquals(normaliserCriteres({ exclureTests: false }).exclureTests, false);
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run: `deno test supabase/functions/admin-dossiers/filtres.test.ts`
Expected: FAIL (module `./filtres.ts` introuvable).

- [ ] **Step 3 : Implémenter filtres.ts**

```ts
// Normalisation des parametres de la liste des dossiers clients.
// Pure : aucun acces reseau, testable sans permissions Deno.
export interface Criteres {
  recherche: string;
  periodeJours: number | null;
  statuts: string[];
  perimetre: "b2c" | "b2b" | null;
  inclureMasquees: boolean;
  exclureTests: boolean;
  inclureSupprimes: boolean;
  tri: "cree_le" | "paye_le";
  ordre: "asc" | "desc";
  page: number;
  parPage: number;
}

const PERIODES = new Set([7, 30, 90]);

export function normaliserCriteres(body: Record<string, unknown>): Criteres {
  const recherche = typeof body.recherche === "string"
    ? body.recherche.trim().slice(0, 200)
    : "";
  const periode = Number(body.periodeJours);
  const statuts = Array.isArray(body.statuts)
    ? body.statuts.filter((s): s is string => typeof s === "string" && s !== "").slice(0, 20)
    : [];
  const parPageBrut = Number(body.parPage);
  return {
    recherche,
    periodeJours: PERIODES.has(periode) ? periode : null,
    statuts,
    perimetre: body.perimetre === "b2c" || body.perimetre === "b2b" ? body.perimetre : null,
    inclureMasquees: body.inclureMasquees === true,
    exclureTests: body.exclureTests !== false,
    inclureSupprimes: body.inclureSupprimes === true,
    tri: body.tri === "paye_le" ? "paye_le" : "cree_le",
    ordre: body.ordre === "asc" ? "asc" : "desc",
    page: Number.isInteger(body.page) && (body.page as number) > 0 ? body.page as number : 1,
    parPage: Number.isInteger(parPageBrut) ? Math.min(100, Math.max(5, parPageBrut)) : 25,
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `deno test supabase/functions/admin-dossiers/filtres.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/admin-dossiers/filtres.ts supabase/functions/admin-dossiers/filtres.test.ts
git commit -m "feat(clients): normalisation des criteres de la liste des dossiers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : Edge Function `admin-dossiers`

**Files:**
- Create: `supabase/functions/admin-dossiers/index.ts`

**Interfaces:**
- Consumes: `chargerSite`/`lecteurSite`/`ErreurSite` (`../_shared/sites.ts`), `sitesAutorises`/`exigerSite`/`ErreurAcces` (`../_shared/droits.ts`), `normaliserCriteres` (Task 4), `canalVente` (Task 3).
- Produces (contrat HTTP consommé par la Task 6) — POST JSON, auth Bearer utilisateur :
  - `{action:'liste', appId, …clés de Criteres à plat}` → `{data: {disponible, dossiers, total, page, parPage, funnel}, error}` — chaque dossier porte les colonnes présentes dans la vue du site + `canal` calculé ; `funnel` = `config.apps.funnel_etapes` du site ou `null`.
  - `{action:'fiche', appId, dossierId}` → `{data: {disponible, dossier, emails, events, funnel}, error}` — `emails`/`events` valent `null` si la vue correspondante n'existe pas côté site.
  - Site sans vue `baikal_dossiers` → `{data: {disponible:false}, error:null}` (jamais une erreur — règle de la spec §8).

- [ ] **Step 1 : Écrire index.ts**

```ts
// admin-dossiers : liste et fiche des dossiers clients d'un site du registre,
// lues dans les vues contractuelles baikal_dossiers / baikal_dossier_emails /
// baikal_dossier_events du projet du site (canal lecture seule _shared/sites.ts).
// La capacite d'un site se lit a la presence des vues et des colonnes : un
// site sans vue baikal_dossiers n'a pas le module (disponible=false, pas une
// erreur), un site sans colonnes abo_* n'affiche pas d'abonnement.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { normaliserCriteres } from "./filtres.ts";
import { canalVente } from "./canal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface EtapeFunnel {
  slug: string;
  libelle: string;
  couleur: string;
  masquee_par_defaut?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Non authentifie" }, 401);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Non authentifie" }, 401);
    // super_admin recoit toutes les apps actives via mes_droits_sites() ;
    // un delegue recoit ses sites ; les autres un tableau vide.
    const sites = await sitesAutorises(caller);
    if (sites.length === 0) return json({ data: null, error: "Acces refuse" }, 403);

    const body = await req.json();
    const { action, appId } = body;
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    exigerSite(sites, appId);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const site = await chargerSite(admin, appId);

    // Etapes du funnel : donnee du registre. NULL = site sans funnel.
    const { data: appConfig } = await admin.schema("config").from("apps")
      .select("funnel_etapes").eq("id", appId).maybeSingle();
    const funnel = (appConfig?.funnel_etapes ?? null) as EtapeFunnel[] | null;

    const sql = lecteurSite(site);
    try {
      const [vues] = await sql`
        SELECT to_regclass('public.baikal_dossiers')::text        AS dossiers,
               to_regclass('public.baikal_dossier_emails')::text  AS emails,
               to_regclass('public.baikal_dossier_events')::text  AS events`;
      if (!vues.dossiers) {
        return json({ data: { disponible: false }, error: null });
      }
      const colonnes = new Set(
        (await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'baikal_dossiers'`)
          .map((c) => c.column_name as string),
      );

      if (action === "liste") {
        const c = normaliserCriteres(body);
        const masquees = (funnel ?? [])
          .filter((e) => e.masquee_par_defaut === true)
          .map((e) => e.slug);
        const motif = `%${c.recherche}%`;
        const rows = await sql`
          SELECT *, count(*) OVER() AS total_lignes
          FROM public.baikal_dossiers
          WHERE true
            ${c.exclureTests ? sql`AND est_test IS NOT TRUE` : sql``}
            ${c.inclureSupprimes ? sql`` : sql`AND supprime_le IS NULL`}
            ${c.perimetre ? sql`AND perimetre = ${c.perimetre}` : sql``}
            ${c.periodeJours
              ? sql`AND cree_le >= now() - make_interval(days => ${c.periodeJours})`
              : sql``}
            ${c.statuts.length > 0
              ? sql`AND statut = ANY(${c.statuts})`
              : (!c.inclureMasquees && masquees.length > 0
                ? sql`AND (statut IS NULL OR statut <> ALL(${masquees}))`
                : sql``)}
            ${c.recherche
              ? sql`AND (email ILIKE ${motif}
                    OR contact_nom ILIKE ${motif}
                    ${colonnes.has("libelle") ? sql`OR libelle ILIKE ${motif}` : sql``})`
              : sql``}
          ORDER BY ${c.tri === "paye_le" ? sql`paye_le` : sql`cree_le`}
            ${c.ordre === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`}
          LIMIT ${c.parPage} OFFSET ${(c.page - 1) * c.parPage}`;
        const total = rows.length > 0 ? Number(rows[0].total_lignes) : 0;
        const dossiers = rows.map(({ total_lignes: _t, ...d }) => ({
          ...d,
          canal: canalVente(d.attribution as Record<string, unknown> | null),
        }));
        return json({
          data: { disponible: true, dossiers, total, page: c.page, parPage: c.parPage, funnel },
          error: null,
        });
      }

      if (action === "fiche") {
        const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
        if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
        const [dossier] = await sql`
          SELECT * FROM public.baikal_dossiers WHERE dossier_id = ${dossierId}`;
        if (!dossier) return json({ data: null, error: "Dossier introuvable" }, 404);
        const emails = vues.emails
          ? await sql`
            SELECT * FROM public.baikal_dossier_emails
            WHERE dossier_id = ${dossierId} ORDER BY envoye_le DESC LIMIT 200`
          : null;
        const events = vues.events
          ? await sql`
            SELECT * FROM public.baikal_dossier_events
            WHERE dossier_id = ${dossierId} ORDER BY survenu_le DESC LIMIT 100`
          : null;
        return json({
          data: {
            disponible: true,
            dossier: {
              ...dossier,
              canal: canalVente(dossier.attribution as Record<string, unknown> | null),
            },
            emails,
            events,
            funnel,
          },
          error: null,
        });
      }

      return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    } finally {
      await sql.end();
    }
  } catch (e) {
    console.error("[admin-dossiers]", e);
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    const message = e instanceof Error ? e.message : String(e);
    return json({ data: null, error: message }, 500);
  }
});
```

- [ ] **Step 2 : Vérifier que les tests unitaires du dossier passent toujours**

Run: `deno test supabase/functions/admin-dossiers/`
Expected: PASS (19 tests canal + filtres).

- [ ] **Step 3 : Déployer**

Run: `npx supabase functions deploy admin-dossiers`
Expected: déploiement OK sur le projet partagé.

- [ ] **Step 4 : Smoke test sans auth**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-dossiers`
Expected: `401` (verify_jwt refuse l'appel sans JWT). Le test authentifié de bout en bout se fait dans le navigateur en Task 8.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/admin-dossiers/index.ts
git commit -m "feat(clients): EF admin-dossiers - liste et fiche en lecture directe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : Service front + badges partagés

**Files:**
- Create: `src/services/dossiers.service.js`
- Create: `src/components/console/badges-clients.jsx`

**Interfaces:**
- Consumes: contrat HTTP de la Task 5.
- Produces:
  - `dossiersService.getListe(appId, criteres)` et `dossiersService.getFiche(appId, dossierId)` → `{data, error}` (même forme que `financeService`).
  - `badges-clients.jsx` exporte `BadgeEtape({statut, payeLe, funnel})`, `BadgeCanal({canal, attribution})`, `fmtDate(iso)`, `fmtDateHeure(iso)`, `fmtEur(n)` — consommés par `Clients.jsx` et `FicheDossier.jsx` (Task 7).

- [ ] **Step 1 : Écrire dossiers.service.js**

```js
/**
 * dossiers.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-dossiers : liste et fiche des dossiers
 * clients du site selectionne, lus en direct dans les vues contractuelles
 * baikal_dossiers du site (spec 2026-08-26). Aucune archive nominative
 * cote Baikal.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function appelerEdge(fonction, corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/${fonction}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corps),
    });
    const json = await response.json();
    if (!response.ok || json.error) {
      return { data: null, error: new Error(json.error || `HTTP ${response.status}`) };
    }
    return { data: json.data, error: null };
  } catch (error) {
    console.error(`[${fonction}]`, error);
    return { data: null, error };
  }
}

export const dossiersService = {
  getListe(appId, criteres = {}) {
    return appelerEdge('admin-dossiers', { action: 'liste', appId, ...criteres });
  },
  getFiche(appId, dossierId) {
    return appelerEdge('admin-dossiers', { action: 'fiche', appId, dossierId });
  },
};
```

- [ ] **Step 2 : Écrire badges-clients.jsx**

```jsx
/**
 * badges-clients.jsx - Baikal Console
 * ============================================================================
 * Badges et formats partages entre la liste /clients et la fiche dossier.
 * Le badge d'etape se resout via funnel_etapes (registre) : slug inconnu ou
 * funnel absent -> repli neutre (Paye/— derive de payeLe).
 * ============================================================================
 */

const COULEURS_ETAPES = {
  slate: 'bg-slate-800/60 text-slate-300 border-slate-600',
  blue: 'bg-blue-900/40 text-blue-300 border-blue-700',
  amber: 'bg-amber-900/40 text-amber-300 border-amber-700',
  emerald: 'bg-emerald-900/40 text-emerald-200 border-emerald-700',
  red: 'bg-red-900/30 text-red-300 border-red-800',
  violet: 'bg-violet-900/40 text-violet-300 border-violet-700',
};
const COULEUR_DEFAUT = 'bg-baikal-bg text-baikal-text border-baikal-border';

// Meme vocabulaire de canaux que /finances (cascade admin.canal_vente).
export const CANAUX = {
  paid: ['Publicité', 'text-amber-400'],
  campaign: ['Campagne', 'text-violet-400'],
  organic: ['SEO', 'text-emerald-400'],
  referral: ['Référent', 'text-blue-400'],
  unattributed: [null, 'text-baikal-text'],
  indetermine: ['Origine perdue', 'text-red-400/80'],
};

export function BadgeEtape({ statut, payeLe, funnel }) {
  const etape = (funnel || []).find((e) => e.slug === statut) || null;
  if (etape) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEURS_ETAPES[etape.couleur] || COULEUR_DEFAUT}`}>
        {etape.libelle}
      </span>
    );
  }
  // Site sans funnel (statut null) ou slug hors registre : repli.
  if (statut) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEUR_DEFAUT}`}>
        {statut}
      </span>
    );
  }
  return payeLe ? (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${COULEURS_ETAPES.emerald}`}>
      Payé
    </span>
  ) : (
    <span className="text-baikal-text opacity-50">—</span>
  );
}

export function BadgeCanal({ canal, attribution }) {
  const [libelle, classe] = CANAUX[canal] || [canal, 'text-baikal-text'];
  if (!libelle) return null;
  const domaine = attribution?.referrer_domaine || null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-baikal-border text-[11px] ${classe}`}>
      {libelle}
      {domaine && <span className="opacity-70">· {domaine}</span>}
    </span>
  );
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function fmtDateHeure(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// postgres-js renvoie les numeric en chaines : on coerce avant de formater.
export function fmtEur(n) {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v)) return '—';
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`;
}
```

- [ ] **Step 3 : Vérifier que le build passe**

Run: `npm run build`
Expected: build Vite OK (les nouveaux fichiers ne sont pas encore importés, le build valide seulement la syntaxe du graphe existant + parsing).

- [ ] **Step 4 : Commit**

```bash
git add src/services/dossiers.service.js src/components/console/badges-clients.jsx
git commit -m "feat(clients): service admin-dossiers et badges partages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7 : Page /clients, fiche, route et navigation

**Files:**
- Create: `src/components/console/FicheDossier.jsx`
- Create: `src/pages/Clients.jsx`
- Modify: `src/App.jsx` (bloc des routes console, après la route `/finances` — voir `src/App.jsx:224-232`)
- Modify: `src/components/console/ConsoleLayout.jsx:36-42` (MODULES_TRANSVERSES) et l'import lucide `ConsoleLayout.jsx:15-18`

**Interfaces:**
- Consumes: `dossiersService`, `BadgeEtape`/`BadgeCanal`/`fmtDate`/`fmtDateHeure`/`fmtEur` (Task 6), `useDonneesCachees`, `ConsoleLayout`, états `etats.jsx`.
- Produces: route `/clients` (module transverse, visible pour super_admin et délégués du site — même mécanique de nav que `/finances`) ; `EXTENSIONS_FICHE` exporté par `FicheDossier.jsx` : registre `{ [appId]: [{id, label, Composant}] }`, vide au lot 1 (les extensions PED du lot 3 s'y brancheront, `Composant` reçoit `{appId, dossierId, dossier}`).

- [ ] **Step 1 : Écrire FicheDossier.jsx**

```jsx
/**
 * FicheDossier.jsx - Baikal Console
 * ============================================================================
 * Fiche detail d'un dossier client : socle generique (Vue / Emails / Events)
 * + registre d'extensions par site (principe VueSite). Les onglets Events et
 * le bloc abonnement n'apparaissent que si le site expose la vue / les
 * colonnes correspondantes — la capacite se lit dans la reponse, jamais en
 * dur par site.
 * ============================================================================
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, Erreur } from './etats';
import { dossiersService } from '../../services/dossiers.service';
import { BadgeEtape, BadgeCanal, fmtDate, fmtDateHeure, fmtEur } from './badges-clients';

// Onglets specifiques par site, branches au lot 3 (PED : Documents, Resultat,
// Chat, Logs IA). Chaque Composant recoit { appId, dossierId, dossier }.
export const EXTENSIONS_FICHE = {};

function Ligne({ libelle, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">{libelle}</dt>
      <dd className="text-sm text-white mt-0.5">{children ?? '—'}</dd>
    </div>
  );
}

function OngletVue({ d }) {
  const aAbonnement = d && 'abo_statut' in d;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Ligne libelle="Email">{d.email || '—'}</Ligne>
      <Ligne libelle="Contact">{d.contact_nom || '—'}</Ligne>
      {'libelle' in d && <Ligne libelle="Libellé">{d.libelle || '—'}</Ligne>}
      {'apporteur' in d && d.apporteur && <Ligne libelle="Apporteur">via {d.apporteur}</Ligne>}
      <Ligne libelle="Créé le">{fmtDateHeure(d.cree_le)}</Ligne>
      <Ligne libelle="Payé le">{fmtDateHeure(d.paye_le)}</Ligne>
      <Ligne libelle="Montant">{fmtEur(d.montant_ttc)}</Ligne>
      <Ligne libelle="Stripe PI">
        {d.stripe_payment_intent_id
          ? <span className="font-mono text-xs">{d.stripe_payment_intent_id}</span>
          : '—'}
      </Ligne>
      <Ligne libelle="Origine">
        <div className="flex items-center gap-2 flex-wrap">
          <BadgeCanal canal={d.canal} attribution={d.attribution} />
          {d.attribution?.utm_source && (
            <span className="text-xs opacity-70">utm: {d.attribution.utm_source}</span>
          )}
          {d.attribution?.landing_page && (
            <span className="text-xs opacity-70 break-all">{d.attribution.landing_page}</span>
          )}
        </div>
      </Ligne>
      <Ligne libelle="Emails">{d.emails_envoyes} envoyés · {d.emails_ouverts} ouverts</Ligne>
      {aAbonnement && (
        <>
          <Ligne libelle="Abonnement">{d.abo_statut} {d.abo_plan ? `· ${d.abo_plan}` : ''}</Ligne>
          <Ligne libelle="Montant mensuel">{fmtEur(d.abo_montant_mensuel)}</Ligne>
          <Ligne libelle="Prochaine échéance">{fmtDate(d.abo_prochaine_echeance)}</Ligne>
          {d.abo_resilie_le && <Ligne libelle="Résilié le">{fmtDate(d.abo_resilie_le)}</Ligne>}
        </>
      )}
      {d.documents_purges_le && (
        <Ligne libelle="Documents">purgés le {fmtDate(d.documents_purges_le)}</Ligne>
      )}
      {d.supprime_le && <Ligne libelle="Supprimé le">{fmtDateHeure(d.supprime_le)}</Ligne>}
      {d.est_test && <Ligne libelle="Marquage">dossier de test</Ligne>}
    </dl>
  );
}

function OngletEmails({ emails }) {
  if (!emails || emails.length === 0) {
    return <p className="text-sm text-baikal-text opacity-60">Aucun email envoyé.</p>;
  }
  return (
    <table className="w-full text-sm text-baikal-text">
      <thead>
        <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
          <th className="py-2 pr-4">Envoyé le</th>
          <th className="py-2 pr-4">Type</th>
          <th className="py-2 pr-4">Statut</th>
          <th className="py-2">Ouvert le</th>
        </tr>
      </thead>
      <tbody>
        {emails.map((e, i) => (
          <tr key={i} className="border-t border-baikal-border/50">
            <td className="py-2 pr-4 whitespace-nowrap">{fmtDateHeure(e.envoye_le)}</td>
            <td className="py-2 pr-4 font-mono text-xs">{e.sujet}</td>
            <td className="py-2 pr-4">{e.statut}</td>
            <td className="py-2 whitespace-nowrap">{fmtDateHeure(e.ouvert_le)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OngletEvents({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-baikal-text opacity-60">Aucun événement.</p>;
  }
  return (
    <ul className="space-y-2">
      {events.map((ev, i) => (
        <li key={i} className="text-sm text-baikal-text flex items-start gap-3">
          <span className="whitespace-nowrap text-xs opacity-60 mt-0.5">{fmtDateHeure(ev.survenu_le)}</span>
          <div className="min-w-0">
            <span className="font-mono text-xs text-white">{ev.type}</span>
            {ev.detail?.page && (
              <span className="ml-2 text-xs opacity-60 break-all">{ev.detail.page}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function FicheDossier({ appId, dossierId, onClose }) {
  const [onglet, setOnglet] = useState('vue');
  const { donnees, erreur } = useDonneesCachees(
    `fiche:${appId}:${dossierId}`,
    () => dossiersService.getFiche(appId, dossierId),
    appId,
  );
  const d = donnees?.dossier;
  const extensions = EXTENSIONS_FICHE[appId] || [];
  const onglets = d
    ? [
      ['vue', 'Vue'],
      ['emails', `Emails (${(donnees.emails || []).length})`],
      ...(donnees.events ? [['events', `Events (${donnees.events.length})`]] : []),
      ...extensions.map((e) => [e.id, e.label]),
    ]
    : [];
  const extensionActive = extensions.find((e) => e.id === onglet) || null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {d && <BadgeEtape statut={d.statut} payeLe={d.paye_le} funnel={donnees?.funnel} />}
              <h3 className="text-white font-semibold truncate">{d?.email || d?.contact_nom || dossierId}</h3>
            </div>
            <p className="font-mono text-xs text-baikal-text opacity-60 mt-1">{dossierId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-baikal-text hover:text-white rounded-md hover:bg-baikal-bg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {onglets.length > 0 && (
          <nav className="flex gap-1 px-4 border-b border-baikal-border overflow-x-auto">
            {onglets.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setOnglet(id)}
                className={`px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors
                  ${onglet === id
                    ? 'border-baikal-cyan text-baikal-cyan'
                    : 'border-transparent text-baikal-text hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="p-4">
          {erreur && <Erreur message={erreur} />}
          {!donnees && !erreur && <Chargement />}
          {d && onglet === 'vue' && <OngletVue d={d} />}
          {d && onglet === 'emails' && <OngletEmails emails={donnees.emails} />}
          {d && onglet === 'events' && <OngletEvents events={donnees.events} />}
          {d && extensionActive && (
            <extensionActive.Composant appId={appId} dossierId={dossierId} dossier={d} />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Écrire Clients.jsx**

```jsx
/**
 * Clients.jsx - Baikal Console
 * ============================================================================
 * Vue transverse des dossiers clients du site selectionne, lue en direct
 * dans la vue contractuelle baikal_dossiers du site (spec 2026-08-26).
 * Le funnel est une donnee du registre (config.apps.funnel_etapes) : les
 * filtres de statut se construisent dynamiquement ; un site sans funnel
 * n'affiche que Paye/— derive de paye_le. Un site sans vue n'a pas le
 * module (etat explicite, pas une erreur).
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { useDonneesCachees } from '../hooks/useDonneesCachees';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import { dossiersService } from '../services/dossiers.service';
import FicheDossier from '../components/console/FicheDossier';
import { BadgeCanal, BadgeEtape, fmtDate } from '../components/console/badges-clients';

const PERIODES = [[null, 'Tout'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']];
const PERIMETRES = [[null, 'Tous'], ['b2c', 'B2C'], ['b2b', 'B2B']];
const PAR_PAGE = 25;

function Chip({ actif, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors
        ${actif
          ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
          : 'border-baikal-border text-baikal-text hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function Case({ coche, onChange, children }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-baikal-text cursor-pointer select-none">
      <input type="checkbox" checked={coche} onChange={onChange} className="accent-baikal-cyan" />
      {children}
    </label>
  );
}

function ClientsContent() {
  const { currentApp } = useApp();
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [periodeJours, setPeriodeJours] = useState(null);
  const [perimetre, setPerimetre] = useState(null);
  const [statuts, setStatuts] = useState([]);
  const [inclureMasquees, setInclureMasquees] = useState(false);
  const [exclureTests, setExclureTests] = useState(true);
  const [inclureSupprimes, setInclureSupprimes] = useState(false);
  const [page, setPage] = useState(1);
  const [ficheId, setFicheId] = useState(null);

  // Debounce de la recherche : 400 ms apres la derniere frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      setRecherche(saisie.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [saisie]);

  // Changement de site : filtres de statut et pagination remis a zero
  // (les slugs d'un funnel n'ont pas de sens sur un autre site).
  useEffect(() => {
    setStatuts([]);
    setPage(1);
    setFicheId(null);
  }, [currentApp]);

  const criteres = useMemo(() => ({
    recherche,
    periodeJours,
    perimetre,
    statuts,
    inclureMasquees,
    exclureTests,
    inclureSupprimes,
    page,
    parPage: PAR_PAGE,
  }), [recherche, periodeJours, perimetre, statuts, inclureMasquees,
    exclureTests, inclureSupprimes, page]);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `clients:${currentApp}:${JSON.stringify(criteres)}`,
    () => dossiersService.getListe(currentApp, criteres),
    currentApp,
  );

  const funnel = donnees?.funnel || null;
  const masquees = (funnel || []).filter((e) => e.masquee_par_defaut === true);
  const dossiers = donnees?.dossiers || [];
  const total = donnees?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const aAbonnement = dossiers.some((d) => 'abo_statut' in d);
  const basculerStatut = (slug) => {
    setStatuts((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
    setPage(1);
  };

  if (donnees && donnees.disponible === false) {
    return (
      <Section titre="Clients">
        <Vide message="Module non disponible pour ce site — la vue baikal_dossiers n'est pas publiée dans sa base. Voir le contrat de données de la spec 2026-08-26." />
      </Section>
    );
  }

  return (
    <Section
      titre="Clients"
      sousTitre="Lecture directe dans la base du site — funnel défini au registre des sites"
    >
      {/* Barre de filtres */}
      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-baikal-text opacity-60" />
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Email, nom, libellé…"
              className="w-full pl-9 pr-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-baikal-text opacity-60 mr-1">Période</span>
            {PERIODES.map(([val, libelle]) => (
              <Chip key={libelle} actif={periodeJours === val}
                onClick={() => { setPeriodeJours(val); setPage(1); }}>
                {libelle}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-baikal-text opacity-60 mr-1">Type</span>
            {PERIMETRES.map(([val, libelle]) => (
              <Chip key={libelle} actif={perimetre === val}
                onClick={() => { setPerimetre(val); setPage(1); }}>
                {libelle}
              </Chip>
            ))}
          </div>
          <span className="ml-auto text-sm text-baikal-text">
            <span className="text-baikal-cyan font-semibold">{total}</span> dossiers
          </span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {funnel && funnel.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-baikal-text opacity-60 mr-1">Statut</span>
              {funnel.map((e) => (
                <Chip key={e.slug} actif={statuts.includes(e.slug)}
                  onClick={() => basculerStatut(e.slug)}>
                  {e.libelle}
                </Chip>
              ))}
            </div>
          )}
          {masquees.length > 0 && (
            <Case coche={inclureMasquees}
              onChange={(e) => { setInclureMasquees(e.target.checked); setPage(1); }}>
              Inclure {masquees.map((e) => `${e.libelle.toLowerCase()}s`).join(' + ')}
            </Case>
          )}
          <Case coche={exclureTests}
            onChange={(e) => { setExclureTests(e.target.checked); setPage(1); }}>
            Exclure tests
          </Case>
          <Case coche={inclureSupprimes}
            onChange={(e) => { setInclureSupprimes(e.target.checked); setPage(1); }}>
            Inclure supprimés
          </Case>
        </div>
      </div>

      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && donnees.disponible !== false && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Contact</th>
                  <th className="px-4 py-2">Statut</th>
                  {aAbonnement && <th className="px-4 py-2">Abonnement</th>}
                  <th className="px-4 py-2 whitespace-nowrap">Créé</th>
                  <th className="px-4 py-2 whitespace-nowrap">Payé le</th>
                  <th className="px-4 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {dossiers.length === 0 && (
                  <LigneVide colonnes={aAbonnement ? 7 : 6}
                    message="Aucun dossier ne correspond aux filtres." />
                )}
                {dossiers.map((d) => (
                  <tr
                    key={d.dossier_id}
                    onClick={() => setFicheId(d.dossier_id)}
                    className={`border-t border-baikal-border/50 cursor-pointer hover:bg-baikal-bg/50
                      ${d.supprime_le ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs opacity-60">
                      {d.dossier_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white truncate max-w-[280px]">
                        {d.email || <span className="opacity-50">— pas d'email</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {d.contact_nom && (
                          <span className="text-xs opacity-60 truncate max-w-[140px]">{d.contact_nom}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs opacity-70">
                          <Mail className="w-3 h-3" />
                          {d.emails_envoyes} / {d.emails_ouverts}
                        </span>
                        <BadgeCanal canal={d.canal} attribution={d.attribution} />
                        {d.apporteur && (
                          <span className="text-xs text-baikal-cyan">via {d.apporteur}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <BadgeEtape statut={d.statut} payeLe={d.paye_le} funnel={funnel} />
                    </td>
                    {aAbonnement && (
                      <td className="px-4 py-3 text-xs">
                        {d.abo_statut
                          ? <>{d.abo_statut}{d.abo_plan ? ` · ${d.abo_plan}` : ''}</>
                          : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(d.cree_le)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(d.paye_le)}</td>
                    <td className="px-4 py-3 text-xs opacity-70">
                      {d.perimetre === 'b2b' ? 'B2B' : 'B2C'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-baikal-text">
            <span>
              Page {page} sur {pages}
              {total > 0 && (
                <> · {(page - 1) * PAR_PAGE + 1}–{Math.min(page * PAR_PAGE, total)} / {total}</>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 border border-baikal-border rounded-md hover:border-baikal-cyan hover:text-baikal-cyan disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="p-2 border border-baikal-border rounded-md hover:border-baikal-cyan hover:text-baikal-cyan disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </ContenuEstompe>
      )}

      {ficheId && (
        <FicheDossier appId={currentApp} dossierId={ficheId} onClose={() => setFicheId(null)} />
      )}
    </Section>
  );
}

export default function Clients() {
  return (
    <ConsoleLayout actif="clients">
      <ClientsContent />
    </ConsoleLayout>
  );
}
```

- [ ] **Step 3 : Ajouter la route dans App.jsx**

Ajouter l'import avec les autres pages (`src/App.jsx`, zone des imports vers la ligne 42) :

```jsx
import Clients from './pages/Clients';
```

Puis, juste après le bloc de la route `/finances` (`src/App.jsx:224-232`) :

```jsx
          {/* Admin - Clients multi-sites */}
          <Route
            path="/clients"
            element={
              <AdminRoute>
                <Clients />
              </AdminRoute>
            }
          />
```

- [ ] **Step 4 : Ajouter le module transverse dans ConsoleLayout.jsx**

Dans l'import lucide (`ConsoleLayout.jsx:15-18`), ajouter `FolderOpen` :

```jsx
import {
    LayoutDashboard, BookOpen, MessageSquareCode, Database, FolderOpen,
    TrendingUp, Mail, Users, Globe, Shield, Settings, LogOut, Euro,
} from 'lucide-react';
```

Dans `MODULES_TRANSVERSES` (`ConsoleLayout.jsx:36-42`), en première position :

```jsx
const MODULES_TRANSVERSES = [
    { id: 'clients', label: 'Clients', icon: FolderOpen, route: '/clients' },
    { id: 'finances', label: 'Finances', icon: Euro, route: '/finances' },
    { id: 'seo', label: 'SEO', icon: TrendingUp, route: '/seo' },
    { id: 'partenariats', label: 'Partenariats', icon: Mail, route: '/partenariats' },
    { id: 'users', label: 'Utilisateurs', icon: Users, route: '/admin/users' },
    { id: 'sites', label: 'Sites', icon: Globe, route: '/sites', superAdmin: true },
];
```

Et compléter le commentaire d'usage du fichier (ligne 9) : `actif ∈ dashboard|knowledge|prompts|indexation|clients|finances|seo|partenariats|users|sites`.

- [ ] **Step 5 : Vérifier que le build passe**

Run: `npm run build`
Expected: build Vite OK, aucun import cassé.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/Clients.jsx src/components/console/FicheDossier.jsx src/App.jsx src/components/console/ConsoleLayout.jsx
git commit -m "feat(clients): page /clients - liste, fiche socle et navigation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8 : Vérification navigateur et parité

**Files:**
- Aucun fichier : vérification de bout en bout dans le navigateur (dev server `baikal-dev` de `.claude/launch.json`).

- [ ] **Step 1 : Lancer le dev server et ouvrir /clients**

`preview_start` avec `{name: "baikal-dev"}`, puis naviguer vers `http://localhost:5173/clients` (se connecter si nécessaire — compte super_admin d'Eric déjà en session dans le navigateur en général). Sélectionner le site **Pré-état-daté / pack-vendeur** dans la colonne de gauche.

- [ ] **Step 2 : Vérifier la liste et la parité**

- Le compteur affiche **53 dossiers** (filtres par défaut : Tout, Tous, tests exclus, visiteurs masqués, supprimés exclus) — chiffre du 2026-08-26, à ±quelques dossiers près si l'activité a bougé.
- Décocher « Exclure tests » → le compteur passe à **59**, soit exactement le total affiché par le /admin PED (qui compte les tests dans son total — écart documenté).
- Les badges de statut affichent Visiteur/Lead/Engagé/Payé/Autre avec les couleurs du registre ; la colonne Abonnement est ABSENTE (PED n'expose pas les colonnes `abo_*`).
- La recherche « scafi » remonte le dossier `l.scafi+preetatdate@gmail.com`, badge Payé.
- Cocher « Inclure visiteurs » → le total grimpe (~650) ; recocher.
- Sélectionner un autre site (ex. ARPET) → état « Module non disponible pour ce site » (pas une erreur rouge).

- [ ] **Step 3 : Vérifier la fiche**

Cliquer la ligne `l.scafi…` : la fiche s'ouvre — onglet Vue (email, montant 24,99 €, payé le 26 août, origine, compteur emails), onglet Emails (liste des envois avec dates), onglet Events présent (la vue existe côté PED). Vérifier la console navigateur (`read_console_messages`) : aucune erreur.

- [ ] **Step 4 : Capture d'écran**

`computer {action: "screenshot"}` de la liste et de la fiche — jointes au rapport final.

---

### Task 9 : Rapport final et documentation

**Files:**
- Aucun fichier modifié sans accord : la mise à jour de `CLAUDE.md` est PROPOSÉE à Eric, jamais appliquée d'office.

- [ ] **Step 1 : Rapport à Eric**

Le rapport final récapitule : ce qui est en prod (vues PED, registre, EF, page), les chiffres de parité (53/59 et pourquoi ils diffèrent), les captures d'écran, et les deux écarts assumés : (1) compteur « ouverts » (Resend `opened_at`) là où le /admin PED affiche des clics déduits des events — l'extension PED du lot 3 pourra reprendre la version fine ; (2) la cascade d'attribution existe désormais en deux exemplaires (SQL `admin.canal_vente` + TS `canal.ts`) — toute évolution doit toucher les deux (commentaire croisé posé dans `canal.ts`).

- [ ] **Step 2 : Proposer la mise à jour de CLAUDE.md**

Proposer à Eric (sans l'appliquer) l'ajout suivant à la section « Modules admin multi-sites » de `CLAUDE.md` :

```
- **Clients** : page `/clients` + EF `admin-dossiers` — liste et fiche des
  dossiers clients d'un site, lues en direct dans les vues contractuelles
  `baikal_dossiers|baikal_dossier_emails|baikal_dossier_events` du projet du
  site (baikal_reader, capacite par presence de colonnes/vues). Funnel defini
  dans `config.apps.funnel_etapes` (jsonb, NULL = pas de funnel). Cascade
  d'attribution dupliquee en TS (`admin-dossiers/canal.ts`) — a maintenir en
  parite avec `admin.canal_vente`. Lot 2 (actions purge/renvoi) et lot 3
  (extensions fiche PED) a venir — spec 2026-08-26-baikal-clients-design.md.
```

- [ ] **Step 3 : Préparer le prompt côté Pack Vendeur**

Fournir à Eric un court prompt à coller dans une session Pack Vendeur : recopier la migration `baikal_dossiers_vues_hub` dans `supabase/migrations/` du repo PED (elle n'existe que dans l'historique du projet Supabase), et rappeler la règle existante « toute nouvelle table doit sa policy `baikal_read` » étendue aux vues du contrat : toute évolution du funnel PED (computeBucket) doit être répercutée dans la vue `baikal_dossiers`.

---

## Self-review du plan (fait à l'écriture)

- **Couverture de la spec (lot 1)** : contrat de vues §3 → Task 1 ; registre §4 → Task 2 ; EF lecture §5 → Tasks 3-5 (y compris tolérance colonnes, site sans vue, funnel dynamique) ; page §6 → Tasks 6-7 (liste, filtres, fiche socle, registre d'extensions vide, colonne abonnement conditionnelle) ; états §8 → `disponible:false` + `Erreur`/`Vide`/`LigneVide`. Les §7 (écritures) et extensions PED sont lots 2-3, hors plan — conforme au découpage §9.
- **Types cohérents** : `Criteres` (Task 4) = clés envoyées par le front (Task 7, objet `criteres`) ; `canalVente` consommé en Task 5 et affiché via `CANAUX` (Task 6) ; `EtapeFunnel` {slug, libelle, couleur, masquee_par_defaut} identique entre la migration (Task 2), l'EF (Task 5) et `BadgeEtape` (Task 6).
- **Pas de placeholder** : chaque étape porte son code ou sa commande et son résultat attendu.
