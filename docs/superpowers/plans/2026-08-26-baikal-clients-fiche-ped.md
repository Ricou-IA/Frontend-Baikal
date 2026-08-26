# Fiche PED complète (lots 2+3) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter la fiche client de `/clients` pour Pré-état-daté : actions d'administration (renvoyer un email, re-extraire, purger les documents) et onglets d'extension (Documents, Résultat, Chat, Logs IA, Données/cohérence), pour que le `/admin` local de PED puisse disparaître.

**Architecture:** Une seule porte vers le site : l'Edge Function `pv-admin-dossiers` du projet PED (elle sait déjà tout faire : `detail` avec URLs signées du storage — que `baikal_reader` ne peut PAS générer —, `re-extract`, `resend-email`). Baikal la joint par un canal inter-services : `env_url` + nom d'EF + anon key publique du site (pour passer le gateway `verify_jwt`) + secret partagé dans l'en-tête `X-Baikal-Key`. L'EF `admin-dossiers` de Baikal relaie après contrôle des droits (purge réservée au super_admin — spec §10.2) ; le front branche les onglets PED via le registre `EXTENSIONS_FICHE` prévu au lot 1. L'acceptation de `X-Baikal-Key` et l'action `purge-documents` côté PED sont un chantier du repo PED (prompt livré en fin de plan) ; tant qu'il n'est pas fait, l'interrupteur d'activation (`env_dossiers_fn`) reste NULL et Baikal n'affiche ni boutons ni onglets — livraison découplée.

**Tech Stack:** Edge Functions Deno (fetch inter-projets), React JSX, migrations via MCP `apply_migration`, secrets via `npx supabase secrets set`.

**Spec:** `docs/superpowers/specs/2026-08-26-baikal-clients-design.md` (§6 extensions, §7 écritures, §10.2 droit de purge)

## Global Constraints

- Projets : partagé Baikal = `odspcxgafcqxjzrarsqf` ; Pré-état-daté = `ycmavnmtyvodqawvwrrd` (org séparée).
- La valeur du secret partagé ne doit JAMAIS apparaître dans un commit, ce plan, ou le registre — générée à l'exécution, posée uniquement dans les Edge Function Secrets des deux projets. L'anon key PED est PUBLIQUE (présente dans le front PED) : elle peut vivre en clair dans `config.apps`.
- `purge-documents` est réservée au super_admin (spec §10.2) — vérifiée côté EF Baikal, pas seulement masquée dans l'UI.
- Textes d'UI en français AVEC accents ; commentaires de code ASCII sans accents ; pas de TypeScript dans `src/`.
- Messages de commit `feat(clients): …` / `fix(clients): …` terminés par `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Ne JAMAIS éditer CLAUDE.md sans accord explicite d'Eric.
- Forme de la réponse `detail` de `pv-admin-dossiers` (lue dans son code, référence pour le front) : `{dossier, share_url, pdf_signed_url, pro_account, documents[], ai_logs[], ai_total_cost_usd, events[], email_logs[], chat_logs[], signed_url_ttl_seconds}` ; `documents[]` porte `original_filename, normalized_filename, file_size_bytes, mime_type, page_count, document_type, ai_confidence, signed_url` ; `ai_logs[]` porte `model, model_used, prompt_type, input_tokens, output_tokens, total_tokens, cost_usd, latency_ms, error, created_at` ; `chat_logs[]` porte `page_path, question, answer, model, created_at`.
- Types d'email renvoyables (whitelist PED existante) : `magic-link-initial`, `post-purchase`, `review-request`, `cart-abandonment`, `expiration-reminder`.

---

### Task 1 : Registre relais + secrets des deux côtés

**Files:**
- Aucun fichier local : migration MCP + `npx supabase secrets set`. Pas de commit.

**Interfaces:**
- Produces: colonnes `config.apps.env_anon_key` (text, clair — clé publique) et `config.apps.env_dossiers_fn` (text, NULL = canal d'administration inactif) ; pour `pack-vendeur` : `env_anon_key` posée, `env_secret_ref = 'ADMIN_ENV_PACKVENDEUR_KEY'`, `env_dossiers_fn` laissée NULL (interrupteur activé en Task 6 après le chantier PED). Secret `ADMIN_ENV_PACKVENDEUR_KEY` posé dans les EF Secrets Baikal, même valeur sous `BAIKAL_ADMIN_KEY` dans les EF Secrets PED.

- [ ] **Step 1 : Migration registre**

`apply_migration` sur `odspcxgafcqxjzrarsqf`, nom `config_apps_relais_dossiers` :

```sql
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS env_anon_key text;
ALTER TABLE config.apps ADD COLUMN IF NOT EXISTS env_dossiers_fn text;
COMMENT ON COLUMN config.apps.env_anon_key IS
  'Cle anon PUBLIQUE du projet du site (presente dans son front) : sert a passer le gateway verify_jwt de ses Edge Functions. Jamais un secret ici.';
