# Module Financier Baikal — lot 1 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** livrer un dashboard financier par site, alimenté par une archive
quotidienne des ventes et des coûts, sans dépendre des vues d'attribution des
sites (lot 2) ni des définitions contractuelles du partenariat (lot 3).

**Architecture :** un cron quotidien appelle l'Edge Function `admin-finance` en
mode capture ; elle lit Stripe (compte unique « Confer ») et les `ai_logs` de
chaque site via `baikal_reader`, puis écrit une ligne par vente dans
`admin.ventes` et une ligne par site et par jour dans `admin.finance_jours`. La
page `/finances` ne lit que l'archive.

**Tech Stack :** Deno (Edge Functions), Postgres 17 (schéma `admin`), postgres-js
via `_shared/sites.ts`, React 18 + Vite + Tailwind, recharts.

**Spec :** `docs/superpowers/specs/2026-08-25-baikal-financier-design.md`

## Global Constraints

- Projet Baikal : `odspcxgafcqxjzrarsqf`. Compte Stripe : `acct_1T5ESoQLEPjlJTgr`
  (« Confer », livemode), **partagé** par Pack Vendeur, Voirie et MonsieurDPE.
- **Toute migration passe par le MCP `apply_migration`**, jamais `supabase db push`.
- Fichier de migration nommé `supabase/migrations/YYYYMMDDHHMMSS_<sujet>.sql`.
- Le schéma `admin` est en **RLS forcée sans policy** : accès `service_role`
  uniquement, comme `admin.prospects` et `admin.seo_snapshots`.
- Les secrets ne sont jamais en table : `config.apps.stripe_secret_ref` ne porte
  que le **nom** du secret Edge Function.
- Montants Stripe en **centimes** : diviser par 100 à l'entrée, jamais après.
- TVA lue dans `config.apps.tva_taux` (défaut `0.20`), jamais en dur.
- Droits : `super_admin` ou droit délégué sur le site, via
  `sitesAutorises()` / `exigerSite()` de `_shared/droits.ts`.
- Code et commentaires en français **sans accents** dans les Edge Functions et
  le SQL (convention du dépôt) ; accents autorisés dans les libellés d'interface.
- Commits : `feat(finance): …` / `fix(finance): …`, minuscules, sans accents.

---

### Task 1 : socle SQL

**Files:**
- Create: `supabase/migrations/20260826010000_finance_socle.sql`

**Interfaces:**
- Produces: tables `admin.ventes`, `admin.finance_jours`,
  `admin.charges_recurrentes`, `admin.stripe_mapping` ; colonnes
  `config.apps.tva_taux` et `config.apps.stripe_secret_ref`.

- [ ] **Step 1 : écrire la migration**

