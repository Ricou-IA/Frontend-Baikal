# Prospects lot 1 — site pilote MonsieurDPE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer `/prospect` dans la console Baikal, branché sur MonsieurDPE : la base adressable du site (65 800 lignes) lue en direct, filtrable par métier, avec les six actions d'écriture.

**Architecture:** Baikal ne possède aucun prospect. MonsieurDPE installe le module `prospects-v1` (tables `prospect` et `prospect_etat`, fonctions `prospect_action` et `prospect_importer`) et publie la vue contractuelle `dpe.baikal_prospects` qui projette ses annuaires. Baikal lit la vue en SQL local (`_shared/sites.ts`, lecture seule forcée) et écrit par la RPC `public.baikal_prospect_action`. La capacité d'un site se lit à la présence de la vue et des colonnes.

**Tech Stack:** Postgres 17 (Supabase), Edge Functions Deno + `postgresjs`, React 18 + Vite + Tailwind (JSX, pas de TypeScript côté front).

**Spec:** `docs/superpowers/specs/2026-08-27-baikal-prospects-design.md`

## Global Constraints

- **Deux repos.** `C:\Dev\Frontend-Baikal` (console, migrations `admin`/`config`, Edge Functions) et `C:\Dev\DPE` (migrations du schéma `dpe`). Chaque tâche dit dans lequel elle travaille.
- **Un seul projet Supabase** pour les deux : `odspcxgafcqxjzrarsqf`. Le schéma `dpe` et le schéma `admin` y cohabitent. Vérifier les migrations avec le MCP Supabase sur ce `project_id`.
- **Français partout** : noms de colonnes, libellés, commentaires SQL, messages d'erreur. Les commentaires SQL disent *pourquoi*, pas *quoi*.
- **RLS forcée sans policy, `service_role` seul** sur toute table nouvelle : `enable row level security`, `force row level security`, `revoke all from anon, authenticated`, `grant` explicite à `service_role`. Pattern déjà en place sur `admin.prospects` et `dpe.diag_optout`.
- **Clé d'un prospect = email normalisé** `lower(trim(email))`. Jamais un identifiant d'annuaire.
- **Funnel partagé, valeurs exactes** : `nouveau`, `contacte`, `relance`, `repondu`, `refus`, `desinscrit`. Pas de `partenaire` — un converti devient un client.
- **Provenances, valeurs exactes** : `annuaire_public`, `acquisition_propre`, `import`, `scrape`.
- **Métiers, slugs exacts** : `notaire`, `agent_immo`, `syndic`, `diagnostiqueur`, `entreprise_rge`, `autre`.
- **Aucune écriture directe de Baikal dans le schéma `dpe`.** Toute écriture passe par `public.baikal_prospect_action`.
- **Ne jamais matérialiser un annuaire dans `prospect`.** C'est la recopie de 03h30 et sa dérive de +29 %.
- **La tâche 11 est destructive** et ne s'exécute qu'après validation de `/prospect` en conditions réelles.

## Chiffres de référence (relevé du 27/08/2026)

À utiliser comme assertions de vérification. Ils bougeront à la marge (les crons tournent) ; un écart de plus de 5 % est un signal, pas du bruit.

| Mesure | Valeur |
|---|---|
| `dpe.diag_site` | 8 744 fiches, toutes joignables |
| Adresses distinctes diagnostiqueurs | 8 595 |
| Dont non revendiquées (adressables campagne) | 8 594 |
| `dpe.entreprise_rge` | 57 258 dont **57 244** avec email valide |
| `dpe.lead` | 4 |
| `dpe.envoi_campagne` | 6 |
| `dpe.envoi_recap` | 0 |
| `dpe.diag_optout` | 0 |
| `dpe.diag_fiche_edito` revendiquées | 1 |
| **Total attendu dans la vue** | **~65 840** |
| `admin.prospects` | 11 077, **toutes `nouveau`** |
| `admin.campagnes` / `campagne_envois` | 0 / 0 |

## File Structure

| Fichier | Repo | Responsabilité |
|---|---|---|
| `docs/contrats/prospects-v1.sql` | Baikal | DDL de référence du module, `@SCHEMA@` à substituer |
| `docs/contrats/README.md` | Baikal | comment installer un module chez un site |
| `supabase/migrations/*_dpe_prospect_module.sql` | DPE | installation du module sur `dpe` |
| `supabase/migrations/*_dpe_prospect_actions.sql` | DPE | `dpe.prospect_action`, `dpe.prospect_importer` |
| `supabase/migrations/*_dpe_baikal_prospects.sql` | DPE | la vue contractuelle |
| `supabase/migrations/*_admin_metier.sql` | Baikal | `admin.metier`, `config.apps.env_prospects_fn`, wrapper RPC |
| `supabase/functions/admin-prospects/filtres.ts` | Baikal | normalisation des critères (pur, testé) |
| `supabase/functions/admin-prospects/filtres.test.ts` | Baikal | ses tests |
| `supabase/functions/admin-prospects/index.ts` | Baikal | handler : capacité, liste, agrégats, fiche, actions |
| `src/services/prospects.service.js` | Baikal | appels à l'EF |
| `src/pages/Prospects.jsx` | Baikal | la page |
| `src/components/console/FicheProspect.jsx` | Baikal | la fiche latérale |
| `src/components/console/badges-prospects.jsx` | Baikal | badges métier, statut, provenance |
| `src/components/console/ImportProspectsDialog.jsx` | Baikal | import CSV |
| `supabase/functions/admin-sites/index.ts` | Baikal | registre des sites + taxonomie, extrait d'`admin-partenariats` |
| `src/services/sites.service.js` | Baikal | son service, remplace `partenariats.service.js` pour `/sites` |

---

### Task 1: Le module prospects — les tables

**Files:**
- Create: `C:\Dev\Frontend-Baikal\docs\contrats\prospects-v1.sql`
- Create: `C:\Dev\Frontend-Baikal\docs\contrats\README.md`
- Create: `C:\Dev\DPE\supabase\migrations\20260827120000_dpe_prospect_module.sql`

**Interfaces:**
- Produces: `dpe.prospect(email pk, metier, provenance, nom_affiche, commune, code_postal, specialite text[], siret, telephone, site_web, origine_site, cree_le)` et `dpe.prospect_etat(email pk, statut, note, maj_le, maj_par)`. Les tâches 2 et 3 s'appuient dessus.

- [ ] **Step 1: Écrire le DDL de référence**

Dans `docs/contrats/prospects-v1.sql` :

```sql
-- ---------------------------------------------------------------------------
-- Module Prospects v1 — DDL de reference.
--
-- Installer chez un site : copier ce fichier dans une migration du site et
-- substituer @SCHEMA@ par le schema du produit. Les quatre objets sont
-- IDENTIQUES chez tous les sites ; seule la projection de l'annuaire local,
-- dans la vue baikal_prospects, est propre au site.
--
-- Ce qui est duplicable, c'est le module. La donnee d'annuaire ne l'est
-- JAMAIS : un annuaire reimporte chaque nuit reste ou il est, et la vue le
-- projette. Le materialiser ici recreerait la recopie de 03h30 et son ecart
-- de +29 % entre ce que la console annonce et ce que la campagne adresse.
-- ---------------------------------------------------------------------------

-- ------ 1. Le receptacle standard ------
--
-- N'accueille QUE les prospects sans annuaire source : import CSV, saisie
-- manuelle, et copie recue d'un autre site (lot 3). La cle est l'adresse,
-- normalisee par l'appelant : c'est ce qui a un sens de bout en bout, et ce
-- qui rend le transfert inter-sites un simple insert ... select.

create table if not exists @SCHEMA@.prospect (
  email        text        primary key,
  metier       text        not null
               check (metier in ('notaire','agent_immo','syndic',
                                 'diagnostiqueur','entreprise_rge','autre')),
  provenance   text        not null default 'import'
               check (provenance in ('annuaire_public','acquisition_propre',
                                     'import','scrape')),
  nom_affiche  text        not null,
  commune      text,
  code_postal  text,
  specialite   text[]      not null default '{}',
  siret        char(14),
  telephone    text,
  site_web     text,
  -- Lot 3 : l'app_id du site d'ou la ligne a ete copiee. Sans lui on ne peut
  -- pas dire d'ou vient un prospect qu'on n'a pas soi-meme collecte.
  origine_site text,
  cree_le      timestamptz not null default now()
);

comment on table @SCHEMA@.prospect is
  'Prospects sans annuaire source. Un prospect issu d''un annuaire du site '
  'n''a RIEN a faire ici : la vue baikal_prospects le projette depuis sa '
  'table d''origine.';

-- ------ 2. L'etat de prospection ------
--
-- Separe de l'annuaire ET du receptacle, parce qu'un annuaire reimporte
-- chaque nuit ecraserait tout statut qu'on y stockerait. Vaut pour TOUS les
-- prospects du site quelle que soit leur origine, d'ou la cle par adresse.

create table if not exists @SCHEMA@.prospect_etat (
  email    text        primary key,
  statut   text        not null default 'nouveau'
           check (statut in ('nouveau','contacte','relance','repondu',
                             'refus','desinscrit')),
  note     text,
  maj_le   timestamptz not null default now(),
  -- Qui a agi depuis la console. Sans cette colonne on ne peut pas dire qui
  -- a passe un prospect en refus.
  maj_par  text
);

comment on table @SCHEMA@.prospect_etat is
  'Ou en est la prospection pour une adresse. Le funnel s''arrete avant la '
  'conversion : un prospect converti devient un client, et c''est /clients '
  'qui le suit.';

-- ------ 3. Droits : service_role seul ------

alter table @SCHEMA@.prospect       enable row level security;
alter table @SCHEMA@.prospect       force  row level security;
alter table @SCHEMA@.prospect_etat  enable row level security;
alter table @SCHEMA@.prospect_etat  force  row level security;

revoke all on @SCHEMA@.prospect      from anon, authenticated;
revoke all on @SCHEMA@.prospect_etat from anon, authenticated;

grant select, insert, update, delete on @SCHEMA@.prospect      to service_role;
grant select, insert, update, delete on @SCHEMA@.prospect_etat to service_role;

create index if not exists prospect_metier on @SCHEMA@.prospect (metier);
```

- [ ] **Step 2: Écrire le README du dossier contrats**

Dans `docs/contrats/README.md` :

