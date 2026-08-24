# Hub Baikal — accès sites : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fondation d'accès aux données du hub : registre `config.apps` complet, rôle `baikal_reader` lecture seule sur les 2 projets dédiés, module partagé `_shared/sites.ts`, refactor d'`import-diagnostiqueurs`.

**Architecture:** Spec validée : `docs/superpowers/specs/2026-08-24-hub-baikal-acces-sites-design.md`. Lecture des bases dédiées en SQL direct via le pooler Supavisor (transaction, port 6543, host `aws-1-eu-west-3.pooler.supabase.com`, user `baikal_reader.<ref>`), lecture des schémas locaux via `SUPABASE_DB_URL`. Lecture seule forcée des deux côtés.

**Tech Stack:** Postgres 17 (3 projets Supabase), Deno Edge Functions, postgres-js v3.4.5, CLI Supabase (authentifiée, projet partagé lié), MCP Supabase pour les migrations.

**Faits vérifiés le 24/08 :**
- Trigger `tr_create_documents_cles_on_app_insert` : upsert `ON CONFLICT` déjà en place, contrainte `concepts_slug_unique` existe. Décision : **on le supprime quand même** (il rattache tout produit actif au concept RAG `documents_cles` — pollution sans objet hors ARPET ; déjà supprimé sur Majord'home dédié).
- `perfec` : 0 organisation, 0 profil → suppression sûre (vérifier les autres FK avant, étape 1.1).
- Jointure MonsieurDPE : `dpe.diag_certifie.slug → dpe.diag_site.slug`.
- Majord'home dédié (`ejqqqwudmizqisdkxohw`) : schémas de données `core`(10), `config`(1), `catalog`(5), `majordhome`(84), `sources`(2). `public` vide.
- Pré-état-daté (`ycmavnmtyvodqawvwrrd`, org séparée) : schéma unique `pack_vendeur` (19 tables).
- Tout est en eu-west-3 ; pooler du projet partagé : `aws-1-eu-west-3.pooler.supabase.com` (fallback à tester pour l'org séparée : `aws-0-...`).

---

### Task 1: Migration registre sur la base partagée

**Files:**
- Create: `supabase/migrations/20260824150000_registre_sites_hub.sql`

- [ ] **Step 1.1: Pré-vérifier les FK qui référencent config.apps et l'absence de perfec**

Via MCP `execute_sql` sur `odspcxgafcqxjzrarsqf` :

```sql
SELECT conrelid::regclass AS table_source, conname
FROM pg_constraint
WHERE confrelid = 'config.apps'::regclass AND contype = 'f';
```

Puis pour chaque table listée : `SELECT count(*) FROM <table> WHERE app_id = 'perfec';`
Attendu : 0 partout. Si non-zéro quelque part : STOP, remonter à Eric.

- [ ] **Step 1.2: Écrire le fichier de migration**

Contenu exact de `supabase/migrations/20260824150000_registre_sites_hub.sql` :

```sql
-- Registre des sites du hub Baikal (spec 2026-08-24-hub-baikal-acces-sites).
-- 1. Trigger RAG retire : il rattachait toute app active au concept
--    'documents_cles' (sans objet hors ARPET, deja retire sur Majord'home).
DROP TRIGGER IF EXISTS tr_create_documents_cles_on_app_insert ON config.apps;
DROP FUNCTION IF EXISTS config.create_documents_cles_concept();

-- 2. Colonnes du registre.
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS db_schema text;
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS db_ro_secret_ref text;
COMMENT ON COLUMN config.apps.db_schema IS
  'Schema Postgres portant les donnees du produit (base partagee ou dediee).';
COMMENT ON COLUMN config.apps.db_ro_secret_ref IS
  'Nom du secret Edge Functions contenant le DSN lecture seule (baikal_reader) '
  'du projet dedie. NULL = donnees dans la base partagee.';

-- 3. Lignes existantes.
UPDATE config.apps SET db_schema = 'arpet'      WHERE id = 'arpet';
UPDATE config.apps SET db_schema = 'dpe'        WHERE id = 'monsieurdpe';
UPDATE config.apps SET db_schema = 'linktrack'  WHERE id = 'linktrack';
UPDATE config.apps SET db_schema = 'majordhome',
       env_url = 'https://ejqqqwudmizqisdkxohw.supabase.co',
       db_ro_secret_ref = 'ADMIN_RO_MAJORDHOME_DSN'
  WHERE id = 'majordhome';
UPDATE config.apps SET db_schema = 'pack_vendeur',
       env_url = 'https://ycmavnmtyvodqawvwrrd.supabase.co',
       db_ro_secret_ref = 'ADMIN_RO_PACKVENDEUR_DSN'
  WHERE id = 'pack-vendeur';

-- 4. Nouvelles lignes (domaine/gsc renseignes plus tard par Eric via /sites).
INSERT INTO config.apps (id, name, description, is_active, sort_order, db_schema)
VALUES
  ('voirie',     'Autorisation Voirie',
   'Demandes d''autorisation d''occupation de voirie (paiement Stripe one-shot)',
   true,  60,  'voirie'),
  ('duerp',      'DUERP',
   'Generation du Document Unique d''Evaluation des Risques Professionnels',
   true,  70,  'duerp'),
  ('cosette',    'Cosette',     NULL, true,  80,  'cosette'),
  ('legifrance', 'Legifrance',  NULL, true,  90,  'legifrance'),
  ('snapstudio', 'SnapStudio',  NULL, true, 100,  'snapstudio'),
  ('karedas',    'Karedas',     NULL, true, 110,  'karedas'),
  ('zelty',      'Zelty',       NULL, false, 120, 'zelty')
ON CONFLICT (id) DO NOTHING;

-- 5. Produit fantome (0 table, 0 org, 0 profil).
DELETE FROM config.apps WHERE id = 'perfec';
```

- [ ] **Step 1.3: Appliquer via MCP `apply_migration`** sur `odspcxgafcqxjzrarsqf`, name `registre_sites_hub`, même SQL.

- [ ] **Step 1.4: Vérifier le registre**

```sql
SELECT id, is_active, db_schema, db_ro_secret_ref, env_url
FROM config.apps ORDER BY sort_order;
```

Attendu : **12 lignes** (13 du tableau de la spec moins `perfec` supprimée), `zelty.is_active = false`, `majordhome` et
`pack-vendeur` avec `env_url` dédiée + `db_ro_secret_ref`, `db_schema` non NULL partout.

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/20260824150000_registre_sites_hub.sql docs/superpowers/plans/2026-08-24-hub-baikal-acces-sites.md
git commit -m "feat(hub): registre config.apps complet (13 produits, db_schema, db_ro_secret_ref)"
```

---

### Task 2: Rôle `baikal_reader` sur Majord'home

- [ ] **Step 2.1: Appliquer la migration** via MCP `apply_migration` sur `ejqqqwudmizqisdkxohw`, name `baikal_reader_lecture_seule` :

```sql
-- Role lecture seule pour le hub Baikal (spec Baikal 2026-08-24).
-- Le mot de passe est pose hors migration (ALTER ROLE ... PASSWORD, verifier SCRAM).
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'baikal_reader') THEN
    CREATE ROLE baikal_reader LOGIN NOINHERIT;
  END IF;
END $$;
ALTER ROLE baikal_reader SET default_transaction_read_only = on;
ALTER ROLE baikal_reader SET statement_timeout = '15s';

GRANT USAGE ON SCHEMA core, config, catalog, majordhome, sources TO baikal_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA core, config, catalog, majordhome, sources TO baikal_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA core       GRANT SELECT ON TABLES TO baikal_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA config     GRANT SELECT ON TABLES TO baikal_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog    GRANT SELECT ON TABLES TO baikal_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA majordhome GRANT SELECT ON TABLES TO baikal_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA sources    GRANT SELECT ON TABLES TO baikal_reader;

-- Policies RLS : pas de BYPASSRLS possible -> policy SELECT permissive par table.
-- Idempotent, a rejouer quand une table apparait (les default privileges ne
-- couvrent pas les policies).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname IN ('core','config','catalog','majordhome','sources')
  LOOP
    IF NOT EXISTS (SELECT FROM pg_policies
                   WHERE schemaname = r.schemaname AND tablename = r.tablename
                     AND policyname = 'baikal_read') THEN
      EXECUTE format(
        'CREATE POLICY baikal_read ON %I.%I FOR SELECT TO baikal_reader USING (true)',
        r.schemaname, r.tablename);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2.2: Vérifier lecture OK** via `execute_sql` :

```sql
SET ROLE baikal_reader;
SELECT count(*) AS rdv FROM majordhome.appointments;
```

Attendu : count ≥ 418 (pas d'erreur, pas de 0 causé par la RLS).

- [ ] **Step 2.3: Vérifier écriture bloquée** via `execute_sql` (appel séparé, l'erreur est le résultat attendu) :

```sql
SET ROLE baikal_reader;
DELETE FROM majordhome.appointments WHERE false;
```

Attendu : `ERROR: permission denied for table appointments` (le GRANT SELECT seul suffit ; le `WHERE false` garantit qu'aucune ligne ne serait touchée même en cas de surprise).

- [ ] **Step 2.4: Vérifier le nombre de policies posées**

```sql
SELECT count(*) FROM pg_policies WHERE policyname = 'baikal_read';
```

Attendu : ≈ 102 (10+1+5+84+2 tables).

---

### Task 3: Rôle `baikal_reader` sur Pré-état-daté

- [ ] **Step 3.1: Appliquer la migration** via MCP `apply_migration` sur `ycmavnmtyvodqawvwrrd`, name `baikal_reader_lecture_seule` — même SQL que 2.1 avec la liste de schémas réduite à `pack_vendeur` :

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'baikal_reader') THEN
    CREATE ROLE baikal_reader LOGIN NOINHERIT;
  END IF;
END $$;
ALTER ROLE baikal_reader SET default_transaction_read_only = on;
ALTER ROLE baikal_reader SET statement_timeout = '15s';
GRANT USAGE ON SCHEMA pack_vendeur TO baikal_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA pack_vendeur TO baikal_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA pack_vendeur GRANT SELECT ON TABLES TO baikal_reader;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables
           WHERE schemaname IN ('pack_vendeur')
  LOOP
    IF NOT EXISTS (SELECT FROM pg_policies
                   WHERE schemaname = r.schemaname AND tablename = r.tablename
                     AND policyname = 'baikal_read') THEN
      EXECUTE format(
        'CREATE POLICY baikal_read ON %I.%I FOR SELECT TO baikal_reader USING (true)',
        r.schemaname, r.tablename);
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 3.2: Lister une table témoin** : `SELECT tablename FROM pg_tables WHERE schemaname='pack_vendeur' ORDER BY tablename LIMIT 5;` puis **vérifier lecture OK / écriture bloquée** comme en 2.2/2.3 sur la première table listée (count sans erreur ; `DELETE ... WHERE false` → permission denied).

- [ ] **Step 3.3: Vérifier policies** : `SELECT count(*) FROM pg_policies WHERE policyname='baikal_read';` — attendu : 19.

---

### Task 4: Mots de passe, secrets Baikal, test de connexion réel

Aucun mot de passe en clair ne transite par le serveur SQL (verifier SCRAM calculé
localement) ni ne reste sur disque en fin de tâche.

- [ ] **Step 4.1: Générer les credentials** — écrire `<scratchpad>/gen-ro-creds.mjs` :

```js
import crypto from "node:crypto";
import fs from "node:fs";

function scram(password) {
  const iterations = 4096;
  const salt = crypto.randomBytes(16);
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = crypto.createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = crypto.createHash("sha256").update(clientKey).digest();
  const serverKey = crypto.createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}` +
    `$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

const sites = [
  { ref: "ejqqqwudmizqisdkxohw", secret: "ADMIN_RO_MAJORDHOME_DSN" },
  { ref: "ycmavnmtyvodqawvwrrd", secret: "ADMIN_RO_PACKVENDEUR_DSN" },
];
const host = "aws-1-eu-west-3.pooler.supabase.com";
const out = {};
let envFile = "";
for (const s of sites) {
  const pwd = crypto.randomBytes(24).toString("base64url");
  out[s.ref] = { password: pwd, verifier: scram(pwd) };
  envFile += `${s.secret}=postgresql://baikal_reader.${s.ref}:${pwd}@${host}:6543/postgres\n`;
}
fs.writeFileSync("ro-creds.json", JSON.stringify(out, null, 2));
fs.writeFileSync("ro-secrets.env", envFile);
console.log("ecrit: ro-creds.json, ro-secrets.env");
```

Run (dans le scratchpad) : `node gen-ro-creds.mjs` — attendu : `ecrit: ...`.

- [ ] **Step 4.2: Poser les mots de passe** — pour chaque projet, via `execute_sql` (verifier lu dans `ro-creds.json`, jamais le mot de passe) :

```sql
ALTER ROLE baikal_reader PASSWORD 'SCRAM-SHA-256$4096:<salt>$<storedkey>:<serverkey>';
```

- [ ] **Step 4.3: Poser les secrets Baikal**

```bash
npx supabase secrets set --env-file <scratchpad>/ro-secrets.env --project-ref odspcxgafcqxjzrarsqf
```

Attendu : sortie listant les 2 secrets. Vérifier : `npx supabase secrets list --project-ref odspcxgafcqxjzrarsqf` contient `ADMIN_RO_MAJORDHOME_DSN` et `ADMIN_RO_PACKVENDEUR_DSN`.

- [ ] **Step 4.4: Test de connexion réel** — écrire `<scratchpad>/test-ro.ts` :

```ts
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";

const creds = JSON.parse(await Deno.readTextFile("ro-creds.json"));
const cibles = [
  { ref: "ejqqqwudmizqisdkxohw", table: "majordhome.appointments" },
  { ref: "ycmavnmtyvodqawvwrrd", table: "pack_vendeur.<TABLE_TEMOIN_3_2>" },
];
const hosts = ["aws-1-eu-west-3.pooler.supabase.com", "aws-0-eu-west-3.pooler.supabase.com"];

for (const c of cibles) {
  let ok = false;
  for (const host of hosts) {
    const dsn = `postgresql://baikal_reader.${c.ref}:${creds[c.ref].password}@${host}:6543/postgres`;
    const sql = postgres(dsn, {
      max: 1, prepare: false, connect_timeout: 10,
      connection: { default_transaction_read_only: "on" },
    });
    try {
      const [n] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${c.table}`);
      const [ro] = await sql.unsafe(`SELECT current_setting('default_transaction_read_only') AS v`);
      console.log(`${c.ref} @ ${host} SELECT ok (${n.n} lignes), read_only=${ro.v}`);
      try {
        await sql.unsafe(`DELETE FROM ${c.table} WHERE false`);
        console.log(`${c.ref} PROBLEME: l'ecriture n'est pas bloquee !`);
      } catch (e) {
        console.log(`${c.ref} ecriture bloquee: ${(e as Error).message.slice(0, 80)}`);
      }
      ok = true;
      await sql.end();
      break;
    } catch (e) {
      console.log(`${c.ref} @ ${host} KO: ${(e as Error).message.slice(0, 120)}`);
      await sql.end({ timeout: 1 });
    }
  }
  if (!ok) console.log(`${c.ref} AUCUN HOST NE REPOND — verifier le host pooler dans le dashboard`);
}
```

Run : `deno run --allow-net --allow-read test-ro.ts` (dans le scratchpad).
Attendu par projet : `SELECT ok`, `read_only=on`, `ecriture bloquee: permission denied...`.
Si le host `aws-1` échoue pour l'org séparée et `aws-0` marche : régénérer
`ro-secrets.env` avec le bon host pour ce site et rejouer 4.3.
Si le paramètre de startup `default_transaction_read_only` est rejeté par Supavisor :
le retirer de l'option `connection` du module (Task 5) pour le chemin dédié — le
`ALTER ROLE SET` du serveur garde la protection.

- [ ] **Step 4.5: Nettoyage** — supprimer `ro-creds.json`, `ro-secrets.env` et `gen-ro-creds.mjs` du scratchpad. Le mot de passe ne vit plus que dans le secret Baikal (rotation : re-dérouler Task 4).

---

### Task 5: Module `_shared/sites.ts` (TDD)

**Files:**
- Create: `supabase/functions/_shared/sites.ts`
- Test: `supabase/functions/_shared/sites.test.ts`

- [ ] **Step 5.1: Écrire le test qui échoue** — `supabase/functions/_shared/sites.test.ts` :

```ts
import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chargerSite, ErreurSite, lecteurSite, type Site } from "./sites.ts";

// Faux client supabase-js : seul le chemin schema().from().select().eq().maybeSingle()
// est utilise par chargerSite.
function fauxAdmin(reponse: { data: unknown; error: { message: string } | null }) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve(reponse) }),
        }),
      }),
    }),
  } as never;
}

const siteLocal: Site = {
  id: "monsieurdpe", name: "MonsieurDPE", is_active: true, domaine: null,
  db_schema: "dpe", db_ro_secret_ref: null, env_url: null, env_secret_ref: null,
};
const siteDedie: Site = {
  ...siteLocal, id: "majordhome", db_schema: "majordhome",
  db_ro_secret_ref: "ADMIN_RO_TEST_DSN",
};

Deno.test("chargerSite: site inconnu -> ErreurSite", async () => {
  await assertRejects(
    () => chargerSite(fauxAdmin({ data: null, error: null }), "nexiste-pas"),
    ErreurSite, "Site inconnu",
  );
});

Deno.test("chargerSite: erreur registre -> ErreurSite", async () => {
  await assertRejects(
    () => chargerSite(fauxAdmin({ data: null, error: { message: "boom" } }), "x"),
    ErreurSite, "registre",
  );
});

Deno.test("chargerSite: renvoie la ligne du registre", async () => {
  const site = await chargerSite(fauxAdmin({ data: siteLocal, error: null }), "monsieurdpe");
  assertEquals(site.db_schema, "dpe");
});

Deno.test("lecteurSite: secret dedie absent -> ErreurSite", () => {
  Deno.env.delete("ADMIN_RO_TEST_DSN");
  assertThrows(() => lecteurSite(siteDedie), ErreurSite, "ADMIN_RO_TEST_DSN");
});

Deno.test("lecteurSite: dedie avec secret -> instance sql", async () => {
  Deno.env.set("ADMIN_RO_TEST_DSN", "postgresql://u:p@localhost:6543/postgres");
  const sql = lecteurSite(siteDedie);
  assertEquals(typeof sql, "function"); // postgres-js: l'instance est une fonction taggee
  await sql.end({ timeout: 0 });
  Deno.env.delete("ADMIN_RO_TEST_DSN");
});

Deno.test("lecteurSite: local sans SUPABASE_DB_URL -> ErreurSite", () => {
  const sauvegarde = Deno.env.get("SUPABASE_DB_URL");
  Deno.env.delete("SUPABASE_DB_URL");
  assertThrows(() => lecteurSite(siteLocal), ErreurSite, "SUPABASE_DB_URL");
  if (sauvegarde) Deno.env.set("SUPABASE_DB_URL", sauvegarde);
});
```

- [ ] **Step 5.2: Vérifier l'échec** — `deno test --allow-env supabase/functions/_shared/sites.test.ts` → attendu : échec de résolution de `./sites.ts`.

- [ ] **Step 5.3: Implémenter** — `supabase/functions/_shared/sites.ts` :

```ts
// Connecteur d'acces aux donnees des sites du registre config.apps.
// Lecture SEULE, quel que soit l'hebergement :
//  - produit sur base dediee  -> DSN baikal_reader lu dans le secret nomme
//    par db_ro_secret_ref (pooler, role lecture seule cote serveur) ;
//  - produit de la base partagee -> SUPABASE_DB_URL, avec lecture seule
//    forcee au niveau de la connexion.
// Les ecritures passent par les clients service_role explicites (local) ou,
// plus tard, par les Edge Functions du projet cible (dedie).
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Site {
  id: string;
  name: string;
  is_active: boolean;
  domaine: string | null;
  db_schema: string | null;
  db_ro_secret_ref: string | null;
  env_url: string | null;
  env_secret_ref: string | null;
}

export class ErreurSite extends Error {}

export async function chargerSite(
  admin: SupabaseClient,
  appId: string,
): Promise<Site> {
  const { data, error } = await admin.schema("config").from("apps")
    .select(
      "id, name, is_active, domaine, db_schema, db_ro_secret_ref, env_url, env_secret_ref",
    )
    .eq("id", appId).maybeSingle();
  if (error) throw new ErreurSite(`Lecture du registre impossible: ${error.message}`);
  if (!data) throw new ErreurSite(`Site inconnu: ${appId}`);
  return data as Site;
}

export function lecteurSite(site: Site) {
  let dsn: string;
  if (site.db_ro_secret_ref) {
    const valeur = Deno.env.get(site.db_ro_secret_ref);
    if (!valeur) {
      throw new ErreurSite(
        `Secret ${site.db_ro_secret_ref} absent des Edge Function Secrets`,
      );
    }
    dsn = valeur;
  } else {
    const locale = Deno.env.get("SUPABASE_DB_URL");
    if (!locale) throw new ErreurSite("SUPABASE_DB_URL absent de l'environnement");
    dsn = locale;
  }
  // max 1 connexion, ouverte paresseusement ; l'appelant fait sql.end() en fin
  // de requete. prepare:false = compatible pooler en mode transaction.
  return postgres(dsn, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 2,
    connection: { default_transaction_read_only: "on" },
  });
}
```

(Si 4.4 a montré que Supavisor rejette le paramètre de startup : le passer
conditionnel — uniquement quand `db_ro_secret_ref` est NULL.)

- [ ] **Step 5.4: Vérifier que les tests passent** — `deno test --allow-env supabase/functions/_shared/sites.test.ts` → 6 tests OK.

- [ ] **Step 5.5: Commit**

```bash
git add supabase/functions/_shared/sites.ts supabase/functions/_shared/sites.test.ts
git commit -m "feat(hub): connecteur _shared/sites.ts, lecture seule unifiee des sites"
```

---

### Task 6: Refactor `import-diagnostiqueurs`

**Files:**
- Modify: `supabase/functions/admin-partenariats/index.ts:200-263` (le case) + import en tête + catch global

- [ ] **Step 6.1: Contrôle d'équivalence AVANT refactor** — via `execute_sql` sur la base partagée, mémoriser les comptes de référence (sémantique PostgREST actuelle : inner join, email non null, limit 10000) :

```sql
SELECT count(*) AS total FROM (
  SELECT c.email FROM dpe.diag_certifie c
  JOIN dpe.diag_site s ON s.slug = c.slug
  WHERE c.email IS NOT NULL LIMIT 10000) x;
SELECT count(*) AS dept69 FROM (
  SELECT c.email FROM dpe.diag_certifie c
  JOIN dpe.diag_site s ON s.slug = c.slug
  WHERE c.email IS NOT NULL AND s.code_postal LIKE '69%' LIMIT 10000) x;
```

- [ ] **Step 6.2: Modifier le code**

En tête de `admin-partenariats/index.ts`, après les imports existants :

```ts
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
```

Remplacer intégralement le `case "import-diagnostiqueurs"` par :

```ts
      case "import-diagnostiqueurs": {
        // Lit diag_certifie dans la base du site via le connecteur (SQL lecture seule).
        const site = await chargerSite(admin, appId);
        if (!site.db_schema) {
          return json({ data: null, error: "Site sans base configuree (db_schema)" }, 400);
        }
        const sql = lecteurSite(site);
        let certifies: Array<Record<string, unknown>>;
        try {
          const filtreDept = body.departement && /^\d{2,3}$/.test(body.departement)
            ? sql`AND s.code_postal LIKE ${body.departement + "%"}`
            : sql``;
          certifies = await sql`
            SELECT c.nom, c.prenom, c.email, c.telephone,
                   s.nom_affiche, s.code_postal, s.commune
            FROM ${sql(site.db_schema)}.diag_certifie c
            JOIN ${sql(site.db_schema)}.diag_site s ON s.slug = c.slug
            WHERE c.email IS NOT NULL ${filtreDept}
            LIMIT 10000`;
        } finally {
          await sql.end();
        }
        const parEmail = new Map<string, Record<string, unknown>>();
        for (const c of certifies) {
          const email = String(c.email ?? "").trim().toLowerCase();
          if (!email.includes("@") || parEmail.has(email)) continue;
          parEmail.set(email, {
            app_id: appId,
            type: "diagnostiqueur",
            email,
            nom: c.nom ?? null, prenom: c.prenom ?? null,
            entreprise: c.nom_affiche ?? null,
            telephone: c.telephone ?? null,
            code_postal: c.code_postal ?? null,
            source: "diag_certifie",
            donnees: { commune: c.commune ?? null },
          });
        }
        const lignes = [...parEmail.values()];
        const { data, error } = await admin.schema("admin").from("prospects")
          .upsert(lignes, { onConflict: "app_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        return json({
          data: {
            lus: certifies.length,
            avecEmail: lignes.length,
            inseres: data?.length ?? 0,
            doublons: lignes.length - (data?.length ?? 0),
          },
          error: null,
        });
      }
```

Dans le `catch` global (fin de fichier), avant le `return json(..., 500)` :

```ts
    if (e instanceof ErreurSite) {
      return json({ data: null, error: e.message }, 400);
    }
```

- [ ] **Step 6.3: Type-check** — `deno check supabase/functions/admin-partenariats/index.ts` → attendu : OK (les erreurs préexistantes d'autres fichiers ne bloquent pas).

- [ ] **Step 6.4: Commit**

```bash
git add supabase/functions/admin-partenariats/index.ts
git commit -m "refactor(partenariats): import-diagnostiqueurs via le connecteur sites (fin du self-appel HTTP)"
```

---

### Task 7: Déploiement et vérification

- [ ] **Step 7.1: Déployer** — `npx supabase functions deploy admin-partenariats --project-ref odspcxgafcqxjzrarsqf` (la CLI bundle `../_shared/sites.ts`). Attendu : `Deployed Function admin-partenariats`.

- [ ] **Step 7.2: Smoke test de boot** — récupérer la clé anon (frontend `.env*` local ou MCP), puis :

```bash
curl -s -X POST "https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-partenariats" -H "Authorization: Bearer <ANON_KEY>" -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" -d '{"action":"list-sites"}'
```

Attendu : `{"data":null,"error":"Non authentifie"}` (HTTP 401) — prouve que la
fonction démarre avec le nouvel import (pas de crash de boot), et que l'auth
reste en place. Le test fonctionnel complet (bouton « Importer diagnostiqueurs »
sur MonsieurDPE, comparaison avec les comptes de 6.1) est un clic d'Eric.

- [ ] **Step 7.3: Documentation et mémoire**
  - Append dans `.claude/proposed-updates.md` (statut PENDING) : proposition de mise à jour CLAUDE.md — gotcha du trigger obsolète (supprimé), colonnes `db_schema`/`db_ro_secret_ref`, module `_shared/sites.ts`, règle « policies baikal_read à rejouer sur nouvelle table des projets dédiés ».
  - Mettre à jour la mémoire `hub-baikal-objectif` (fondation posée) et `baikal-infra-reelle` (registre complété, trigger supprimé).

- [ ] **Step 7.4: Commit final**

```bash
git add docs/superpowers/plans/2026-08-24-hub-baikal-acces-sites.md .claude/proposed-updates.md
git commit -m "docs(hub): plan execute, propositions CLAUDE.md"
```

---

## Hors périmètre (rappel spec)

Pas d'UI nouvelle, pas de canal d'écriture vers les projets dédiés, pas de
suppression des schémas obsolètes de la base partagée, pas de correction de la
fuite `/admin/users`. Domaines/GSC des 7 nouveaux produits : gestes d'Eric via
`/sites`.