```sql
-- Socle du module Financier (spec 2026-08-25-baikal-financier-design).
-- admin.ventes est la memoire primaire : une ligne par vente, attribution figee.
-- Le CA n'est jamais stocke en agregat, il se somme depuis cette table.

ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS tva_taux numeric(5,4) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS stripe_secret_ref text;

CREATE TABLE IF NOT EXISTS admin.ventes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id                    text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  vente_id                  text,                    -- identifiant cote site, rempli au lot 2
  stripe_payment_intent_id  text,
  created_at                timestamptz,             -- creation cote site (lot 2)
  paid_at                   timestamptz NOT NULL,
  montant_ttc               numeric(12,2) NOT NULL DEFAULT 0,
  montant_ht                numeric(12,2) NOT NULL DEFAULT 0,
  devise                    text NOT NULL DEFAULT 'EUR',
  frais_stripe_eur          numeric(12,2) NOT NULL DEFAULT 0,
  rembourse_le              timestamptz,
  montant_rembourse         numeric(12,2) NOT NULL DEFAULT 0,
  offre                     text NOT NULL DEFAULT 'inconnu',
  perimetre                 text NOT NULL DEFAULT 'b2c',
  attribution               jsonb NOT NULL DEFAULT '{}'::jsonb,
  capture                   text NOT NULL DEFAULT 'live',
  capture_le                timestamptz NOT NULL DEFAULT now(),
  maj_le                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ventes_capture_chk CHECK (capture IN ('live','backfill','backfill_partiel')),
  CONSTRAINT ventes_perimetre_chk CHECK (perimetre IN ('b2c','b2b'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ventes_pi_uidx
  ON admin.ventes (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ventes_site_vente_uidx
  ON admin.ventes (app_id, vente_id) WHERE vente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventes_app_paid_idx ON admin.ventes (app_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS admin.finance_jours (
  app_id       text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  jour         date NOT NULL,
  cout_ia_usd  numeric(12,4) NOT NULL DEFAULT 0,
  cout_ia_eur  numeric(12,2) NOT NULL DEFAULT 0,
  taux_usd     numeric(8,4)  NOT NULL DEFAULT 0.92,
  ads_eur      numeric(12,2),
  complet      boolean NOT NULL DEFAULT true,
  manques      text[] NOT NULL DEFAULT '{}',
  calcule_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, jour)
);

CREATE TABLE IF NOT EXISTS admin.charges_recurrentes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  libelle             text NOT NULL,
  categorie           text NOT NULL DEFAULT 'autre',
  montant_mensuel_eur numeric(12,2) NOT NULL,
  debut               date NOT NULL,
  fin                 date,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charges_periode_chk CHECK (fin IS NULL OR fin >= debut)
);
CREATE INDEX IF NOT EXISTS charges_app_idx ON admin.charges_recurrentes (app_id, debut);

-- Correspondance produit Stripe -> site, tant que les checkouts ne posent pas
-- metadata[application]. cle_type : 'product' | 'price' | 'libelle'.
CREATE TABLE IF NOT EXISTS admin.stripe_mapping (
  cle_type text NOT NULL,
  cle      text NOT NULL,
  app_id   text NOT NULL REFERENCES config.apps(id) ON DELETE CASCADE,
  offre    text NOT NULL,
  PRIMARY KEY (cle_type, cle),
  CONSTRAINT stripe_mapping_type_chk CHECK (cle_type IN ('product','price','libelle'))
);

ALTER TABLE admin.ventes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.ventes              FORCE ROW LEVEL SECURITY;
ALTER TABLE admin.finance_jours       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.finance_jours       FORCE ROW LEVEL SECURITY;
ALTER TABLE admin.charges_recurrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.charges_recurrentes FORCE ROW LEVEL SECURITY;
ALTER TABLE admin.stripe_mapping      ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.stripe_mapping      FORCE ROW LEVEL SECURITY;

GRANT ALL ON admin.ventes, admin.finance_jours,
             admin.charges_recurrentes, admin.stripe_mapping TO service_role;

-- Correspondances connues au 25/08/2026 (catalogue lu dans Stripe).
INSERT INTO admin.stripe_mapping (cle_type, cle, app_id, offre) VALUES
  ('product', 'prod_U3Ld2qJXsJp3a8', 'pack-vendeur', 'pre-etat-date'),
  ('product', 'prod_UWhwcQ6I0FarKG', 'pack-vendeur', 'pack-unitaire'),
  ('product', 'prod_UWhynX6GtKJHYy', 'pack-vendeur', 'pack-x5'),
  ('product', 'prod_UP4b6U4xzrlExH', 'pack-vendeur', 'pack-x10'),
  ('product', 'prod_UP4bNZZAiZVTPO', 'pack-vendeur', 'pack-x20')
ON CONFLICT (cle_type, cle) DO NOTHING;
```

- [ ] **Step 2 : appliquer via le MCP**

Appeler `apply_migration` sur `odspcxgafcqxjzrarsqf` avec le contenu ci-dessus.
Ne pas utiliser `supabase db push`.

- [ ] **Step 3 : vérifier en réel**

```sql
SELECT count(*) FROM admin.stripe_mapping;                       -- attendu : 5
SELECT tva_taux FROM config.apps WHERE id = 'pack-vendeur';      -- attendu : 0.2000
SELECT relforcerowsecurity FROM pg_class WHERE relname = 'ventes'; -- attendu : t
```

- [ ] **Step 4 : commit**

```bash
git add supabase/migrations/20260826010000_finance_socle.sql
git commit -m "feat(finance): socle sql (ventes, finance_jours, charges, mapping stripe)"
```

---

### Task 2 : client Stripe en lecture

**Files:**
- Create: `supabase/functions/_shared/stripe.ts`
- Test: `supabase/functions/_shared/stripe.test.ts`