```markdown
# Contrats de modules

Un module est un DDL de reference installe **tel quel** chez chaque site.
Baikal le versionne ici ; les sites l'appliquent dans leurs propres
migrations.

## Installer un module chez un site

1. Copier le `.sql` dans une migration du repo du site.
2. Remplacer `@SCHEMA@` par le schema du produit (`dpe`, `pack_vendeur`...).
3. Ecrire la partie propre au site : pour `prospects-v1`, la projection de
   l'annuaire local dans la vue `baikal_prospects`.

## Regle

Le **module** est duplicable. La **donnee d'annuaire** ne l'est jamais : elle
reste dans sa table d'origine et la vue la projette.

| Module | Version | Sites installes |
|---|---|---|
| `prospects-v1.sql` | 1 | monsieurdpe |
```

- [ ] **Step 3: Créer la migration DPE**

Dans `C:\Dev\DPE\supabase\migrations\20260827120000_dpe_prospect_module.sql` : copier le contenu de `prospects-v1.sql` en remplaçant `@SCHEMA@` par `dpe`, et ajouter en tête :

```sql
-- Module Prospects v1 installe sur le schema dpe.
-- Source : Frontend-Baikal/docs/contrats/prospects-v1.sql — toute
-- divergence avec ce fichier est un bug, pas une adaptation locale.
```

- [ ] **Step 4: Appliquer et vérifier**

Appliquer la migration sur le projet `odspcxgafcqxjzrarsqf`, puis vérifier :

```sql
select
  to_regclass('dpe.prospect')      is not null as table_prospect,
  to_regclass('dpe.prospect_etat') is not null as table_etat,
  (select count(*) from pg_policies
    where schemaname='dpe' and tablename in ('prospect','prospect_etat')) as policies,
  (select relforcerowsecurity from pg_class where oid='dpe.prospect'::regclass) as force_rls;
```

Attendu : `table_prospect = true`, `table_etat = true`, `policies = 0`, `force_rls = true`.

- [ ] **Step 5: Vérifier qu'un statut hors funnel est refusé**

```sql
insert into dpe.prospect_etat (email, statut) values ('t@t.fr', 'partenaire');
```

Attendu : `ERROR ... violates check constraint "prospect_etat_statut_check"`. Puis nettoyer si une ligne a été créée : `delete from dpe.prospect_etat where email='t@t.fr';`

- [ ] **Step 6: Commit (deux repos)**

```bash
cd "C:\Dev\Frontend-Baikal" && git add docs/contrats && git commit -m "docs(contrats): module prospects-v1, le DDL de reference

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

```bash
cd "C:\Dev\DPE" && git add supabase/migrations/20260827120000_dpe_prospect_module.sql && git commit -m "feat(prospect): installe le module prospects-v1 sur le schema dpe

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: L'interface d'écriture du site

**Files:**
- Modify: `C:\Dev\Frontend-Baikal\docs\contrats\prospects-v1.sql` (ajouter les fonctions)
- Create: `C:\Dev\DPE\supabase\migrations\20260827130000_dpe_prospect_actions.sql`

**Interfaces:**
- Consumes: `dpe.prospect`, `dpe.prospect_etat` (tâche 1)
- Produces: `dpe.prospect_action(p_action text, p_email text, p_valeur text, p_acteur text) returns jsonb` et `dpe.prospect_importer(p_lignes jsonb, p_acteur text) returns jsonb`. La tâche 4 les appelle via un wrapper, la tâche 7 via l'EF.

- [ ] **Step 1: Ajouter les fonctions au DDL de référence**

À la suite de `prospects-v1.sql` :

```sql
-- ------ 4. L'interface d'ecriture ------
--
-- Baikal n'ecrit JAMAIS dans les tables du site : il appelle ces fonctions,
-- et elles seules. C'est le site qui decide ce qui est ecrivable chez lui.
--
-- La table d'opt-out differe d'un site a l'autre (dpe.diag_optout,
-- pv_email_unsubscribes) : chaque installation adapte le corps du cas
-- 'desinscrire', et rien d'autre.

create or replace function @SCHEMA@.prospect_action(
  p_action text,
  p_email  text,
  p_valeur text default null,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse invalide: %', p_email;
  end if;

  case p_action
    when 'statut' then
      if p_valeur not in ('nouveau','contacte','relance','repondu','refus','desinscrit') then
        raise exception 'Statut inconnu: %', p_valeur;
      end if;
      insert into @SCHEMA@.prospect_etat (email, statut, maj_par)
      values (v_email, p_valeur, p_acteur)
      on conflict (email) do update
        set statut = excluded.statut, maj_le = now(), maj_par = excluded.maj_par;

    when 'note' then
      insert into @SCHEMA@.prospect_etat (email, note, maj_par)
      values (v_email, p_valeur, p_acteur)
      on conflict (email) do update
        set note = excluded.note, maj_le = now(), maj_par = excluded.maj_par;

    when 'desinscrire' then
      -- ADAPTER PAR SITE : la table d'opt-out locale.
      insert into @SCHEMA@.diag_optout (email, motif)
      values (v_email, 'demande')
      on conflict (email) do nothing;
      insert into @SCHEMA@.prospect_etat (email, statut, maj_par)
      values (v_email, 'desinscrit', p_acteur)
      on conflict (email) do update
        set statut = 'desinscrit', maj_le = now(), maj_par = excluded.maj_par;

    when 'supprimer' then
      -- Uniquement une ligne du receptacle. Une ligne d'annuaire reviendrait
      -- au prochain cron : la supprimer donnerait une fausse impression
      -- d'effacement. Pour ne plus l'adresser, c'est 'desinscrire'.
      if not exists (select 1 from @SCHEMA@.prospect where email = v_email) then
        raise exception 'Seul un prospect saisi ou importe peut etre supprime';
      end if;
      delete from @SCHEMA@.prospect      where email = v_email;
      delete from @SCHEMA@.prospect_etat where email = v_email;

    else
      raise exception 'Action inconnue: %', p_action;
  end case;

  return jsonb_build_object('ok', true, 'email', v_email, 'action', p_action);
end;
$$;

revoke all on function @SCHEMA@.prospect_action(text,text,text,text) from anon, authenticated;

-- ------ 5. L'import par lots ------
--
-- Un import n'ecrase JAMAIS un etat existant : la cle est l'adresse et le
-- conflit ne fait rien. Une ligne deja connue est comptee en doublon et
-- rapportee comme telle. Sans cette regle, un CSV importe par megarde efface
-- des statuts et des refus durement gagnes.

create or replace function @SCHEMA@.prospect_importer(
  p_lignes jsonb,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recus   int;
  v_inseres int;
begin
  create temporary table lignes_import on commit drop as
  select
    lower(trim(l->>'email'))                      as email,
    coalesce(l->>'metier', 'autre')               as metier,
    coalesce(l->>'provenance', 'import')          as provenance,
    coalesce(nullif(trim(l->>'nom_affiche'), ''),
             lower(trim(l->>'email')))            as nom_affiche,
    nullif(trim(l->>'commune'), '')               as commune,
    nullif(trim(l->>'code_postal'), '')           as code_postal,
    nullif(trim(l->>'telephone'), '')             as telephone,
    nullif(trim(l->>'site_web'), '')              as site_web,
    nullif(trim(l->>'siret'), '')                 as siret,
    nullif(trim(l->>'origine_site'), '')          as origine_site
  from jsonb_array_elements(p_lignes) l
  where lower(trim(l->>'email')) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

  select count(*) into v_recus from lignes_import;

  with insere as (
    insert into @SCHEMA@.prospect
      (email, metier, provenance, nom_affiche, commune, code_postal,
       telephone, site_web, siret, origine_site)
    select email, metier, provenance, nom_affiche, commune, code_postal,
           telephone, site_web, siret::char(14), origine_site
    from lignes_import
    on conflict (email) do nothing
    returning 1
  )
  select count(*) into v_inseres from insere;

  return jsonb_build_object(
    'ok', true, 'recus', v_recus, 'inseres', v_inseres,
    'doublons', v_recus - v_inseres, 'acteur', p_acteur);
end;
$$;

revoke all on function @SCHEMA@.prospect_importer(jsonb,text) from anon, authenticated;
```

- [ ] **Step 2: Créer la migration DPE**

`20260827130000_dpe_prospect_actions.sql` : le même contenu, `@SCHEMA@` → `dpe`. Le cas `desinscrire` écrit dans `dpe.diag_optout`, qui existe déjà avec la bonne forme (`email pk, motif, cree_le`) — aucune adaptation nécessaire ici.

- [ ] **Step 3: Appliquer et tester l'action `statut`**

```sql
select dpe.prospect_action('statut', '  TEST@Exemple.fr ', 'contacte', 'plan-task2');
select email, statut, maj_par from dpe.prospect_etat where email = 'test@exemple.fr';
```

Attendu : une ligne `test@exemple.fr | contacte | plan-task2`. L'adresse doit être normalisée (minuscules, sans espaces).

- [ ] **Step 4: Tester que l'import n'écrase pas un état**

```sql
select dpe.prospect_importer(
  '[{"email":"test@exemple.fr","metier":"notaire","nom_affiche":"Etude Test"},
    {"email":"nouveau@exemple.fr","metier":"syndic","nom_affiche":"Syndic Test"},
    {"email":"pas-une-adresse","metier":"autre","nom_affiche":"X"}]'::jsonb,
  'plan-task2');
select statut from dpe.prospect_etat where email = 'test@exemple.fr';
```

Attendu : `recus = 2` (la ligne sans `@` est écartée), `inseres = 2`, `doublons = 0` — les deux adresses entrent dans `prospect` car aucune n'y était. Le statut de `test@exemple.fr` reste **`contacte`** : l'import a créé la ligne d'identité sans toucher l'état.

Relancer le même appel : attendu `recus = 2, inseres = 0, doublons = 2`.

- [ ] **Step 5: Tester que `supprimer` refuse une ligne d'annuaire**

```sql
select dpe.prospect_action('supprimer',
  (select min(email) from dpe.diag_certifie where email is not null), null, 'plan-task2');
```

Attendu : `ERROR: Seul un prospect saisi ou importe peut etre supprime`.

- [ ] **Step 6: Nettoyer les données de test**

```sql
delete from dpe.prospect      where email in ('test@exemple.fr','nouveau@exemple.fr','syndic test');
delete from dpe.prospect_etat where email in ('test@exemple.fr','nouveau@exemple.fr');
select count(*) as doit_etre_zero from dpe.prospect;
```

- [ ] **Step 7: Commit (deux repos)**

```bash
cd "C:\Dev\Frontend-Baikal" && git add docs/contrats/prospects-v1.sql && git commit -m "docs(contrats): l'interface d'ecriture du module prospects

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

```bash
cd "C:\Dev\DPE" && git add supabase/migrations/20260827130000_dpe_prospect_actions.sql && git commit -m "feat(prospect): prospect_action et prospect_importer sur dpe

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: La vue contractuelle `dpe.baikal_prospects`

**Files:**
- Create: `C:\Dev\DPE\supabase\migrations\20260827140000_dpe_baikal_prospects.sql`