COMMENT ON COLUMN config.apps.env_dossiers_fn IS
  'Nom de l''Edge Function d''administration des dossiers du site (ex: pv-admin-dossiers). NULL = pas d''actions ni d''onglets etendus dans /clients.';

UPDATE config.apps SET
  env_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljbWF2bm10eXZvZHFhd3Z3cnJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTU0NjksImV4cCI6MjEwMDY3MTQ2OX0.HT0IyY_K9z38fxXnWjUV__GvIAWcUG4Jox4faCVffUc',
  env_secret_ref = 'ADMIN_ENV_PACKVENDEUR_KEY'
WHERE id = 'pack-vendeur';
-- env_dossiers_fn reste NULL : active en Task 6 quand PED accepte X-Baikal-Key.
```

- [ ] **Step 2 : Générer et poser le secret des deux côtés**

```bash
SECRET=$(openssl rand -hex 32) && \
npx supabase secrets set ADMIN_ENV_PACKVENDEUR_KEY="$SECRET" && \
npx supabase secrets set --project-ref ycmavnmtyvodqawvwrrd BAIKAL_ADMIN_KEY="$SECRET" && \
echo "secret pose des deux cotes"
```

Repli si la commande `--project-ref` échoue (org séparée non couverte par le login CLI) : écrire la valeur dans `C:\Users\epude\AppData\Local\Temp\claude\C--Dev-Frontend-Baikal\a670bdac-d781-4d49-939a-60d079f015b4\scratchpad\BAIKAL_ADMIN_KEY.txt`, poser quand même le côté Baikal, et signaler à Eric qu'il doit poser `BAIKAL_ADMIN_KEY` dans le dashboard PED (Settings → Edge Functions → Secrets) avec cette valeur, puis supprimer le fichier. Ne JAMAIS imprimer la valeur dans la conversation.

- [ ] **Step 3 : Vérifier**

```bash
npx supabase secrets list | grep ADMIN_ENV_PACKVENDEUR_KEY
```

Puis `execute_sql` sur `odspcxgafcqxjzrarsqf` : `SELECT id, env_anon_key IS NOT NULL AS anon, env_secret_ref, env_dossiers_fn FROM config.apps WHERE id='pack-vendeur';` — attendu : `anon=true`, `env_secret_ref='ADMIN_ENV_PACKVENDEUR_KEY'`, `env_dossiers_fn=NULL`.

---

### Task 2 : Extension du connecteur + module relais (TDD)

**Files:**
- Modify: `supabase/functions/_shared/sites.ts` (interface `Site` + select de `chargerSite`)
- Modify: `supabase/functions/_shared/sites.test.ts` (fixtures)
- Create: `supabase/functions/admin-dossiers/relais.ts`
- Test: `supabase/functions/admin-dossiers/relais.test.ts`

**Interfaces:**
- Produces:

```ts
// sites.ts — 2 champs ajoutes a l'interface Site (nullable) :
env_anon_key: string | null;
env_dossiers_fn: string | null;

// relais.ts :
export class ErreurRelais extends Error {}
export interface CibleRelais { url: string; headers: Record<string, string>; }
export function relaisConfigure(site: Site): boolean;          // les 4 champs presents
export function preparerRelais(site: Site): CibleRelais | null; // null si non configure ; ErreurRelais si secret env absent
```

- [ ] **Step 1 : Étendre `Site` et `chargerSite`**

Dans `supabase/functions/_shared/sites.ts`, ajouter à l'interface `Site` (après `env_secret_ref`) :

```ts
  env_anon_key: string | null;
  env_dossiers_fn: string | null;
```

et dans le `.select(...)` de `chargerSite`, remplacer la liste par :

```ts
      "id, name, is_active, domaine, db_schema, db_ro_secret_ref, env_url, env_secret_ref, env_anon_key, env_dossiers_fn",
```

Dans `supabase/functions/_shared/sites.test.ts`, compléter les deux fixtures (`siteLocal` puis `siteDedie` hérite par spread) en ajoutant à `siteLocal` :

```ts
  env_anon_key: null,
  env_dossiers_fn: null,
```

- [ ] **Step 2 : Écrire les tests du relais (qui échouent)**

```ts
// relais.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ErreurRelais, preparerRelais, relaisConfigure } from "./relais.ts";
import type { Site } from "../_shared/sites.ts";

const siteComplet: Site = {
  id: "pack-vendeur",
  name: "Pack Vendeur",
  is_active: true,
  domaine: null,
  db_schema: "pack_vendeur",
  db_ro_secret_ref: null,
  env_url: "https://exemple.supabase.co/",
  env_secret_ref: "RELAIS_TEST_CLE",
  env_anon_key: "anon-jwt",
  env_dossiers_fn: "pv-admin-dossiers",
};

