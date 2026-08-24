# Hub Baikal — UI console : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sélecteur de site global dans un layout console partagé, onglets contextuels au site, page Utilisateurs filtrée par site (fin de la fuite inter-produits).

**Architecture:** Spec : `docs/superpowers/specs/2026-08-24-hub-baikal-ui-console-design.md`. Un `ConsoleLayout` monte `AppProvider` une fois et porte header + sélecteur + navigation ; les pages gardent leur contenu. Les onglets internes d'`Admin.jsx` deviennent des URL (`/admin?tab=…`). RPC users paramétrées par `app_id` (drop + recreate pour éviter l'ambiguïté d'overload PostgREST).

**Tech Stack:** React 18 + Vite (JSX), TailwindCSS (thème baikal-*), react-router 6, Supabase (RPC SECURITY DEFINER), MCP pour la migration.

**Faits vérifiés :**
- `AppContext`/`AppSelector` existent, persistance `localStorage['baikal-app']` partagée ; `Seo.jsx`, `Partenariats.jsx`, `Dashboard.jsx` montent chacun leur `AppProvider` (`defaultApp="audit"`, id invalide → retombe sur la 1re app = majordhome).
- Headers dupliqués « BAIKAL_CONSOLE » : `Admin.jsx:193-278`, `Seo.jsx:~216`, `Partenariats.jsx:~391`, `Sites.jsx:~170`, `Users.jsx` (à vérifier en exécution).
- `public.get_pending_users()` + `core.get_pending_users()` : filtre `org_id IS NULL` sans app. `public.get_users_for_admin(uuid,text,int,int)` + `core.…` : idem.
- Working tree : chantier « suppression de compte + auth + logs » non commité (voir Task 0).

---

### Task 0: Commits préalables du travail en cours

- [x] **Step 0.1: Relire les diffs** (`git diff` sur CLAUDE.md, OnboardingGuard, AuthContext, Login, App.jsx, Dashboard.jsx, projects.service.js, baikal-retrieval, meeting-transcribe) pour confirmer la répartition en 3 lots. Si un diff révèle un couplage différent, adapter les lots — règle : chaque commit cohérent seul.

- [x] **Step 0.2: Commit lot 1 — suppression de compte**

```bash
git add supabase/functions/delete-user src/features/users/components/DeleteUserModal.jsx src/features/users/components/UserRow.jsx src/features/users/components/CreateUserModal.jsx src/features/users/components/index.js src/services/users.service.js src/pages/admin/Users.jsx deno.lock
git commit -m "feat(users): suppression definitive de compte (EF delete-user + modal)"
```

- [x] **Step 0.3: Commit lot 2 — auth et déverrouillage multi-app**

```bash
git add src/components/OnboardingGuard.jsx src/contexts/AuthContext.jsx src/pages/Login.jsx src/App.jsx src/pages/Dashboard.jsx src/services/projects.service.js CLAUDE.md
git commit -m "refactor(auth): simplification guards/login, retrait du verrou app_id=arpet des projets"
```

- [x] **Step 0.4: Commit lot 3 — logs retrieval et cloture migration**

```bash
git add supabase/functions/baikal-retrieval supabase/functions/meeting-transcribe supabase/migrations/20260612_rag_query_logs.sql supabase/migrations/20260824090000_cloture_migration_majordhome_packvendeur.sql
git commit -m "feat(retrieval): journalisation rag_query_logs; meeting-transcribe ajustements"
```

- [x] **Step 0.5: Vérifier** `git status` : plus aucun fichier modifié non commité hors `.claude/` éventuel.

---

### Task 1: `ConsoleLayout`

**Files:**
- Create: `src/components/console/ConsoleLayout.jsx`

- [x] **Step 1.1: Créer le composant** (code complet) :