**Interfaces:**
- Consumes: `dpe.prospect`, `dpe.prospect_etat` (tâche 1)
- Produces: la vue `dpe.baikal_prospects` avec les colonnes `prospect_id, email, metier, provenance, nom_affiche, commune, code_postal, specialite, siret, telephone, site_web, statut, dernier_contact_le, nb_contacts, note, client_depuis, cree_le, est_test`. Les tâches 6 et 7 lisent exactement ces noms.

- [ ] **Step 1: Vérifier les valeurs de `dpe.abonnement.statut`**

Avant d'écrire le `client_depuis` des RGE, lire ce que la colonne contient réellement :

```sql
select statut, count(*) from dpe.abonnement group by statut;
```

Si aucune valeur `actif` n'apparaît, utiliser `annule_le is null` comme critère dans l'étape suivante plutôt que `statut = 'actif'`.

- [ ] **Step 2: Écrire la vue**

```sql
-- ---------------------------------------------------------------------------
-- La vue contractuelle des prospects de MonsieurDPE, lue par Baikal.
--
-- Elle projette les annuaires du site, elle ne les recopie pas. C'est toute
-- la difference avec la sync de 03h30 qu'elle remplace : celle-la
-- dedoublonnait par adresse de CERTIFIE (11 077 lignes), la campagne sert une
-- adresse par FICHE (8 594). Deux regles de choix, deux verites, +29 %
-- d'ecart entre ce que la console annoncait et ce qui partait reellement.
--
-- La regle retenue ici est celle de la CAMPAGNE — min(email) par slug,
-- identique a dpe.campagne_a_envoyer et dpe.revendication_ouvrir. Les trois
-- doivent rester d'accord : sinon la console montre une adresse et le mail
-- part vers une autre.
-- ---------------------------------------------------------------------------

create or replace view dpe.baikal_prospects with (security_invoker = true) as
with sources as (
  -- 1. Diagnostiqueurs certifies : une adresse par fiche.
  select
    s.slug                                                as prospect_id,
    (select min(c.email) from dpe.diag_certifie c
      where c.slug = s.slug
        and c.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')       as email,
    'diagnostiqueur'::text                                as metier,
    'annuaire_public'::text                               as provenance,
    s.nom_affiche                                         as nom_affiche,
    s.commune                                             as commune,
    s.code_postal::text                                   as code_postal,
    '{}'::text[]                                          as specialite,
    null::char(14)                                        as siret,
    null::text                                            as telephone,
    null::text                                            as site_web,
    s.cree_le                                             as cree_le,
    (select max(v.envoye_le) from dpe.envoi_campagne v
      where v.slug = s.slug and v.erreur is null)         as dernier_contact_le,
    (select count(*)::int from dpe.envoi_campagne v
      where v.slug = s.slug and v.erreur is null)         as nb_contacts,
    (select e.cree_le::date from dpe.diag_fiche_edito e
      where e.slug = s.slug and e.profil_id is not null)  as client_depuis,
    -- En cas de collision d'adresse (un diagnostiqueur egalement RGE), c'est
    -- la ligne diagnostiqueur qui gagne : c'est la population travaillee.
    1                                                     as priorite
  from dpe.diag_site s

  union all

  -- 2. Entreprises RGE.
  select
    r.siret::text,
    lower(trim(r.email)),
    'entreprise_rge',
    'annuaire_public',
    r.raison_sociale,
    r.commune,
    r.code_postal::text,
    coalesce(r.domaines, '{}'::text[]),
    r.siret,
    r.telephone,
    r.site_internet,
    r.cree_le,
    (select max(x.envoye_le) from dpe.envoi_recap x
      where x.siret = r.siret and x.erreur is null),
    (select count(*)::int from dpe.envoi_recap x
      where x.siret = r.siret and x.erreur is null),
    coalesce(
      r.abonne_jusqu_a,
      (select min(a.debut_le)::date from dpe.abonnement a
        where a.siret = r.siret and a.annule_le is null)),
    2
  from dpe.entreprise_rge r

  union all

  -- 3. Acquisition propre du site : la seule population dont le consentement
  --    est horodate, donc la plus solide juridiquement.
  select
    l.id::text, lower(trim(l.email)), 'autre', 'acquisition_propre',
    lower(trim(l.email)), null, null, '{}'::text[], null, null, null,
    l.consenti_le, null, 0, null, 3
  from dpe.lead l

  union all

  -- 4. Le receptacle du module : imports, saisies, copies inter-sites.
  select
    p.email, p.email, p.metier, p.provenance, p.nom_affiche, p.commune,
    p.code_postal, p.specialite, p.siret, p.telephone, p.site_web,
    p.cree_le, null, 0, null, 4
  from dpe.prospect p
),
adressables as (
  -- La vue n'expose que l'adressable : une ligne sans adresse valide n'a
  -- rien a faire dans une base dont le seul usage est d'ecrire. Cout mesure
  -- le 27/08 : 14 entreprises RGE sur 57 258.
  select distinct on (email) *
  from sources
  where email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  order by email, priorite
)
select
  a.prospect_id,
  a.email,
  a.metier,
  a.provenance,
  a.nom_affiche,
  a.commune,
  a.code_postal,
  a.specialite,
  a.siret,
  a.telephone,
  a.site_web,
  -- desinscrit est terminal : l'opt-out prime sur tout etat stocke.
  case when o.email is not null then 'desinscrit'
       else coalesce(e.statut, 'nouveau') end as statut,
  a.dernier_contact_le,
  a.nb_contacts,
  e.note,
  a.client_depuis,
  a.cree_le,
  (a.email ~* 'pudebat|confer-sas|test|demo|example\.com') as est_test
from adressables a
left join dpe.prospect_etat e on e.email = a.email
left join dpe.diag_optout   o on o.email = a.email;

comment on view dpe.baikal_prospects is
  'Base adressable de MonsieurDPE pour la console Baikal. Projette les '
  'annuaires du site sans jamais les recopier. La regle de choix d''adresse '
  'des diagnostiqueurs est celle de dpe.campagne_a_envoyer : les deux doivent '
  'rester d''accord.';

grant select on dpe.baikal_prospects to service_role;
```

- [ ] **Step 3: Vérifier les volumes**

```sql
select count(*) as total,
       count(*) filter (where metier='diagnostiqueur') as diagnostiqueurs,
       count(*) filter (where metier='entreprise_rge') as rge,
       count(*) filter (where metier='autre')          as autres,
       count(*) filter (where statut='desinscrit')     as desinscrits,
       count(*) filter (where client_depuis is not null) as convertis,
       count(*) filter (where est_test)                as tests
from dpe.baikal_prospects;
```

Attendu, aux dérives de cron près : `total ≈ 65 840`, `diagnostiqueurs ≈ 8 595`, `rge ≈ 57 244`, `autres ≈ 4`, `desinscrits = 0`, `convertis ≈ 2`.

- [ ] **Step 4: Vérifier la parité avec la campagne (le point critique)**

```sql
select
  (select count(distinct email) from dpe.baikal_prospects
    where metier='diagnostiqueur' and client_depuis is null
      and statut <> 'desinscrit')                       as vue_adressables,
  (select count(*) from dpe.campagne_a_envoyer('revendication')) as campagne_restants,
  (select count(*) from dpe.envoi_campagne where erreur is null) as deja_servis;
```

Attendu : `vue_adressables = campagne_restants + deja_servis`. **Si l'égalité est fausse, ne pas continuer** : la vue et la campagne divergent, c'est exactement le défaut que ce lot corrige.

- [ ] **Step 5: Vérifier que `dernier_contact_le` colle aux envois réels**

```sql
select p.email, p.nb_contacts, p.dernier_contact_le, v.envoye_le
from dpe.baikal_prospects p
join dpe.envoi_campagne v on v.email = p.email and v.erreur is null
limit 10;
```

Attendu : `dernier_contact_le = envoye_le` sur les 6 lignes envoyées, `nb_contacts >= 1`.

- [ ] **Step 6: Commit**

```bash
cd "C:\Dev\DPE" && git add supabase/migrations/20260827140000_dpe_baikal_prospects.sql && git commit -m "feat(prospect): vue contractuelle baikal_prospects

Projette les annuaires sans les recopier, avec la regle d'adresse de
la campagne. Remplace la sync de 03h30 qui annoncait 11 077 la ou 8 594
sont adressables.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: La taxonomie et le wrapper d'écriture (Baikal)

**Files:**
- Create: `C:\Dev\Frontend-Baikal\supabase\migrations\20260827150000_admin_metier.sql`

**Interfaces:**
- Consumes: `dpe.prospect_action` (tâche 2)
- Produces: `admin.metier(slug pk, libelle, couleur, ordre)`, la colonne `config.apps.env_prospects_fn`, et `public.baikal_prospect_action(p_app_id, p_action, p_email, p_valeur, p_acteur) returns jsonb`. La tâche 7 appelle la RPC, la tâche 6 lit `admin.metier`.

- [ ] **Step 1: Écrire la migration**

```sql
-- ---------------------------------------------------------------------------
-- Taxonomie des metiers et adaptateur d'ecriture du module Prospects.
--
-- La taxonomie est FERMEE (deux sites doivent etre comparables, et le lot 3
-- copiera de l'un a l'autre) mais elle vit EN BASE : ajouter "courtier" est
-- une ligne, pas un deploiement. C'est le meme arbitrage que
-- config.apps.funnel_etapes pour les Clients.
-- ---------------------------------------------------------------------------

create table if not exists admin.metier (
  slug    text primary key,
  libelle text not null,
  couleur text not null default 'slate'
          check (couleur in ('slate','blue','amber','emerald','red','violet')),
  ordre   int  not null default 100
);

insert into admin.metier (slug, libelle, couleur, ordre) values
  ('notaire',        'Notaires',                 'violet',  10),
  ('agent_immo',     'Agent immobilier',         'blue',    20),
  ('syndic',         'Syndic',                   'amber',   30),
  ('diagnostiqueur', 'Diagnostiqueur immobilier','emerald', 40),
  ('entreprise_rge', 'Entreprise RGE',           'slate',   50),
  ('autre',          'Autre',                    'slate',   90)
on conflict (slug) do update
  set libelle = excluded.libelle,
      couleur = excluded.couleur,
      ordre   = excluded.ordre;

alter table admin.metier enable row level security;
alter table admin.metier force  row level security;
revoke all on admin.metier from anon, authenticated;
grant select, insert, update, delete on admin.metier to service_role;

-- Canal d'ecriture des sites HEBERGES A PART. NULL par defaut : pas d'EF
-- declaree, pas de boutons. Les sites de la base partagee n'en ont pas
-- besoin, ils exposent la fonction SQL du module.
alter table config.apps add column if not exists env_prospects_fn text;

