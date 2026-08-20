# Admin multi-sites (SEO + Partenariats) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Greffer sur Baikal deux modules multi-sites — suivi Search Console et CRM de
prospection avec campagnes Resend — pilotés par le registre de sites `config.apps`.

**Architecture :** Le front (Vite + React Router, JSX) n'accède jamais aux nouvelles
tables : tout passe par deux Edge Functions (`admin-seo`, `admin-partenariats`) qui
vérifient le rôle de l'appelant (`super_admin`/`org_admin` via `core.profiles`) puis
agissent en `service_role`. Les tables vivent dans un nouveau schéma `admin`, RLS
forcée sans policy (verrouillage par `revoke`, pattern `dpe` éprouvé). L'auth GSC est
le mécanisme OAuth refresh-token repris de Pack Vendeur.

**Tech stack :** React 18 + Vite 5 (JSX, pas de TS front), Supabase (Postgres + Edge
Functions Deno/TS), API Google Search Console (Search Analytics v3), Resend.

**Spec :** `docs/superpowers/specs/2026-08-20-admin-multi-sites-seo-partenariats-design.md`

**Contraintes transverses (à respecter dans CHAQUE tâche) :**
- Le repo a du travail non commité d'une autre session : **tout `git add` se fait par
  pathspec explicite**, jamais `git add -A` ni `git add .`.
- Pas de harnais de test unitaire dans ce repo : la vérification est `deno check`
  pour les Edge Functions, `npm run build` pour le front, et un smoke test manuel
  final. Ne pas introduire vitest/jest.
- Les Edge Functions n'importent PAS depuis `_shared/` pour les nouveaux helpers
  (gotcha Pack Vendeur : les imports `../_shared/*` cassent le déploiement par
  bundle MCP) : chaque helper vit dans le dossier de sa fonction.
- Réponses EF toujours `{ data, error }` en JSON, jamais de throw non catché.
- Textes UI en français, sans tiret cadratin.

---

### Task 0 : Vérifier l'état réel de `config.apps`

Le DDL de `config.apps` n'est pas versionné dans le repo. Avant toute migration, on
constate ce qui existe.

**Files :** aucun (lecture seule, SQL Editor Supabase ou MCP).

- [ ] **Step 1 : Inspecter les colonnes et lignes existantes**

Exécuter dans le SQL Editor du projet Supabase de Baikal :

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'config' and table_name = 'apps'
order by ordinal_position;

select * from config.apps;
```

Attendu : au moins `id` (text) et `name` (text), une ligne pour ARPET. Noter la
valeur exacte de l'`id` d'ARPET et le type réel de `id`.

- [ ] **Step 2 : Adapter si nécessaire**

Si `id` n'est pas de type `text`, adapter le type de la colonne `app_id` des
migrations des Tasks 1 et 2 pour correspondre. Si d'autres colonnes obligatoires
(NOT NULL sans default) existent sur `config.apps`, compléter les `insert` de la
Task 1 en conséquence.

---

### Task 1 : Migration — le registre des sites

**Files :**
- Create : `supabase/migrations/20260820100000_admin_registre_sites.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- ---------------------------------------------------------------------------
-- Registre des sites : config.apps devient le registre multi-sites de l'admin.
-- Spec : docs/superpowers/specs/2026-08-20-admin-multi-sites-seo-partenariats-design.md
-- ---------------------------------------------------------------------------

alter table config.apps add column if not exists domaine        text;
alter table config.apps add column if not exists gsc_propriete  text;
alter table config.apps add column if not exists env_url        text;
alter table config.apps add column if not exists env_secret_ref text;

comment on column config.apps.gsc_propriete is
  'Identifiant de propriété Search Console (sc-domain:example.fr ou URL). '
  'NULL = module SEO inactif pour ce site.';
comment on column config.apps.env_secret_ref is
  'NOM du secret Edge Functions portant la clé service de l''environnement du '
  'site. La clé elle-même n''est jamais en table.';

-- Les deux nouveaux sites. ARPET existe déjà et n'est pas touché ici.
insert into config.apps (id, name, domaine, gsc_propriete, env_url, env_secret_ref)
values
  ('monsieurdpe', 'MonsieurDPE', 'monsieurdpe.fr', 'sc-domain:monsieurdpe.fr',
   'https://odspcxgafcqxjzrarsqf.supabase.co', 'ADMIN_ENV_MONSIEURDPE_KEY'),
  ('pack-vendeur', 'Pack Vendeur', 'pre-etat-date.ai', 'sc-domain:pre-etat-date.ai',
   null, null)
on conflict (id) do update set
  domaine        = excluded.domaine,
  gsc_propriete  = excluded.gsc_propriete,
  env_url        = excluded.env_url,
  env_secret_ref = excluded.env_secret_ref;
```

Note : si la Task 0 a révélé des colonnes NOT NULL supplémentaires sur
`config.apps`, les ajouter aux `insert`. Vérifier aussi que la propriété GSC de
Pack Vendeur est bien de forme `sc-domain:` (sinon reprendre la valeur exacte du
secret `GOOGLE_GSC_SITE_URL` de Pack Vendeur).

- [ ] **Step 2 : Appliquer la migration** (SQL Editor ou `supabase db push` selon
l'usage du projet ; les migrations de ce repo sont appliquées à la main
historiquement). Vérifier : `select id, domaine, gsc_propriete from config.apps;`
rend 3 lignes.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260820100000_admin_registre_sites.sql
git commit -m "feat(admin): config.apps devient le registre multi-sites"
```

---

### Task 2 : Migration — schéma `admin`, prospects et campagnes

**Files :**
- Create : `supabase/migrations/20260820110000_admin_partenariats.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- ---------------------------------------------------------------------------
-- Module Partenariats : prospects, campagnes, envois.
-- Le client n'accède JAMAIS à ces tables en direct : tout passe par l'Edge
-- Function admin-partenariats (service_role). RLS forcée, aucune policy,
-- verrouillage par revoke (pattern éprouvé, cf. schéma dpe de MonsieurDPE).
-- ---------------------------------------------------------------------------

create schema if not exists admin;

create table if not exists admin.prospects (
  id          uuid primary key default gen_random_uuid(),
  app_id      text        not null,
  type        text        not null check (type in ('agence', 'diagnostiqueur', 'autre')),
  statut      text        not null default 'nouveau'
              check (statut in ('nouveau', 'contacte', 'relance', 'repondu',
                                'partenaire', 'refus', 'desinscrit')),
  email       text        not null,
  nom         text,
  prenom      text,
  entreprise  text,
  telephone   text,
  site_web    text,
  code_postal text,
  source      text        not null check (source in ('csv', 'diag_certifie', 'manuel')),
  donnees     jsonb       not null default '{}'::jsonb,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  unique (app_id, email)
);

create index if not exists prospects_app_statut on admin.prospects (app_id, statut);
create index if not exists prospects_app_type   on admin.prospects (app_id, type);

create table if not exists admin.campagnes (
  id         uuid primary key default gen_random_uuid(),
  app_id     text        not null,
  nom        text        not null,
  objet      text        not null default '',
  corps_html text        not null default '',
  segment    jsonb       not null default '{}'::jsonb,
  statut     text        not null default 'brouillon'
             check (statut in ('brouillon', 'envoyee')),
  cree_le    timestamptz not null default now(),
  envoyee_le timestamptz
);

create index if not exists campagnes_app on admin.campagnes (app_id);

create table if not exists admin.campagne_envois (
  id          uuid primary key default gen_random_uuid(),
  campagne_id uuid        not null references admin.campagnes(id) on delete cascade,
  prospect_id uuid        not null references admin.prospects(id) on delete cascade,
  statut      text        not null default 'envoye'
              check (statut in ('envoye', 'ouvert', 'clique', 'repondu',
                                'desinscrit', 'erreur')),
  resend_id   text,
  erreur      text,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  unique (campagne_id, prospect_id)
);

create index if not exists campagne_envois_campagne on admin.campagne_envois (campagne_id);
create index if not exists campagne_envois_resend   on admin.campagne_envois (resend_id);

alter table admin.prospects       enable row level security;
alter table admin.campagnes       enable row level security;
alter table admin.campagne_envois enable row level security;
alter table admin.prospects       force row level security;
alter table admin.campagnes       force row level security;
alter table admin.campagne_envois force row level security;

revoke all on admin.prospects       from anon, authenticated;
revoke all on admin.campagnes       from anon, authenticated;
revoke all on admin.campagne_envois from anon, authenticated;

grant usage on schema admin to service_role;
grant all on admin.prospects       to service_role;
grant all on admin.campagnes       to service_role;
grant all on admin.campagne_envois to service_role;
```

