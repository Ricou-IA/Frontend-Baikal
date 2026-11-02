# Module Événements v1 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer dans `docs/contrats/` le module `evenements-v1`, installable tel quel chez tout site suivi par Baikal : le SQL, le relais serveur, la bibliothèque navigateur, le guide d'installation et la recette.

**Architecture:** Un module de contrat, comme `prospects-v1` : des objets SQL identiques partout sous `@SCHEMA@`, un gestionnaire HTTP neutre que deux enrobages de trois lignes posent en Edge Function Deno ou en route Next, et une bibliothèque navigateur sans dépendance. La logique est dans des fonctions pures testées sous Deno ; le SQL est éprouvé par une recette jouée dans un schéma jetable d'un projet Supabase réel, puis supprimé.

**Tech Stack:** Postgres 15 (Supabase, pg_cron), Deno 2.8 (`deno test`), JavaScript ES module pour le navigateur, PowerShell 5.1 pour jouer le SQL par l'API de gestion Supabase.

**Spec:** `docs/superpowers/specs/2026-11-02-contrat-evenements-design.md`

## Global Constraints

- Tout en français : noms SQL, fonctions, messages, commentaires. Pas de tiret cadratin dans les textes.
- Le schéma s'écrit `@SCHEMA@` dans les fichiers du module ; jamais un nom de site en dur.
- Fonctions SQL en `security definer` avec `set search_path = ''`, références qualifiées `@SCHEMA@.`.
- RLS activée **et** forcée sur chaque table ; policy `service_role` seule en écriture ; `grant select` et policy `baikal_read` pour `baikal_reader` sur chaque table source et sur la vue.
- Le vocabulaire, dans cet ordre et sans autre valeur : `page_vue`, `clic`, `recherche`, `resultat_ouvert`, `filtre`, `formulaire_envoye`, `fichier_telecharge`, `media_lu`, `partage`, `paiement_initie`, `erreur`, `identification`, `autre`.
- Tailles : `libelle` 200 caractères, `page` 300 caractères, `referent` 200, `detail` 20 clés au plus, valeurs scalaires de 200 caractères au plus, `origine` 40, 50 lignes par lot envoyé par le navigateur.
- Le navigateur ne peut pas poser `email` : une ligne qui en porte est rejetée par le relais **et** par la fonction SQL.
- Le relais répond `204` à tout `POST`, erreur comprise ; l'erreur va dans ses logs.
- Purge des visiteurs jamais identifiés après 90 jours ; les identifiés sont gardés.
- Commits dans le dépôt Frontend-Baikal, par pathspec (`git commit -o`), messages en français au style du dépôt (`feat(contrats) : …`), terminés par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Jamais de push.
- Les tests Deno se lancent depuis la racine du dépôt : `deno test docs/contrats/`.

## Review Focus

1. **`navigator.sendBeacon` envoie un corps `text/plain`**, pas `application/json` : un relais qui lit `req.json()` selon l'en-tête perd tous les lots. Test dans la tâche 3 : un `Request` sans `Content-Type` et au corps JSON texte est lu.
2. **Un lot qui porte `email`** : la ligne est rejetée, les autres passent. Tâche 3 (relais) et tâche 1 (SQL).
3. **Une page avec `?adresse=…`** : la bibliothèque la nettoie avant l'envoi, et la fonction SQL rejette ce qui arriverait quand même. Tâches 4 et 1.
4. **Un visiteur identifié sans aucun geste antérieur** : le rattachement est posé, un geste `identification` est écrit avec `page = '/'`, `rattaches = 0`. Tâche 1.
5. **Un lot de 51 lignes, ou un `detail` de 21 clés** : refus du lot entier pour la taille du lot, refus de la seule ligne pour le `detail`, sans toucher aux autres. Tâches 3 et 1.

---

### Task 1: Le SQL du module et sa recette

**Files:**
- Create: `docs/contrats/evenements-v1.sql`
- Create: `docs/contrats/evenements-v1.recette.sql`
- Create: `scripts/sql-api.ps1`