comment on column config.apps.env_prospects_fn is
  'Nom de l''Edge Function d''administration des prospects chez un site '
  'heberge sur son propre projet. NULL pour un site de la base partagee, '
  'qui expose <db_schema>.prospect_action a la place.';

-- ------ L'adaptateur d'ecriture ------
--
-- Baikal n'ecrit jamais dans une table de site : il appelle la fonction que
-- le site a definie, et elle seule. Ce wrapper ne fait que resoudre le
-- schema depuis le registre — si le site n'a pas installe le module, la
-- fonction n'existe pas et l'appel echoue proprement.
-- Meme pattern que admin.sync_diagnostiqueurs.

create or replace function public.baikal_prospect_action(
  p_app_id text,
  p_action text,
  p_email  text,
  p_valeur text default null,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema  text;
  v_reponse jsonb;
begin
  select db_schema into v_schema from config.apps where id = p_app_id;
  if v_schema is null then
    raise exception 'Site % sans base configuree (db_schema)', p_app_id;
  end if;
  if to_regprocedure(format('%I.prospect_action(text,text,text,text)', v_schema)) is null then
    raise exception 'Le site % n''a pas installe le module prospects', p_app_id;
  end if;

  execute format('select %I.prospect_action($1,$2,$3,$4)', v_schema)
    into v_reponse
    using p_action, p_email, p_valeur, p_acteur;

  return v_reponse;
end;
$$;

create or replace function public.baikal_prospect_importer(
  p_app_id text,
  p_lignes jsonb,
  p_acteur text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schema  text;
  v_reponse jsonb;
begin
  select db_schema into v_schema from config.apps where id = p_app_id;
  if v_schema is null then
    raise exception 'Site % sans base configuree (db_schema)', p_app_id;
  end if;
  if to_regprocedure(format('%I.prospect_importer(jsonb,text)', v_schema)) is null then
    raise exception 'Le site % n''a pas installe le module prospects', p_app_id;
  end if;

  execute format('select %I.prospect_importer($1,$2)', v_schema)
    into v_reponse
    using p_lignes, p_acteur;

  return v_reponse;
end;
$$;

revoke all on function public.baikal_prospect_action(text,text,text,text,text)
  from anon, authenticated;
revoke all on function public.baikal_prospect_importer(text,jsonb,text)
  from anon, authenticated;
grant execute on function public.baikal_prospect_action(text,text,text,text,text)
  to service_role;
grant execute on function public.baikal_prospect_importer(text,jsonb,text)
  to service_role;
```

- [ ] **Step 2: Appliquer et vérifier la taxonomie**

```sql
select slug, libelle, couleur, ordre from admin.metier order by ordre;
```

Attendu : 6 lignes, dans l'ordre notaire, agent_immo, syndic, diagnostiqueur, entreprise_rge, autre.

- [ ] **Step 3: Vérifier le wrapper de bout en bout**

```sql
select public.baikal_prospect_action('monsieurdpe','statut','wrapper@exemple.fr','contacte','plan-task4');
select statut, maj_par from dpe.prospect_etat where email='wrapper@exemple.fr';
```

Attendu : `contacte | plan-task4`.

- [ ] **Step 4: Vérifier le refus sur un site sans module**

```sql
select public.baikal_prospect_action('voirie','statut','x@exemple.fr','contacte','plan-task4');
```

Attendu : `ERROR: Le site voirie n'a pas installe le module prospects`.

- [ ] **Step 5: Nettoyer**

```sql
delete from dpe.prospect_etat where email='wrapper@exemple.fr';
```

- [ ] **Step 6: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add supabase/migrations/20260827150000_admin_metier.sql && git commit -m "feat(prospects): taxonomie des metiers et adaptateur d'ecriture

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Normalisation des critères (TDD)

**Files:**
- Create: `C:\Dev\Frontend-Baikal\supabase\functions\admin-prospects\filtres.ts`
- Create: `C:\Dev\Frontend-Baikal\supabase\functions\admin-prospects\filtres.test.ts`

**Interfaces:**
- Produces: `normaliserCriteres(body: Record<string, unknown>): Criteres` où `Criteres = { recherche, metiers, statuts, provenances, departement, avecTelephone, exclureTests, exclureClients, page, parPage, tri, ordre }`. La tâche 6 l'importe.

Ce module est **pur** : aucun accès réseau, testable sans permissions Deno. C'est le seul endroit du lot où le vrai cycle TDD s'applique.

- [ ] **Step 1: Écrire les tests d'abord**

Dans `filtres.test.ts` :

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliserCriteres } from "./filtres.ts";

Deno.test("body vide -> valeurs par defaut", () => {
  assertEquals(normaliserCriteres({}), {
    recherche: "",
    metiers: [],
    statuts: [],
    provenances: [],
    departement: "",
    avecTelephone: false,
    exclureTests: true,
    exclureClients: true,
    page: 1,
    parPage: 25,
    tri: "cree_le",
    ordre: "desc",
  });
});

Deno.test("les tests et les clients sont exclus par defaut, desactivables", () => {
  assertEquals(normaliserCriteres({}).exclureTests, true);
  assertEquals(normaliserCriteres({ exclureTests: false }).exclureTests, false);
  assertEquals(normaliserCriteres({}).exclureClients, true);
  assertEquals(normaliserCriteres({ exclureClients: false }).exclureClients, false);
});

Deno.test("metiers hors taxonomie ecartes", () => {
  assertEquals(
    normaliserCriteres({ metiers: ["notaire", "plombier", "", 42, "syndic"] }).metiers,
    ["notaire", "syndic"],
  );
});

Deno.test("statuts hors funnel ecartes, partenaire compris", () => {
  assertEquals(
    normaliserCriteres({ statuts: ["contacte", "partenaire", "refus"] }).statuts,
    ["contacte", "refus"],
  );
});

Deno.test("departement : deux ou trois caracteres, sinon vide", () => {
  assertEquals(normaliserCriteres({ departement: "31" }).departement, "31");
  assertEquals(normaliserCriteres({ departement: "2A" }).departement, "2A");
  assertEquals(normaliserCriteres({ departement: "974" }).departement, "974");
  assertEquals(normaliserCriteres({ departement: "3" }).departement, "");
  assertEquals(normaliserCriteres({ departement: "31000" }).departement, "");
});

Deno.test("parPage borne a 5..100, page minimale 1", () => {
  assertEquals(normaliserCriteres({ parPage: 1 }).parPage, 5);
  assertEquals(normaliserCriteres({ parPage: 5000 }).parPage, 100);
  assertEquals(normaliserCriteres({ page: -3 }).page, 1);
  assertEquals(normaliserCriteres({ page: "abc" }).page, 1);
});

Deno.test("tri et ordre en liste blanche", () => {
  assertEquals(normaliserCriteres({ tri: "email" }).tri, "cree_le");
  assertEquals(normaliserCriteres({ tri: "dernier_contact_le" }).tri, "dernier_contact_le");
  assertEquals(normaliserCriteres({ ordre: "asc" }).ordre, "asc");
  assertEquals(normaliserCriteres({ ordre: "n'importe" }).ordre, "desc");
});

Deno.test("recherche tronquee a 200 caracteres et trimmee", () => {
  assertEquals(normaliserCriteres({ recherche: "  toulouse " }).recherche, "toulouse");
  assertEquals(normaliserCriteres({ recherche: "x".repeat(500) }).recherche.length, 200);
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

```bash
cd "C:\Dev\Frontend-Baikal" && deno test supabase/functions/admin-prospects/filtres.test.ts --allow-none
```

Attendu : échec, `Module not found "./filtres.ts"`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `filtres.ts` :

```typescript
// Normalisation des parametres de la liste des prospects.
// Pure : aucun acces reseau, testable sans permissions Deno.
//
// Les listes blanches ne sont pas cosmetiques : ces valeurs partent dans des
// clauses SQL construites par postgresjs. Un slug non filtre ici, c'est une
// requete qui echoue en production sur une valeur que personne n'a saisie.
export interface Criteres {
  recherche: string;
  metiers: string[];
  statuts: string[];
  provenances: string[];
  departement: string;
  avecTelephone: boolean;
  exclureTests: boolean;
  // Un client n'est plus un prospect : on ne lui ecrit pas "reprenez votre
  // fiche" alors qu'il l'a reprise. Exclu par defaut, affichable a la demande.
  exclureClients: boolean;
  page: number;
  parPage: number;
  tri: "cree_le" | "dernier_contact_le";
  ordre: "asc" | "desc";
}

const METIERS = new Set([
  "notaire", "agent_immo", "syndic", "diagnostiqueur", "entreprise_rge", "autre",
]);
const STATUTS = new Set([
  "nouveau", "contacte", "relance", "repondu", "refus", "desinscrit",
]);
const PROVENANCES = new Set([
  "annuaire_public", "acquisition_propre", "import", "scrape",
]);

function listeBlanche(brut: unknown, permis: Set<string>): string[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter((v): v is string => typeof v === "string" && permis.has(v)).slice(0, 20);
}

export function normaliserCriteres(body: Record<string, unknown>): Criteres {
  const departement = typeof body.departement === "string"
    ? body.departement.trim().toUpperCase()
    : "";
  const parPageBrut = Number(body.parPage);
  return {
    recherche: typeof body.recherche === "string"
      ? body.recherche.trim().slice(0, 200)
      : "",
    metiers: listeBlanche(body.metiers, METIERS),
    statuts: listeBlanche(body.statuts, STATUTS),
    provenances: listeBlanche(body.provenances, PROVENANCES),
    departement: /^[0-9]{2}[0-9AB]?$/.test(departement) ? departement : "",
    avecTelephone: body.avecTelephone === true,
    exclureTests: body.exclureTests !== false,
    exclureClients: body.exclureClients !== false,
    page: Number.isInteger(body.page) && (body.page as number) > 0
      ? body.page as number
      : 1,
    parPage: Number.isInteger(parPageBrut)
      ? Math.min(100, Math.max(5, parPageBrut))
      : 25,
    tri: body.tri === "dernier_contact_le" ? "dernier_contact_le" : "cree_le",
    ordre: body.ordre === "asc" ? "asc" : "desc",
  };
}
```

- [ ] **Step 4: Relancer les tests**

```bash
cd "C:\Dev\Frontend-Baikal" && deno test supabase/functions/admin-prospects/filtres.test.ts --allow-none
```

Attendu : `ok | 8 passed | 0 failed`. Le test du département `2A` doit passer — la regex accepte `2A`/`2B` en Corse et les trois chiffres d'outre-mer.

- [ ] **Step 5: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add supabase/functions/admin-prospects/filtres.ts supabase/functions/admin-prospects/filtres.test.ts && git commit -m "feat(prospects): normalisation des criteres de liste, testee

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: L'Edge Function — capacité, liste, agrégats

**Files:**
- Create: `C:\Dev\Frontend-Baikal\supabase\functions\admin-prospects\index.ts`

**Interfaces:**
- Consumes: `normaliserCriteres` (tâche 5), `chargerSite`/`lecteurSite`/`ErreurSite` de `../_shared/sites.ts`, `sitesAutorises`/`exigerSite`/`ErreurAcces` de `../_shared/droits.ts`, la vue `dpe.baikal_prospects` (tâche 3), `admin.metier` (tâche 4)
- Produces: action `liste` renvoyant `{ disponible, prospects, total, page, parPage, metiers, compteurs, kpi, actions }`. La tâche 8 consomme exactement cette forme.

Calquer `supabase/functions/admin-dossiers/index.ts` : même en-tête CORS, même séquence d'authentification, même détection de schéma de vue, même repli de `count(*) OVER()`.

- [ ] **Step 1: Écrire le handler**

```typescript
// admin-prospects : la base adressable d'un site du registre, lue dans sa vue
// contractuelle baikal_prospects (canal lecture seule _shared/sites.ts).
// La capacite d'un site se lit a la presence de la vue et des colonnes : un
// site sans vue n'a pas le module (disponible=false, pas une erreur).
// Les ecritures ne passent JAMAIS par ce canal : voir l'action "action".
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { normaliserCriteres } from "./filtres.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  let sql: ReturnType<typeof lecteurSite> | null = null;
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

    // La taxonomie vit dans Baikal : c'est le seul objet du module que la
    // console possede, et le seul vocabulaire commun a tous les sites.
    const { data: metiers } = await admin.schema("admin").from("metier")
      .select("slug, libelle, couleur, ordre").order("ordre");

    sql = lecteurSite(site);

    // Bases partagees : un schema par produit. Projets dedies : public.
    // Premier trouve gagne, comme pour baikal_dossiers.
    const candidats = [site.db_schema, "public"].filter((s): s is string => Boolean(s));
    let schemaVues: string | null = null;
    for (const s of candidats) {
      const [r] = await sql`
        SELECT to_regclass(${s + ".baikal_prospects"}) IS NOT NULL AS ok`;
      if (r.ok) { schemaVues = s; break; }
    }
    if (!schemaVues) return json({ data: { disponible: false }, error: null });

    const colonnes = new Set(
      (await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = ${schemaVues} AND table_name = 'baikal_prospects'`)
        .map((c) => c.column_name as string),
    );

    // Ecriture possible ? Fonction SQL du module (base partagee) ou Edge
    // Function declaree (projet dedie). Ni l'un ni l'autre : lecture seule.
    const [ecriture] = await sql`
      SELECT to_regprocedure(${schemaVues + ".prospect_action(text,text,text,text)"})
             IS NOT NULL AS rpc`;
    const actionsDispo = Boolean(ecriture.rpc) || Boolean(site.env_prospects_fn);

    if (action === "liste") {
      const c = normaliserCriteres(body);
      const motif = `%${c.recherche}%`;
      const filtres = sql`
        WHERE true
          ${c.exclureTests && colonnes.has("est_test") ? sql`AND est_test IS NOT TRUE` : sql``}
          ${c.exclureClients && colonnes.has("client_depuis") ? sql`AND client_depuis IS NULL` : sql``}
          ${c.metiers.length > 0 ? sql`AND metier = ANY(${c.metiers})` : sql``}
          ${c.statuts.length > 0 ? sql`AND statut = ANY(${c.statuts})` : sql``}
          ${c.provenances.length > 0 ? sql`AND provenance = ANY(${c.provenances})` : sql``}
          ${c.departement
            ? sql`AND left(code_postal, ${c.departement.length}) = ${c.departement}`
            : sql``}
          ${c.avecTelephone && colonnes.has("telephone")
            ? sql`AND telephone IS NOT NULL AND telephone <> ''`
            : sql``}
          ${c.recherche
            ? sql`AND (email ILIKE ${motif} OR nom_affiche ILIKE ${motif}
                       OR commune ILIKE ${motif})`
            : sql``}`;

      const rows = await sql`
        SELECT *, count(*) OVER() AS total_lignes
        FROM ${sql(schemaVues)}.baikal_prospects
        ${filtres}
        ORDER BY ${c.tri === "dernier_contact_le" ? sql`dernier_contact_le` : sql`cree_le`}
          ${c.ordre === "asc" ? sql`ASC NULLS LAST` : sql`DESC NULLS LAST`}
        LIMIT ${c.parPage} OFFSET ${(c.page - 1) * c.parPage}`;

      let total = rows.length > 0 ? Number(rows[0].total_lignes) : 0;
      if (rows.length === 0 && c.page > 1) {
        // count(*) OVER() n'existe que sur les lignes renvoyees : une page
        // au-dela du dernier resultat perdrait le total sans ce repli.
        const [compte] = await sql`
          SELECT count(*) AS total FROM ${sql(schemaVues)}.baikal_prospects ${filtres}`;
        total = Number(compte.total);
      }

      // Compteurs des chips metier et KPI : agreges EN BASE. La page ne
      // porte que 25 lignes sur 65 000, tout compte cote client serait faux.
      const compteurs = await sql`
        SELECT metier, count(*)::int AS n
        FROM ${sql(schemaVues)}.baikal_prospects
        ${filtres}
        GROUP BY metier`;

      const [kpi] = await sql`
        SELECT count(*)::int AS adressables,
               count(*) FILTER (WHERE statut = 'nouveau')::int AS nouveaux,
               count(*) FILTER (WHERE dernier_contact_le IS NOT NULL)::int AS contactes,
               count(*) FILTER (WHERE statut = 'desinscrit')::int AS desinscrits
        FROM ${sql(schemaVues)}.baikal_prospects
        ${c.exclureTests && colonnes.has("est_test") ? sql`WHERE est_test IS NOT TRUE` : sql`WHERE true`}`;

      const [convertis] = colonnes.has("client_depuis")
        ? await sql`
          SELECT count(*)::int AS n FROM ${sql(schemaVues)}.baikal_prospects
          WHERE client_depuis IS NOT NULL`
        : [{ n: 0 }];

      return json({
        data: {
          disponible: true,
          prospects: rows.map(({ total_lignes: _t, ...p }) => p),
          total,
          page: c.page,
          parPage: c.parPage,
          metiers: metiers ?? [],
          compteurs: Object.fromEntries(compteurs.map((r) => [r.metier, r.n])),
          kpi: { ...kpi, convertis: convertis.n },
          colonnes: [...colonnes],
          actions: actionsDispo,
        },
        error: null,
      });
    }

    return json({ data: null, error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    console.error("[admin-prospects]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  } finally {
    if (sql) await sql.end();
  }
});
```

- [ ] **Step 2: Déployer**

```bash
cd "C:\Dev\Frontend-Baikal" && npx supabase functions deploy admin-prospects
```

- [ ] **Step 3: Vérifier sur MonsieurDPE**

Depuis la console navigateur d'une session Baikal authentifiée :

```javascript
const { data: { session } } = await window.supabase.auth.getSession();
const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-prospects`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'liste', appId: 'monsieurdpe', parPage: 5 }),
});
console.log(await r.json());
```

Attendu : `disponible: true`, 5 prospects, `total ≈ 65 838`, `compteurs.entreprise_rge ≈ 57 244`, `kpi.adressables ≈ 65 840`, `actions: true`, `metiers` avec 6 entrées.

- [ ] **Step 4: Vérifier le cas « site sans module »**

Même appel avec `appId: 'voirie'`. Attendu : `{ data: { disponible: false }, error: null }` — **pas** une erreur HTTP.

- [ ] **Step 5: Vérifier la pagination et les filtres**

Trois appels : `{ metiers: ['diagnostiqueur'] }` → `total ≈ 8 594` (les clients sont exclus par défaut) ; `{ departement: '31' }` → un sous-ensemble non vide ; `{ page: 99999 }` → `prospects: []` avec le `total` conservé.

- [ ] **Step 6: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add supabase/functions/admin-prospects/index.ts && git commit -m "feat(prospects): EF admin-prospects, liste paginee et agregats serveur

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: L'Edge Function — fiche et actions

**Files:**
- Modify: `C:\Dev\Frontend-Baikal\supabase\functions\admin-prospects\index.ts`

**Interfaces:**
- Consumes: `public.baikal_prospect_action` et `public.baikal_prospect_importer` (tâche 4)
- Produces: actions `fiche` → `{ disponible, prospect }`, `action` → `{ ok, email, action }`, `importer` → `{ ok, recus, inseres, doublons }`. La tâche 9 et la tâche 10 les consomment.

- [ ] **Step 1: Ajouter l'action `fiche`**

Avant le `return json({ data: null, error: "Action inconnue..." })` :

```typescript
    if (action === "fiche") {
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
      if (!email) return json({ data: null, error: "email requis" }, 400);
      const [prospect] = await sql`
        SELECT * FROM ${sql(schemaVues)}.baikal_prospects WHERE email = ${email}`;
      if (!prospect) return json({ data: null, error: "Prospect introuvable" }, 404);
      return json({
        data: { disponible: true, prospect, actions: actionsDispo },
        error: null,
      });
    }
```

- [ ] **Step 2: Ajouter les actions d'écriture**

```typescript
    if (action === "action") {
      const ACTIONS = new Set(["statut", "note", "desinscrire", "creer", "supprimer"]);
      const actionSite = typeof body.actionSite === "string" ? body.actionSite : "";
      if (!ACTIONS.has(actionSite)) {
        return json({ data: null, error: `Action inconnue: ${actionSite}` }, 400);
      }
      if (!actionsDispo) {
        return json({ data: null, error: "Site sans interface d'ecriture des prospects" }, 400);
      }
      const email = typeof body.email === "string" ? body.email : "";
      if (!email) return json({ data: null, error: "email requis" }, 400);

      // "creer" est un import d'une seule ligne : meme fonction, donc meme
      // regle de non-ecrasement. Deux chemins d'ecriture pour un meme geste
      // finiraient par diverger.
      if (actionSite === "creer") {
        const { data, error } = await admin.rpc("baikal_prospect_importer", {
          p_app_id: appId,
          p_lignes: [{
            email,
            metier: typeof body.metier === "string" ? body.metier : "autre",
            provenance: "import",
            nom_affiche: typeof body.nomAffiche === "string" ? body.nomAffiche : email,
            commune: body.commune ?? null,
            code_postal: body.codePostal ?? null,
            telephone: body.telephone ?? null,
            site_web: body.siteWeb ?? null,
          }],
          p_acteur: user.email ?? user.id,
        });
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data, error: null });
      }

      const { data, error } = await admin.rpc("baikal_prospect_action", {
        p_app_id: appId,
        p_action: actionSite,
        p_email: email,
        p_valeur: typeof body.valeur === "string" ? body.valeur : null,
        p_acteur: user.email ?? user.id,
      });
      if (error) return json({ data: null, error: error.message }, 400);
      return json({ data, error: null });
    }

    if (action === "importer") {
      if (!actionsDispo) {
        return json({ data: null, error: "Site sans interface d'ecriture des prospects" }, 400);
      }
      const lignes = Array.isArray(body.lignes) ? body.lignes : [];
      if (lignes.length === 0) return json({ data: null, error: "Aucune ligne" }, 400);
      // Borne dure : au-dela, le client decoupe. Un import de 50 000 lignes
      // en un appel depasserait le temps d'execution de la fonction.
      if (lignes.length > 2000) {
        return json({ data: null, error: "2000 lignes maximum par lot" }, 400);
      }
      const { data, error } = await admin.rpc("baikal_prospect_importer", {
        p_app_id: appId,
        p_lignes: lignes,
        p_acteur: user.email ?? user.id,
      });
      if (error) return json({ data: null, error: error.message }, 400);
      return json({ data, error: null });
    }
```

- [ ] **Step 3: Redéployer**

```bash
cd "C:\Dev\Frontend-Baikal" && npx supabase functions deploy admin-prospects
```

- [ ] **Step 4: Vérifier fiche et statut**

Appeler `{ action: 'fiche', appId: 'monsieurdpe', email: <une adresse de la liste> }` → la fiche complète.
Puis `{ action: 'action', appId: 'monsieurdpe', actionSite: 'statut', email: <la même>, valeur: 'contacte' }` → `{ ok: true }`.
Puis rappeler `fiche` : `statut` vaut `contacte`, et en base `dpe.prospect_etat.maj_par` porte l'adresse de l'utilisateur connecté.

- [ ] **Step 5: Vérifier que la désinscription est terminale**

`{ actionSite: 'desinscrire', email: <la même> }`, puis `fiche` → `statut: 'desinscrit'`. Vérifier en SQL que `dpe.diag_optout` contient l'adresse. Puis remettre `statut: 'contacte'` par l'action et re-vérifier : la fiche doit **toujours** dire `desinscrit`, l'opt-out primant sur l'état stocké.

- [ ] **Step 6: Nettoyer**

```sql
delete from dpe.diag_optout    where email = '<l adresse testee>';
delete from dpe.prospect_etat  where email = '<l adresse testee>';
```

- [ ] **Step 7: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add supabase/functions/admin-prospects/index.ts && git commit -m "feat(prospects): fiche et actions d'ecriture via la RPC du site

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Le service front, la page et la navigation

**Files:**
- Create: `C:\Dev\Frontend-Baikal\src\services\prospects.service.js`
- Create: `C:\Dev\Frontend-Baikal\src\components\console\badges-prospects.jsx`
- Create: `C:\Dev\Frontend-Baikal\src\pages\Prospects.jsx`
- Modify: `C:\Dev\Frontend-Baikal\src\App.jsx`
- Modify: `C:\Dev\Frontend-Baikal\src\components\console\ConsoleLayout.jsx:37-40`

**Interfaces:**
- Consumes: l'action `liste` (tâche 6)
- Produces: la route `/prospect`, l'entrée de navigation `prospects`, et `prospectsService.{getListe, getFiche, executerAction, importer}`

Calquer `src/pages/Clients.jsx` : `ConsoleLayout`, `useApp()` pour le site courant, `useDonneesCachees`, les composants d'état de `components/console/etats`, les `Chip` et `Case` locaux.

- [ ] **Step 1: Écrire le service**

```javascript
/**
 * prospects.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-prospects : la base adressable du site
 * selectionne, lue en direct dans sa vue contractuelle baikal_prospects
 * (spec 2026-08-27). Baikal ne stocke aucun prospect.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function appelerEdge(corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-prospects`, {
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
    console.error('[admin-prospects]', error);
    return { data: null, error };
  }
}