Deno.test("relaisConfigure: vrai quand les 4 champs sont presents", () => {
  assertEquals(relaisConfigure(siteComplet), true);
});
Deno.test("relaisConfigure: faux si env_dossiers_fn manque", () => {
  assertEquals(relaisConfigure({ ...siteComplet, env_dossiers_fn: null }), false);
});
Deno.test("relaisConfigure: faux si env_url manque", () => {
  assertEquals(relaisConfigure({ ...siteComplet, env_url: null }), false);
});
Deno.test("preparerRelais: null quand non configure", () => {
  assertEquals(preparerRelais({ ...siteComplet, env_anon_key: null }), null);
});
Deno.test("preparerRelais: ErreurRelais si le secret n'est pas pose", () => {
  Deno.env.delete("RELAIS_TEST_CLE");
  assertThrows(() => preparerRelais(siteComplet), ErreurRelais, "RELAIS_TEST_CLE");
});
Deno.test("preparerRelais: cible complete, slash final rogne", () => {
  Deno.env.set("RELAIS_TEST_CLE", "s3cret");
  const cible = preparerRelais(siteComplet)!;
  assertEquals(cible.url, "https://exemple.supabase.co/functions/v1/pv-admin-dossiers");
  assertEquals(cible.headers["apikey"], "anon-jwt");
  assertEquals(cible.headers["Authorization"], "Bearer anon-jwt");
  assertEquals(cible.headers["X-Baikal-Key"], "s3cret");
  Deno.env.delete("RELAIS_TEST_CLE");
});
```

- [ ] **Step 3 : Vérifier qu'ils échouent**

Run: `deno test --allow-env supabase/functions/admin-dossiers/relais.test.ts`
Expected: FAIL (module `./relais.ts` introuvable).

- [ ] **Step 4 : Implémenter relais.ts**

```ts
// Canal d'administration inter-projets du module Clients : Baikal appelle
// l'Edge Function d'administration du site (pv-admin-dossiers chez PED).
// L'anon key PUBLIQUE du site passe le gateway verify_jwt ; l'autorisation
// reelle est le secret partage X-Baikal-Key, verifie cote site.
import type { Site } from "../_shared/sites.ts";

export class ErreurRelais extends Error {}

export interface CibleRelais {
  url: string;
  headers: Record<string, string>;
}

export function relaisConfigure(site: Site): boolean {
  return Boolean(
    site.env_url && site.env_dossiers_fn && site.env_secret_ref && site.env_anon_key,
  );
}

export function preparerRelais(site: Site): CibleRelais | null {
  if (!relaisConfigure(site)) return null;
  const cle = Deno.env.get(site.env_secret_ref!);
  if (!cle) {
    throw new ErreurRelais(
      `Secret ${site.env_secret_ref} absent des Edge Function Secrets`,
    );
  }
  return {
    url: `${site.env_url!.replace(/\/+$/, "")}/functions/v1/${site.env_dossiers_fn}`,
    headers: {
      "Content-Type": "application/json",
      "apikey": site.env_anon_key!,
      "Authorization": `Bearer ${site.env_anon_key}`,
      "X-Baikal-Key": cle,
    },
  };
}
```

- [ ] **Step 5 : Vérifier que tout passe (relais + sites + modules du lot 1)**

Run: `deno test --allow-env supabase/functions/admin-dossiers/ supabase/functions/_shared/sites.test.ts`
Expected: PASS (6 relais + 19 lot 1 + 6 sites = 31 tests).

- [ ] **Step 6 : Commit**

```bash
git add supabase/functions/_shared/sites.ts supabase/functions/_shared/sites.test.ts supabase/functions/admin-dossiers/relais.ts supabase/functions/admin-dossiers/relais.test.ts
git commit -m "feat(clients): canal relais vers l'EF d'administration du site

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : EF admin-dossiers — actions site-detail et site-action

**Files:**
- Modify: `supabase/functions/admin-dossiers/index.ts`

**Interfaces:**
- Consumes: `relaisConfigure`, `preparerRelais`, `ErreurRelais` (Task 2).
- Produces (contrat HTTP pour la Task 4) :
  - `{action:'site-detail', appId, dossierId}` → `{data: <réponse detail PED brute>, error:null}` ;
  - `{action:'site-action', appId, dossierId, actionSite, emailAction?}` avec `actionSite ∈ re-extract|resend-email|purge-documents` → `{data: <réponse PED brute>, error:null}` ; `purge-documents` exige `profiles.app_role = 'super_admin'` (403 sinon) ;
  - échec HTTP du site → `{data:null, error:"Site <id>: HTTP <status>", detail:<corps>}` en 502 ; site sans canal configuré → 400 explicite ;
  - les réponses `liste` et `fiche` existantes gagnent `actions: boolean` (= `relaisConfigure(site)`).

- [ ] **Step 1 : Ajouter les imports et le bloc relais**

Dans `index.ts`, ajouter à la fin des imports :

```ts
import { ErreurRelais, preparerRelais, relaisConfigure } from "./relais.ts";
```