**Interfaces:**
- Produces :
  - `listerTransactions(cle: string, debut: Date, fin: Date): Promise<TxStripe[]>`
    où `TxStripe = { id, type, amount_eur, fee_eur, created, source, payment_intent }`
  - `listerSessions(cle: string, debut: Date, fin: Date): Promise<SessionStripe[]>`
    où `SessionStripe = { payment_intent, metadata, produits: {product, price, libelle}[] }`

- [ ] **Step 1 : écrire les tests**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { listerTransactions } from "./stripe.ts";

function fauxFetch(pages: unknown[]) {
  let i = 0;
  return () => Promise.resolve(new Response(JSON.stringify(pages[i++])));
}

Deno.test("listerTransactions convertit les centimes et suit la pagination", async () => {
  globalThis.fetch = fauxFetch([
    { data: [{ id: "txn_1", type: "charge", amount: 2499, fee: 62,
               created: 1785000000, source: "py_1" }], has_more: true },
    { data: [{ id: "txn_2", type: "refund", amount: -2499, fee: 0,
               created: 1785100000, source: "py_2" }], has_more: false },
  ]) as never;

  const tx = await listerTransactions("sk_test", new Date(0), new Date());
  assertEquals(tx.length, 2);
  assertEquals(tx[0].amount_eur, 24.99);
  assertEquals(tx[0].fee_eur, 0.62);
  assertEquals(tx[1].amount_eur, -24.99);
});
```

- [ ] **Step 2 : lancer le test, vérifier qu'il échoue**

Run: `deno test --allow-net supabase/functions/_shared/stripe.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter**

Points imposés : `GET /v1/balance_transactions` avec `created[gte]` et
`created[lte]` en secondes, `limit=100`, `expand[]=data.source` — sans lui la
transaction ne porte que l'identifiant de charge, pas le `payment_intent` qui
sert de clé de rapprochement — et pagination par `starting_after` tant que
`has_more`. Montants divisés par 100 à la lecture. Aucun appel par
transaction — c'est ce qui supprime le plafond de frais du code Pack Vendeur.
`listerSessions` appelle `GET /v1/checkout/sessions` avec
`expand[]=data.line_items` et la même pagination.

- [ ] **Step 4 : relancer, vérifier que ça passe**

Run: `deno test --allow-net supabase/functions/_shared/stripe.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5 : commit**

```bash
git add supabase/functions/_shared/stripe.ts supabase/functions/_shared/stripe.test.ts
git commit -m "feat(finance): client stripe en lecture (transactions, sessions)"
```

---

### Task 3 : résolution du site et de l'offre

**Files:**
- Create: `supabase/functions/_shared/finance-mapping.ts`
- Test: `supabase/functions/_shared/finance-mapping.test.ts`

**Interfaces:**
- Consumes : `SessionStripe` (Task 2)
- Produces : `resoudreSite(session, mapping: LigneMapping[]): { app_id, offre }`
  où `LigneMapping = { cle_type: 'product'|'price'|'libelle', cle, app_id, offre }`

- [ ] **Step 1 : écrire les tests**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resoudreSite } from "./finance-mapping.ts";

const mapping = [
  { cle_type: "product" as const, cle: "prod_U3Ld", app_id: "pack-vendeur", offre: "pre-etat-date" },
  { cle_type: "libelle" as const, cle: "Autorisation de voirie", app_id: "voirie", offre: "permis" },
];

Deno.test("metadata application prime sur le mapping", () => {
  const r = resoudreSite(
    { payment_intent: "pi_1", metadata: { application: "dpe", cle: "pack_pro" }, produits: [] },
    mapping,
  );
  assertEquals(r, { app_id: "dpe", offre: "pack_pro" });
});

Deno.test("a defaut, le product identifie le site", () => {
  const r = resoudreSite(
    { payment_intent: "pi_2", metadata: {}, produits: [{ product: "prod_U3Ld", price: "price_x", libelle: "" }] },
    mapping,
  );
  assertEquals(r.app_id, "pack-vendeur");
});

Deno.test("prix inline : le libelle identifie le site", () => {
  const r = resoudreSite(
    { payment_intent: "pi_3", metadata: {}, produits: [{ product: null, price: null, libelle: "Autorisation de voirie" }] },
    mapping,
  );
  assertEquals(r.app_id, "voirie");
});

Deno.test("rien ne correspond : inconnu, jamais un site au hasard", () => {
  const r = resoudreSite(
    { payment_intent: "pi_4", metadata: {}, produits: [{ product: "prod_zzz", price: null, libelle: "" }] },
    mapping,
  );
  assertEquals(r, { app_id: "inconnu", offre: "inconnu" });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `deno test supabase/functions/_shared/finance-mapping.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter la cascade**