export const prospectsService = {
  getListe(appId, criteres = {}) {
    return appelerEdge({ action: 'liste', appId, ...criteres });
  },
  getFiche(appId, email) {
    return appelerEdge({ action: 'fiche', appId, email });
  },
  executerAction(appId, email, actionSite, params = {}) {
    return appelerEdge({ action: 'action', appId, email, actionSite, ...params });
  },
  importer(appId, lignes) {
    return appelerEdge({ action: 'importer', appId, lignes });
  },
};
```

- [ ] **Step 2: Écrire les badges**

```jsx
/**
 * badges-prospects.jsx - Baikal Console
 * ============================================================================
 * Badges metier, statut et provenance de la page /prospect. La couleur du
 * metier vient de admin.metier (donnee, pas code) : un slug absent de la
 * table s'affiche en gris avec sa valeur brute plutot que de casser la page.
 * ============================================================================
 */
const COULEURS = {
  slate: 'border-slate-500/40 text-slate-300 bg-slate-500/10',
  blue: 'border-blue-500/40 text-blue-300 bg-blue-500/10',
  amber: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  emerald: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  red: 'border-red-500/40 text-red-300 bg-red-500/10',
  violet: 'border-violet-500/40 text-violet-300 bg-violet-500/10',
};

const STATUTS = {
  nouveau: ['slate', 'Nouveau'],
  contacte: ['blue', 'Contacté'],
  relance: ['amber', 'Relancé'],
  repondu: ['emerald', 'A répondu'],
  refus: ['red', 'Refus'],
  desinscrit: ['red', 'Désinscrit'],
};