Puis insérer ce bloc APRÈS `const site = await chargerSite(admin, appId);` et AVANT le chargement du funnel (le chemin relais n'ouvre jamais la connexion SQL) :

```ts
    // Chemin relais : actions et fiche etendue via l'EF d'administration du
    // site (spec §7). Pas de connexion SQL ici — tout part en HTTP.
    if (action === "site-detail" || action === "site-action") {
      const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
      if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
      const ACTIONS_SITE: Record<string, { superAdminSeul: boolean }> = {
        "detail": { superAdminSeul: false },
        "re-extract": { superAdminSeul: false },
        "resend-email": { superAdminSeul: false },
        "purge-documents": { superAdminSeul: true },
      };
      const actionSite = action === "site-detail" ? "detail" : String(body.actionSite ?? "");
      const def = ACTIONS_SITE[actionSite];
      if (!def || (action === "site-action" && actionSite === "detail")) {
        return json({ data: null, error: `Action site inconnue: ${actionSite}` }, 400);
      }
      if (def.superAdminSeul) {
        const { data: profil } = await caller
          .from("profiles").select("app_role").eq("id", user.id).single();
        if (profil?.app_role !== "super_admin") {
          return json({ data: null, error: "Action reservee au super_admin" }, 403);
        }
      }
      const cible = preparerRelais(site);
      if (!cible) {
        return json({ data: null, error: "Site sans canal d'administration configure" }, 400);
      }
      const corps: Record<string, unknown> = { action: actionSite, dossier_id: dossierId };
      if (actionSite === "resend-email") {
        corps.email_action = typeof body.emailAction === "string" ? body.emailAction : "";
      }
      const reponse = await fetch(cible.url, {
        method: "POST",
        headers: cible.headers,
        body: JSON.stringify(corps),
      });
      const texte = await reponse.text();
      let charge: unknown;
      try {
        charge = JSON.parse(texte);
      } catch {
        charge = { brut: texte.slice(0, 500) };
      }
      if (!reponse.ok) {
        return json(
          { data: null, error: `Site ${site.id}: HTTP ${reponse.status}`, detail: charge },
          502,
        );
      }
      return json({ data: charge, error: null });
    }
```

- [ ] **Step 2 : Exposer le flag `actions` dans liste et fiche**

Dans la réponse de `liste`, remplacer la ligne `data:` par :

```ts
          data: {
            disponible: true,
            dossiers,
            total,
            page: c.page,
            parPage: c.parPage,
            funnel,
            actions: relaisConfigure(site),
          },
```

et dans la réponse de `fiche`, ajouter après `funnel,` :

```ts
            actions: relaisConfigure(site),
```

- [ ] **Step 3 : Mapper ErreurRelais**

Dans le `catch` final, après la ligne `ErreurSite` :

```ts
    if (e instanceof ErreurRelais) return json({ data: null, error: e.message }, 500);
```

- [ ] **Step 4 : Tests + déploiement + smoke**

Run: `deno test --allow-env supabase/functions/admin-dossiers/` — Expected: PASS (25 tests).
Run: `npx supabase functions deploy admin-dossiers` — Expected: Deployed.
Run: `curl -s -o /dev/null -w "%{http_code}" -X POST https://odspcxgafcqxjzrarsqf.supabase.co/functions/v1/admin-dossiers` — Expected: `401`.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/admin-dossiers/index.ts
git commit -m "feat(clients): actions site-detail et site-action relayees vers l'EF du site

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : Front — service + FicheDossier (actions et chargement des extensions)

**Files:**
- Modify: `src/services/dossiers.service.js`
- Modify: `src/components/console/FicheDossier.jsx` (réécriture complète du fichier — code intégral ci-dessous)

**Interfaces:**
- Consumes: contrat HTTP Task 3 ; `EXTENSIONS_FICHE` reste `{ [appId]: [{id, label, Composant}] }`, chaque `Composant` reçoit désormais `{appId, dossierId, dossier, detail}` où `detail` est la réponse `site-detail` (ou `null` pendant le chargement) ; `useAuth().isSuperAdmin`.
- Produces: `dossiersService.getDetailSite(appId, dossierId)` et `dossiersService.executerActionSite(appId, dossierId, actionSite, params)` ; `TYPES_EMAIL_PED` exporté par `FicheDossier.jsx` n'existe pas — la liste des types vit dans le composant (constante locale `TYPES_EMAIL`).

- [ ] **Step 1 : Étendre le service**

Ajouter dans l'objet `dossiersService` de `src/services/dossiers.service.js` :

```js
  getDetailSite(appId, dossierId) {
    return appelerEdge('admin-dossiers', { action: 'site-detail', appId, dossierId });
  },
  executerActionSite(appId, dossierId, actionSite, params = {}) {
    return appelerEdge('admin-dossiers', { action: 'site-action', appId, dossierId, actionSite, ...params });
  },
```

- [ ] **Step 2 : Réécrire FicheDossier.jsx**

Remplacer intégralement le fichier par :

```jsx
/**
 * FicheDossier.jsx - Baikal Console
 * ============================================================================
 * Fiche detail d'un dossier client : socle generique (Vue / Emails / Events),
 * actions d'administration relayees vers l'EF du site (renvoyer un email,
 * re-extraire, purger les documents — super_admin seul), et onglets
 * d'extension par site (EXTENSIONS_FICHE). Le detail etendu du site est
 * charge UNE fois et partage entre tous les onglets d'extension.
 * ============================================================================
 */
import { useState } from 'react';
import { RefreshCw, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, Erreur } from './etats';
import { dossiersService } from '../../services/dossiers.service';
import { BadgeEtape, BadgeCanal, fmtDate, fmtDateHeure, fmtEur } from './badges-clients';
import { ONGLETS_PED } from './extensions/ped';

// Onglets specifiques par site. Chaque Composant recoit
// { appId, dossierId, dossier, detail } — detail est la reponse site-detail
// du site (null pendant le chargement).
export const EXTENSIONS_FICHE = {
  'pack-vendeur': ONGLETS_PED,
};

const TYPES_EMAIL = [
  ['magic-link-initial', 'Lien magique initial'],
  ['post-purchase', 'Post-achat'],
  ['review-request', "Demande d'avis"],
  ['cart-abandonment', 'Panier abandonné'],
  ['expiration-reminder', "Rappel d'expiration"],
];

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

function BarreActions({ appId, dossierId, isSuperAdmin, onFait }) {
  const [typeEmail, setTypeEmail] = useState(TYPES_EMAIL[0][0]);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);

  const executer = async (actionSite, params = {}, confirmation = null) => {
    if (confirmation && !window.confirm(confirmation)) return;
    setEnCours(actionSite);
    setMessage(null);
    const { data, error } = await dossiersService.executerActionSite(
      appId, dossierId, actionSite, params,
    );
    setEnCours(null);
    if (error) {
      setMessage({ ok: false, texte: error.message });
    } else {
      setMessage({ ok: true, texte: data?.message || 'Action exécutée.' });
      onFait();
    }
  };

  return (
    <div className="px-4 py-3 border-b border-baikal-border space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={typeEmail}
          onChange={(e) => setTypeEmail(e.target.value)}
          className="px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs text-baikal-text focus:outline-none focus:border-baikal-cyan"
        >
          {TYPES_EMAIL.map(([val, libelle]) => (
            <option key={val} value={val}>{libelle}</option>
          ))}
        </select>
        <button
          onClick={() => executer('resend-email', { emailAction: typeEmail })}
          disabled={enCours !== null}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          {enCours === 'resend-email' ? 'Envoi…' : "Renvoyer l'email"}
        </button>
        <button
          onClick={() => executer('re-extract', {},
            'Relancer l\u2019extraction de ce dossier ? Le statut repasse en cours d\u2019analyse.')}
          disabled={enCours !== null}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${enCours === 're-extract' ? 'animate-spin' : ''}`} />
          {enCours === 're-extract' ? 'Relance…' : 'Re-extraire'}
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => executer('purge-documents', {},
              'Purger les documents de ce dossier ? Les fichiers et les données extraites seront '
              + 'supprimés DÉFINITIVEMENT. Le dossier, les emails et la transaction sont conservés.')}
            disabled={enCours !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-500/50 text-xs text-red-300 hover:bg-red-900/20 disabled:opacity-50 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {enCours === 'purge-documents' ? 'Purge…' : 'Purger les documents'}
          </button>
        )}
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {message.texte}
        </p>
      )}
    </div>
  );
}