Ordre imposé : `metadata.application` (+ `metadata.cle` comme offre) →
`product` → `price` → `libelle` → `{ app_id: 'inconnu', offre: 'inconnu' }`.
Ne jamais deviner par le montant.

- [ ] **Step 4 : relancer**

Run: `deno test supabase/functions/_shared/finance-mapping.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5 : commit**

```bash
git add supabase/functions/_shared/finance-mapping.ts supabase/functions/_shared/finance-mapping.test.ts
git commit -m "feat(finance): resolution site et offre depuis stripe"
```

---

### Task 4 : capture d'une journée

**Files:**
- Create: `supabase/functions/admin-finance/capture.ts`
- Test: `supabase/functions/admin-finance/capture.test.ts`

**Interfaces:**
- Consumes : `listerTransactions`, `listerSessions` (Task 2), `resoudreSite` (Task 3),
  `chargerSite`, `lecteurSite` (`_shared/sites.ts`)
- Produces :
  - `construireVentes(tx, sessions, mapping, tvaParSite): VenteArchivee[]`
  - `captureJour(admin, jour: Date): Promise<{ ventes: number; sites: string[]; manques: string[] }>`

- [ ] **Step 1 : écrire le test de la fonction pure**

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { construireVentes } from "./capture.ts";

Deno.test("une charge et son remboursement donnent une vente au net trace", () => {
  const tx = [
    { id: "txn_1", type: "charge", amount_eur: 24.99, fee_eur: 0.62,
      created: 1785000000, source: "py_1", payment_intent: "pi_1" },
    { id: "txn_2", type: "refund", amount_eur: -24.99, fee_eur: 0,
      created: 1785100000, source: "py_1", payment_intent: "pi_1" },
  ];
  const sessions = [{ payment_intent: "pi_1", metadata: {},
    produits: [{ product: "prod_U3Ld", price: null, libelle: "" }] }];
  const mapping = [{ cle_type: "product" as const, cle: "prod_U3Ld",
    app_id: "pack-vendeur", offre: "pre-etat-date" }];

  const ventes = construireVentes(tx, sessions, mapping, { "pack-vendeur": 0.20 });

  assertEquals(ventes.length, 1);
  assertEquals(ventes[0].montant_ttc, 24.99);
  assertEquals(ventes[0].montant_ht, 20.83);          // 24.99 / 1.20, arrondi 2 dec.
  assertEquals(ventes[0].montant_rembourse, 24.99);   // le CA reste, le remboursement est un cout
  assertEquals(ventes[0].frais_stripe_eur, 0.62);
});

Deno.test("un encaissement sans site reconnu est archive en inconnu, pas ignore", () => {
  const ventes = construireVentes(
    [{ id: "txn_9", type: "charge", amount_eur: 9.9, fee_eur: 0.4,
       created: 1785000000, source: "py_9", payment_intent: "pi_9" }],
    [], [], {},
  );
  assertEquals(ventes[0].app_id, "inconnu");
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `deno test supabase/functions/admin-finance/capture.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter `construireVentes`**

Une vente par `payment_intent`. Le CA vient des transactions de type `charge`
ou `payment` ; les `refund` alimentent `montant_rembourse` et `rembourse_le`
**sans diminuer** `montant_ttc` — décision d'Eric : la vente reste comptée, le
remboursement est un coût décomposé. `montant_ht = montant_ttc / (1 + tva)`
arrondi à deux décimales.

- [ ] **Step 4 : relancer**