```jsx
/**
 * ConsoleLayout.jsx - Baikal Console
 * ============================================================================
 * Layout commun de la console multi-sites : header sticky BAIKAL_CONSOLE,
 * selecteur de site global (AppProvider monte ici, une seule fois),
 * navigation contextuelle (modules du site + modules transverses).
 *
 * Usage : <ConsoleLayout actif="seo">…contenu…</ConsoleLayout>
 * `actif` ∈ dashboard|knowledge|prompts|indexation|seo|partenariats|users|sites
 * `badges` optionnel : { knowledge: 3 } affiche un badge sur l'onglet.
 * ============================================================================
 */
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, BookOpen, MessageSquareCode, Database,
    TrendingUp, Mail, Users, Globe, Shield, Settings, LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AppProvider, useApp } from '../../contexts/AppContext';
import AppSelector from '../AppSelector';
import { ProfileSwitcher } from '../admin';
import supabase from '../../lib/supabaseClient';

// Modules propres au site selectionne (ARPET est le seul a en avoir).
const MODULES_SITE = {
    arpet: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, route: '/admin' },
        { id: 'knowledge', label: 'Connaissances', icon: BookOpen, route: '/admin?tab=knowledge' },
        { id: 'prompts', label: 'Prompts', icon: MessageSquareCode, route: '/admin?tab=prompts', superAdmin: true },
        { id: 'indexation', label: 'Indexation', icon: Database, route: '/admin?tab=indexation', superAdmin: true },
    ],
};

// Modules transverses, quel que soit le site.
const MODULES_TRANSVERSES = [
    { id: 'seo', label: 'SEO', icon: TrendingUp, route: '/seo' },
    { id: 'partenariats', label: 'Partenariats', icon: Mail, route: '/partenariats' },
    { id: 'users', label: 'Utilisateurs', icon: Users, route: '/admin/users' },
    { id: 'sites', label: 'Sites', icon: Globe, route: '/sites', superAdmin: true },
];

function Onglet({ tab, actif, badge, onClick }) {
    const Icon = tab.icon;
    const isActive = actif === tab.id;
    return (
        <button
            onClick={onClick}
            className={`relative flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive
                    ? 'border-baikal-cyan text-baikal-cyan'
                    : 'border-transparent text-baikal-text hover:text-white hover:border-baikal-border'}`}
        >
            <Icon className="w-4 h-4" />
            {tab.label}
            {badge ? (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-md font-mono">
                    {badge}
                </span>
            ) : null}
        </button>
    );
}

function LayoutInterne({ actif, badges = {}, children }) {
    const navigate = useNavigate();
    const { profile, isSuperAdmin, isImpersonating, signOut } = useAuth();
    const { currentApp, setCurrentApp, availableApps } = useApp();

    const modulesSite = (MODULES_SITE[currentApp] || [])
        .filter((t) => !t.superAdmin || isSuperAdmin);
    const transverses = MODULES_TRANSVERSES
        .filter((t) => !t.superAdmin || isSuperAdmin);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-baikal-bg">
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-baikal-cyan rounded-md flex items-center justify-center">
                                <Shield className="w-5 h-5 text-black" />
                            </div>
                            <h1 className="text-lg font-mono font-bold text-white hidden md:block">
                                BAIKAL_CONSOLE
                            </h1>
                            {/* Selecteur de site global */}
                            <AppSelector
                                currentApp={currentApp}
                                onAppChange={setCurrentApp}
                                apps={availableApps}
                                showLabel={false}
                                className="w-56"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            {isSuperAdmin && !isImpersonating && <ProfileSwitcher />}
                            {isImpersonating && (
                                <div className="px-3 py-1.5 bg-amber-900/20 text-amber-300 border border-amber-500/50 rounded-md text-sm font-mono">
                                    👤 {profile?.full_name || profile?.email}
                                </div>
                            )}
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan rounded-md text-sm font-mono">
                                <Shield className="w-4 h-4" />
                                {isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN'}
                            </div>
                            <button
                                onClick={() => navigate('/settings')}
                                className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleSignOut}
                                className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="bg-baikal-surface border-b border-baikal-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 -mb-px overflow-x-auto items-center">
                        {modulesSite.map((tab) => (
                            <Onglet key={tab.id} tab={tab} actif={actif}
                                badge={badges[tab.id]}
                                onClick={() => navigate(tab.route)} />
                        ))}
                        {modulesSite.length > 0 && (
                            <span className="mx-2 h-6 w-px bg-baikal-border" aria-hidden="true" />
                        )}
                        {transverses.map((tab) => (
                            <Onglet key={tab.id} tab={tab} actif={actif}
                                badge={badges[tab.id]}
                                onClick={() => navigate(tab.route)} />
                        ))}
                    </nav>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
}

export default function ConsoleLayout({ actif, badges, children }) {
    return (
        <AppProvider supabaseClient={supabase} defaultApp="arpet">
            <LayoutInterne actif={actif} badges={badges}>
                {children}
            </LayoutInterne>
        </AppProvider>
    );
}
```