function Badge({ couleur, children }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] border ${COULEURS[couleur] || COULEURS.slate}`}>
      {children}
    </span>
  );
}

export function BadgeMetier({ slug, metiers }) {
  const m = (metiers || []).find((x) => x.slug === slug);
  return <Badge couleur={m?.couleur}>{m?.libelle || slug || '—'}</Badge>;
}

export function BadgeStatut({ statut }) {
  const [couleur, libelle] = STATUTS[statut] || ['slate', statut || '—'];
  return <Badge couleur={couleur}>{libelle}</Badge>;
}

export function BadgeClient({ depuis }) {
  if (!depuis) return null;
  return <Badge couleur="emerald">Client</Badge>;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function fmtNombre(n) {
  return new Intl.NumberFormat('fr-FR').format(n ?? 0);
}
```

- [ ] **Step 3: Écrire la page**

`src/pages/Prospects.jsx`. Le squelette, à compléter en calquant la mise en forme de `src/pages/Clients.jsx` (mêmes classes Tailwind, mêmes composants `Chip`, `Case`, `Section`, `Vide`) :

```jsx
/**
 * Prospects.jsx - Baikal Console
 * ============================================================================
 * La base adressable du site selectionne, lue en direct dans sa vue
 * contractuelle baikal_prospects (spec 2026-08-27). Baikal ne stocke aucun
 * prospect. Une seule liste : le metier est un filtre, pas un onglet.
 * Un site sans vue n'a pas le module (etat explicite, pas une erreur).
 * ============================================================================
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Upload } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { Chargement, Erreur, Section, Vide } from '../components/console/etats';
import { prospectsService } from '../services/prospects.service';
import FicheProspect from '../components/console/FicheProspect';
import ImportProspectsDialog from '../components/console/ImportProspectsDialog';
import {
  BadgeClient, BadgeMetier, BadgeStatut, fmtDate, fmtNombre,
} from '../components/console/badges-prospects';

const STATUTS = [
  ['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['relance', 'Relancé'],
  ['repondu', 'A répondu'], ['refus', 'Refus'], ['desinscrit', 'Désinscrit'],
];
const PROVENANCES = [
  ['annuaire_public', 'Annuaire public'], ['acquisition_propre', 'Acquisition propre'],
  ['import', 'Import'], ['scrape', 'Scrape'],
];
const PAR_PAGE = 25;

function ProspectsContent() {
  const { currentApp } = useApp();
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [metiers, setMetiers] = useState([]);
  const [statuts, setStatuts] = useState([]);
  const [provenances, setProvenances] = useState([]);
  const [departement, setDepartement] = useState('');
  const [avecTelephone, setAvecTelephone] = useState(false);
  const [exclureTests, setExclureTests] = useState(true);
  const [exclureClients, setExclureClients] = useState(true);
  const [page, setPage] = useState(1);
  const [emailOuvert, setEmailOuvert] = useState(null);
  const [importOuvert, setImportOuvert] = useState(false);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  // Debounce : sans lui, chaque frappe declenche trois agregats sur
  // 65 000 lignes.
  useEffect(() => {
    const t = setTimeout(() => { setRecherche(saisie); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [saisie]);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data: d, error } = await prospectsService.getListe(currentApp, {
      recherche, metiers, statuts, provenances, departement,
      avecTelephone, exclureTests, exclureClients, page, parPage: PAR_PAGE,
    });
    if (error) { setErreur(error.message); setData(null); }
    else { setData(d); setErreur(null); }
    setChargement(false);
  }, [currentApp, recherche, metiers, statuts, provenances, departement,
      avecTelephone, exclureTests, exclureClients, page]);

  useEffect(() => { charger(); }, [charger]);

  function basculer(liste, setListe, valeur) {
    setListe(liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur]);
    setPage(1);
  }

  const pages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / PAR_PAGE)),
    [data?.total],
  );

  if (erreur) return <Erreur message={erreur} />;
  if (chargement && !data) return <Chargement />;
  if (data && data.disponible === false) {
    return <Vide message="Ce site n'expose pas de base de prospects." />;
  }

  // ... KPI, chips, filtres, table, pagination : voir les etapes ci-dessous.
}

export default function Prospects() {
  return (
    <ConsoleLayout actif="prospects">
      <ProspectsContent />
    </ConsoleLayout>
  );
}
```

Rendu, dans cet ordre :

1. **KPI** — cinq tuiles depuis `data.kpi` : Adressables, Nouveaux, Contactés, Convertis, Désinscrits. Nombres en `tabular-nums`, formatés par `fmtNombre`.
2. **Chips métier** — `data.metiers.map()`, chaque chip affiche `libelle` et `fmtNombre(data.compteurs[slug] ?? 0)`. Un clic bascule le slug dans `metiers` et remet `page` à 1.
3. **Filtres** — champ de recherche (`Search`), champ département (2-3 caractères), chips de statut, chips de provenance, cases « Avec téléphone », « Voir les tests », « Voir les clients ».
4. **Table** — colonnes Nom · Métier · Spécialité · Commune · Statut · Dernier contact. `specialite` affiche le premier élément puis `+N`. Une ligne cliquable ouvre `emailOuvert`.
5. **Pagination** — `ChevronLeft` / `ChevronRight`, « page X sur Y », Y = `Math.ceil(total / parPage)`.
6. **`disponible === false`** → composant `Vide` : « Ce site n'expose pas de base de prospects. » Pas une erreur.

