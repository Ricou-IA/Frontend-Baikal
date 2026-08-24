# Sync nocturne diagnostiqueurs → prospects — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Remplacer l'import manuel des diagnostiqueurs par une fonction SQL
`admin.sync_diagnostiqueurs()` appelée chaque nuit à 03h30 par pg_cron, et par
un bouton « Synchroniser » qui appelle la même fonction.

**Architecture :** Tout se joue dans la base partagée (projet
odspcxgafcqxjzrarsqf) : `dpe.diag_certifie`/`dpe.diag_site` sont déjà
synchronisées chaque nuit à 02h30 par le projet DPE ; on ajoute un
`INSERT … SELECT` interne (`ON CONFLICT DO NOTHING`) vers `admin.prospects`,
planifié à 03h30, exposé en RPC pour le déclenchement manuel depuis l'EF
`admin-partenariats`. Spec :
`docs/superpowers/specs/2026-08-24-sync-diagnostiqueurs-prospects-design.md`.

**Tech Stack :** Postgres (plpgsql, pg_cron), Supabase Edge Functions (Deno),
React JSX.

**Ordre impératif :** Task 1 (migration) avant Task 2 (EF) — l'action
`sync-diagnostiqueurs` appelle la fonction SQL ; la déployer avant la migration
casserait le bouton.

---

### Task 1 : Migration — fonction `admin.sync_diagnostiqueurs` + cron

**Files:**
- Create: `supabase/migrations/20260825010000_sync_diagnostiqueurs_prospects.sql`

- [x] **Step 1 : Écrire la migration**

```sql
-- ---------------------------------------------------------------------------
-- Sync nocturne des diagnostiqueurs certifies vers admin.prospects.
--
-- dpe.diag_certifie / dpe.diag_site sont deja synchronisees chaque nuit a
-- 02h30 par le projet DPE (cron dpe-annuaire-diag-sync, CSV quotidien du
-- Ministere sur data.gouv.fr). Ici on ajoute seulement le pont interne vers
-- admin.prospects : INSERT ... SELECT, jamais de reecriture d'une fiche
-- existante (statuts du funnel et desinscrits intouchables).
--
-- La meme fonction sert au cron (03h30, apres la chaine amont 02h30/02h50)
-- et au bouton "Synchroniser" de la console (RPC via l'EF admin-partenariats).
-- Spec : docs/superpowers/specs/2026-08-24-sync-diagnostiqueurs-prospects-design.md
-- ---------------------------------------------------------------------------

create or replace function admin.sync_diagnostiqueurs(p_app_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema     text;
  v_lus        bigint;
  v_avec_email bigint;
  v_inseres    bigint;
begin
  select db_schema into v_schema from config.apps where id = p_app_id;
  if v_schema is null then
    raise exception 'Site % sans base configuree (db_schema)', p_app_id;
  end if;
  if to_regclass(format('%I.diag_certifie', v_schema)) is null
     or to_regclass(format('%I.diag_site', v_schema)) is null then
    raise exception 'Tables diag_certifie/diag_site absentes du schema %', v_schema;
  end if;

  -- Meme mapping que l'ancien import manuel : dedoublonnage par email
  -- normalise, entreprise = nom_affiche du site, commune dans donnees.
  execute format($sql$
    with lignes as (
      select lower(trim(c.email)) as email,
             c.nom, c.prenom, c.telephone,
             s.nom_affiche, s.code_postal, s.commune
      from %I.diag_certifie c
      join %I.diag_site s on s.slug = c.slug
      where c.email is not null
    ),
    valides as (
      select distinct on (email) *
      from lignes
      where position('@' in email) > 0
      order by email
    ),
    inserees as (
      insert into admin.prospects
        (app_id, type, email, nom, prenom, entreprise, telephone,
         code_postal, source, donnees)
      select $1, 'diagnostiqueur', email, nom, prenom, nom_affiche,
             telephone, code_postal, 'diag_certifie',
             jsonb_build_object('commune', commune)
      from valides
      on conflict (app_id, email) do nothing
      returning 1
    )
    select (select count(*) from lignes),
           (select count(*) from valides),
           (select count(*) from inserees)
  $sql$, v_schema, v_schema)
  into v_lus, v_avec_email, v_inseres
  using p_app_id;

  -- Trace pour les nuits sans temoin (Postgres logs + cron.job_run_details).
  raise log '[sync_diagnostiqueurs] app=% lus=% avec_email=% inseres=%',
    p_app_id, v_lus, v_avec_email, v_inseres;

  return jsonb_build_object(
    'lus', v_lus,
    'avecEmail', v_avec_email,
    'inseres', v_inseres,
    'doublons', v_avec_email - v_inseres);
end;
$$;

-- Execute par le cron (postgres, owner) et par l'EF (service_role via RPC).
revoke all on function admin.sync_diagnostiqueurs(text) from public, anon, authenticated;
grant execute on function admin.sync_diagnostiqueurs(text) to service_role;

-- Rejouable : on deprogramme d'abord pour que la commande soit remplacee aussi.
select cron.unschedule('admin-sync-diag-prospects')
where exists (select 1 from cron.job where jobname = 'admin-sync-diag-prospects');

-- 03h30, apres la chaine amont du projet DPE (sync annuaire 02h30, geocodage
-- 02h50, meme horloge) : les prospects refletent le CSV du jour. Appel SQL
-- direct : pas de pg_net, pas de secret. MonsieurDPE est le seul site avec des
-- tables diag_* ; un autre site un jour = un appel de plus, pas une mecanique.
select cron.schedule(
  'admin-sync-diag-prospects',
  '30 3 * * *',
  $cron$ select admin.sync_diagnostiqueurs('monsieurdpe'); $cron$
);

-- La fonction doit etre visible en RPC immediatement.
notify pgrst, 'reload schema';
```