Run: `deno test supabase/functions/admin-finance/capture.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5 : implémenter `captureJour`**

Enchaîne : lire `admin.stripe_mapping` et les `tva_taux` → `listerTransactions`
et `listerSessions` sur la journée → `construireVentes` → upsert
`admin.ventes` sur `stripe_payment_intent_id` → pour chaque site touché, somme
de `cost_usd` de `<schema>.ai_logs` via `lecteurSite` → upsert
`admin.finance_jours`. Toute source en **échec** ajoute son nom à `manques` et met `complet = false` ;
jamais d'exception silencieuse. Une source **non configurée** est un cas
différent : `ads_eur` reste nul et la journée demeure complète — Google Ads
n'est branché sur aucun site au lot 1, une journée sans Ads n'est pas une
journée ratée. Le nom de la table de
coûts IA est `pv_ai_logs` pour Pack Vendeur et `ai_logs` dans le schéma du site
ailleurs — résolu par `db_schema` du registre.

- [ ] **Step 6 : commit**

```bash
git add supabase/functions/admin-finance/
git commit -m "feat(finance): capture quotidienne des ventes et des couts"
```

---

### Task 5 : Edge Function `admin-finance`

**Files:**
- Create: `supabase/functions/admin-finance/index.ts`

**Interfaces:**
- Consumes : `captureJour` (Task 4), `sitesAutorises`/`exigerSite` (`_shared/droits.ts`)
- Produces : actions HTTP `capture`, `synthese`, `serie`, `ventes`, `charges`,
  `charge-creer`, `charge-supprimer`

- [ ] **Step 1 : implémenter le squelette et les droits**

Calquer `admin-seo/index.ts` : `serve`, en-têtes CORS identiques, réponse
`{ data, error }`, `POST` uniquement. Deux chemins d'entrée :

- `capture` : authentifié par l'en-tête `X-Cron-Secret` comparé au secret
  `admin_finance_cron_secret`, **jamais** par un JWT utilisateur ;
- toutes les autres actions : client caller, `sitesAutorises()` puis
  `exigerSite(sites, appId)`.

- [ ] **Step 2 : implémenter les lectures**

- `synthese { appId }` → trois fenêtres, forme exacte :

```json
{ "fenetres": {
    "7j":    { "ventes": 3, "ca_ttc": 74.97, "ca_ht": 62.48, "frais_stripe": 1.86,
               "remboursements": 0, "cout_ia": 0.28, "ads": null,
               "charges_fixes": 4.93, "resultat": 55.41,
               "complet": true, "jours_incomplets": [] },
    "mois":  { "...": "idem" },
    "annee": { "...": "idem" } },
  "devise": "EUR", "tva_taux": 0.20 }