Débounce la recherche à 300 ms (`useEffect` + `setTimeout`) : sans lui, chaque frappe déclenche trois agrégats sur 65 000 lignes.

- [ ] **Step 4: Brancher la route**

Dans `src/App.jsx`, à côté du bloc Clients (ligne ~235) :

```jsx
import Prospects from './pages/Prospects';
```

```jsx
{/* Admin - Prospects multi-sites */}
<Route path="/prospect" element={<ProtectedRoute><Prospects /></ProtectedRoute>} />
```

Copier exactement la forme du garde utilisé par la route `/clients` voisine.

- [ ] **Step 5: Brancher la navigation**

Dans `src/components/console/ConsoleLayout.jsx`, ajouter après l'entrée `clients` (ligne 37) :

```jsx
{ id: 'prospects', label: 'Prospects', icon: Users, route: '/prospect' },
```

Importer `Users` depuis `lucide-react` et compléter la liste des valeurs de `actif` dans le commentaire d'en-tête (ligne 9).

- [ ] **Step 6: Vérifier dans le navigateur**

```bash
cd "C:\Dev\Frontend-Baikal" && npm run dev
```

Ouvrir `/prospect`, site MonsieurDPE. Vérifier : la page s'ouvre en moins de 2 s ; les KPI affichent ~65 840 adressables ; les chips montrent Entreprise RGE ≈ 57 244 et Diagnostiqueur immobilier ≈ 8 595 ; un clic sur un chip filtre la table et met la pagination à jour ; basculer sur voirie affiche l'état « pas de base de prospects » sans erreur en console.

- [ ] **Step 7: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add src/services/prospects.service.js src/components/console/badges-prospects.jsx src/pages/Prospects.jsx src/App.jsx src/components/console/ConsoleLayout.jsx && git commit -m "feat(prospects): la page /prospect, une seule liste classee par metier

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: La fiche latérale et les actions

**Files:**
- Create: `C:\Dev\Frontend-Baikal\src\components\console\FicheProspect.jsx`
- Modify: `C:\Dev\Frontend-Baikal\src\pages\Prospects.jsx`

**Interfaces:**
- Consumes: `prospectsService.getFiche` et `executerAction` (tâche 8), actions `fiche` et `action` (tâche 7)
- Produces: `<FicheProspect appId email actions metiers onFerme onChange />`

Calquer `src/components/console/FicheDossier.jsx`.

- [ ] **Step 1: Écrire la fiche**

Panneau latéral affichant : `nom_affiche` en titre avec `BadgeMetier` et `BadgeClient` ; l'adresse, le téléphone, le site web, la commune et le code postal, le SIRET s'il existe ; les spécialités en puces ; la provenance ; `BadgeStatut` ; `dernier_contact_le` et `nb_contacts` ; la note en `textarea`.

Les colonnes absentes du contrat ne s'affichent pas : tester `prospect.telephone !== undefined`, pas sa valeur — un site sans la colonne ne doit pas afficher un tiret trompeur.

Barre d'actions, masquée entièrement si `actions === false` :

- un `select` de statut (les six valeurs du funnel) → `executerAction(appId, email, 'statut', { valeur })`
- « Enregistrer la note » → `executerAction(appId, email, 'note', { valeur: note })`
- « Désinscrire » → passe par la `ConfirmModal` maison (jamais `window.confirm`, règle du projet), texte : « Cette adresse ne sera plus jamais adressée par ce site. L'action est définitive. »
- « Supprimer », visible seulement si `provenance` vaut `import` ou `scrape` — l'annuaire ne se supprime pas. Même `ConfirmModal`.

Après chaque action réussie, appeler `onChange()` pour que la liste se rafraîchisse : sans ça, la table garde l'ancien statut et l'écran ment.

- [ ] **Step 2: Brancher la fiche dans la page**

Dans `Prospects.jsx`, rendre `<FicheProspect />` quand `emailOuvert` est non nul, et lui passer `onChange={rafraichir}`.

- [ ] **Step 3: Vérifier de bout en bout**

Ouvrir une fiche de diagnostiqueur, passer le statut à « Contacté », fermer, vérifier que la ligne de la table affiche « Contacté ». Vérifier en SQL :

```sql
select email, statut, maj_par from dpe.prospect_etat order by maj_le desc limit 3;
```

`maj_par` doit porter l'adresse de l'utilisateur connecté, pas un identifiant technique.

- [ ] **Step 4: Vérifier le garde-fou de suppression**

Ouvrir la fiche d'une entreprise RGE (provenance `annuaire_public`) : le bouton « Supprimer » ne doit pas apparaître.

- [ ] **Step 5: Nettoyer et commit**

```sql
delete from dpe.prospect_etat where maj_par is not null;
```

```bash
cd "C:\Dev\Frontend-Baikal" && git add src/components/console/FicheProspect.jsx src/pages/Prospects.jsx && git commit -m "feat(prospects): fiche laterale et actions d'ecriture

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: L'import CSV

**Files:**
- Create: `C:\Dev\Frontend-Baikal\src\components\console\ImportProspectsDialog.jsx`
- Modify: `C:\Dev\Frontend-Baikal\src\pages\Prospects.jsx`

**Interfaces:**
- Consumes: `prospectsService.importer` (tâche 8), `parseCsv` de `src/utils/csv.js` (déjà utilisé par `Partenariats.jsx`)
- Produces: `<ImportProspectsDialog appId metiers onFerme onImporte />`

- [ ] **Step 1: Écrire le dialogue**

Un bouton « Importer un CSV » dans l'en-tête de la page, visible seulement si `actions === true`.

Le dialogue :

1. Sélection du fichier, lecture par `file.text()`, parsing par `parseCsv`.
2. Un `select` de métier appliqué à tout le lot (les CSV n'ont jamais de colonne métier fiable).
3. Mapping des colonnes reconnues, insensible à la casse : `email`, `nom`/`nom_affiche`/`raison_sociale`, `commune`/`ville`, `code_postal`/`cp`, `telephone`/`tel`, `site_web`/`site`, `siret`.
4. Aperçu avant envoi : nombre de lignes lues, nombre d'adresses valides, cinq premières lignes.
5. **Découpage en lots de 500** et appels successifs à `importer`, en cumulant `recus`, `inseres`, `doublons`. La borne serveur est à 2 000 ; 500 laisse de la marge et rend la barre de progression utile.
6. Compte rendu final : « Import : N insérés, M doublons ignorés (P lignes lues). » — la même phrase que `Partenariats.jsx` affiche aujourd'hui, pour ne pas dérouter.

Afficher explicitement, au-dessus du bouton d'envoi : « Un import ne modifie jamais le statut d'un prospect déjà connu. » C'est la garantie que porte `prospect_importer` ; la taire ferait hésiter avant chaque import.

- [ ] **Step 2: Vérifier avec un CSV réel**

Créer `C:\Users\epude\AppData\Local\Temp\claude\C--Dev-Frontend-Baikal\dcdc6bbc-6c9b-4bb6-8e7c-2b904283fbc7\scratchpad\import-test.csv` :

```csv
email,nom,commune,code_postal,telephone
notaire.un@exemple-test.fr,Etude Un,Toulouse,31000,0561000001
notaire.deux@exemple-test.fr,Etude Deux,Blagnac,31700,0561000002
pas-une-adresse,Etude Trois,Muret,31600,
```

Importer avec le métier « Notaires ». Attendu : « 2 insérés, 0 doublons ignorés (2 lignes lues) » — la troisième ligne est écartée faute d'adresse valide.

- [ ] **Step 3: Vérifier la non-destruction**

Passer `notaire.un@exemple-test.fr` en statut « Refus » depuis sa fiche, puis réimporter le même fichier. Attendu : « 0 insérés, 2 doublons ignorés » et le statut **reste** « Refus ».

- [ ] **Step 4: Nettoyer**

```sql
delete from dpe.prospect      where email like '%@exemple-test.fr';
delete from dpe.prospect_etat where email like '%@exemple-test.fr';
```

- [ ] **Step 5: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add src/components/console/ImportProspectsDialog.jsx src/pages/Prospects.jsx && git commit -m "feat(prospects): import CSV par lots, sans ecraser les etats connus

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Dégager le registre, et éditer la taxonomie depuis /sites

**Files:**
- Create: `C:\Dev\Frontend-Baikal\supabase\functions\admin-sites\index.ts`
- Create: `C:\Dev\Frontend-Baikal\src\services\sites.service.js`
- Modify: `C:\Dev\Frontend-Baikal\src\pages\Sites.jsx`

**Interfaces:**
- Consumes: `admin.metier` (tâche 4)
- Produces: `sitesService.{listSites, saveSite, listMetiers, saveMetier, deleteMetier}`. La tâche 12 s'appuie sur l'existence de cette EF pour pouvoir supprimer `admin-partenariats`.

**Pourquoi cette tâche existe.** `admin-partenariats` est mixte : elle porte les actions prospects et campagnes, **mais aussi** `list-sites` et `save-site`, dont dépend `src/pages/Sites.jsx`. La supprimer sans dégager le registre casserait la page de paramétrage. On extrait donc le registre avant de démonter le reste. Et comme on touche `/sites`, c'est le moment d'y brancher l'édition de la taxonomie, qui n'a nulle part ailleurs où vivre.

- [ ] **Step 1: Créer l'EF `admin-sites`**

Reprendre depuis `supabase/functions/admin-partenariats/index.ts` : le même en-tête CORS, la même authentification, le même contrôle `super_admin`, et **uniquement** les `case "list-sites"` et `case "save-site"` (lignes 94 à 131), sans rien changer à leur corps. Ajouter trois actions :

```typescript
      case "list-metiers": {
        const { data, error } = await admin.schema("admin").from("metier")
          .select("slug, libelle, couleur, ordre").order("ordre");
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data: { metiers: data }, error: null });
      }

      case "save-metier": {
        // La taxonomie est fermee mais elle vit en base : ajouter un metier
        // doit etre une ligne, pas un deploiement. Le slug est immuable — le
        // changer orphelinerait les vues des sites qui l'exposent.
        const m = body.metier as Record<string, unknown>;
        const slug = String(m?.slug ?? "").trim().toLowerCase();
        if (!/^[a-z][a-z0-9_]{1,30}$/.test(slug)) {
          return json({ data: null, error: "Slug invalide (a-z, 0-9, _)" }, 400);
        }
        const { error } = await admin.schema("admin").from("metier").upsert({
          slug,
          libelle: String(m.libelle ?? slug),
          couleur: String(m.couleur ?? "slate"),
          ordre: Number.isInteger(m.ordre) ? m.ordre : 100,
        });
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data: { ok: true }, error: null });
      }

      case "delete-metier": {
        // Refuser la suppression d'un slug encore porte par une vue de site
        // serait ideal, mais Baikal ne peut pas interroger tous les sites ici.
        // La page /prospect degrade proprement : un slug inconnu s'affiche en
        // gris avec sa valeur brute.
        const slug = String(body.slug ?? "");
        const { error } = await admin.schema("admin").from("metier")
          .delete().eq("slug", slug);
        if (error) return json({ data: null, error: error.message }, 400);
        return json({ data: { ok: true }, error: null });
      }