- [x] **Step 2 : Appliquer la migration**

Run : `npx supabase db push`
Attendu : `Applying migration 20260825010000_sync_diagnostiqueurs_prospects.sql... Finished supabase db push.`
(Si le CLI n'est pas relié au projet distant, exécuter le contenu du fichier
tel quel dans le SQL editor du dashboard — projet odspcxgafcqxjzrarsqf — puis
noter dans le commit que la migration a été appliquée à la main.)

- [x] **Step 3 : Vérifier la fonction (SQL editor du dashboard)**

```sql
select admin.sync_diagnostiqueurs('monsieurdpe');
```
Attendu : jsonb `{"lus": ..., "avecEmail": ..., "inseres": ..., "doublons": ...}`
avec `lus > 0`. Relancer aussitôt la même requête : `inseres` = 0 (idempotent),
`doublons` = `avecEmail`.

```sql
select admin.sync_diagnostiqueurs('app-inexistante');
```
Attendu : `ERROR: Site app-inexistante sans base configuree (db_schema)`.

```sql
select jobname, schedule, command from cron.job
 where jobname = 'admin-sync-diag-prospects';
```
Attendu : 1 ligne, `30 3 * * *`, commande `select admin.sync_diagnostiqueurs('monsieurdpe');`.

- [x] **Step 4 : Commit**

```bash
git add supabase/migrations/20260825010000_sync_diagnostiqueurs_prospects.sql
git commit -m "feat(partenariats): fonction admin.sync_diagnostiqueurs + cron 03h30"
```

---

### Task 2 : EF `admin-partenariats` — action `sync-diagnostiqueurs`

**Files:**
- Modify: `supabase/functions/admin-partenariats/index.ts:4` (imports),
  `:216-268` (action), `:453-458` (catch)

- [x] **Step 1 : Remplacer l'action `import-diagnostiqueurs`**

Supprimer tout le bloc `case "import-diagnostiqueurs": { ... }` (lignes
216-268, de `// Lit diag_certifie...` à la fermeture du case) et le remplacer
par :

```ts
      case "sync-diagnostiqueurs": {
        // Le mapping vit dans admin.sync_diagnostiqueurs, partage avec le
        // cron nocturne admin-sync-diag-prospects (03h30).
        const { data, error } = await admin.schema("admin")
          .rpc("sync_diagnostiqueurs", { p_app_id: appId });
        if (error) throw error;
        return json({ data, error: null });
      }
```

- [x] **Step 2 : Retirer le connecteur sites.ts devenu inutile**

L'action supprimée était le seul usage du connecteur dans cette EF.

Ligne 4, supprimer :
```ts
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
```

Dans le `catch` final (vers la ligne 453), supprimer le bloc :
```ts
    if (e instanceof ErreurSite) {
      return json({ data: null, error: e.message }, 400);
    }
```
(Garder le bloc `ErreurAcces`, toujours utilisé par `exigerSite`.)

- [x] **Step 3 : Vérifier qu'il ne reste aucune référence**

Run : `grep -n "ErreurSite\|chargerSite\|lecteurSite\|import-diagnostiqueurs" supabase/functions/admin-partenariats/index.ts`
Attendu : aucune sortie.

- [x] **Step 4 : Déployer**

Run : `npx supabase functions deploy admin-partenariats`
Attendu : `Deployed Functions on project odspcxgafcqxjzrarsqf: admin-partenariats`.

- [x] **Step 5 : Commit**

```bash
git add supabase/functions/admin-partenariats/index.ts
git commit -m "feat(partenariats): action sync-diagnostiqueurs via RPC, retrait du connecteur"
```

---

### Task 3 : Frontend — bouton « Synchroniser les diagnostiqueurs »