```

  `resultat = ca_ht − frais_stripe − remboursements − cout_ia − charges_fixes`,
  `ads` exclu tant qu'il vaut `null`. Les charges fixes sont calculées au
  prorata journalier sur la fenêtre.
- `serie { appId, mois }` → une ligne par mois : CA, coûts, résultat.
- `ventes { appId, debut, fin }` → les lignes de `admin.ventes`, triées par
  `paid_at` décroissant.
- `charges { appId }`, `charge-creer`, `charge-supprimer` → CRUD sur
  `admin.charges_recurrentes`.

- [ ] **Step 3 : déployer et exercer en réel**

```bash
npx supabase functions deploy admin-finance
```

Puis déclencher une capture sur une journée connue portant un remboursement :

```sql
SELECT net.http_post(
  url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-finance',
  headers := jsonb_build_object('Content-Type','application/json',
    'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                      WHERE name = 'admin_finance_cron_secret')),
  body := '{"action":"capture","jour":"2026-07-30"}'::jsonb,
  timeout_milliseconds := 120000);
```

Vérifier : `SELECT app_id, montant_ttc, montant_rembourse FROM admin.ventes
WHERE paid_at::date = '2026-07-30';` — la vente remboursée du 30 juillet doit
apparaître avec `montant_ttc = 24.99` et `montant_rembourse = 24.99`.

- [ ] **Step 4 : commit**

```bash
git add supabase/functions/admin-finance/index.ts
git commit -m "feat(finance): edge function admin-finance (capture + lectures)"
```

---

### Task 6 : cron quotidien

**Files:**
- Create: `supabase/migrations/20260826020000_finance_cron.sql`

- [ ] **Step 1 : poser le secret**

```bash
npx supabase secrets set ADMIN_FINANCE_CRON_SECRET=<valeur> --project-ref odspcxgafcqxjzrarsqf
```

Puis le même secret dans Vault sous le nom `admin_finance_cron_secret`, comme
pour `admin_seo_cron_secret`.

- [ ] **Step 2 : écrire la migration du cron**

```sql
-- Capture financiere quotidienne a 04h30 UTC. Le SEO tourne a 04h15 : on ne
-- les croise pas. La journee de la veille plus une fenetre de rattrapage de
-- 7 jours pour les paid_at tardifs et les remboursements.
SELECT cron.schedule(
  'admin-finance-capture-quotidien',
  '30 4 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-finance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'admin_finance_cron_secret')),
    body := '{"action":"capture","rattrapage":7}'::jsonb,
    timeout_milliseconds := 180000)
  $cron$
);
```

- [ ] **Step 3 : vérifier la planification**

```sql
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'admin-finance%';
```

- [ ] **Step 4 : commit**

```bash
git add supabase/migrations/20260826020000_finance_cron.sql
git commit -m "feat(finance): cron de capture quotidien 04h30"
```

---

### Task 7 : page `/finances`

**Files:**
- Create: `src/services/finance.service.js`
- Create: `src/pages/Finances.jsx`
- Modify: `src/App.jsx` (route `/finances`, `AdminRoute`)
- Modify: `src/components/console/ConsoleLayout.jsx` (`MODULES_TRANSVERSES`)

**Interfaces:**
- Consumes : actions de l'EF (Task 5)
- Produces : `financeService.getSynthese|getSerie|getVentes|getCharges|creerCharge|supprimerCharge`

- [ ] **Step 1 : le service**

Copier la forme de `src/services/seo.service.js` : `appelerEdge('admin-finance',
{ action, ... })`, retour `{ data, error }`.

- [ ] **Step 2 : la page**

Réutiliser sans les réécrire : `ConsoleLayout` (`actif="finances"`), `KpiCarte`,
et les composants d'état de `Seo.jsx` — `Chargement`, `Erreur`, `Vide`,
`LigneVide` — ainsi que le hook `useDonneesCachees` avec son `scope` (l'`appId`)
qui empêche d'afficher les chiffres d'un autre site.

Sections, dans l'ordre de la spec : synthèse trois fenêtres, tendance mensuelle
(recharts, même forme que le bloc Performances), ventilation par offre, charges
récurrentes éditables, liste des ventes.

Un bandeau d'avertissement dès qu'une journée de la période a `complet = false`,
avec la liste des sources manquantes. Un jour incomplet ne s'affiche jamais
comme complet.

- [ ] **Step 3 : la route et l'onglet**

```jsx
// src/App.jsx — a cote de la route /seo
<Route path="/finances" element={<AdminRoute><Finances /></AdminRoute>} />
```

```jsx
// ConsoleLayout.jsx — MODULES_TRANSVERSES, avant 'seo'
{ id: 'finances', label: 'Finances', icon: Euro, route: '/finances' },
```

- [ ] **Step 4 : vérifier dans le navigateur**

`preview_start` sur `baikal-dev`, puis sur `/finances` : basculer d'un site à
l'autre dans la colonne de gauche et confirmer qu'aucun chiffre du site
précédent ne persiste ; vérifier qu'un site sans vente affiche l'état vide et
non une erreur ; contrôler que le CA du mois recoupe Stripe.

- [ ] **Step 5 : commit**

```bash
git add src/services/finance.service.js src/pages/Finances.jsx src/App.jsx src/components/console/ConsoleLayout.jsx
git commit -m "feat(finance): page /finances par site"
```

---

## Contrôle de recette du lot 1

Après la Task 7, sur Pack Vendeur, une fois le dossier de test
`pi_3T5YeiQLEPjlJTgr0Zu7qAtn` marqué côté Pack Vendeur :

| Contrôle | Attendu |
|---|---|
| Nombre de ventes archivées | 43 |
| CA TTC brut | 899,64 € |
| Remboursements | 24,99 € (30 juillet) |
| Net | 874,65 € |
| Ventes en `app_id = 'inconnu'` | 0 |

Un écart sur la dernière ligne signale un produit Stripe absent de
`admin.stripe_mapping` — à corriger par un `INSERT`, jamais par une devinette
sur le montant.

## Ce que le lot 1 ne fait pas

Attribution et ventilation par canal (lot 2, dépend de `public.pv_ventes_baikal`
et du backfill), partenariat (lot 3, dépend des définitions de l'article 1),
Google Ads et taux USD automatique (tracés en points ouverts dans la spec).