- [ ] **Step 2 : Appliquer et vérifier** — `select count(*) from admin.prospects;`
rend 0 en service_role ; la même requête en `authenticated` échoue (permission
denied), preuve que le revoke tient.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/20260820110000_admin_partenariats.sql
git commit -m "feat(admin): tables prospects, campagnes et envois (schema admin)"
```

---

### Task 3 : Edge Function `admin-seo` — helper GSC

Reprise adaptée du mécanisme Pack Vendeur (`_shared/google-search-console.ts` de
`C:\Dev\Pack Vendeur`) : OAuth refresh token, cache mémoire du token, ancrage J-3.
Différence : la propriété interrogée est un **paramètre** (elle vient de
`config.apps.gsc_propriete`), plus un secret global.

**Files :**
- Create : `supabase/functions/admin-seo/gsc.ts`

- [ ] **Step 1 : Écrire `gsc.ts`**

```ts
// Client Google Search Console (Search Analytics v3).
// Auth par OAuth refresh token, repris de Pack Vendeur. La propriété interrogée
// est un paramètre : une seule paire de credentials, N proprietes partagees au
// meme compte Google.

export const GSC_DATA_LAG_DAYS = 3;

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function getConfig() {
  const clientId = Deno.env.get("GOOGLE_GSC_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_GSC_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_GSC_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Secrets GOOGLE_GSC_OAUTH_* manquants");
  }
  return { clientId, clientSecret, refreshToken };
}

async function fetchAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const cfg = getConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth Google ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  cachedAccessToken = {
    value: json.access_token,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) * 1000),
  };
  return json.access_token;
}

export type GscDimension = "query" | "page" | "country" | "device" | "date";