Vérifier en exécution : le chemin d'import de `supabase` (`../../lib/supabaseClient`) et l'export de `ProfileSwitcher` depuis `../admin` (index des composants admin).

- [x] **Step 1.2: Build** — `npm run build` → OK (composant pas encore consommé).

- [x] **Step 1.3: Commit** — `git add src/components/console/ConsoleLayout.jsx && git commit -m "feat(console): ConsoleLayout partage (header, selecteur de site global, nav contextuelle)"`

---

### Task 2: Refonte `Admin.jsx`

**Files:**
- Modify: `src/pages/Admin.jsx`

- [x] **Step 2.1: Onglet piloté par l'URL** — remplacer `useState('dashboard')` par `useSearchParams` : `const tab = searchParams.get('tab') || 'dashboard'`. Supprimer `getTabs`, `handleTabClick`, le header (l.193-244), la nav (l.247-278) et l'enrobage `<div className="min-h-screen …">` : le contenu (erreur, loader, blocs par onglet) est rendu dans `<ConsoleLayout actif={tab} badges={{ knowledge: pendingCount || undefined }}>`.

- [x] **Step 2.2: Cas site ≠ ARPET** — dans le contenu, si `currentApp !== 'arpet'` (via `useApp`, disponible sous le layout), afficher à la place des onglets ARPET une carte sobre du site :

```jsx
function CarteSite() {
    const { getActiveApp } = useApp();
    const app = getActiveApp();
    if (!app) return null;
    return (
        <div className="max-w-xl mx-auto bg-baikal-surface border border-baikal-border rounded-lg p-6 space-y-3">
            <h2 className="text-xl font-semibold text-white">{app.name}</h2>
            {app.description && <p className="text-baikal-text">{app.description}</p>}
            <dl className="text-sm text-baikal-text space-y-1 font-mono">
                {app.domaine && <div><dt className="inline text-baikal-cyan">domaine </dt><dd className="inline">{app.domaine}</dd></div>}
                {app.db_schema && <div><dt className="inline text-baikal-cyan">schema </dt><dd className="inline">{app.db_schema}</dd></div>}
                <div><dt className="inline text-baikal-cyan">hebergement </dt><dd className="inline">{app.db_ro_secret_ref ? 'base dediee' : 'base partagee'}</dd></div>
            </dl>
            <p className="text-sm text-baikal-text">
                Pas de module dedie pour ce site. Modules transverses : SEO, Partenariats, Utilisateurs.
            </p>
        </div>
    );
}
```

Prérequis : ajouter `domaine, db_schema, db_ro_secret_ref` au `select` de `AppContext.jsx` (l.96) et d'`AppSelector.jsx` (l.74).

- [x] **Step 2.3: Build + vérif manuelle** (`npm run dev`) : `/admin` affiche Dashboard ARPET par défaut ; `?tab=knowledge` marche ; sélection d'un autre site → carte du site, onglets ARPET absents.