**Interfaces:**
- Produces: `@SCHEMA@.evenement`, `@SCHEMA@.evenement_visiteur`, `@SCHEMA@.evenement_enregistrer(p_lignes jsonb) returns jsonb`, `@SCHEMA@.evenement_identifier(p_visiteur_id uuid, p_email text, p_dossier_id text default null, p_origine text default 'formulaire') returns jsonb`, `@SCHEMA@.evenement_purger() returns integer`, vue `@SCHEMA@.baikal_evenements`.

- [ ] **Step 1 : écrire `scripts/sql-api.ps1`**

Paramètres : `-Ref` (référence du projet), `-Fichier` (chemin du `.sql`), `-Schema` (remplace `@SCHEMA@`, facultatif). Lit le jeton dans `[Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User")` ; `POST https://api.supabase.com/v1/projects/<Ref>/database/query` avec `{ "query": "<sql>" }` encodé en UTF-8 ; caster `[string]$sql` avant `ConvertTo-Json` (PowerShell 5.1 sérialise sinon une chaîne à propriétés en `{"value": …}`) ; affiche la réponse en JSON ; sort en code 1 si l'API répond une erreur. Ne jamais afficher le jeton.

- [ ] **Step 2 : écrire la recette `docs/contrats/evenements-v1.recette.sql`**