export interface GscRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function searchAnalytics(
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: GscDimension[] = [],
  rowLimit = 1000,
): Promise<GscRow[]> {
  const accessToken = await fetchAccessToken();
  const url =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const body: Record<string, unknown> = {
    startDate,
    endDate,
    rowLimit: Math.min(Math.max(rowLimit, 1), 5000),
    dataState: "all",
  };
  // dimensions=[] : on OMET la cle, Google rend alors une ligne agregee.
  if (dimensions.length > 0) body.dimensions = dimensions;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GSC ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return (json.rows ?? []) as GscRow[];
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Fenetre de `days` jours ancree a J-3 (GSC ne consolide pas les 2-3 derniers
// jours ; une fenetre finissant aujourd'hui produirait un faux signal de chute).
export function windowAnchored(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - GSC_DATA_LAG_DAYS);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

// La fenetre de meme longueur immediatement anterieure.
export function previousWindow(days: number): { startDate: string; endDate: string } {
  const current = windowAnchored(days);
  const end = new Date(current.startDate + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}
```

- [ ] **Step 2 : Vérifier** — `deno check supabase/functions/admin-seo/gsc.ts`
Attendu : aucun diagnostic. (Lancer depuis la racine du repo Baikal.)

- [ ] **Step 3 : Commit**

```bash
git add supabase/functions/admin-seo/gsc.ts
git commit -m "feat(admin-seo): client Search Console multi-proprietes"
```

---

### Task 4 : Edge Function `admin-seo` — endpoint

**Files :**
- Create : `supabase/functions/admin-seo/index.ts`

- [ ] **Step 1 : Écrire `index.ts`**

Structure identique à `supabase/functions/create-user/index.ts` (CORS inline, client
anon porteur du header Authorization pour identifier l'appelant, client service pour
agir). Rôles admis : `super_admin` et `org_admin`.

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { searchAnalytics, windowAnchored, previousWindow, type GscRow } from "./gsc.ts";

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

function totals(rows: GscRow[]) {
  const t = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  for (const r of rows) {
    t.clicks += r.clicks;
    t.impressions += r.impressions;
  }
  // ctr et position se recalculent ponderes par impressions, pas en moyenne brute.
  if (t.impressions > 0) {
    t.ctr = t.clicks / t.impressions;
    let posImp = 0;
    for (const r of rows) posImp += r.position * r.impressions;
    t.position = posImp / t.impressions;
  }
  return t;
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

    const { data: profile } = await caller
      .from("profiles").select("app_role").eq("id", user.id).single();
    if (!profile || !["super_admin", "org_admin"].includes(profile.app_role)) {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId, days = 28, limit = 50 } = body;
    const nbJours = [7, 28, 90].includes(days) ? days : 28;

    async function proprieteDe(id: string): Promise<string> {
      const { data, error } = await admin
        .schema("config").from("apps")
        .select("gsc_propriete").eq("id", id).single();
      if (error || !data?.gsc_propriete) {
        throw new Error(`Pas de propriete Search Console pour le site ${id}`);
      }
      return data.gsc_propriete;
    }

    switch (action) {
      case "overview": {
        const site = await proprieteDe(appId);
        const cur = windowAnchored(nbJours);
        const prev = previousWindow(nbJours);
        const [curRows, prevRows, daily] = await Promise.all([
          searchAnalytics(site, cur.startDate, cur.endDate),
          searchAnalytics(site, prev.startDate, prev.endDate),
          searchAnalytics(site, cur.startDate, cur.endDate, ["date"], 100),
        ]);
        return json({
          data: {
            fenetre: cur,
            fenetrePrecedente: prev,
            totaux: totals(curRows),
            totauxPrecedents: totals(prevRows),
            parJour: daily.map((r) => ({
              date: r.keys?.[0],
              clicks: r.clicks,
              impressions: r.impressions,
            })),
          },
          error: null,
        });
      }

      case "top": {
        const site = await proprieteDe(appId);
        const dimension = body.dimension === "page" ? "page" : "query";
        const w = windowAnchored(nbJours);
        const rows = await searchAnalytics(site, w.startDate, w.endDate, [dimension], limit);
        return json({
          data: rows.map((r) => ({
            cle: r.keys?.[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          })),
          error: null,
        });
      }

      case "all-sites": {
        const { data: apps, error } = await admin
          .schema("config").from("apps")
          .select("id, name, gsc_propriete")
          .not("gsc_propriete", "is", null);
        if (error) throw error;
        const w = windowAnchored(nbJours);
        const resultats = await Promise.all((apps ?? []).map(async (a) => {
          try {
            const rows = await searchAnalytics(a.gsc_propriete, w.startDate, w.endDate);
            return { appId: a.id, nom: a.name, ...totals(rows), erreur: null };
          } catch (e) {
            return {
              appId: a.id, nom: a.name,
              clicks: 0, impressions: 0, ctr: 0, position: 0,
              erreur: String(e).slice(0, 200),
            };
          }
        }));
        return json({ data: { fenetre: w, sites: resultats }, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-seo]", e);
    return json({ data: null, error: String(e?.message ?? e) }, 500);
  }
});
```

- [ ] **Step 2 : Vérifier** — `deno check supabase/functions/admin-seo/index.ts`

- [ ] **Step 3 : Déployer et tester à la main**

Déployer comme les autres fonctions du projet (dashboard ou
`supabase functions deploy admin-seo`). Prérequis : les 3 secrets
`GOOGLE_GSC_OAUTH_*` copiés depuis Pack Vendeur (geste d'Eric, cf. spec §3).
Test : depuis la console du navigateur connecté à Baikal en super_admin,

```js
const { data: { session } } = await window.__supabase?.auth.getSession?.() ?? {};
// ou récupérer le token via l'app ; puis :
fetch(`${VITE_SUPABASE_URL}/functions/v1/admin-seo`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "all-sites", days: 28 }),
}).then(r => r.json()).then(console.log);
```

Attendu : `{ data: { sites: [...] }, error: null }` avec une ligne par site à
propriété GSC. Une propriété non partagée au compte Google rend sa ligne avec
`erreur` renseignée, sans faire tomber les autres.

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/admin-seo/index.ts
git commit -m "feat(admin-seo): endpoint overview, top et vue croisee multi-sites"
```

---

### Task 5 : Edge Function `admin-partenariats` — prospects et imports

**Files :**
- Create : `supabase/functions/admin-partenariats/index.ts`

- [ ] **Step 1 : Écrire `index.ts` (première moitié : socle + prospects + imports)**

Même socle auth/CORS que `admin-seo`. Le fichier complet est donné ici avec les
actions campagnes en Task 6 ; cette task implémente : `list-prospects`,
`save-prospect`, `delete-prospect`, `import-csv`, `import-diagnostiqueurs`.

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { data: profile } = await caller
      .from("profiles").select("app_role").eq("id", user.id).single();
    if (!profile || !["super_admin", "org_admin"].includes(profile.app_role)) {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId } = body;
    if (!appId && action !== "resend-status") {
      return json({ data: null, error: "appId requis" }, 400);
    }

    switch (action) {
      case "list-prospects": {
        let q = admin.schema("admin").from("prospects")
          .select("*", { count: "exact" })
          .eq("app_id", appId)
          .order("cree_le", { ascending: false })
          .range(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 50) - 1);
        if (body.type) q = q.eq("type", body.type);
        if (body.statut) q = q.eq("statut", body.statut);
        if (body.recherche) {
          const r = String(body.recherche).replaceAll("%", "").replaceAll(",", " ");
          q = q.or(`email.ilike.%${r}%,nom.ilike.%${r}%,entreprise.ilike.%${r}%`);
        }
        const { data, error, count } = await q;
        if (error) throw error;
        return json({ data: { prospects: data, total: count }, error: null });
      }

      case "save-prospect": {
        const p = body.prospect ?? {};
        if (!p.email || !p.type) {
          return json({ data: null, error: "email et type requis" }, 400);
        }
        const ligne = {
          app_id: appId,
          type: p.type,
          statut: p.statut ?? "nouveau",
          email: String(p.email).trim().toLowerCase(),
          nom: p.nom ?? null, prenom: p.prenom ?? null,
          entreprise: p.entreprise ?? null, telephone: p.telephone ?? null,
          site_web: p.site_web ?? null, code_postal: p.code_postal ?? null,
          source: p.source ?? "manuel",
          donnees: p.donnees ?? {},
          maj_le: new Date().toISOString(),
        };
        const { data, error } = await admin.schema("admin").from("prospects")
          .upsert(ligne, { onConflict: "app_id,email" }).select().single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "delete-prospect": {
        const { error } = await admin.schema("admin").from("prospects")
          .delete().eq("id", body.prospectId).eq("app_id", appId);
        if (error) throw error;
        return json({ data: { ok: true }, error: null });
      }

      case "import-csv": {
        // Le front a deja parse le CSV : on recoit des lignes normalisees.
        const lignes = Array.isArray(body.lignes) ? body.lignes : [];
        if (lignes.length === 0 || lignes.length > 5000) {
          return json({ data: null, error: "Entre 1 et 5000 lignes attendues" }, 400);
        }
        const valides = lignes
          .filter((l: Record<string, unknown>) =>
            typeof l.email === "string" && l.email.includes("@"))
          .map((l: Record<string, string>) => ({
            app_id: appId,
            type: body.type === "diagnostiqueur" ? "diagnostiqueur" : "agence",
            email: l.email.trim().toLowerCase(),
            nom: l.nom ?? null, prenom: l.prenom ?? null,
            entreprise: l.entreprise ?? null, telephone: l.telephone ?? null,
            site_web: l.site_web ?? null, code_postal: l.code_postal ?? null,
            source: "csv",
            donnees: l.donnees ?? {},
          }));
        // ignoreDuplicates : un email deja present (quel que soit son statut,
        // desinscrit compris) n'est JAMAIS reecrit par un import.
        const { data, error } = await admin.schema("admin").from("prospects")
          .upsert(valides, { onConflict: "app_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        return json({
          data: {
            recus: lignes.length,
            valides: valides.length,
            inseres: data?.length ?? 0,
            doublons: valides.length - (data?.length ?? 0),
          },
          error: null,
        });
      }

      case "import-diagnostiqueurs": {
        // Lit dpe.diag_certifie dans l'environnement du site via PostgREST.
        const { data: app, error: appError } = await admin
          .schema("config").from("apps")
          .select("env_url, env_secret_ref").eq("id", appId).single();
        if (appError || !app?.env_url || !app?.env_secret_ref) {
          return json({ data: null, error: "Site sans environnement configure" }, 400);
        }
        const cle = Deno.env.get(app.env_secret_ref);
        if (!cle) {
          return json(
            { data: null, error: `Secret ${app.env_secret_ref} absent des Edge Function Secrets` },
            500,
          );
        }
        let url = `${app.env_url}/rest/v1/diag_certifie` +
          `?select=nom,prenom,email,telephone,diag_site!inner(nom_affiche,code_postal,commune)` +
          `&email=not.is.null&limit=10000`;
        if (body.departement && /^\d{2,3}$/.test(body.departement)) {
          url += `&diag_site.code_postal=like.${body.departement}*`;
        }
        const res = await fetch(url, {
          headers: {
            apikey: cle,
            Authorization: `Bearer ${cle}`,
            "Accept-Profile": "dpe",
          },
        });
        if (!res.ok) {
          const t = await res.text();
          return json({ data: null, error: `Environnement site ${res.status}: ${t.slice(0, 200)}` }, 502);
        }
        const certifies = await res.json();
        const parEmail = new Map<string, Record<string, unknown>>();
        for (const c of certifies) {
          const email = String(c.email ?? "").trim().toLowerCase();
          if (!email.includes("@") || parEmail.has(email)) continue;
          parEmail.set(email, {
            app_id: appId,
            type: "diagnostiqueur",
            email,
            nom: c.nom ?? null, prenom: c.prenom ?? null,
            entreprise: c.diag_site?.nom_affiche ?? null,
            telephone: c.telephone ?? null,
            code_postal: c.diag_site?.code_postal ?? null,
            source: "diag_certifie",
            donnees: { commune: c.diag_site?.commune ?? null },
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

      // ... actions campagnes ajoutees en Task 6 ...

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-partenariats]", e);
    return json({ data: null, error: String(e?.message ?? e) }, 500);
  }
});
```

- [ ] **Step 2 : Vérifier** — `deno check supabase/functions/admin-partenariats/index.ts`

- [ ] **Step 3 : Déployer et tester** — prérequis : le secret
`ADMIN_ENV_MONSIEURDPE_KEY` (clé service du projet MonsieurDPE) posé dans les
secrets du projet Baikal. Test manuel : action `import-diagnostiqueurs` avec
`{ appId: "monsieurdpe", departement: "31" }`, attendu `{ data: { lus, avecEmail,
inseres, ... } }` avec des nombres cohérents (lus >= avecEmail >= inseres), puis
`list-prospects` rend ces lignes.

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/admin-partenariats/index.ts
git commit -m "feat(admin-partenariats): prospects, import CSV et import diagnostiqueurs"
```

---

### Task 6 : `admin-partenariats` — campagnes, Resend, désinscription

**Files :**
- Create : `supabase/functions/admin-partenariats/envoi.ts`
- Modify : `supabase/functions/admin-partenariats/index.ts` (ajouter les cases au switch)
- Create : `supabase/functions/admin-desinscription/index.ts`

- [ ] **Step 1 : Écrire `envoi.ts`** (Resend + token de désinscription, repris du
pattern Pack Vendeur : HMAC-SHA256 hex sur l'email minuscule, fail closed)

```ts
const RESEND_API_URL = "https://api.resend.com/emails";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUnsubscribeToken(email: string): Promise<string | null> {
  const secret = Deno.env.get("ADMIN_UNSUBSCRIBE_SECRET");
  if (!secret) return null; // fail closed : pas de secret, pas de lien, pas d'envoi
  return await hmacHex(secret, normalizeEmail(email));
}

export async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  const attendu = await signUnsubscribeToken(email);
  if (!attendu || attendu.length !== token.length) return false;
  // comparaison a temps constant
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function buildUnsubscribeUrl(email: string): Promise<string | null> {
  const token = await signUnsubscribeToken(email);
  if (!token) return null;
  const base = Deno.env.get("SUPABASE_URL");
  return `${base}/functions/v1/admin-desinscription?e=${encodeURIComponent(normalizeEmail(email))}&t=${token}`;
}

export function renderTemplate(tpl: string, prospect: Record<string, unknown>): string {
  return tpl
    .replaceAll("{{prenom}}", String(prospect.prenom ?? ""))
    .replaceAll("{{nom}}", String(prospect.nom ?? ""))
    .replaceAll("{{entreprise}}", String(prospect.entreprise ?? ""));
}

export async function sendOneEmail(
  fromName: string, fromEmail: string, replyTo: string,
  to: string, subject: string, html: string,
): Promise<{ ok: boolean; resendId?: string; error?: string }> {
  const apiKey = Deno.env.get("ADMIN_RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "Secret ADMIN_RESEND_API_KEY absent" };
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to, subject, html, reply_to: replyTo,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 300)}` };
  }
  const data = await res.json();
  return { ok: true, resendId: data.id };
}
```

- [ ] **Step 2 : Ajouter les cases campagnes au switch de `index.ts`**

En tête de fichier, ajouter l'import :

```ts
import { buildUnsubscribeUrl, renderTemplate, sendOneEmail } from "./envoi.ts";
```

Puis, à la place du commentaire `// ... actions campagnes ajoutees en Task 6 ...` :

```ts
      case "list-campagnes": {
        const { data, error } = await admin.schema("admin").from("campagnes")
          .select("*").eq("app_id", appId).order("cree_le", { ascending: false });
        if (error) throw error;
        return json({ data, error: null });
      }

      case "save-campagne": {
        const c = body.campagne ?? {};
        const ligne = {
          ...(c.id ? { id: c.id } : {}),
          app_id: appId,
          nom: c.nom ?? "Sans nom",
          objet: c.objet ?? "",
          corps_html: c.corps_html ?? "",
          segment: c.segment ?? {},
        };
        const { data, error } = await admin.schema("admin").from("campagnes")
          .upsert(ligne).select().single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "preview-segment": {
        const s = body.segment ?? {};
        let q = admin.schema("admin").from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("app_id", appId).neq("statut", "desinscrit");
        if (s.type) q = q.eq("type", s.type);
        if (s.statut) q = q.eq("statut", s.statut);
        if (s.departement) q = q.like("code_postal", `${s.departement}%`);
        const { count, error } = await q;
        if (error) throw error;
        return json({ data: { destinataires: count }, error: null });
      }

      case "send-test": {
        const { data: c, error: cErr } = await admin.schema("admin").from("campagnes")
          .select("*").eq("id", body.campagneId).eq("app_id", appId).single();
        if (cErr || !c) return json({ data: null, error: "Campagne introuvable" }, 404);
        const exp = expediteurDe(appId);
        const lien = await buildUnsubscribeUrl(body.email);
        if (!lien) return json({ data: null, error: "ADMIN_UNSUBSCRIBE_SECRET absent" }, 500);
        const html = renderTemplate(c.corps_html, { prenom: "Test", nom: "Test", entreprise: "Test" })
          + piedDePage(lien);
        const r = await sendOneEmail(exp.nom, exp.email, exp.replyTo, body.email,
          `[TEST] ${c.objet}`, html);
        return r.ok
          ? json({ data: { ok: true }, error: null })
          : json({ data: null, error: r.error }, 502);
      }

      case "send-campaign": {
        const { data: c, error: cErr } = await admin.schema("admin").from("campagnes")
          .select("*").eq("id", body.campagneId).eq("app_id", appId).single();
        if (cErr || !c) return json({ data: null, error: "Campagne introuvable" }, 404);
        if (c.statut === "envoyee") {
          return json({ data: null, error: "Campagne deja envoyee" }, 409);
        }
        const s = c.segment ?? {};
        let q = admin.schema("admin").from("prospects").select("*")
          .eq("app_id", appId).neq("statut", "desinscrit").limit(2000);
        if (s.type) q = q.eq("type", s.type);
        if (s.statut) q = q.eq("statut", s.statut);
        if (s.departement) q = q.like("code_postal", `${s.departement}%`);
        const { data: cibles, error: pErr } = await q;
        if (pErr) throw pErr;

        const exp = expediteurDe(appId);
        let envoyes = 0, erreurs = 0, dejaTraites = 0;
        for (const p of cibles ?? []) {
          // claim atomique : l'unicite (campagne_id, prospect_id) garantit
          // qu'un rejeu de l'action ne renvoie jamais deux fois au meme prospect
          const { error: claimErr } = await admin.schema("admin")
            .from("campagne_envois")
            .insert({ campagne_id: c.id, prospect_id: p.id, statut: "envoye" });
          if (claimErr) { dejaTraites++; continue; } // 23505 = deja traite
          const lien = await buildUnsubscribeUrl(p.email);
          if (!lien) {
            await admin.schema("admin").from("campagne_envois")
              .update({ statut: "erreur", erreur: "ADMIN_UNSUBSCRIBE_SECRET absent" })
              .eq("campagne_id", c.id).eq("prospect_id", p.id);
            erreurs++; continue;
          }
          const html = renderTemplate(c.corps_html, p) + piedDePage(lien);
          const r = await sendOneEmail(exp.nom, exp.email, exp.replyTo, p.email, c.objet, html);
          await admin.schema("admin").from("campagne_envois")
            .update(r.ok
              ? { resend_id: r.resendId, maj_le: new Date().toISOString() }
              : { statut: "erreur", erreur: r.error, maj_le: new Date().toISOString() })
            .eq("campagne_id", c.id).eq("prospect_id", p.id);
          if (r.ok) {
            envoyes++;
            await admin.schema("admin").from("prospects")
              .update({ statut: "contacte", maj_le: new Date().toISOString() })
              .eq("id", p.id).eq("statut", "nouveau");
          } else {
            erreurs++;
          }
        }
        await admin.schema("admin").from("campagnes")
          .update({ statut: "envoyee", envoyee_le: new Date().toISOString() })
          .eq("id", c.id);
        return json({ data: { envoyes, erreurs, dejaTraites }, error: null });
      }

      case "campaign-stats": {
        const { data, error } = await admin.schema("admin").from("campagne_envois")
          .select("statut").eq("campagne_id", body.campagneId);
        if (error) throw error;
        const stats: Record<string, number> = {};
        for (const e of data ?? []) stats[e.statut] = (stats[e.statut] ?? 0) + 1;
        return json({ data: stats, error: null });
      }
```

Et les deux helpers, au niveau module (au-dessus de `serve`) :

```ts
// Expediteur par site. En v1, seul MonsieurDPE envoie ; ajouter une entree ici
// quand un nouveau site obtient son domaine Resend verifie.
function expediteurDe(appId: string): { nom: string; email: string; replyTo: string } {
  const table: Record<string, { nom: string; email: string; replyTo: string }> = {
    monsieurdpe: {
      nom: "Eric de MonsieurDPE",
      email: "eric@monsieurdpe.fr",
      replyTo: "eric.pudebat@confer-sas.fr",
    },
  };
  const exp = table[appId];
  if (!exp) throw new Error(`Pas d'expediteur configure pour le site ${appId}`);
  return exp;
}

function piedDePage(lienDesinscription: string): string {
  return `<p style="margin-top:32px;font-size:12px;color:#888">` +
    `Vous recevez cet email dans le cadre d'une prise de contact professionnelle. ` +
    `<a href="${lienDesinscription}" style="color:#888">Ne plus recevoir d'emails</a></p>`;
}
```

- [ ] **Step 3 : Écrire `admin-desinscription/index.ts`**

GET affiche une confirmation (jamais d'écriture sur GET), POST exécute. Cette
fonction doit être déployée avec **`verify_jwt` désactivé** (destinataires non
authentifiés) : `supabase functions deploy admin-desinscription --no-verify-jwt`.

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyUnsubscribeToken, normalizeEmail } from "../admin-partenariats/envoi.ts";

function page(corps: string): Response {
  return new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Desinscription</title>` +
    `<body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:0 16px">${corps}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const valide = email && token && await verifyUnsubscribeToken(email, token);
  if (!valide) return page(`<p>Lien invalide ou expire.</p>`);

  if (req.method === "GET") {
    return page(
      `<p>Ne plus recevoir d'emails a l'adresse <strong>${normalizeEmail(email)}</strong> ?</p>` +
      `<form method="post"><button type="submit" ` +
      `style="padding:10px 20px;cursor:pointer">Confirmer la desinscription</button></form>`,
    );
  }

  if (req.method === "POST") {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    // Desinscription globale : l'email est retire de TOUS les sites.
    const { error } = await admin.schema("admin").from("prospects")
      .update({ statut: "desinscrit", maj_le: new Date().toISOString() })
      .eq("email", normalizeEmail(email));
    if (error) return page(`<p>Erreur, reessayez plus tard.</p>`);
    return page(`<p>C'est fait. Vous ne recevrez plus d'emails de notre part.</p>`);
  }

  return page(`<p>Methode non supportee.</p>`);
});
```

Note : l'import `../admin-partenariats/envoi.ts` traverse les dossiers de
fonctions. Si le déploiement le refuse (bundling par fonction), copier `envoi.ts`
dans `admin-desinscription/` (seules `verifyUnsubscribeToken` et `normalizeEmail`
sont nécessaires) et le noter en commentaire dans les deux fichiers.

- [ ] **Step 4 : Vérifier** — les deux `deno check`, puis déployer. Prérequis
secrets : `ADMIN_RESEND_API_KEY`, `ADMIN_UNSUBSCRIBE_SECRET` (chaîne aléatoire
longue, `openssl rand -hex 32`).

- [ ] **Step 5 : Test manuel** — `send-test` vers ta propre adresse : l'email
arrive avec le pied de page ; le lien GET affiche la confirmation ; le POST passe
le prospect en `desinscrit` ; un `send-campaign` ultérieur l'exclut
(`preview-segment` le décompte aussi).

- [ ] **Step 6 : Commit**

```bash
git add supabase/functions/admin-partenariats/envoi.ts supabase/functions/admin-partenariats/index.ts supabase/functions/admin-desinscription/index.ts
git commit -m "feat(admin-partenariats): campagnes, envoi Resend et desinscription"
```

---

### Task 7 : Services front

**Files :**
- Create : `src/services/seo.service.js`
- Create : `src/services/partenariats.service.js`

- [ ] **Step 1 : Écrire `src/services/seo.service.js`**

Les deux services partagent le même appel : fetch direct de l'Edge Function avec le
token de session (pattern `process-audio` de `supabaseClient.js`).

```js
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

export const seoService = {
  getOverview(appId, days = 28) {
    return appelerEdge('admin-seo', { action: 'overview', appId, days });
  },
  getTop(appId, dimension, days = 28, limit = 50) {
    return appelerEdge('admin-seo', { action: 'top', appId, dimension, days, limit });
  },
  getAllSites(days = 28) {
    return appelerEdge('admin-seo', { action: 'all-sites', days });
  },
};

export { appelerEdge };
```

- [ ] **Step 2 : Écrire `src/services/partenariats.service.js`**

```js
import { appelerEdge } from './seo.service';

export const partenariatsService = {
  listProspects(appId, filtres = {}) {
    return appelerEdge('admin-partenariats', { action: 'list-prospects', appId, ...filtres });
  },
  saveProspect(appId, prospect) {
    return appelerEdge('admin-partenariats', { action: 'save-prospect', appId, prospect });
  },
  deleteProspect(appId, prospectId) {
    return appelerEdge('admin-partenariats', { action: 'delete-prospect', appId, prospectId });
  },
  importCsv(appId, type, lignes) {
    return appelerEdge('admin-partenariats', { action: 'import-csv', appId, type, lignes });
  },
  importDiagnostiqueurs(appId, departement) {
    return appelerEdge('admin-partenariats', { action: 'import-diagnostiqueurs', appId, departement });
  },
  listCampagnes(appId) {
    return appelerEdge('admin-partenariats', { action: 'list-campagnes', appId });
  },
  saveCampagne(appId, campagne) {
    return appelerEdge('admin-partenariats', { action: 'save-campagne', appId, campagne });
  },
  previewSegment(appId, segment) {
    return appelerEdge('admin-partenariats', { action: 'preview-segment', appId, segment });
  },
  sendTest(appId, campagneId, email) {
    return appelerEdge('admin-partenariats', { action: 'send-test', appId, campagneId, email });
  },
  sendCampaign(appId, campagneId) {
    return appelerEdge('admin-partenariats', { action: 'send-campaign', appId, campagneId });
  },
  campaignStats(appId, campagneId) {
    return appelerEdge('admin-partenariats', { action: 'campaign-stats', appId, campagneId });
  },
};
```

- [ ] **Step 3 : Vérifier** — `npm run build` passe.

- [ ] **Step 4 : Commit**

```bash
git add src/services/seo.service.js src/services/partenariats.service.js
git commit -m "feat(admin): services front seo et partenariats"
```

---

### Task 8 : Page SEO

**Files :**
- Create : `src/pages/Seo.jsx`
- Modify : `src/App.jsx` (route)
- Modify : le fichier où la navigation latérale liste les pages (repérer comment
  `src/pages/Dashboard.jsx` construit ses `tabs` pour la `Sidebar` et où la
  navigation inter-pages se fait — suivre ce pattern à l'identique)

- [ ] **Step 1 : Écrire `src/pages/Seo.jsx`**

Avant d'écrire, ouvrir `src/pages/Dashboard.jsx` et reprendre exactement sa
structure d'enrobage (layout, Sidebar, header) — le JSX ci-dessous donne le contenu
de la page, à insérer dans ce même enrobage. Contenu :

```jsx
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { seoService } from '../services/seo.service';

const FENETRES = [7, 28, 90];

function pct(n) {
  return `${(n * 100).toFixed(1)} %`;
}

function Delta({ actuel, precedent, inverse = false }) {
  if (!precedent) return <Minus className="w-4 h-4 text-baikal-text" />;
  const delta = ((actuel - precedent) / precedent) * 100;
  const positif = inverse ? delta < 0 : delta > 0;
  const Icone = delta === 0 ? Minus : (delta > 0 ? TrendingUp : TrendingDown);
  return (
    <span className={positif ? 'text-green-400' : 'text-red-400'}>
      <Icone className="w-4 h-4 inline" /> {delta > 0 ? '+' : ''}{delta.toFixed(1)} %
    </span>
  );
}

export default function Seo() {
  const { currentApp } = useApp();
  const [jours, setJours] = useState(28);
  const [overview, setOverview] = useState(null);
  const [topRequetes, setTopRequetes] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [tousSites, setTousSites] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const [o, q, p, t] = await Promise.all([
      seoService.getOverview(currentApp, jours),
      seoService.getTop(currentApp, 'query', jours, 25),
      seoService.getTop(currentApp, 'page', jours, 25),
      seoService.getAllSites(jours),
    ]);
    const premiereErreur = o.error || q.error || p.error || t.error;
    if (premiereErreur) setErreur(premiereErreur.message);
    setOverview(o.data);
    setTopRequetes(q.data || []);
    setTopPages(p.data || []);
    setTousSites(t.data);
    setChargement(false);
  }, [currentApp, jours]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-baikal-text">SEO</h1>
        <div className="flex gap-2">
          {FENETRES.map((f) => (
            <button
              key={f}
              onClick={() => setJours(f)}
              className={`px-3 py-1 rounded border ${jours === f
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              {f} j
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <p className="text-red-400 border border-red-400 rounded p-3">{erreur}</p>
      )}
      {chargement && <p className="text-baikal-text">Chargement…</p>}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Clics', overview.totaux.clicks, overview.totauxPrecedents.clicks, false],
            ['Impressions', overview.totaux.impressions, overview.totauxPrecedents.impressions, false],
            ['CTR', pct(overview.totaux.ctr), null, false],
            ['Position', overview.totaux.position.toFixed(1), overview.totauxPrecedents.position, true],
          ].map(([label, valeur, precedent, inverse]) => (
            <div key={label} className="border border-baikal-border rounded-lg p-4 bg-baikal-surface">
              <p className="text-sm text-baikal-text opacity-70">{label}</p>
              <p className="text-2xl font-semibold text-baikal-text">
                {typeof valeur === 'number' ? valeur.toLocaleString('fr-FR') : valeur}
              </p>
              {typeof precedent === 'number' && (
                <Delta
                  actuel={typeof valeur === 'string' ? parseFloat(valeur) : valeur}
                  precedent={precedent}
                  inverse={inverse}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <TableauTop titre="Top requêtes" lignes={topRequetes} />
        <TableauTop titre="Top pages" lignes={topPages} />
      </div>

      {tousSites && (
        <div>
          <h2 className="text-lg font-semibold text-baikal-text mb-3">Tous les sites</h2>
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="border-b border-baikal-border text-left opacity-70">
                <th className="py-2">Site</th><th>Clics</th><th>Impressions</th>
                <th>CTR</th><th>Position</th>
              </tr>
            </thead>
            <tbody>
              {tousSites.sites.map((s) => (
                <tr key={s.appId} className="border-b border-baikal-border">
                  <td className="py-2">{s.nom}</td>
                  {s.erreur
                    ? <td colSpan={4} className="text-red-400">{s.erreur}</td>
                    : <>
                        <td>{s.clicks.toLocaleString('fr-FR')}</td>
                        <td>{s.impressions.toLocaleString('fr-FR')}</td>
                        <td>{pct(s.ctr)}</td>
                        <td>{s.position.toFixed(1)}</td>
                      </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TableauTop({ titre, lignes }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-baikal-text mb-3">{titre}</h2>
      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="border-b border-baikal-border text-left opacity-70">
            <th className="py-2 w-1/2"></th><th>Clics</th><th>Impr.</th><th>Pos.</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle} className="border-b border-baikal-border">
              <td className="py-2 truncate max-w-0" title={l.cle}>{l.cle}</td>
              <td>{l.clicks}</td>
              <td>{l.impressions}</td>
              <td>{l.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2 : Câbler la route dans `src/App.jsx`** (motif `AdminRoute` identique
aux autres pages admin) :

```jsx
import Seo from './pages/Seo';
// ...
<Route
  path="/seo"
  element={
    <AdminRoute>
      <Seo />
    </AdminRoute>
  }
/>
```

- [ ] **Step 3 : Ajouter l'entrée de navigation** — repérer où les pages
existantes déclarent leurs `tabs` de Sidebar et la navigation inter-pages (regarder
`src/pages/Dashboard.jsx` et `src/pages/Admin.jsx`), ajouter une entrée
`{ id: 'seo', label: 'SEO', icon: TrendingUp }` qui navigue vers `/seo`, visible
sous la même condition de rôle que les entrées admin existantes.

- [ ] **Step 4 : Vérifier** — `npm run build` passe ; `npm run dev`, se connecter,
ouvrir `/seo` : les cartes s'affichent pour le site sélectionné, le sélecteur
d'app change les chiffres, la table « Tous les sites » liste les 3 sites.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/Seo.jsx src/App.jsx
git commit -m "feat(admin): page SEO multi-sites"
```

(ajouter au pathspec le fichier de navigation modifié au Step 3)

---

### Task 9 : Page Partenariats

**Files :**
- Create : `src/pages/Partenariats.jsx`
- Create : `src/utils/csv.js`
- Modify : `src/App.jsx` (route) + le fichier de navigation (comme Task 8)

- [ ] **Step 1 : Écrire `src/utils/csv.js`** — parseur minimal, séparateur `;` ou
`,` détecté sur l'en-tête, guillemets gérés, pas de dépendance nouvelle :

```js
// Parseur CSV minimal : separateur ; ou , (detecte sur l'en-tete), guillemets
// doubles, CRLF. Suffisant pour un export tabulaire propre ; pas un parseur
// general.
export function parseCsv(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lignes.length < 2) return { entetes: [], lignes: [] };
  const sep = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ';' : ',';

  function decouper(ligne) {
    const champs = [];
    let courant = '';
    let entreGuillemets = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (entreGuillemets) {
        if (c === '"' && ligne[i + 1] === '"') { courant += '"'; i++; }
        else if (c === '"') entreGuillemets = false;
        else courant += c;
      } else if (c === '"') {
        entreGuillemets = true;
      } else if (c === sep) {
        champs.push(courant); courant = '';
      } else {
        courant += c;
      }
    }
    champs.push(courant);
    return champs.map((x) => x.trim());
  }

  const entetes = decouper(lignes[0]).map((e) => e.toLowerCase());
  return {
    entetes,
    lignes: lignes.slice(1).map((l) => {
      const champs = decouper(l);
      const objet = {};
      entetes.forEach((e, i) => { objet[e] = champs[i] ?? ''; });
      return objet;
    }),
  };
}

// Mappe des en-tetes libres vers les champs prospect connus.
const ALIAS = {
  email: ['email', 'e-mail', 'mail', 'courriel'],
  nom: ['nom', 'lastname', 'last_name'],
  prenom: ['prenom', 'prénom', 'firstname', 'first_name'],
  entreprise: ['entreprise', 'societe', 'société', 'company', 'agence', 'name', 'raison_sociale'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone'],
  site_web: ['site_web', 'site', 'website', 'url'],
  code_postal: ['code_postal', 'cp', 'zip', 'postal_code'],
};

export function versProspects(lignesBrutes) {
  return lignesBrutes.map((brut) => {
    const p = { donnees: {} };
    for (const [champ, alias] of Object.entries(ALIAS)) {
      const cle = alias.find((a) => a in brut && brut[a] !== '');
      if (cle) p[champ] = brut[cle];
    }
    for (const [cle, valeur] of Object.entries(brut)) {
      if (!Object.values(ALIAS).flat().includes(cle) && valeur !== '') {
        p.donnees[cle] = valeur;
      }
    }
    return p;
  }).filter((p) => p.email);
}
```

- [ ] **Step 2 : Écrire `src/pages/Partenariats.jsx`**

Même enrobage layout que les autres pages (cf. Task 8 Step 1). Deux onglets
internes (`prospects` / `campagnes`) gérés par un `useState`, pas par le routeur.

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Users, Mail, Send, RefreshCw } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { partenariatsService } from '../services/partenariats.service';
import { parseCsv, versProspects } from '../utils/csv';

const STATUTS = ['nouveau', 'contacte', 'relance', 'repondu', 'partenaire', 'refus', 'desinscrit'];
const TYPES = ['agence', 'diagnostiqueur', 'autre'];

export default function Partenariats() {
  const { currentApp } = useApp();
  const [onglet, setOnglet] = useState('prospects');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-baikal-text">Partenariats</h1>
        <div className="flex gap-2">
          {[['prospects', 'Prospects', Users], ['campagnes', 'Campagnes', Mail]].map(([id, label, Icone]) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={`px-3 py-1 rounded border flex items-center gap-2 ${onglet === id
                ? 'border-baikal-cyan text-baikal-cyan'
                : 'border-baikal-border text-baikal-text'}`}
            >
              <Icone className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      {onglet === 'prospects'
        ? <Prospects appId={currentApp} />
        : <Campagnes appId={currentApp} />}
    </div>
  );
}

function Prospects({ appId }) {
  const [prospects, setProspects] = useState([]);
  const [total, setTotal] = useState(0);
  const [filtres, setFiltres] = useState({ type: '', statut: '', recherche: '' });
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const fichierRef = useRef(null);

  const charger = useCallback(async () => {
    const { data, error } = await partenariatsService.listProspects(appId, {
      type: filtres.type || undefined,
      statut: filtres.statut || undefined,
      recherche: filtres.recherche || undefined,
      limit: 100,
    });
    if (error) { setMessage(error.message); return; }
    setProspects(data.prospects);
    setTotal(data.total);
  }, [appId, filtres]);

  useEffect(() => { charger(); }, [charger]);

  async function importerCsv(event) {
    const fichier = event.target.files?.[0];
    if (!fichier) return;
    setOccupe(true);
    const texte = await fichier.text();
    const lignes = versProspects(parseCsv(texte).lignes);
    const { data, error } = await partenariatsService.importCsv(appId, 'agence', lignes);
    setMessage(error
      ? error.message
      : `Import : ${data.inseres} insérés, ${data.doublons} doublons ignorés (${data.recus} lignes lues).`);
    setOccupe(false);
    event.target.value = '';
    charger();
  }

  async function importerDiagnostiqueurs() {
    const departement = window.prompt('Département (vide = tous) :') ?? '';
    setOccupe(true);
    const { data, error } = await partenariatsService.importDiagnostiqueurs(
      appId, departement.trim() || undefined);
    setMessage(error
      ? error.message
      : `Import : ${data.inseres} insérés, ${data.doublons} doublons (${data.lus} certifiés lus, ${data.avecEmail} avec email).`);
    setOccupe(false);
    charger();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="Rechercher…"
          className="bg-baikal-bg border border-baikal-border rounded px-3 py-1 text-baikal-text"
          value={filtres.recherche}
          onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
        />
        <select
          className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
          value={filtres.type}
          onChange={(e) => setFiltres({ ...filtres, type: e.target.value })}
        >
          <option value="">Tous types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
          value={filtres.statut}
          onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })}
        >
          <option value="">Tous statuts</option>
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-sm text-baikal-text opacity-70">{total} prospects</span>
        <div className="flex-1" />
        <button
          onClick={() => fichierRef.current?.click()}
          disabled={occupe}
          className="px-3 py-1 rounded border border-baikal-border text-baikal-text flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Import CSV agences
        </button>
        <input ref={fichierRef} type="file" accept=".csv" className="hidden" onChange={importerCsv} />
        <button
          onClick={importerDiagnostiqueurs}
          disabled={occupe}
          className="px-3 py-1 rounded border border-baikal-border text-baikal-text flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Import diagnostiqueurs
        </button>
      </div>

      {message && <p className="text-baikal-cyan text-sm">{message}</p>}

      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="border-b border-baikal-border text-left opacity-70">
            <th className="py-2">Email</th><th>Nom</th><th>Entreprise</th>
            <th>Type</th><th>CP</th><th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((p) => (
            <tr key={p.id} className="border-b border-baikal-border">
              <td className="py-2">{p.email}</td>
              <td>{[p.prenom, p.nom].filter(Boolean).join(' ')}</td>
              <td>{p.entreprise}</td>
              <td>{p.type}</td>
              <td>{p.code_postal}</td>
              <td>
                <select
                  className="bg-baikal-bg border border-baikal-border rounded px-1"
                  value={p.statut}
                  onChange={async (e) => {
                    await partenariatsService.saveProspect(appId, { ...p, statut: e.target.value });
                    charger();
                  }}
                >
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Campagnes({ appId }) {
  const [campagnes, setCampagnes] = useState([]);
  const [edition, setEdition] = useState(null); // campagne en cours d'edition
  const [apercu, setApercu] = useState(null);   // nb de destinataires du segment
  const [stats, setStats] = useState({});       // campagneId -> stats
  const [message, setMessage] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await partenariatsService.listCampagnes(appId);
    if (error) { setMessage(error.message); return; }
    setCampagnes(data);
    for (const c of data.filter((x) => x.statut === 'envoyee')) {
      partenariatsService.campaignStats(appId, c.id).then(({ data: s }) => {
        if (s) setStats((prev) => ({ ...prev, [c.id]: s }));
      });
    }
  }, [appId]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!edition) { setApercu(null); return; }
    partenariatsService.previewSegment(appId, edition.segment ?? {})
      .then(({ data }) => setApercu(data?.destinataires ?? null));
  }, [appId, edition?.segment?.type, edition?.segment?.statut, edition?.segment?.departement]);

  async function sauvegarder() {
    setOccupe(true);
    const { data, error } = await partenariatsService.saveCampagne(appId, edition);
    setOccupe(false);
    if (error) { setMessage(error.message); return; }
    setEdition(data);
    setMessage('Campagne enregistrée.');
    charger();
  }

  async function envoyerTest() {
    const email = window.prompt('Envoyer le test à :');
    if (!email) return;
    setOccupe(true);
    const { error } = await partenariatsService.sendTest(appId, edition.id, email);
    setOccupe(false);
    setMessage(error ? error.message : `Test envoyé à ${email}.`);
  }

  async function envoyer() {
    if (!window.confirm(`Envoyer à ${apercu ?? '?'} destinataires ? Cette action est définitive.`)) return;
    setOccupe(true);
    const { data, error } = await partenariatsService.sendCampaign(appId, edition.id);
    setOccupe(false);
    setMessage(error
      ? error.message
      : `Envoyé : ${data.envoyes} ok, ${data.erreurs} erreurs, ${data.dejaTraites} déjà traités.`);
    setEdition(null);
    charger();
  }

  if (edition) {
    const segment = edition.segment ?? {};
    return (
      <div className="space-y-4 max-w-3xl">
        {message && <p className="text-baikal-cyan text-sm">{message}</p>}
        <input
          className="w-full bg-baikal-bg border border-baikal-border rounded px-3 py-2 text-baikal-text"
          placeholder="Nom de la campagne"
          value={edition.nom ?? ''}
          onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
        />
        <input
          className="w-full bg-baikal-bg border border-baikal-border rounded px-3 py-2 text-baikal-text"
          placeholder="Objet de l'email"
          value={edition.objet ?? ''}
          onChange={(e) => setEdition({ ...edition, objet: e.target.value })}
        />
        <textarea
          className="w-full h-64 bg-baikal-bg border border-baikal-border rounded px-3 py-2 text-baikal-text font-mono text-sm"
          placeholder="Corps HTML. Variables : {{prenom}} {{nom}} {{entreprise}}"
          value={edition.corps_html ?? ''}
          onChange={(e) => setEdition({ ...edition, corps_html: e.target.value })}
        />
        <div className="flex gap-2 items-center">
          <select
            className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
            value={segment.type ?? ''}
            onChange={(e) => setEdition({ ...edition, segment: { ...segment, type: e.target.value || undefined } })}
          >
            <option value="">Tous types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            className="bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
            value={segment.statut ?? ''}
            onChange={(e) => setEdition({ ...edition, segment: { ...segment, statut: e.target.value || undefined } })}
          >
            <option value="">Tous statuts</option>
            {STATUTS.filter((s) => s !== 'desinscrit').map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            className="w-24 bg-baikal-bg border border-baikal-border rounded px-2 py-1 text-baikal-text"
            placeholder="Dépt"
            value={segment.departement ?? ''}
            onChange={(e) => setEdition({ ...edition, segment: { ...segment, departement: e.target.value || undefined } })}
          />
          <span className="text-sm text-baikal-text opacity-70">
            {apercu === null ? '…' : `${apercu} destinataires`}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEdition(null)} className="px-3 py-1 rounded border border-baikal-border text-baikal-text">Retour</button>
          <button onClick={sauvegarder} disabled={occupe} className="px-3 py-1 rounded border border-baikal-cyan text-baikal-cyan">Enregistrer</button>
          {edition.id && edition.statut === 'brouillon' && (
            <>
              <button onClick={envoyerTest} disabled={occupe} className="px-3 py-1 rounded border border-baikal-border text-baikal-text">Envoyer un test</button>
              <button onClick={envoyer} disabled={occupe} className="px-3 py-1 rounded border border-red-400 text-red-400 flex items-center gap-2">
                <Send className="w-4 h-4" /> Envoyer la campagne
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && <p className="text-baikal-cyan text-sm">{message}</p>}
      <button
        onClick={() => setEdition({ nom: '', objet: '', corps_html: '', segment: {}, statut: 'brouillon' })}
        className="px-3 py-1 rounded border border-baikal-cyan text-baikal-cyan"
      >
        Nouvelle campagne
      </button>
      <table className="w-full text-sm text-baikal-text">
        <thead>
          <tr className="border-b border-baikal-border text-left opacity-70">
            <th className="py-2">Nom</th><th>Statut</th><th>Envoyée le</th><th>Résultats</th><th></th>
          </tr>
        </thead>
        <tbody>
          {campagnes.map((c) => (
            <tr key={c.id} className="border-b border-baikal-border">
              <td className="py-2">{c.nom}</td>
              <td>{c.statut}</td>
              <td>{c.envoyee_le ? new Date(c.envoyee_le).toLocaleDateString('fr-FR') : ''}</td>
              <td>
                {stats[c.id]
                  ? Object.entries(stats[c.id]).map(([k, v]) => `${k}: ${v}`).join(', ')
                  : ''}
              </td>
              <td>
                <button onClick={() => setEdition(c)} className="text-baikal-cyan">
                  {c.statut === 'brouillon' ? 'Éditer' : 'Voir'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3 : Câbler la route et la navigation** — comme Task 8 :
route `/partenariats` sous `AdminRoute`, entrée de nav
`{ id: 'partenariats', label: 'Partenariats', icon: Mail }`.

- [ ] **Step 4 : Vérifier** — `npm run build` ; puis en dev : import d'un petit
CSV de test (3 lignes dont 1 doublon), import diagnostiqueurs sur un département,
création d'une campagne, `preview-segment` cohérent, envoi d'un test vers ta
propre adresse.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/Partenariats.jsx src/utils/csv.js src/App.jsx
git commit -m "feat(admin): page Partenariats, prospects, imports et campagnes"
```

(ajouter au pathspec le fichier de navigation modifié au Step 3)

---

### Task 10 : Vérification de bout en bout et checklist des gestes d'Eric

**Files :** aucun nouveau.

- [ ] **Step 1 : Build et checks complets**

```bash
npm run build
deno check supabase/functions/admin-seo/index.ts supabase/functions/admin-partenariats/index.ts supabase/functions/admin-desinscription/index.ts
```

- [ ] **Step 2 : Smoke test complet en conditions réelles** (nécessite les secrets) :
connexion super_admin → sélecteur de site sur MonsieurDPE → page SEO affiche des
chiffres non nuls → vue tous sites → page Partenariats → import diagnostiqueurs
d'un département → campagne de test vers sa propre adresse → lien de
désinscription fonctionnel → le prospect passe `desinscrit` → il disparaît du
`preview-segment`.

- [ ] **Step 3 : Vérifier la checklist des gestes manuels** (bloquants, à faire par
Eric, dans l'ordre) :

1. Search Console : propriété `monsieurdpe.fr` déclarée, accessible au compte
   Google qui a émis le refresh token de Pack Vendeur.
2. Secrets à poser dans le projet Supabase de Baikal :
   `GOOGLE_GSC_OAUTH_CLIENT_ID`, `GOOGLE_GSC_OAUTH_CLIENT_SECRET`,
   `GOOGLE_GSC_OAUTH_REFRESH_TOKEN` (copiés de Pack Vendeur),
   `ADMIN_ENV_MONSIEURDPE_KEY` (clé service du projet MonsieurDPE),
   `ADMIN_RESEND_API_KEY`, `ADMIN_UNSUBSCRIBE_SECRET` (aléatoire).
3. Resend : domaine `monsieurdpe.fr` vérifié (SPF + DKIM), expéditeur
   `eric@monsieurdpe.fr`.
4. Export CSV des agences depuis la base Pack Vendeur (colonnes minimales :
   email, entreprise ; bonus : nom, prenom, telephone, code_postal).

- [ ] **Step 4 : Commit final de la doc** — mettre à jour le `CLAUDE.md` de Baikal :
section courte « Modules admin multi-sites » (registre `config.apps`, schéma
`admin`, les 3 EFs, les secrets attendus). Commit par pathspec.

```bash
git add CLAUDE.md
git commit -m "docs: modules admin multi-sites (SEO, partenariats)"
```