- [x] **Step 2.4: Commit** — `git add src/pages/Admin.jsx src/contexts/AppContext.jsx src/components/AppSelector.jsx && git commit -m "feat(console): /admin sous ConsoleLayout, onglets URL, carte site hors ARPET"`

---

### Task 3: `Seo.jsx`, `Partenariats.jsx`, `Sites.jsx` sous le layout

**Files:**
- Modify: `src/pages/Seo.jsx` (wrapper l.~200-267), `src/pages/Partenariats.jsx` (l.~380-442), `src/pages/Sites.jsx` (l.~150-fin)

- [x] **Step 3.1: Pour chaque page** : supprimer le header/nav local dupliqué et le wrapper `AppProvider` ; le composant exporté devient :

```jsx
export default function Seo() {
    return (
        <ConsoleLayout actif="seo">
            <SeoContent />
        </ConsoleLayout>
    );
}
```

(idem `partenariats`, `sites` avec leur `actif`). Les `useApp()` internes des contenus fonctionnent tels quels (provider fourni par le layout). Supprimer les imports devenus inutiles (AppProvider, AppSelector, icônes du header). `Sites.jsx` n'utilise pas `currentApp` : rien d'autre à changer.

- [x] **Step 3.2: Build + vérif** : la sélection de site faite sur `/seo` est conservée en arrivant sur `/partenariats` et `/admin`.

- [x] **Step 3.3: Commit** — `git add src/pages/Seo.jsx src/pages/Partenariats.jsx src/pages/Sites.jsx && git commit -m "refactor(console): Seo/Partenariats/Sites sous ConsoleLayout, fin des headers dupliques"`

---

### Task 4: Utilisateurs par site

**Files:**
- Create: `supabase/migrations/20260824190000_users_par_app.sql`
- Modify: `src/services/users.service.js`, `src/pages/admin/Users.jsx`

- [x] **Step 4.1: Migration SQL** (fichier + `apply_migration` name `users_par_app` sur `odspcxgafcqxjzrarsqf`). Drop + recreate pour éviter deux overloads ambigus côté PostgREST :

```sql
-- Filtrage par app des RPC d'administration des utilisateurs (spec UI console).
DROP FUNCTION IF EXISTS public.get_pending_users();
DROP FUNCTION IF EXISTS core.get_pending_users();
DROP FUNCTION IF EXISTS public.get_users_for_admin(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS core.get_users_for_admin(uuid, text, integer, integer);

CREATE FUNCTION core.get_pending_users(p_app_id text DEFAULT NULL)
RETURNS TABLE(id uuid, email text, full_name text, app_role text,
              business_role text, app_id text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'core', 'public'
AS $$
BEGIN
    IF NOT core.is_super_admin() THEN
        RAISE EXCEPTION 'Accès réservé aux super administrateurs';
    END IF;
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           p.app_id, p.created_at
    FROM core.profiles p
    WHERE p.org_id IS NULL
      AND p.app_role != 'super_admin'
      AND (p_app_id IS NULL OR p.app_id = p_app_id)
    ORDER BY p.created_at DESC;
END;
$$;

CREATE FUNCTION public.get_pending_users(p_app_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'core', 'pg_temp'
AS $$
BEGIN
    RETURN (SELECT jsonb_agg(row_to_json(r))
            FROM core.get_pending_users(p_app_id) AS r);
END;
$$;

CREATE FUNCTION core.get_users_for_admin(
    p_org_id uuid DEFAULT NULL, p_search text DEFAULT NULL,
    p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
    p_app_id text DEFAULT NULL)
RETURNS TABLE(id uuid, email text, full_name text, app_role text,
              business_role text, org_id uuid, org_name text, app_id text,
              created_at timestamptz, updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'core', 'public'
AS $$
DECLARE
    v_current_user_org_id uuid;
    v_is_super_admin boolean;
    v_total bigint;
BEGIN
    v_is_super_admin := core.is_super_admin();
    SELECT p.org_id INTO v_current_user_org_id
    FROM core.profiles p WHERE p.id = auth.uid();
    IF NOT v_is_super_admin AND NOT core.is_org_admin(v_current_user_org_id) THEN
        RAISE EXCEPTION 'Droits insuffisants';
    END IF;
    SELECT count(*) INTO v_total
    FROM core.profiles p
    WHERE (v_is_super_admin OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL OR p.app_id = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%');
    RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.app_role, p.business_role,
           p.org_id, o.name, p.app_id, p.created_at, p.updated_at, v_total
    FROM core.profiles p
    LEFT JOIN core.organizations o ON p.org_id = o.id
    WHERE (v_is_super_admin OR p.org_id = v_current_user_org_id)
      AND (p_org_id IS NULL OR p.org_id = p_org_id)
      AND (p_app_id IS NULL OR p.app_id = p_app_id)
      AND (p_search IS NULL OR p.email ILIKE '%' || p_search || '%'
           OR p.full_name ILIKE '%' || p_search || '%')
    ORDER BY p.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE FUNCTION public.get_users_for_admin(
    p_org_id uuid DEFAULT NULL, p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100, p_offset integer DEFAULT 0,
    p_app_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'core', 'pg_temp'
AS $$
BEGIN
    RETURN (SELECT jsonb_agg(row_to_json(r))
            FROM core.get_users_for_admin(p_org_id, p_search, p_limit,
                                          p_offset, p_app_id) AS r);
END;
$$;
```