```

- [ ] **Step 2: Créer `sites.service.js`**

Copier `src/services/partenariats.service.js` en ne gardant que `listSites` et `saveSite`, cible `admin-sites`, et ajouter :

```javascript
  listMetiers() {
    return appelerEdge('admin-sites', { action: 'list-metiers' });
  },
  saveMetier(metier) {
    return appelerEdge('admin-sites', { action: 'save-metier', metier });
  },
  deleteMetier(slug) {
    return appelerEdge('admin-sites', { action: 'delete-metier', slug });
  },
```

- [ ] **Step 3: Basculer `Sites.jsx` sur le nouveau service**

Remplacer `import { partenariatsService }` par `import { sitesService }` (ligne 15) et les deux appels `partenariatsService.saveSite` (ligne 119) et `partenariatsService.listSites` (ligne 187). Rien d'autre ne change.

- [ ] **Step 4: Ajouter la section Métiers à `/sites`**

Sous le tableau des sites, une section « Métiers » : la liste des six métiers avec `libelle`, un `select` de couleur (les six valeurs autorisées), un champ `ordre`, un bouton d'enregistrement par ligne, et une ligne d'ajout (slug + libellé). Suppression via la `ConfirmModal` maison.

Un encart au-dessus : « Ces métiers sont le vocabulaire commun de tous les sites. Un site qui expose un slug absent de cette liste l'affiche en gris — ajoutez-le ici plutôt que de le renommer chez le site. »

- [ ] **Step 5: Déployer et vérifier**

```bash
cd "C:\Dev\Frontend-Baikal" && npx supabase functions deploy admin-sites
```

Ouvrir `/sites` : le tableau des sites s'affiche et s'enregistre comme avant ; la section Métiers liste les six entrées ; ajouter `courtier` / « Courtier » / bleu / 25, puis recharger `/prospect` — le chip « Courtier » apparaît avec un compteur à zéro. Le supprimer ensuite.

- [ ] **Step 6: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add supabase/functions/admin-sites src/services/sites.service.js src/pages/Sites.jsx && git commit -m "feat(sites): EF admin-sites, registre degage et taxonomie editable

admin-partenariats portait aussi list-sites et save-site : le registre
est extrait avant que le module Partenariats ne soit demonte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Démantèlement de l'ancien module (DESTRUCTIF)

**Files:**
- Delete: `C:\Dev\Frontend-Baikal\src\pages\Partenariats.jsx`
- Delete: `C:\Dev\Frontend-Baikal\src\services\partenariats.service.js`
- Delete: `C:\Dev\Frontend-Baikal\supabase\functions\admin-partenariats\`
- Modify: `C:\Dev\Frontend-Baikal\src\App.jsx`, `src\components\console\ConsoleLayout.jsx`
- Create: `C:\Dev\Frontend-Baikal\supabase\migrations\20260827160000_drop_admin_partenariats.sql`

**Interfaces:**
- Consumes: `admin-sites` et `sites.service.js` (tâche 11), qui ont repris le registre.
- Produces: rien. Cette tâche ne retire que du code et des tables que plus rien n'appelle.

**Prérequis absolu : la tâche 11 est terminée et `/sites` fonctionne sur `admin-sites`.** Sans elle, cette suppression casse le paramétrage.

**Ne commencer cette tâche qu'après avoir utilisé `/prospect` en conditions réelles pendant au moins une journée.** Les tâches 1 à 10 n'ont rien détruit ; celle-ci est irréversible.

- [ ] **Step 1: Re-mesurer avant de détruire**

Le relevé qui autorise la suppression date du 27/08. Le revérifier :

```sql
select
  (select count(*) from admin.prospects)                           as prospects,
  (select count(*) from admin.prospects where statut <> 'nouveau') as prospects_travailles,
  (select count(*) from admin.campagnes)                           as campagnes,
  (select count(*) from admin.campagne_envois)                     as envois;
```

**Condition d'arrêt : si `prospects_travailles`, `campagnes` ou `envois` est différent de zéro, arrêter et revenir vers Eric.** Un état a été créé depuis le relevé, et il devra être migré vers `dpe.prospect_etat` avant toute suppression.

(`admin.prospects` n'a pas de colonne `note` : les seuls états qu'elle peut porter sont `statut` et l'appartenance à une campagne.)

- [ ] **Step 2: Retirer la page et la navigation**

Supprimer l'import et le bloc de route `/partenariats` dans `src/App.jsx`, et l'entrée `partenariats` dans `ConsoleLayout.jsx` (ligne 40). Vérifier qu'aucun autre fichier ne référence la route :

```bash
cd "C:\Dev\Frontend-Baikal" && grep -rn "partenariats" src/ --include="*.jsx" --include="*.js"
```

Attendu après nettoyage : aucune occurrence, hors `admin.partenariats` du module Financier, qui est une autre table et ne bouge pas. **Vérifier en particulier que `src/pages/Sites.jsx` n'apparaît plus** — s'il apparaît, la tâche 11 n'est pas terminée, s'arrêter là.

Les actions campagnes de l'EF (`list-campagnes`, `save-campagne`, `preview-segment`, `send-test`, `send-campaign`, `campaign-stats`) disparaissent avec elle. C'est assumé : elles n'ont jamais servi (0 campagne, 0 envoi) et le lot 2 repartira d'un schéma dessiné pour l'usage réel plutôt que d'hériter de code mort.

- [ ] **Step 3: Supprimer les fichiers**

```bash
cd "C:\Dev\Frontend-Baikal" && git rm -r src/pages/Partenariats.jsx src/services/partenariats.service.js supabase/functions/admin-partenariats
```

- [ ] **Step 4: Vérifier que le build passe**

```bash
cd "C:\Dev\Frontend-Baikal" && npm run build
```

Attendu : build réussi, aucun import cassé.

- [ ] **Step 5: Écrire la migration de suppression**

```sql
-- ---------------------------------------------------------------------------
-- Retrait de l'ancien module Partenariats.
--
-- admin.prospects etait une recopie integrale de dpe.diag_certifie, refaite
-- chaque nuit a 03h30. Au releve du 27/08 : 11 077 lignes, TOUTES au statut
-- nouveau, aucune note, aucun desinscrit. Aucun etat de prospection n'y a
-- jamais vecu, et les deux tables de campagne n'ont jamais servi.
--
-- Ce n'est donc pas un transfert, c'est une suppression : dpe.baikal_prospects
-- relit la meme population en direct, et mieux — 8 594 adresses reellement
-- adressables au lieu de 11 077 gonflees par un dedoublonnage par certifie.
-- ---------------------------------------------------------------------------

select cron.unschedule('admin-sync-diag-prospects')
where exists (select 1 from cron.job where jobname = 'admin-sync-diag-prospects');

drop function if exists admin.sync_diagnostiqueurs(text);

drop table if exists admin.campagne_envois;
drop table if exists admin.campagnes;
drop table if exists admin.prospects;
```

`admin.partenariats` et `admin.partenariat_mensuel` appartiennent au module Financier : **ne pas y toucher.**

- [ ] **Step 6: Appliquer et vérifier**

```sql
select
  to_regclass('admin.prospects')       is null as prospects_supprimee,
  to_regclass('admin.campagnes')       is null as campagnes_supprimee,
  to_regclass('admin.campagne_envois') is null as envois_supprimee,
  to_regclass('admin.partenariats')    is not null as financier_intact,
  (select count(*) from cron.job where jobname = 'admin-sync-diag-prospects') as cron_restant;
```

Attendu : les quatre premiers `true`, `cron_restant = 0`.

- [ ] **Step 7: Vérifier que les crons d'annuaire tournent toujours**

```sql
select jobname, schedule, active from cron.job
where jobname like 'dpe-annuaire%' or jobname = 'dpe-campagne-revendication'
order by jobname;
```

Attendu : `dpe-annuaire-diag-sync`, `dpe-annuaire-diag-geocode`, `dpe-annuaire-rge-sync`, `dpe-annuaire-rge-recap` et `dpe-campagne-revendication`, tous `active = true`. **Ce sont eux la source de vérité ; s'ils ne tournent plus, la base adressable se fige.**

- [ ] **Step 8: Vérifier que /prospect fonctionne toujours**

Recharger `/prospect` sur MonsieurDPE : la liste doit être identique à avant la suppression. Elle ne lisait déjà plus `admin.prospects`.

- [ ] **Step 9: Commit**

```bash
cd "C:\Dev\Frontend-Baikal" && git add -A && git commit -m "refactor(prospects): retire l'ancien module Partenariats

admin.prospects recopiait dpe.diag_certifie chaque nuit et annoncait
11 077 prospects la ou 8 594 sont adressables. Ni statut travaille, ni
note, ni desinscrit n'y ont jamais existe, et les deux tables de
campagne etaient vides : rien a migrer.

Les crons d'annuaire de DPE restent tous actifs, seule la recopie de
03h30 disparait.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Après ce plan

- **Mise à jour du `CLAUDE.md`** : le module Prospects et sa règle « le module est duplicable, la donnée d'annuaire ne l'est pas » méritent une entrée, ainsi que le renommage `admin-partenariats` → `admin-sites`. Proposer l'ajout à Eric plutôt que de l'écrire directement.
- **Lot 1 bis — Pack Vendeur** : son propre plan. Aucune table à créer (`pack_vendeur.leads` porte déjà l'état, `lead_interactions` l'historique) ; il faut la vue `public.baikal_prospects`, les actions dans `pv-admin-dossiers`, et renseigner `config.apps.env_prospects_fn`.
- **Lot 2 — `/mailing`** : sa propre spec. Deux constats de ce lot y entrent : le taux de rebond de 8,6 % observé sur la prospection Pack Vendeur, et les 57 244 entreprises RGE jamais contactées.
- **Lot 3 — copie inter-sites** : la table `prospect` étant identique partout, le transfert est un `insert ... select`, filtré sur les opt-out de la source.