export default function FicheDossier({ appId, dossierId, onClose }) {
  const [onglet, setOnglet] = useState('vue');
  const [version, setVersion] = useState(0);
  const { isSuperAdmin } = useAuth();
  const { donnees, erreur } = useDonneesCachees(
    `fiche:${appId}:${dossierId}:${version}`,
    () => dossiersService.getFiche(appId, dossierId),
    appId,
  );
  const d = donnees?.dossier;
  const extensions = EXTENSIONS_FICHE[appId] || [];
  const actionsActives = donnees?.actions === true;

  // Detail etendu du site : charge une fois, partage entre les onglets
  // d'extension. Le chargeur est neutre tant que le canal n'est pas actif.
  const { donnees: detail } = useDonneesCachees(
    `detail-site:${appId}:${dossierId}:${actionsActives}:${version}`,
    () => (actionsActives && extensions.length > 0
      ? dossiersService.getDetailSite(appId, dossierId)
      : Promise.resolve({ data: null, error: null })),
    appId,
  );

  const onglets = d
    ? [
      ['vue', 'Vue'],
      ['emails', `Emails (${(donnees.emails || []).length})`],
      ...(donnees.events ? [['events', `Events (${donnees.events.length})`]] : []),
      ...(actionsActives ? extensions.map((e) => [e.id, e.label]) : []),
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
        {d && actionsActives && (
          <BarreActions
            appId={appId}
            dossierId={dossierId}
            isSuperAdmin={isSuperAdmin}
            onFait={() => setVersion((v) => v + 1)}
          />
        )}
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
            <extensionActive.Composant
              appId={appId}
              dossierId={dossierId}
              dossier={d}
              detail={detail}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

Note : ce fichier importe `./extensions/ped` qui n'existe qu'à la Task 5 — les Tasks 4 et 5 se committent ENSEMBLE (un seul commit, à la fin de la Task 5). Ne pas lancer `npm run build` avant la Task 5.

- [ ] **Step 3 : Pas de commit ici**

Le commit et le build arrivent en Task 5 (dépendance d'import circulairement liée).

---

### Task 5 : Onglets d'extension PED

**Files:**
- Create: `src/components/console/extensions/ped.jsx`
- (commit conjoint avec la Task 4)

**Interfaces:**
- Consumes: prop `detail` = réponse `detail` de `pv-admin-dossiers` (forme dans les Global Constraints), `dossier` = ligne `baikal_dossiers`.
- Produces: `export const ONGLETS_PED = [{id, label, Composant}]` — 5 entrées : `documents`, `resultat`, `chat`, `logs-ia`, `donnees`.

- [ ] **Step 1 : Écrire ped.jsx**

```jsx
/**
 * ped.jsx - Baikal Console
 * ============================================================================
 * Onglets d'extension Pre-etat-date de la fiche client : Documents, Resultat,
 * Chat, Logs IA, Donnees. Tous consomment la reponse `detail` de
 * pv-admin-dossiers (relayee par admin-dossiers, action site-detail) — les
 * URLs signees du storage n'existent que la (TTL 1 h), jamais recomposees ici.
 * ============================================================================
 */
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Chargement, Vide } from '../etats';
import { fmtDateHeure, fmtEur } from '../badges-clients';

function fmtOctets(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(4)} $`;
}

function EnAttente({ detail, children }) {
  if (!detail) return <Chargement />;
  return children;
}

function OngletDocuments({ detail, dossier }) {
  return (
    <EnAttente detail={detail}>
      {dossier.documents_purges_le && (
        <p className="mb-3 text-xs text-amber-300">
          Documents purgés le {fmtDateHeure(dossier.documents_purges_le)} — les fichiers ont été supprimés.
        </p>
      )}
      {(!detail?.documents || detail.documents.length === 0) ? (
        <Vide message="Aucun document sur ce dossier." />
      ) : (
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
              <th className="py-2 pr-4">Fichier</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Pages</th>
              <th className="py-2 pr-4">Taille</th>
              <th className="py-2 pr-4">Confiance IA</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {detail.documents.map((doc) => (
              <tr key={doc.id} className="border-t border-baikal-border/50">
                <td className="py-2 pr-4 max-w-[220px] truncate" title={doc.original_filename}>
                  {doc.normalized_filename || doc.original_filename}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{doc.document_type || '—'}</td>
                <td className="py-2 pr-4">{doc.page_count ?? '—'}</td>
                <td className="py-2 pr-4">{fmtOctets(doc.file_size_bytes)}</td>
                <td className="py-2 pr-4">
                  {doc.ai_confidence != null ? `${Math.round(Number(doc.ai_confidence) * 100)} %` : '—'}
                </td>
                <td className="py-2">
                  {doc.signed_url && (
                    <a
                      href={doc.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-baikal-cyan hover:underline text-xs"
                    >
                      Ouvrir <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detail?.documents?.length > 0 && (
        <p className="mt-2 text-xs text-baikal-text opacity-60">
          Liens valables {Math.round((detail.signed_url_ttl_seconds || 3600) / 60)} minutes.
        </p>
      )}
    </EnAttente>
  );
}

function OngletResultat({ detail }) {
  const d = detail?.dossier;
  return (
    <EnAttente detail={detail}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Pré-état-daté (PDF)</dt>
          <dd className="text-sm mt-0.5">
            {detail?.pdf_signed_url ? (
              <a
                href={detail.pdf_signed_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-baikal-cyan hover:underline"
              >
                Ouvrir le PDF <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : <span className="text-baikal-text opacity-60">Pas encore généré</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Lien de partage notaire</dt>
          <dd className="text-sm mt-0.5">
            {detail?.share_url ? (
              <a href={detail.share_url} target="_blank" rel="noreferrer"
                className="text-baikal-cyan hover:underline break-all text-xs">
                {detail.share_url}
              </a>
            ) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Consulté par le notaire</dt>
          <dd className="text-sm text-white mt-0.5">{fmtDateHeure(d?.notary_accessed_at)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Téléchargements</dt>
          <dd className="text-sm text-white mt-0.5">{d?.download_count ?? 0}</dd>
        </div>
      </dl>
    </EnAttente>
  );
}

function OngletChat({ detail }) {
  return (
    <EnAttente detail={detail}>
      {(!detail?.chat_logs || detail.chat_logs.length === 0) ? (
        <Vide message="Aucun échange de chat sur ce dossier." />
      ) : (
        <ul className="space-y-3">
          {detail.chat_logs.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="text-xs text-baikal-text opacity-60">
                {fmtDateHeure(c.created_at)} · {c.page_path || '—'}
              </div>
              <div className="text-white mt-0.5">{c.question}</div>
              <div className="text-baikal-text mt-0.5 whitespace-pre-wrap">{c.answer}</div>
            </li>
          ))}
        </ul>
      )}
    </EnAttente>
  );
}

function OngletLogsIa({ detail }) {
  return (
    <EnAttente detail={detail}>
      {(!detail?.ai_logs || detail.ai_logs.length === 0) ? (
        <Vide message="Aucun appel IA sur ce dossier." />
      ) : (
        <>
          <p className="mb-2 text-sm text-baikal-text">
            Coût total : <span className="text-white font-semibold">{fmtUsd(detail.ai_total_cost_usd)}</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Modèle</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Coût</th>
                  <th className="py-2">Latence</th>
                </tr>
              </thead>
              <tbody>
                {detail.ai_logs.map((l) => (
                  <tr key={l.id} className={`border-t border-baikal-border/50 ${l.error ? 'text-red-300' : ''}`}>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs">{fmtDateHeure(l.created_at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{l.model_used || l.model || '—'}</td>
                    <td className="py-2 pr-4 text-xs">{l.prompt_type || '—'}</td>
                    <td className="py-2 pr-4">{l.total_tokens ?? '—'}</td>
                    <td className="py-2 pr-4">{fmtUsd(l.cost_usd)}</td>
                    <td className="py-2">{l.latency_ms != null ? `${l.latency_ms} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </EnAttente>
  );
}

const CHAMPS_FINANCIERS = [
  ['charges_courantes', 'Charges courantes', 'eur'],
  ['charges_calculees', 'Charges calculées', 'eur'],
  ['charges_budget_n1', 'Charges budget N-1', 'eur'],
  ['charges_exceptionnelles', 'Charges exceptionnelles', 'eur'],
  ['fonds_travaux_balance', 'Fonds travaux (solde)', 'eur'],
  ['provisions_exigibles', 'Provisions exigibles', 'eur'],
  ['impaye_vendeur', 'Impayé vendeur', 'eur'],
  ['dette_copro_fournisseurs', 'Dette fournisseurs', 'eur'],
  ['tantiemes_lot', 'Tantièmes du lot', 'brut'],
  ['tantiemes_totaux', 'Tantièmes totaux', 'brut'],
];

function OngletDonnees({ detail }) {
  const d = detail?.dossier;
  const ecart = d?.charges_discrepancy_pct != null ? Number(d.charges_discrepancy_pct) : null;
  return (
    <EnAttente detail={detail}>
      {ecart != null && ecart >= 20 && (
        <div className="mb-3 p-3 bg-amber-900/20 border border-amber-500/50 rounded-md flex items-start gap-2 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Écart {Math.round(ecart)} % entre charges calculées ({fmtEur(d.charges_calculees)})
            et charges budget N-1 ({fmtEur(d.charges_budget_n1)}). Tantièmes probablement à vérifier.
          </span>
        </div>
      )}
      <table className="w-full text-sm text-baikal-text mb-4">
        <tbody>
          {CHAMPS_FINANCIERS.map(([cle, libelle, format]) => (
            <tr key={cle} className="border-t border-baikal-border/50 first:border-t-0">
              <td className="py-1.5 pr-4 text-xs opacity-70">{libelle}</td>
              <td className="py-1.5 text-white">
                {format === 'eur' ? fmtEur(d?.[cle]) : (d?.[cle] ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {['extracted_data', 'validated_data'].map((cle) => (
        d?.[cle] ? (
          <details key={cle} className="mb-2">
            <summary className="text-xs text-baikal-text opacity-70 cursor-pointer select-none">
              {cle === 'extracted_data' ? 'Données extraites (JSON)' : 'Données validées (JSON)'}
            </summary>
            <pre className="mt-1 p-2 bg-baikal-bg border border-baikal-border rounded text-[11px] text-baikal-text overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(d[cle], null, 2)}
            </pre>
          </details>
        ) : null
      ))}
    </EnAttente>
  );
}

export const ONGLETS_PED = [
  { id: 'documents', label: 'Documents', Composant: OngletDocuments },
  { id: 'resultat', label: 'Résultat', Composant: OngletResultat },
  { id: 'chat', label: 'Chat', Composant: OngletChat },
  { id: 'logs-ia', label: 'Logs IA', Composant: OngletLogsIa },
  { id: 'donnees', label: 'Données', Composant: OngletDonnees },
];
```

- [ ] **Step 2 : Build**

Run: `npm run build`
Expected: build Vite OK.

- [ ] **Step 3 : Commit conjoint Tasks 4+5**

```bash
git add src/services/dossiers.service.js src/components/console/FicheDossier.jsx src/components/console/extensions/ped.jsx
git commit -m "feat(clients): actions d'administration et onglets d'extension PED dans la fiche

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : Push, prompt PED et activation différée

**Files:**
- Aucun code : push, rédaction du prompt PED, procédure d'activation.

- [ ] **Step 1 : Push**

```bash
git push origin main
```

- [ ] **Step 2 : Fournir le prompt PED à Eric**

Le rapport final livre ce prompt (à coller dans la conversation du repo Pack Vendeur) :

```text
La console Baikal remplace le /admin de Pré-état-daté. Elle appelle désormais pv-admin-dossiers depuis son EF admin-dossiers via un canal inter-services. À faire dans ce repo :

1. AUTH — dans supabase/functions/pv-admin-dossiers/index.ts, accepter un appel Baikal : si l'en-tête X-Baikal-Key est présent ET égal (constantTimeEqual de _shared/auth.ts) au secret d'environnement BAIKAL_ADMIN_KEY (déjà posé dans les Edge Function Secrets du projet), l'appel est autorisé au même titre qu'un admin (bypass de verifyAdminAccess, logguer "via=baikal"). Sinon, comportement actuel inchangé. Si BAIKAL_ADMIN_KEY n'est pas posé dans l'environnement, le chemin est refusé (jamais de comparaison à une valeur vide).

2. PURGE DOCUMENTAIRE — nouvelle action "purge-documents" (dossier_id requis) qui remplace la suppression pour le RGPD : supprimer du storage tous les fichiers du dossier (documents uploadés ET le PDF pré-état-daté généré), vider extracted_text/extracted_data/ai_classification_raw/gemini_file_uri des pv_documents (garder les métadonnées : nom, type, taille, pages), vider extracted_data/validated_data du dossier, poser une nouvelle colonne pv_dossiers.documents_purged_at (migration). CONSERVER : le dossier, les emails (pv_email_logs), la transaction (stripe_*, amount_paid, paid_at), l'attribution. Exposer documents_purged_at AS documents_purges_le dans la vue public.baikal_dossiers.

3. AUDIT — vérifier ce qui efface réellement les adresses email aujourd'hui (la suppression admin actuelle est un soft-delete qui ne touche pas les emails ; chercher un cron/hard-delete RGPD). Règle voulue : on ne supprime que les documents ; l'email et la transaction sont conservés (obligation comptable). Corriger tout chemin qui viole cette règle et le documenter dans CLAUDE.md.

4. Déployer pv-admin-dossiers, puis répondre "canal Baikal prêt" avec le nom exact des actions supportées.
```

- [ ] **Step 3 : Activation (APRÈS le retour « canal Baikal prêt » de la session PED)**

`execute_sql` sur `odspcxgafcqxjzrarsqf` :

```sql
UPDATE config.apps SET env_dossiers_fn = 'pv-admin-dossiers' WHERE id = 'pack-vendeur';
```

Tant que cette ligne n'est pas exécutée, `/clients` fonctionne exactement comme au lot 1 (ni boutons ni onglets étendus). Après activation : vérification navigateur en prod avec Eric — fiche `l.scafi…` : barre d'actions visible, onglet Documents avec liens signés qui s'ouvrent, onglet Données avec le bandeau d'écart 41 %, renvoi d'un email de test, et purge sur un dossier de TEST uniquement.

---

## Self-review du plan (fait à l'écriture)

- **Spec (§6, §7, §10.2)** : actions via EF du site → Tasks 1-3 ; purge super_admin seul → Task 3 (vérif EF) + Task 4 (bouton masqué) ; extensions par site via `EXTENSIONS_FICHE` → Tasks 4-5 ; chantier côté produit (auth, purge, audit emails) → prompt Task 6 ; sémantique « Supprimer → Purger » → l'UI Baikal n'expose pas le soft-delete.
- **Découplage** : `env_dossiers_fn` NULL = interrupteur ; Baikal livrable et inoffensif avant le chantier PED.
- **Types cohérents** : `Site.env_anon_key/env_dossiers_fn` (T2) = colonnes T1 = consommés par `relaisConfigure/preparerRelais` (T2) = utilisés T3 ; `actionSite` (T3) = `executerActionSite` (T4) ; `detail` (T5) = forme documentée en Global Constraints = réponse relayée T3 ; `ONGLETS_PED` (T5) = import T4.
- **Choix assumés** : seuil du bandeau d'écart à 20 % (le seuil PED exact est inconnu — heuristique à ajuster au premier retour d'Eric) ; le bloc « Non extrait — à compléter par le vendeur » du /admin PED n'est pas reproduit en v1 (sa source dans extracted_data n'est pas documentée — à brancher quand la session PED la précisera).