Un script sans sortie quand tout passe, en blocs `do $$ … raise exception … $$` qui nomment le contrôle manqué. Il suppose le module déjà installé sous `@SCHEMA@` et laisse le schéma propre (il efface ce qu'il a écrit). Les contrôles, dans l'ordre :

```sql
-- 1. objets présents : 2 tables avec relforcerowsecurity, 3 fonctions, 1 vue
-- 2. droits : has_table_privilege('baikal_reader', '@SCHEMA@.evenement', 'select')
--    et une ligne de pg_policies (policyname = 'baikal_read') sur evenement,
--    evenement_visiteur ; grant select sur baikal_evenements
-- 3. enregistrer : un lot de 3 lignes dont une au geste 'inconnu' -> {ok:true, ecrits:2, rejetes:1}
-- 4. enregistrer : page '/x?y=1' rejetée ; page sans '/' initial rejetée ; email présent rejeté ;
--    detail de 21 clés rejeté ; detail {"a":{"b":1}} (valeur non scalaire) rejeté ;
--    libelle de 300 caractères ÉCRIT tronqué à 200
-- 5. identifier : un visiteur sans geste -> {ok:true, rattaches:0}, une ligne evenement_visiteur,
--    un geste 'identification' libelle 'formulaire', page '/'
-- 6. identifier : un visiteur à 2 gestes anonymes puis identifier('A@B.fr', 'D1', 'connexion')
--    -> rattaches:2 ; les 2 gestes portent email 'a@b.fr' et dossier_id 'D1' ;
--    le geste 'identification' a page = la dernière page du visiteur ;
--    un 3e geste enregistré ensuite porte l'email sans qu'on le donne
-- 7. identifier : email 'pas-un-email' -> {ok:false, erreur:'email invalide'}, rien d'écrit
-- 8. vue : un geste est_test = true n'apparaît pas dans baikal_evenements
-- 9. purger : un geste anonyme daté de 91 jours (update survenu_le) est supprimé,
--    un geste identifié de 91 jours reste ; retour = nombre supprimé
```

- [ ] **Step 3 : jouer la recette avant le module, vérifier qu'elle échoue**

Run :
```powershell
.\scripts\sql-api.ps1 -Ref odspcxgafcqxjzrarsqf -Fichier docs/contrats/evenements-v1.recette.sql -Schema evt_test
```
Expected : erreur `relation "evt_test.evenement" does not exist` (ou le message du contrôle 1).

- [ ] **Step 4 : écrire `docs/contrats/evenements-v1.sql`**

En-tête au style de `prospects-v1.sql` : ce qu'est le module, comment l'installer, pourquoi la donnée reste chez le site. Puis :

- `create table if not exists @SCHEMA@.evenement` : colonnes du §4.1 de la spec, avec `check (geste in (…))` sur les treize mots, `check (page ~ '^/' and page !~ '[?#]' and char_length(page) <= 300)`, `check (jsonb_typeof(detail) = 'object')`, `check (libelle is null or char_length(libelle) <= 200)`, `check (referent is null or char_length(referent) <= 200)`. Index `evenement_email_idx (email, survenu_le desc) where email is not null`, `evenement_visiteur_idx (visiteur_id, survenu_le)`, `evenement_survenu_idx (survenu_le)`.
- `create table if not exists @SCHEMA@.evenement_visiteur` : §4.2, `check (char_length(origine) <= 40)`.
- `evenement_enregistrer(p_lignes jsonb)` : pour chaque élément (objet) du tableau : `visiteur_id` uuid valide, `geste` du vocabulaire **sauf `identification`** (réservé à l'autre fonction), `page` valide, `detail` objet d'au plus 20 clés aux valeurs `string|number|boolean|null`, pas de clé `email`, `est_test` booléen (défaut faux) ; `libelle` et `referent` tronqués par `left(…, 200)`, chaque valeur texte de `detail` tronquée à 200 ; `email` et `dossier_id` pris dans `evenement_visiteur` quand la ligne n'a pas de `dossier_id` ; une ligne invalide incrémente `rejetes`, le reste s'écrit. Retour `jsonb_build_object('ok', true, 'ecrits', n, 'rejetes', m)`. Un `p_lignes` qui n'est pas un tableau rend `{ok:false, erreur:'lot invalide'}`.
- `evenement_identifier(p_visiteur_id, p_email, p_dossier_id, p_origine)` : email `lower(trim())` validé par `'^[^@\s]+@[^@\s]+\.[^@\s]+$'`, sinon `{ok:false, erreur:'email invalide'}` ; `insert … on conflict (visiteur_id) do update set email, dossier_id = coalesce(excluded.dossier_id, …), identifie_le = now(), origine` ; `update evenement set email = v_email, dossier_id = coalesce(dossier_id, p_dossier_id) where visiteur_id = p and email is null` → `rattaches` ; puis `insert` du geste `identification` avec `libelle = left(p_origine, 200)`, `page` = la page du dernier geste du visiteur ou `'/'`, `est_test` = celui du dernier geste ou faux, `email`, `dossier_id`.
- `evenement_purger()` : `delete … where email is null and survenu_le < now() - interval '90 days'`, retourne `row_count`.
- `create or replace view @SCHEMA@.baikal_evenements with (security_invoker = true)` : `survenu_le, visiteur_id, email, dossier_id, geste, libelle, page, detail, referent` où `not est_test`.
- RLS, policies, grants : `service_role` tout sur les deux tables ; `grant select` + policy `baikal_read` pour `baikal_reader` sur les deux tables et `grant select` sur la vue ; `revoke all … from anon, authenticated` ; `grant execute` des trois fonctions à `service_role` seul.
- Purge planifiée, gardée : `do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.schedule('@SCHEMA@-evenements-purge', '17 3 * * *', 'select @SCHEMA@.evenement_purger()'); end if; end $$;` (idempotent : `cron.schedule` remplace un job du même nom).

- [ ] **Step 5 : installer le module dans le schéma jetable, jouer la recette**

Run, dans l'ordre :
```powershell
.\scripts\sql-api.ps1 -Ref odspcxgafcqxjzrarsqf -Fichier docs/contrats/evenements-v1.sql -Schema evt_test
.\scripts\sql-api.ps1 -Ref odspcxgafcqxjzrarsqf -Fichier docs/contrats/evenements-v1.recette.sql -Schema evt_test
```
Avant la première : créer le schéma par une requête `create schema evt_test; grant usage on schema evt_test to service_role, baikal_reader;` (le module n'a pas à créer le schéma du site). Expected : la recette rend `[]` sans erreur.

- [ ] **Step 6 : rejouer le module une seconde fois sur le même schéma**

Expected : aucune erreur (idempotence, `if not exists` et `create or replace` partout, `drop policy if exists` avant chaque policy).

- [ ] **Step 7 : nettoyer le schéma jetable**

Requête : `select cron.unschedule('evt_test-evenements-purge'); drop schema evt_test cascade;` Expected : pas d'erreur ; `select count(*) from cron.job where jobname like 'evt_test%'` rend 0.

- [ ] **Step 8 : commit**

```bash
git commit -o docs/contrats/evenements-v1.sql docs/contrats/evenements-v1.recette.sql scripts/sql-api.ps1 -m "feat(contrats) : module evenements-v1, SQL et recette"
```

---

### Task 2: Le vocabulaire et la validation pure du relais

**Files:**
- Create: `docs/contrats/evenements-relais-v1.ts`
- Create: `docs/contrats/evenements-relais-v1.test.ts`

**Interfaces:**
- Produces: `export const GESTES: readonly string[]` (les treize mots, dans l'ordre) ; `export const MOTIF_ROBOT: RegExp` ; `export function estRobot(userAgent: string | null): boolean` ; `export type Ligne = { visiteur_id: string; geste: string; libelle: string | null; page: string; detail: Record<string, string | number | boolean | null>; dossier_id: string | null; referent: string | null; est_test: boolean }` ; `export type LotLu = { ok: true; lignes: Ligne[]; rejetees: number } | { ok: false; motif: "forme" | "trop" | "robot" }` ; `export function lireLot(corps: unknown, userAgent: string | null): LotLu`.

- [ ] **Step 1 : écrire les tests de `lireLot` et `estRobot`**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { estRobot, GESTES, lireLot } from "./evenements-relais-v1.ts";

const V = "2d49df67-6cf3-49cb-a413-8535c655836d";
const ligne = (sup: Record<string, unknown> = {}) =>
  ({ visiteur_id: V, geste: "clic", libelle: "Payer", page: "/pro/sourcing", detail: { cible: "/tarifs" }, ...sup });

Deno.test("treize gestes, dans l'ordre de la spec", () =>
  assertEquals(GESTES, ["page_vue","clic","recherche","resultat_ouvert","filtre","formulaire_envoye",
    "fichier_telecharge","media_lu","partage","paiement_initie","erreur","identification","autre"]));
Deno.test("un lot valide est lu, les champs absents prennent leur défaut", () =>
  assertEquals(lireLot({ lignes: [ligne()] }, "Mozilla/5.0"), {
    ok: true, rejetees: 0,
    lignes: [{ visiteur_id: V, geste: "clic", libelle: "Payer", page: "/pro/sourcing",
      detail: { cible: "/tarifs" }, dossier_id: null, referent: null, est_test: false }] }));
Deno.test("une ligne qui porte email est rejetée, l'autre passe", () =>
  assertEquals(lireLot({ lignes: [ligne({ email: "a@b.fr" }), ligne()] }, "Mozilla/5.0").ok && 1,
    1) /* et rejetees: 1, lignes.length: 1 */);
Deno.test("identification n'est pas acceptée du navigateur", () =>
  assertEquals((lireLot({ lignes: [ligne({ geste: "identification" })] }, "x") as { rejetees: number }).rejetees, 1));
Deno.test("geste inconnu, visiteur_id mal formé, page avec ? : rejetés", () => { /* trois lots d'une ligne, rejetees: 1 chacun */ });
Deno.test("51 lignes : motif trop", () =>
  assertEquals(lireLot({ lignes: Array.from({ length: 51 }, () => ligne()) }, "x"), { ok: false, motif: "trop" }));
Deno.test("corps qui n'est pas un objet à lignes : motif forme", () =>
  assertEquals(lireLot("n'importe quoi", "x"), { ok: false, motif: "forme" }));
Deno.test("robot : motif robot, avant toute lecture", () =>
  assertEquals(lireLot({ lignes: [ligne()] }, "Googlebot/2.1"), { ok: false, motif: "robot" }));
Deno.test("user-agent vide est un robot", () => assertEquals(estRobot(""), true));
Deno.test("detail : 21 clés rejeté, valeur objet rejetée, texte tronqué à 200", () => { /* trois cas */ });
Deno.test("libelle et referent tronqués à 200, page de 301 rejetée", () => { /* deux cas */ });
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `deno test docs/contrats/evenements-relais-v1.test.ts`
Expected : échec à l'import, module absent.

- [ ] **Step 3 : écrire `GESTES`, `MOTIF_ROBOT`, `estRobot`, `lireLot` dans `docs/contrats/evenements-relais-v1.ts`**

`MOTIF_ROBOT` est copié de `site/lib/trafic.ts` de MonsieurDPE : `/bot|crawl|spider|slurp|headless|lighthouse|monitor|curl|wget|python|httpclient|go-http|java\/|externalhit|preview|scan|checkpoint|validator|feedfetcher/i`. `lireLot` ne fait aucune I/O ; elle applique les mêmes règles que la fonction SQL (ceinture et bretelles) et le plafond de 50 lignes. L'en-tête du fichier décrit le contrat HTTP comme `prospects-relais-v1.ts` le fait.

- [ ] **Step 4 : lancer, vérifier le succès**

Run : `deno test docs/contrats/evenements-relais-v1.test.ts`
Expected : tous verts.

- [ ] **Step 5 : commit**

```bash
git commit -o docs/contrats/evenements-relais-v1.ts docs/contrats/evenements-relais-v1.test.ts -m "feat(contrats) : evenements-v1, lecture d'un lot et vocabulaire"
```

---

### Task 3: Le gestionnaire HTTP du relais et ses deux enrobages

**Files:**
- Modify: `docs/contrats/evenements-relais-v1.ts`
- Modify: `docs/contrats/evenements-relais-v1.test.ts`

**Interfaces:**
- Consumes: `lireLot`, `Ligne` (tâche 2).
- Produces: `export type DependancesRelais = { enregistrer: (lignes: Ligne[]) => Promise<{ error: string | null }>; journal?: (message: string) => void; origine?: string }` ; `export async function traiterBalise(req: Request, deps: DependancesRelais): Promise<Response>`.

- [ ] **Step 1 : écrire les tests de `traiterBalise`**

```ts
const deps = () => { const recus: unknown[] = []; const logs: string[] = [];
  return { recus, logs, deps: { enregistrer: async (l: unknown) => { recus.push(l); return { error: null }; }, journal: (m: string) => logs.push(m) } }; };
const post = (corps: string, entetes: Record<string, string> = {}) =>
  new Request("https://x/api/evenements", { method: "POST", body: corps, headers: { "user-agent": "Mozilla/5.0", ...entetes } });

Deno.test("un POST sans content-type (sendBeacon) est lu et écrit, réponse 204", async () => {
  const d = deps(); const r = await traiterBalise(post(JSON.stringify({ lignes: [ligne()] })), d.deps);
  assertEquals(r.status, 204); assertEquals(d.recus.length, 1); });
Deno.test("un corps illisible répond 204 et journalise", async () => {
  const d = deps(); const r = await traiterBalise(post("{pas du json"), d.deps);
  assertEquals(r.status, 204); assertEquals(d.recus.length, 0); assertEquals(d.logs.length, 1); });
Deno.test("un robot répond 204 sans écrire ni journaliser", async () => { /* user-agent Googlebot */ });
Deno.test("enregistrer en erreur : 204 quand même, erreur journalisée", async () => { /* enregistrer rend { error: "42501" } */ });
Deno.test("OPTIONS répond 204 avec les en-têtes CORS de l'origine donnée", async () => {
  const r = await traiterBalise(new Request("https://x/api/evenements", { method: "OPTIONS" }), { ...deps().deps, origine: "https://www.monsite.fr" });
  assertEquals(r.status, 204); assertEquals(r.headers.get("access-control-allow-origin"), "https://www.monsite.fr"); });
Deno.test("GET répond 405", async () => { /* */ });
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `deno test docs/contrats/evenements-relais-v1.test.ts`
Expected : `traiterBalise` non exporté.

- [ ] **Step 3 : écrire `traiterBalise` et, en commentaire de fin de fichier, les deux enrobages**

`traiterBalise` : `OPTIONS` → 204 avec `Access-Control-Allow-Origin` = `deps.origine ?? "*"`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: content-type` ; autre que `POST` → 405 ; sinon `await req.text()` puis `JSON.parse` dans un `try` (jamais `req.json()` : `sendBeacon` envoie `text/plain`), `lireLot(corps, req.headers.get("user-agent"))`, motif `robot` → 204 muet, motif `forme`/`trop` → 204 et `journal`, lot ok → `await deps.enregistrer(lignes)`, `error` non nul → `journal`, puis 204. Jamais de `throw` hors de la fonction.

Les deux enrobages, en commentaire à copier par le site :
```ts
// Edge Function (Deno) : verify_jwt = false obligatoire, sendBeacon ne pose aucun en-tête.
// Deno.serve((req) => traiterBalise(req, { enregistrer: (l) => supabase.rpc("evenement_enregistrer", { p_lignes: l }).then(({ error }) => ({ error: error?.message ?? null })), journal: console.error, origine: "https://www.monsite.fr" }));
// Route Next (app/api/evenements/route.ts) :
// export const POST = (req: Request) => traiterBalise(req, { ...mêmes dépendances, le client service_role du site… });
// export const OPTIONS = POST;
```
Le client Supabase appelle la RPC avec `schema: "<schema>"` (ou l'en-tête `content-profile`) : le README le rappelle.

- [ ] **Step 4 : lancer, vérifier le succès**

Run : `deno test docs/contrats/evenements-relais-v1.test.ts`
Expected : tous verts.

- [ ] **Step 5 : commit**

```bash
git commit -o docs/contrats/evenements-relais-v1.ts docs/contrats/evenements-relais-v1.test.ts -m "feat(contrats) : evenements-v1, le relais et ses deux enrobages"
```

---

### Task 4: La bibliothèque navigateur

**Files:**
- Create: `docs/contrats/evenements-v1.js`
- Create: `docs/contrats/evenements-v1.test.js`

**Interfaces:**
- Produces: `export function nettoyerPage(href)` → chemin sans requête ni fragment, `'/'` si vide ; `export function hoteReferent(referrer, hoteCourant)` → nom d'hôte du référent ou `null` s'il est vide ou égal à l'hôte courant ; `export function lireStaff(search, stockage)` → booléen, pose/retire la clé `mouchard_staff` dans `stockage` selon `?staff=1` / `?staff=0` ; `export function creerMouchard(options)` ; `export function installer(options)`.

`options` de `creerMouchard` : `{ relais: string, nomCookie: string, fenetre, stockage, envoyer: (url, corps: string) => void, maintenant: () => number }` ; tout sauf `relais` et `nomCookie` a un défaut pris sur `window` (`fenetre = window`, `stockage = window.localStorage`, `envoyer` = `navigator.sendBeacon` sinon `fetch` en `keepalive`, `maintenant = Date.now`). Rend `{ visiteur(): string, geste(geste, libelle, detail, dossierId): void, pageVue(): void, vider(): void, file: Ligne[] }`.

`installer(options)` : appelle `creerMouchard`, émet `pageVue()` tout de suite, enveloppe `history.pushState` et `history.replaceState` et écoute `popstate` pour émettre un `pageVue()` quand le chemin change, `visibilitychange` vers `hidden` → `vider()`, `setInterval(vider, 5000)`, et `vider()` dès que la file atteint 20. Rend le mouchard.

- [ ] **Step 1 : écrire les tests, avec des faux pour `window`**

```js
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { creerMouchard, hoteReferent, lireStaff, nettoyerPage } from "./evenements-v1.js";

Deno.test("nettoyerPage retire requête et fragment", () => {
  assertEquals(nettoyerPage("https://x.fr/rapport?adresse=12%20rue#haut"), "/rapport");
  assertEquals(nettoyerPage("https://x.fr"), "/"); });
Deno.test("hoteReferent : nul si vide ou même hôte", () => {
  assertEquals(hoteReferent("https://www.google.fr/search?q=dpe", "x.fr"), "www.google.fr");
  assertEquals(hoteReferent("https://x.fr/accueil", "x.fr"), null); assertEquals(hoteReferent("", "x.fr"), null); });
Deno.test("lireStaff : ?staff=1 pose, persiste, ?staff=0 retire", () => {
  const s = new Map(); const stockage = { getItem: (k) => s.get(k) ?? null, setItem: (k, v) => s.set(k, v), removeItem: (k) => s.delete(k) };
  assertEquals(lireStaff("?staff=1", stockage), true); assertEquals(lireStaff("", stockage), true);
  assertEquals(lireStaff("?staff=0", stockage), false); assertEquals(lireStaff("", stockage), false); });

function faux() { /* fenetre: { location: { href, hostname, search }, document: { title, referrer, cookie: "" } }, stockage Map, envois: [] */ }
Deno.test("visiteur() crée un uuid, le garde en stockage et en cookie, le relit", () => { /* deux appels, même valeur ; cookie contient nomCookie= */ });
Deno.test("geste() met en file une ligne complète, page nettoyée, sans email possible", () => {
  /* geste("clic", "Payer", { cible: "/tarifs", email: "a@b.fr" }, null) : la clé email est retirée du detail */ });
Deno.test("pageVue() porte le titre et le referent, seulement lui", () => { /* referent non nul sur page_vue, null sur un clic */ });
Deno.test("vider() envoie un seul lot JSON {lignes} au relais et vide la file", () => { /* envois.length 1, JSON.parse(corps).lignes.length 2 */ });
Deno.test("vider() sur file vide n'envoie rien", () => {});
Deno.test("la 20e ligne déclenche l'envoi", () => {});
Deno.test("en mode staff chaque ligne porte est_test true", () => {});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run : `deno test docs/contrats/evenements-v1.test.js`
Expected : module absent.

- [ ] **Step 3 : écrire `docs/contrats/evenements-v1.js`**

Module ES sans import. Génération de l'identifiant : `crypto.randomUUID()`. Cookie : `${nomCookie}=${id}; Max-Age=31536000; Path=/; SameSite=Lax`. Le `detail` est copié clé par clé en ne gardant que les scalaires, sans la clé `email`, 20 clés au plus (la bibliothèque n'envoie pas ce que le relais refuserait). En-tête du fichier : comment l'installer dans une coque Next (`useEffect` dans le layout client), Vite ou une page statique, en trois lignes.

- [ ] **Step 4 : lancer, vérifier le succès**

Run : `deno test docs/contrats/evenements-v1.test.js`
Expected : tous verts.

- [ ] **Step 5 : commit**

```bash
git commit -o docs/contrats/evenements-v1.js docs/contrats/evenements-v1.test.js -m "feat(contrats) : evenements-v1, la bibliothèque navigateur"
```

---

### Task 5: Le guide d'installation et le registre des contrats

**Files:**
- Create: `docs/contrats/evenements-v1.md`
- Modify: `docs/contrats/README.md` (tableau des contrats, et un paragraphe d'installation numéroté 8)
- Modify: `CLAUDE.md` (la ligne du bloc « contrats » qui liste les modules, à côté de `mailing-v1`)

**Interfaces:**
- Consumes: tout ce qui précède, par ses noms.

- [ ] **Step 1 : écrire `docs/contrats/evenements-v1.md`**

C'est la pièce que le Claude Code du site lit. Sections, dans cet ordre, en prose courte :

1. Ce que c'est, en cinq lignes, et ce qu'il n'est pas (spec §2).
2. Les six règles (spec §5), chacune avec sa raison en une phrase.
3. Installer, pas à pas : copier `evenements-v1.sql` en migration et substituer `@SCHEMA@` ; déployer le relais (route serveur du site de préférence, enrobage Next ; Edge Function sinon, `verify_jwt = false`, secret `service_role`) ; poser `evenements-v1.js` dans la coque et appeler `installer({ relais: "/api/evenements", nomCookie: "<schema>_visiteur" })` ; poser les appels `geste(...)` ; poser l'identification serveur ; ajouter la branche à `baikal_dossier_events` ; compléter la page de confidentialité ; passer la recette.
4. Le vocabulaire : le tableau du §6 de la spec, tel quel.
5. L'identification côté serveur : trois exemples nommés, « formulaire de lead », « connexion », « webhook de paiement », chacun : lire le cookie `<schema>_visiteur`, appeler `evenement_identifier(uuid, email, dossier, origine)` par le client `service_role` ; le webhook de paiement n'a pas de cookie, il passe le `visiteur_id` dans les métadonnées de la session de paiement au moment du `paiement_initie`.
6. La branche Events : les deux formes (clé = email, clé = `dossier_id`), copiées de la spec §4.4.
7. Reprendre un mouchard existant : garder l'ancienne table en lecture, poser une table de correspondance ancien nom → geste v1 avec l'ancien nom dans `detail.nom_ancien`, retirer l'ancien relais.
8. La recette : les sept contrôles de la spec §8, les contrôles 1, 2, 5 par `evenements-v1.recette.sql`, les autres comme gestes à faire dans un navigateur, avec la requête qui vérifie chacun.

- [ ] **Step 2 : ajouter le module au `README.md` des contrats**

Une ligne dans le tableau : `evenements-v1.sql` + `.ts` + `.js` | module | 1 | aucun site encore. Et un point 8 dans « Installer un module chez un site » : « **Module événements** (`evenements-v1.md`) : le relais tourne chez le site, l'identification ne vient que de son serveur, la branche Events se dérive de `baikal_evenements`. »

- [ ] **Step 3 : une ligne dans `CLAUDE.md` de Baikal**

À l'endroit où les contrats sont listés (bloc « Les règles communes à tous les contrats… », vers la ligne 307) : « Module événements (`docs/contrats/evenements-v1.md`) : le mouchard standard des sites, vocabulaire fermé de treize gestes, aucun site branché au 02/11/2026. Spec : `docs/superpowers/specs/2026-11-02-contrat-evenements-design.md`. »

- [ ] **Step 4 : relire le guide comme le Claude Code d'un site**

Vérifier que chaque étape de la section 3 nomme un fichier et une commande, qu'aucune ne renvoie à « voir la spec ». Expected : zéro renvoi hors du dossier `docs/contrats/`.

- [ ] **Step 5 : commit**

```bash
git commit -o docs/contrats/evenements-v1.md docs/contrats/README.md CLAUDE.md -m "docs(contrats) : guide d'installation du module evenements-v1"
```

---

### Task 6: Vérification de bout en bout, en local, sur le schéma jetable

**Files:**
- Create: `docs/contrats/evenements-v1.bout-en-bout.ts` (script Deno, pas un test : il touche une base réelle)

**Interfaces:**
- Consumes: `traiterBalise`, `lireLot` (tâches 2-3), le SQL (tâche 1), `creerMouchard` (tâche 4).

- [ ] **Step 1 : écrire le script**

Il lit `SUPABASE_URL` et `SUPABASE_CLE_SERVICE` dans l'environnement, installe le module sous `evt_e2e` par les mêmes requêtes que la tâche 1 (par l'API REST `rpc` il ne peut pas : il indique de jouer `sql-api.ps1` avant, et vérifie que la table existe), puis : construit un mouchard avec un faux `window` et un `envoyer` qui appelle `traiterBalise` directement avec `enregistrer` = appel RPC `evenement_enregistrer` sur le schéma `evt_e2e` ; émet `pageVue()`, `geste("resultat_ouvert", "10 Rue de Lan Goc", { rang: 1 })`, `vider()` ; appelle la RPC `evenement_identifier(visiteur, "test@evt.fr", null, "formulaire")` ; lit `baikal_evenements` filtrée sur `test@evt.fr` et affiche les gestes dans l'ordre. Expected affiché : `page_vue`, `resultat_ouvert`, `identification`, les trois avec `email = test@evt.fr`.

- [ ] **Step 2 : jouer, puis nettoyer**

Run : `.\scripts\sql-api.ps1 -Ref odspcxgafcqxjzrarsqf -Fichier docs/contrats/evenements-v1.sql -Schema evt_e2e` après `create schema evt_e2e; grant usage …`, puis `deno run --allow-net --allow-env docs/contrats/evenements-v1.bout-en-bout.ts`, puis `select cron.unschedule('evt_e2e-evenements-purge'); drop schema evt_e2e cascade;`.
Expected : les trois gestes dans l'ordre, puis un schéma disparu.

- [ ] **Step 3 : commit**

```bash
git commit -o docs/contrats/evenements-v1.bout-en-bout.ts -m "test(contrats) : evenements-v1 de bout en bout sur un schéma jetable"
```