Vérifier avant : `EXECUTE` de ces fonctions par `anon`/`PUBLIC` (piège connu : révoquer sur PUBLIC si les anciennes l'étaient — relever l'ACL des anciennes avant le drop et répliquer).

- [x] **Step 4.2: Service** — `getPendingUsers(appId = null)` passe `{ p_app_id: appId }` ; `getUsersForAdmin({ orgId, search, limit, offset, appId = null })` ajoute `p_app_id: appId`.

- [x] **Step 4.3: Page Users** — envelopper dans `<ConsoleLayout actif="users">` (supprimer header local), lire `const { currentApp } = useApp()` dans le contenu, passer `currentApp` aux deux appels, `currentApp` dans les deps des `useEffect` de chargement. Colonne/badge « site » optionnelle : afficher `app_id` dans la liste En attente (les profils d'autres sites n'y apparaissent plus, mais le badge confirme).

- [x] **Step 4.4: Vérif données** — SQL : `SELECT app_id, count(*) FROM core.profiles WHERE org_id IS NULL AND app_role != 'super_admin' GROUP BY 1;` → noter les comptes attendus par site (le client voirie doit sortir de la vue ARPET).

- [x] **Step 4.5: Build + commit** — `git add supabase/migrations/20260824190000_users_par_app.sql src/services/users.service.js src/pages/admin/Users.jsx && git commit -m "feat(users): filtrage par site selectionne (RPC p_app_id), fin de la fuite inter-produits"`

---

### Task 5: Vérification finale et documentation

- [x] **Step 5.1:** `npm run build` — zéro erreur.
- [x] **Step 5.2:** Parcours manuel (dev server) : navigation contextuelle, persistance de la sélection, Users filtré. Ce qui ne peut être validé que par Eric (session super_admin réelle) : listé dans le bilan.
- [x] **Step 5.3:** `.claude/proposed-updates.md` : entrée PENDING (ConsoleLayout, onglets URL, RPC users par app). Mémoire `hub-baikal-objectif` mise à jour.
- [x] **Step 5.4:** Commit final docs + plan coché.

## Hors périmètre (rappel)

Organizations/Projets/Invitations, accueil portefeuille, modules dédiés non-ARPET, push/déploiement Vercel (Eric pousse quand il veut).