**Files:**
- Modify: `src/services/partenariats.service.js:16-18`
- Modify: `src/pages/Partenariats.jsx:4`, `:94-104` (handler), `:141-147` (bouton)

- [x] **Step 1 : Service**

Remplacer :
```js
  importDiagnostiqueurs(appId, departement) {
    return appelerEdge('admin-partenariats', { action: 'import-diagnostiqueurs', appId, departement });
  },
```
par :
```js
  syncDiagnostiqueurs(appId) {
    return appelerEdge('admin-partenariats', { action: 'sync-diagnostiqueurs', appId });
  },
```

- [x] **Step 2 : Handler de la page**

Dans `src/pages/Partenariats.jsx`, remplacer la fonction
`importerDiagnostiqueurs` (lignes 94-104, `window.prompt` compris) par :

```jsx
  async function synchroniserDiagnostiqueurs() {
    setOccupe(true);
    const { data, error } = await partenariatsService.syncDiagnostiqueurs(appId);
    setMessage(error
      ? error.message
      : `Synchronisation : ${data.inseres} insérés, ${data.doublons} doublons `
        + `(${data.lus} certifiés lus, ${data.avecEmail} avec email). `
        + `Tourne aussi chaque nuit à 03h30.`);
    setOccupe(false);
    charger();
  }
```

- [x] **Step 3 : Bouton**

Remplacer le bouton (lignes 141-147) par :

```jsx
        <button
          onClick={synchroniserDiagnostiqueurs}
          disabled={occupe}
          title="Tourne aussi automatiquement chaque nuit à 03h30"
          className="px-3 py-1 rounded border border-baikal-border text-baikal-text flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Synchroniser les diagnostiqueurs
        </button>
```

Et ligne 4, ajuster le commentaire d'en-tête :
`* CRM de prospection multi-sites : prospects (import CSV, sync diagnostiqueurs)`.

- [x] **Step 4 : Vérifier le build et l'absence de référence morte**

Run : `npm run build`
Attendu : build Vite sans erreur.

Run : `grep -rn "importDiagnostiqueurs\|import-diagnostiqueurs" src/`
Attendu : aucune sortie.

- [x] **Step 5 : Test manuel dans la console**

Page Partenariats, site MonsieurDPE → clic « Synchroniser les
diagnostiqueurs » → message « Synchronisation : 0 insérés, N doublons… » (la
migration de la Task 1 a déjà tout inséré) ; la liste des prospects se
recharge.

- [x] **Step 6 : Commit**

```bash
git add src/services/partenariats.service.js src/pages/Partenariats.jsx
git commit -m "feat(partenariats): bouton Synchroniser les diagnostiqueurs (sync SQL partagee)"
```

---

### Task 4 : Proposer la mise à jour du CLAUDE.md

Le CLAUDE.md décrit encore « import diagnostiqueurs (via env_url + secret
nommé par env_secret_ref) ». Règle du projet : ne JAMAIS éditer le CLAUDE.md
sans accord explicite — on passe par `.claude/proposed-updates.md`.

**Files:**
- Modify: `.claude/proposed-updates.md` (append)

- [x] **Step 1 : Appender la proposition**

```markdown
## [2026-08-24 23:30] Partenariats : sync nocturne des diagnostiqueurs
**Statut** : PENDING
**Commit** : (hash du commit de la Task 3)
**Contexte** : L'import manuel des diagnostiqueurs est remplacé par
admin.sync_diagnostiqueurs() (fonction SQL, INSERT...SELECT depuis
dpe.diag_certifie, ON CONFLICT DO NOTHING), appelée par le cron
admin-sync-diag-prospects à 03h30 (après la sync annuaire DPE de 02h30) et par
le bouton « Synchroniser les diagnostiqueurs » (RPC via admin-partenariats).
**Proposition** : Dans la section Partenariats du CLAUDE.md, remplacer
« import diagnostiqueurs (via env_url + secret nomme par env_secret_ref) » par
« sync diagnostiqueurs (fonction SQL admin.sync_diagnostiqueurs, cron
admin-sync-diag-prospects 03h30 + bouton console ; source amont :
dpe.diag_certifie, synchronisee a 02h30 par le projet DPE) ».
---
```

- [x] **Step 2 : Commit**

```bash
git add .claude/proposed-updates.md
git commit -m "docs(partenariats): proposition CLAUDE.md pour la sync diagnostiqueurs"
```

---

## Vérification finale (après la première nuit)

```sql
select start_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'admin-sync-diag-prospects')
order by start_time desc limit 3;
```
Attendu : `status = succeeded`. Les compteurs de la passe sont dans les logs
Postgres (`[sync_diagnostiqueurs] app=monsieurdpe ...`).
