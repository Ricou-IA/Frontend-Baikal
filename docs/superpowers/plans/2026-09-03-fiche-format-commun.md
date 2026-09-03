# Fiche transaction — format commun : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire des 8 onglets de la fiche client un contrat unique lu en SQL, identique pour tous les produits, et supprimer le rendu React spécifique à Pré-état-daté.

**Architecture:** L'Edge Function `admin-dossiers` gagne trois actions génériques (`fiche` enrichie, `onglet`, `fichier`) qui lisent des vues `baikal_dossier_*` optionnelles via le canal `baikal_reader` en lecture seule, avec détection de capacité par `to_regclass` / `information_schema`. Le relais HTTP vers l'Edge Function du site ne sert plus qu'à signer l'ouverture d'un fichier et à exécuter des actions, lesquelles sont déclarées par le site dans un manifeste rendu **par dossier**. Le front rend les 8 onglets avec 5 composants génériques pilotés par des descriptions de colonnes.

**Tech Stack:** Deno / TypeScript (Edge Functions, Supabase), postgres-js (canal lecture seule), React 18 + JSX + TailwindCSS (console), lucide-react (icônes).

**Spec:** `docs/superpowers/specs/2026-09-03-fiche-transaction-format-commun-design.md`

## Global Constraints

- **Français partout** : UI, libellés, messages d'erreur, noms de fonctions et de variables. Les commentaires de code des Edge Functions et des composants sont **sans accents** (convention du repo) ; les documents Markdown gardent les accents.
- **Lecture seule** : aucune écriture SQL vers la base d'un site. Toute écriture passe par le relais HTTP vers l'Edge Function du site.
- **Aucune donnée nominative archivée** : rien de ce qui est lu ici n'est écrit dans le schéma `admin`.
- **Règle de capacité** : pas de vue → pas d'onglet ; pas de colonne → pas de section. Une absence n'est jamais une erreur.
- **Aucun nom de vue ne vient de la requête** : les noms de vues sont dans une table de correspondance en dur (`ONGLETS`), le paramètre client n'est qu'une clé de ce dictionnaire.
- **Tests Edge Functions** : `Deno.test` + `assertEquals` depuis `https://deno.land/std@0.224.0/assert/mod.ts`, dans un fichier `<module>.test.ts` à côté du module. Commande : `deno test --allow-env supabase/functions/admin-dossiers/`.
- **Pas de tests unitaires front** : le repo n'a aucun runner front (pas de vitest, pas de jest, aucun `*.test.jsx`). N'en installe pas — c'est hors périmètre. Le front se vérifie par `npm run lint` (zéro warning, `--max-warnings 0`) puis par observation réelle dans le navigateur.
- **Vérification navigateur** : la configuration `baikal-dev` de `.claude/launch.json` (npm run dev, port 5173) existe déjà — utilise-la, ne lance jamais un serveur via Bash.
- **Commits fréquents**, un par tâche, en français sans accents, préfixe `feat(fiche):` / `test(fiche):` / `refactor(fiche):` / `docs(fiche):`.

---

## Structure des fichiers

**Edge Function `supabase/functions/admin-dossiers/`**

| Fichier | Responsabilité |
|---|---|
| `onglets.ts` *(créer)* | Table de correspondance onglet → vue, résolution, tri tolérant, pagination |
| `onglets.test.ts` *(créer)* | Tests du précédent |
| `champs.ts` *(créer)* | Groupement des champs déclarés en sections ordonnées |
| `champs.test.ts` *(créer)* | Tests du précédent |
| `manifeste.ts` *(créer)* | Normalisation défensive du manifeste d'actions renvoyé par un site |
| `manifeste.test.ts` *(créer)* | Tests du précédent |
| `index.ts` *(modifier)* | Câblage : actions `fiche`, `onglet`, `fichier`, `site-action` |
| `relais.ts`, `filtres.ts`, `canal.ts` | Inchangés |

**Front `src/components/console/fiche/`** (nouveau dossier)

| Fichier | Responsabilité |
|---|---|
| `formats.jsx` *(créer)* | `formaterValeur(valeur, format)` — un seul endroit qui décide comment s'écrit un montant, une date, une taille |
| `colonnes.js` *(créer)* | Description des colonnes de chaque onglet de type liste |
| `OngletFiche.jsx` *(créer)* | Noyau `baikal_dossiers` + sections déclarées |
| `OngletListe.jsx` *(créer)* | Tableau générique + `details` repliable + pagination |
| `OngletTimeline.jsx` *(créer)* | Events |
| `OngletConversation.jsx` *(créer)* | Chat |
| `OngletBlocs.jsx` *(créer)* | Données (accordéon JSON) |
| `BarreActions.jsx` *(créer)* | Boutons construits depuis le manifeste |
| `Fiche.jsx` *(créer)* | Coquille : en-tête, onglets, chargement par onglet |

**Front, ailleurs**

| Fichier | Action |
|---|---|
| `src/services/dossiers.service.js` | Ajouter `getOnglet`, `getFichier` ; supprimer `getDetailSite` |
| `src/pages/Clients.jsx` | Importer `fiche/Fiche` au lieu de `FicheDossier` |
| `src/components/console/FicheDossier.jsx` | Supprimé en tâche 12 |
| `src/components/console/extensions/ped.jsx` | Supprimé en tâche 12 |

**Documentation**

| Fichier | Action |
|---|---|
| `docs/superpowers/prompts/2026-09-03-ped-vues-fiche-commune.md` *(créer)* | Prompt à coller dans une session du repo Pré-état-daté |

---

## Ordre et dépendances

Les tâches 2 à 7 (Edge Function) sont testables **sans** que Pré-état-daté ait publié quoi que ce soit : ce sont des modules purs et du câblage tolérant à l'absence de vues. Les tâches 8 à 11 (front) s'écrivent aussi sans PED, mais ne se **vérifient** à l'écran qu'une fois les vues publiées. La tâche 1 produit le prompt qui débloque ce travail côté PED : fais-la d'abord pour qu'Eric puisse la lancer en parallèle.

---

### Task 1: Prompt de publication des vues côté Pré-état-daté

Livrable documentaire : le texte qu'Eric collera dans une session ouverte sur le repo Pré-état-daté. Il est le lot 1 de la spec ; sans lui, rien n'est vérifiable à l'écran.

**Files:**
- Create: `docs/superpowers/prompts/2026-09-03-ped-vues-fiche-commune.md`

**Interfaces:**
- Consumes: la spec §3 (contrat de données) et §8 (chantier PED).
- Produces: rien pour le code de ce repo ; le document est autonome.

- [ ] **Step 1: Créer le dossier et écrire le prompt**

Le document doit être autonome (le lecteur n'a pas cette conversation) et contenir, dans cet ordre : le contexte en trois phrases, le contrat colonne par colonne des six vues à créer, les correspondances connues avec les tables PED, les deux actions à ajouter à `pv-admin-dossiers`, et le `GRANT`.

Contenu à écrire :

````markdown
# Pré-état-daté — publier les vues de la fiche commune Baikal

Baikal (le back-office unique) affiche désormais la fiche d'un dossier avec
huit onglets identiques pour tous les produits, lus dans des vues SQL que
chaque produit publie. Pré-état-daté expose déjà `baikal_dossiers`,
`baikal_dossier_emails` et `baikal_dossier_events` : il manque six vues et
deux actions d'Edge Function.

Toutes les vues sont en lecture seule pour le rôle `baikal_reader`, dans le
schéma `public` (projet dédié). Seule la colonne `dossier_id` est obligatoire
dans chacune : toute colonne absente est simplement non affichée côté Baikal.

## 1. `public.baikal_dossier_champs`

Les champs métier de l'onglet Vue (le bloc « BIEN » de l'ancien /admin).
Colonnes : `dossier_id text`, `section text`, `ordre_section int`,
`libelle text`, `ordre int`, `valeur text`, `format text`, `niveau text`.

- `format` ∈ `texte` (défaut) `euro` `date` `datetime` `pourcent` `nombre`
  `octets` `booleen` `lien` `mono` — donne la valeur BRUTE dans `valeur`,
  Baikal applique le formatage.
- `niveau` ∈ `attention` / `danger` (sinon NULL) — surligne le champ.
  L'ancien encart « écart de X % sur les tantièmes » devient un champ de
  section `COPROPRIETE` avec `niveau = 'attention'` quand
  `charges_discrepancy_pct >= 20`.
- Attendu : une section `BIEN` (adresse, ville, lot, surface, copropriété,
  syndic) et une section `COPROPRIETE` (charges, tantièmes) construites en
  dépliant les colonnes du dossier — typiquement par un `LATERAL` sur une
  liste de `VALUES`.

## 2. `public.baikal_dossier_documents`

Les pièces déposées. Source : la table des documents du dossier.
Colonnes : `dossier_id text`, `document_id text`, `libelle text`,
`nature text`, `type text`, `mime text`, `taille_octets bigint`,
`pages int`, `depose_le timestamptz`, `source text`, `statut text`,
`ouvrable boolean`, `details jsonb`.

- `nature` = `'fichier'` pour tous les documents PED.
- `libelle` = `COALESCE(normalized_filename, original_filename)`.
- `type` = `document_type` (le type métier, affiché tel quel).
- `taille_octets` = `file_size_bytes`, `pages` = `page_count`.
- `ouvrable` = `true` (l'Edge Function sait signer une URL).
- `details` = `jsonb_build_object('Confiance IA', round(ai_confidence * 100) || ' %')`
  quand `ai_confidence` n'est pas NULL, sinon NULL.

## 3. `public.baikal_dossier_resultats`

Ce que l'outil a produit. Une ligne par livrable.
Colonnes : `dossier_id text`, `resultat_id text`, `libelle text`,
`nature text`, `produit_le timestamptz`, `version int`, `statut text`,
`url_publique text`, `consulte_le timestamptz`, `telechargements int`,
`ouvrable boolean`, `details jsonb`.

Deux lignes attendues par dossier, en `UNION ALL` :

- le PDF : `resultat_id = 'pdf'`, `libelle = 'Pré-état-daté (PDF)'`,
  `nature = 'document'`, `ouvrable = true`, `telechargements = download_count` ;
- le lien notaire : `resultat_id = 'partage'`,
  `libelle = 'Lien de partage notaire'`, `nature = 'lien_partage'`,
  `url_publique` = l'URL de partage, `consulte_le = notary_accessed_at`,
  `ouvrable = false`.

## 4. `public.baikal_dossier_messages`

Le chat. La table PED stocke question et réponse sur une même ligne : la vue
doit les **dégrouper en deux lignes** avec `UNION ALL`.
Colonnes : `dossier_id text`, `message_id text`, `survenu_le timestamptz`,
`role text`, `contenu text`, `canal text`, `contexte text`, `details jsonb`.

- ligne 1 : `role = 'client'`, `contenu = question` ;
- ligne 2 : `role = 'assistant'`, `contenu = answer` ;
- `contexte = page_path`, `survenu_le = created_at` (ajoute quelques
  millisecondes à la réponse si tu veux garantir l'ordre d'affichage).

## 5. `public.baikal_dossier_ia`

Les appels IA. Source : la table des logs IA.
Colonnes : `dossier_id text`, `survenu_le timestamptz`, `operation text`,
`modele text`, `tokens_entree int`, `tokens_sortie int`, `tokens_total int`,
`cout_usd numeric`, `latence_ms int`, `statut text`, `erreur text`,
`details jsonb`.

- `operation` = `prompt_type`, `modele` = `COALESCE(model_used, model)`.
- `erreur` = le message d'erreur de l'appel. C'est le champ que
  l'ancienne réponse `detail` exposait sous la clé `error` dans
  `ai_logs` — retrouve la colonne correspondante dans ta table de logs.
- `statut` = `'erreur'` quand ce champ est renseigné, sinon `'ok'`.
- Ne fournis PAS de total : Baikal somme `cout_usd` lui-même.

## 6. `public.baikal_dossier_donnees`

Le brut. Une ligne par bloc.
Colonnes : `dossier_id text`, `bloc text`, `libelle text`, `ordre int`,
`contenu jsonb`, `maj_le timestamptz`.

Blocs attendus : `extracted_data` (« Données extraites »), `validated_data`
(« Données validées »). N'inclus une ligne que si le JSON n'est pas NULL.

## 7. Droits

```sql
GRANT SELECT ON public.baikal_dossier_champs,
                public.baikal_dossier_documents,
                public.baikal_dossier_resultats,
                public.baikal_dossier_messages,
                public.baikal_dossier_ia,
                public.baikal_dossier_donnees
  TO baikal_reader;
```

## 8. Deux actions dans `pv-admin-dossiers`

### `manifeste`

Entrée : `{ action: "manifeste", dossier_id }`. Sortie :
`{ actions: [ … ] }`. Chaque action :
`{ id, libelle, icone, variante, super_admin, confirmation, parametres }`.

- `icone` ∈ `send` `refresh` `coins` `trash` `mail` `download` `check` `alert`
  (tout autre nom est ignoré par Baikal).
- `variante` ∈ `neutre` (défaut) / `danger`.
- `confirmation` = `{ titre, message, bouton }` ou `null`.
- `parametres[]` = `{ id, type, libelle, options?, min?, max?, defaut? }`,
  `type` ∈ `choix` `nombre` `texte` `booleen`. Un `choix` doit fournir
  `options: [{valeur, libelle}]` non vide.

**Le manifeste est calculé pour CE dossier** : n'expose `add-pro-credits`
que si le dossier est B2B. C'est ce qui évite d'écrire des règles métier
dans Baikal.

Actions à déclarer : `resend-email`, `re-extract`, `reset-extractions`,
`add-pro-credits` (paramètre `nombre` `credits`, min 1, max 100,
`super_admin: true`), `purge-documents` (`variante: danger`,
`super_admin: true`, confirmation renseignée).

`resend-email` porte un paramètre `choix` `emailAction` avec ces cinq
options :

- `magic-link-initial` (« Lien magique initial »)
- `post-purchase` (« Post-achat »)
- `review-request` (« Demande d'avis »)
- `cart-abandonment` (« Panier abandonné »)
- `expiration-reminder` (« Rappel d'expiration »)

### `fichier`

Entrée : `{ action: "fichier", dossier_id, cible, id }` où `cible` vaut
`document` ou `resultat` et `id` est le `document_id` / `resultat_id` de la
vue. Sortie : `{ url, expire_le }` — une URL signée, même TTL qu'aujourd'hui.
Vérifie que l'identifiant appartient bien au dossier demandé.

## 9. Règles inchangées

- L'autorisation reste le secret partagé `X-Baikal-Key`, et l'Edge Function
  **revérifie elle-même** les actions réservées : le `super_admin` du
  manifeste sert à construire l'interface, il ne fait pas autorité.
- L'action `detail` reste en place jusqu'à la bascule de Baikal ; elle sera
  retirée ensuite.
````

- [ ] **Step 2: Relire le prompt en se mettant à la place du lecteur**

Vérifie qu'aucune phrase ne suppose la connaissance de Baikal : le lecteur ouvre le repo Pré-état-daté et ne connaît ni la spec, ni cette conversation. Chaque vue doit être créable à partir du seul document.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/prompts/2026-09-03-ped-vues-fiche-commune.md
git commit -m "docs(fiche): prompt de publication des vues cote Pre-etat-date"
```

---

### Task 2: Module `onglets.ts` — correspondance, tri, pagination

**Files:**
- Create: `supabase/functions/admin-dossiers/onglets.ts`
- Test: `supabase/functions/admin-dossiers/onglets.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `ONGLETS: Record<string, DefOnglet>`, `resoudreOnglet(nom: unknown): DefOnglet | null`, `triEffectif(def: DefOnglet, colonnes: Set<string>): string | null`, `paginationOnglet(body: Record<string, unknown>): { page: number; parPage: number }`, `interface DefOnglet { vue: string; tri: string; ordre: "ASC" | "DESC" }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `supabase/functions/admin-dossiers/onglets.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ONGLETS, paginationOnglet, resoudreOnglet, triEffectif } from "./onglets.ts";

Deno.test("resoudreOnglet: nom connu -> definition", () => {
  assertEquals(resoudreOnglet("documents")?.vue, "baikal_dossier_documents");
  assertEquals(resoudreOnglet("chat")?.ordre, "ASC");
});

Deno.test("resoudreOnglet: nom inconnu ou hostile -> null", () => {
  assertEquals(resoudreOnglet("champs"), null);
  assertEquals(resoudreOnglet("baikal_dossiers"), null);
  assertEquals(resoudreOnglet("../../etc/passwd"), null);
  assertEquals(resoudreOnglet(undefined), null);
  assertEquals(resoudreOnglet(42), null);
  assertEquals(resoudreOnglet("constructor"), null);
});

Deno.test("ONGLETS: la table de correspondance est verrouillee", () => {
  assertEquals(ONGLETS, {
    documents: { vue: "baikal_dossier_documents", tri: "depose_le", ordre: "DESC" },
    resultats: { vue: "baikal_dossier_resultats", tri: "produit_le", ordre: "DESC" },
    emails: { vue: "baikal_dossier_emails", tri: "envoye_le", ordre: "DESC" },
    chat: { vue: "baikal_dossier_messages", tri: "survenu_le", ordre: "ASC" },
    ia: { vue: "baikal_dossier_ia", tri: "survenu_le", ordre: "DESC" },
    donnees: { vue: "baikal_dossier_donnees", tri: "ordre", ordre: "ASC" },
    events: { vue: "baikal_dossier_events", tri: "survenu_le", ordre: "DESC" },
  });
});

Deno.test("triEffectif: colonne de tri presente -> clause", () => {
  const def = ONGLETS.documents;
  assertEquals(triEffectif(def, new Set(["dossier_id", "depose_le"])), "depose_le DESC");
});

Deno.test("triEffectif: colonne de tri absente -> null (pas de ORDER BY)", () => {
  const def = ONGLETS.documents;
  assertEquals(triEffectif(def, new Set(["dossier_id", "libelle"])), null);
});

Deno.test("paginationOnglet: defauts", () => {
  assertEquals(paginationOnglet({}), { page: 1, parPage: 50 });
});

Deno.test("paginationOnglet: bornes", () => {
  assertEquals(paginationOnglet({ parPage: 1 }).parPage, 5);
  assertEquals(paginationOnglet({ parPage: 5000 }).parPage, 200);
  assertEquals(paginationOnglet({ page: 0 }).page, 1);
  assertEquals(paginationOnglet({ page: -3 }).page, 1);
  assertEquals(paginationOnglet({ page: "2" }).page, 2);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `deno test supabase/functions/admin-dossiers/onglets.test.ts`
Expected: FAIL — `Module not found "./onglets.ts"`.

- [ ] **Step 3: Écrire le module**

Créer `supabase/functions/admin-dossiers/onglets.ts` :

```ts
// Correspondance onglet -> vue contractuelle du site. Le nom de vue ne vient
// JAMAIS de la requete : le parametre client est seulement une cle de ce
// dictionnaire, ce qui ferme toute surface d'injection.
export interface DefOnglet {
  vue: string;
  tri: string;
  ordre: "ASC" | "DESC";
}

export const ONGLETS: Record<string, DefOnglet> = {
  documents: { vue: "baikal_dossier_documents", tri: "depose_le", ordre: "DESC" },
  resultats: { vue: "baikal_dossier_resultats", tri: "produit_le", ordre: "DESC" },
  emails: { vue: "baikal_dossier_emails", tri: "envoye_le", ordre: "DESC" },
  chat: { vue: "baikal_dossier_messages", tri: "survenu_le", ordre: "ASC" },
  ia: { vue: "baikal_dossier_ia", tri: "survenu_le", ordre: "DESC" },
  donnees: { vue: "baikal_dossier_donnees", tri: "ordre", ordre: "ASC" },
  events: { vue: "baikal_dossier_events", tri: "survenu_le", ordre: "DESC" },
};

export function resoudreOnglet(nom: unknown): DefOnglet | null {
  if (typeof nom !== "string") return null;
  // Object.hasOwn : "constructor" ou "toString" ne doivent pas resoudre.
  if (!Object.hasOwn(ONGLETS, nom)) return null;
  return ONGLETS[nom];
}

// Un site peut ne pas exposer la colonne de tri : on lit sans ORDER BY
// plutot que d'echouer -- une absence n'est jamais une erreur.
export function triEffectif(def: DefOnglet, colonnes: Set<string>): string | null {
  if (!colonnes.has(def.tri)) return null;
  return `${def.tri} ${def.ordre}`;
}

export function paginationOnglet(
  body: Record<string, unknown>,
): { page: number; parPage: number } {
  const pageBrute = Number(body.page);
  const parPageBrute = Number(body.parPage);
  const page = Number.isFinite(pageBrute) && pageBrute >= 1
    ? Math.floor(pageBrute)
    : 1;
  const parPage = Number.isFinite(parPageBrute)
    ? Math.min(200, Math.max(5, Math.floor(parPageBrute)))
    : 50;
  return { page, parPage };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `deno test supabase/functions/admin-dossiers/onglets.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-dossiers/onglets.ts supabase/functions/admin-dossiers/onglets.test.ts
git commit -m "feat(fiche): table de correspondance onglet vers vue contractuelle"
```

---

### Task 3: Module `champs.ts` — groupement des champs déclarés

**Files:**
- Create: `supabase/functions/admin-dossiers/champs.ts`
- Test: `supabase/functions/admin-dossiers/champs.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `grouperChamps(lignes: Record<string, unknown>[]): SectionChamps[]` avec `interface SectionChamps { section: string; champs: Champ[] }` et `interface Champ { libelle: string; valeur: string | null; format: string; niveau: string | null }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `supabase/functions/admin-dossiers/champs.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { grouperChamps } from "./champs.ts";

Deno.test("groupe par section, sections triees par ordre_section", () => {
  const sections = grouperChamps([
    { section: "BIEN", ordre_section: 2, libelle: "Ville", ordre: 2, valeur: "Lyon" },
    { section: "ACHETEUR", ordre_section: 1, libelle: "Email", ordre: 1, valeur: "a@b.fr" },
    { section: "BIEN", ordre_section: 2, libelle: "Adresse", ordre: 1, valeur: "12 rue X" },
  ]);
  assertEquals(sections.map((s) => s.section), ["ACHETEUR", "BIEN"]);
  assertEquals(sections[1].champs.map((c) => c.libelle), ["Adresse", "Ville"]);
});

Deno.test("ordre_section absent -> section rejetee en fin, ordre alphabetique", () => {
  const sections = grouperChamps([
    { section: "ZZZ", libelle: "a", valeur: "1" },
    { section: "AAA", libelle: "b", valeur: "2" },
    { section: "PREMIERE", ordre_section: 1, libelle: "c", valeur: "3" },
  ]);
  assertEquals(sections.map((s) => s.section), ["PREMIERE", "AAA", "ZZZ"]);
});

Deno.test("format inconnu ou absent -> texte", () => {
  const [s] = grouperChamps([
    { section: "A", libelle: "x", valeur: "1", format: "hieroglyphe" },
    { section: "A", libelle: "y", valeur: "2" },
  ]);
  assertEquals(s.champs.map((c) => c.format), ["texte", "texte"]);
});

Deno.test("format connu conserve", () => {
  const [s] = grouperChamps([{ section: "A", libelle: "x", valeur: "12", format: "euro" }]);
  assertEquals(s.champs[0].format, "euro");
});

Deno.test("niveau hors liste -> null", () => {
  const [s] = grouperChamps([
    { section: "A", libelle: "x", valeur: "1", niveau: "panique" },
    { section: "A", libelle: "y", valeur: "2", niveau: "attention" },
  ]);
  assertEquals(s.champs.map((c) => c.niveau), [null, "attention"]);
});

Deno.test("ligne sans libelle ignoree", () => {
  assertEquals(grouperChamps([{ section: "A", valeur: "1" }]), []);
});

Deno.test("section absente -> section sans titre, en tete", () => {
  const sections = grouperChamps([
    { libelle: "orphelin", valeur: "1" },
    { section: "B", ordre_section: 1, libelle: "range", valeur: "2" },
  ]);
  assertEquals(sections.map((s) => s.section), ["", "B"]);
});

Deno.test("valeur nulle conservee (le front affiche un tiret)", () => {
  const [s] = grouperChamps([{ section: "A", libelle: "x", valeur: null }]);
  assertEquals(s.champs[0].valeur, null);
});

Deno.test("liste vide -> aucune section", () => {
  assertEquals(grouperChamps([]), []);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `deno test supabase/functions/admin-dossiers/champs.test.ts`
Expected: FAIL — `Module not found "./champs.ts"`.

- [ ] **Step 3: Écrire le module**

Créer `supabase/functions/admin-dossiers/champs.ts` :

```ts
// Groupement des champs declares par le site (vue baikal_dossier_champs) en
// sections ordonnees. Baikal ne connait aucun de ces libelles : il ne fait
// que les ranger et transmettre le format demande.
const FORMATS = new Set([
  "texte",
  "euro",
  "date",
  "datetime",
  "pourcent",
  "nombre",
  "octets",
  "booleen",
  "lien",
  "mono",
]);
const NIVEAUX = new Set(["attention", "danger"]);

export interface Champ {
  libelle: string;
  valeur: string | null;
  format: string;
  niveau: string | null;
}

export interface SectionChamps {
  section: string;
  champs: Champ[];
}

interface Interne {
  section: string;
  ordreSection: number | null;
  champs: { champ: Champ; ordre: number | null; arrivee: number }[];
}

export function grouperChamps(lignes: Record<string, unknown>[]): SectionChamps[] {
  const groupes = new Map<string, Interne>();

  lignes.forEach((ligne, arrivee) => {
    const libelle = typeof ligne.libelle === "string" ? ligne.libelle.trim() : "";
    if (!libelle) return; // une ligne sans libelle n'est pas affichable
    const section = typeof ligne.section === "string" ? ligne.section : "";
    const ordreSection = Number.isFinite(Number(ligne.ordre_section))
      ? Number(ligne.ordre_section)
      : null;
    const ordre = Number.isFinite(Number(ligne.ordre)) ? Number(ligne.ordre) : null;
    const format = typeof ligne.format === "string" && FORMATS.has(ligne.format)
      ? ligne.format
      : "texte";
    const niveau = typeof ligne.niveau === "string" && NIVEAUX.has(ligne.niveau)
      ? ligne.niveau
      : null;
    const valeur = ligne.valeur === null || ligne.valeur === undefined
      ? null
      : String(ligne.valeur);

    if (!groupes.has(section)) {
      groupes.set(section, { section, ordreSection, champs: [] });
    }
    const groupe = groupes.get(section)!;
    // La premiere valeur non nulle rencontree fixe l'ordre de la section.
    if (groupe.ordreSection === null && ordreSection !== null) {
      groupe.ordreSection = ordreSection;
    }
    groupe.champs.push({ champ: { libelle, valeur, format, niveau }, ordre, arrivee });
  });

  return [...groupes.values()]
    .sort((a, b) => {
      // Sans ordre_section, la section passe apres celles qui en ont un,
      // puis par ordre alphabetique -- sauf la section sans titre, qui
      // ouvre la fiche.
      if (a.section === "" && b.section !== "") return -1;
      if (b.section === "" && a.section !== "") return 1;
      if (a.ordreSection !== null && b.ordreSection !== null) {
        return a.ordreSection - b.ordreSection;
      }
      if (a.ordreSection !== null) return -1;
      if (b.ordreSection !== null) return 1;
      return a.section.localeCompare(b.section);
    })
    .map((groupe) => ({
      section: groupe.section,
      champs: groupe.champs
        .sort((a, b) => {
          if (a.ordre !== null && b.ordre !== null) return a.ordre - b.ordre;
          if (a.ordre !== null) return -1;
          if (b.ordre !== null) return 1;
          return a.arrivee - b.arrivee;
        })
        .map((c) => c.champ),
    }));
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `deno test supabase/functions/admin-dossiers/champs.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-dossiers/champs.ts supabase/functions/admin-dossiers/champs.test.ts
git commit -m "feat(fiche): groupement des champs declares en sections"
```

---

### Task 4: Module `manifeste.ts` — normalisation des actions déclarées

Le manifeste vient d'un autre projet : il est traité comme une donnée à valider, jamais comme une instruction. Une action mal formée est écartée, elle ne casse pas la fiche.

**Files:**
- Create: `supabase/functions/admin-dossiers/manifeste.ts`
- Test: `supabase/functions/admin-dossiers/manifeste.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `normaliserManifeste(charge: unknown): ActionFiche[]`, `trouverAction(actions: ActionFiche[], id: unknown): ActionFiche | null`, `interface ActionFiche { id: string; libelle: string; icone: string | null; variante: "neutre" | "danger"; superAdmin: boolean; confirmation: Confirmation | null; parametres: ParametreAction[] }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `supabase/functions/admin-dossiers/manifeste.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normaliserManifeste, trouverAction } from "./manifeste.ts";

Deno.test("action minimale valide", () => {
  const actions = normaliserManifeste({ actions: [{ id: "re-extract", libelle: "Re-extraire" }] });
  assertEquals(actions.length, 1);
  assertEquals(actions[0], {
    id: "re-extract",
    libelle: "Re-extraire",
    icone: null,
    variante: "neutre",
    superAdmin: false,
    confirmation: null,
    parametres: [],
  });
});

Deno.test("charge invalide -> aucune action, jamais d'exception", () => {
  assertEquals(normaliserManifeste(null), []);
  assertEquals(normaliserManifeste({}), []);
  assertEquals(normaliserManifeste({ actions: "oui" }), []);
  assertEquals(normaliserManifeste({ actions: [null, 3, "x"] }), []);
});

Deno.test("action sans id ou sans libelle ecartee", () => {
  const actions = normaliserManifeste({
    actions: [{ libelle: "Sans id" }, { id: "sans-libelle" }, { id: "ok", libelle: "OK" }],
  });
  assertEquals(actions.map((a) => a.id), ["ok"]);
});

Deno.test("icone hors liste -> null, icone connue conservee", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", icone: "licorne" },
      { id: "b", libelle: "B", icone: "trash" },
    ],
  });
  assertEquals(actions.map((a) => a.icone), [null, "trash"]);
});

Deno.test("variante hors liste -> neutre", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", variante: "rose" },
      { id: "b", libelle: "B", variante: "danger" },
    ],
  });
  assertEquals(actions.map((a) => a.variante), ["neutre", "danger"]);
});

Deno.test("super_admin coerce en booleen", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", super_admin: true },
      { id: "b", libelle: "B", super_admin: "oui" },
      { id: "c", libelle: "C" },
    ],
  });
  assertEquals(actions.map((a) => a.superAdmin), [true, true, false]);
});

Deno.test("confirmation incomplete -> null", () => {
  const actions = normaliserManifeste({
    actions: [
      { id: "a", libelle: "A", confirmation: { titre: "T" } },
      { id: "b", libelle: "B", confirmation: { titre: "T", message: "M", bouton: "OK" } },
    ],
  });
  assertEquals(actions[0].confirmation, null);
  assertEquals(actions[1].confirmation, { titre: "T", message: "M", bouton: "OK" });
});

Deno.test("parametre de type inconnu ecarte", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [
        { id: "p1", type: "sorcellerie", libelle: "P1" },
        { id: "p2", type: "texte", libelle: "P2" },
      ],
    }],
  });
  assertEquals(action.parametres.map((p) => p.id), ["p2"]);
});

Deno.test("choix sans options non vides ecarte", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [
        { id: "vide", type: "choix", libelle: "Vide", options: [] },
        { id: "bon", type: "choix", libelle: "Bon", options: [{ valeur: "v", libelle: "L" }] },
      ],
    }],
  });
  assertEquals(action.parametres.map((p) => p.id), ["bon"]);
  assertEquals(action.parametres[0].options, [{ valeur: "v", libelle: "L" }]);
});

Deno.test("nombre: min et max par defaut quand absents ou non numeriques", () => {
  const [action] = normaliserManifeste({
    actions: [{
      id: "a",
      libelle: "A",
      parametres: [{ id: "n", type: "nombre", libelle: "N", min: "x", max: 100 }],
    }],
  });
  assertEquals(action.parametres[0].min, 0);
  assertEquals(action.parametres[0].max, 100);
});

Deno.test("trouverAction: retrouve par id, refuse l'inconnu", () => {
  const actions = normaliserManifeste({ actions: [{ id: "purge", libelle: "Purger" }] });
  assertEquals(trouverAction(actions, "purge")?.id, "purge");
  assertEquals(trouverAction(actions, "autre"), null);
  assertEquals(trouverAction(actions, undefined), null);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `deno test supabase/functions/admin-dossiers/manifeste.test.ts`
Expected: FAIL — `Module not found "./manifeste.ts"`.

- [ ] **Step 3: Écrire le module**

Créer `supabase/functions/admin-dossiers/manifeste.ts` :

```ts
// Normalisation du manifeste d'actions renvoye par l'EF d'administration d'un
// site. C'est une donnee venue d'un autre projet : elle est validee, jamais
// executee telle quelle. Une action mal formee est ecartee, la fiche reste
// affichable.
//
// Le flag super_admin construit l'interface ET conditionne le relais cote
// Baikal, mais l'autorisation qui fait foi reste celle de l'EF du site.
const ICONES = new Set([
  "send",
  "refresh",
  "coins",
  "trash",
  "mail",
  "download",
  "check",
  "alert",
]);
const TYPES_PARAMETRE = new Set(["choix", "nombre", "texte", "booleen"]);

export interface OptionChoix {
  valeur: string;
  libelle: string;
}

export interface ParametreAction {
  id: string;
  type: string;
  libelle: string;
  options: OptionChoix[];
  min: number;
  max: number;
  defaut: string | null;
}

export interface Confirmation {
  titre: string;
  message: string;
  bouton: string;
}

export interface ActionFiche {
  id: string;
  libelle: string;
  icone: string | null;
  variante: "neutre" | "danger";
  superAdmin: boolean;
  confirmation: Confirmation | null;
  parametres: ParametreAction[];
}

function texte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserOptions(brut: unknown): OptionChoix[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const option = o as Record<string, unknown>;
      const valeur = texte(option.valeur);
      const libelle = texte(option.libelle) || valeur;
      return valeur ? { valeur, libelle } : null;
    })
    .filter((o): o is OptionChoix => o !== null);
}

function normaliserParametre(brut: unknown): ParametreAction | null {
  if (!brut || typeof brut !== "object") return null;
  const p = brut as Record<string, unknown>;
  const id = texte(p.id);
  const type = texte(p.type);
  if (!id || !TYPES_PARAMETRE.has(type)) return null;
  const options = type === "choix" ? normaliserOptions(p.options) : [];
  if (type === "choix" && options.length === 0) return null;
  const min = Number.isFinite(Number(p.min)) ? Number(p.min) : 0;
  const max = Number.isFinite(Number(p.max)) ? Number(p.max) : 100;
  return {
    id,
    type,
    libelle: texte(p.libelle) || id,
    options,
    min,
    max,
    defaut: p.defaut === undefined || p.defaut === null ? null : String(p.defaut),
  };
}

function normaliserConfirmation(brut: unknown): Confirmation | null {
  if (!brut || typeof brut !== "object") return null;
  const c = brut as Record<string, unknown>;
  const titre = texte(c.titre);
  const message = texte(c.message);
  const bouton = texte(c.bouton);
  if (!titre || !message || !bouton) return null;
  return { titre, message, bouton };
}

export function normaliserManifeste(charge: unknown): ActionFiche[] {
  if (!charge || typeof charge !== "object") return [];
  const brut = (charge as Record<string, unknown>).actions;
  if (!Array.isArray(brut)) return [];
  return brut
    .map((a): ActionFiche | null => {
      if (!a || typeof a !== "object") return null;
      const action = a as Record<string, unknown>;
      const id = texte(action.id);
      const libelle = texte(action.libelle);
      if (!id || !libelle) return null;
      const icone = texte(action.icone);
      return {
        id,
        libelle,
        icone: ICONES.has(icone) ? icone : null,
        variante: action.variante === "danger" ? "danger" : "neutre",
        superAdmin: Boolean(action.super_admin),
        confirmation: normaliserConfirmation(action.confirmation),
        parametres: Array.isArray(action.parametres)
          ? action.parametres
            .map(normaliserParametre)
            .filter((p): p is ParametreAction => p !== null)
          : [],
      };
    })
    .filter((a): a is ActionFiche => a !== null);
}

export function trouverAction(actions: ActionFiche[], id: unknown): ActionFiche | null {
  if (typeof id !== "string") return null;
  return actions.find((a) => a.id === id) ?? null;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `deno test supabase/functions/admin-dossiers/manifeste.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Lancer toute la suite de la fonction**

Run: `deno test supabase/functions/admin-dossiers/`
Expected: PASS — les tests existants (`canal`, `filtres`, `relais`) et les trois nouveaux modules.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-dossiers/manifeste.ts supabase/functions/admin-dossiers/manifeste.test.ts
git commit -m "feat(fiche): normalisation defensive du manifeste d'actions"
```

---

### Task 5: Action `fiche` enrichie — sections, compteurs, capacités, manifeste

À la fin de cette tâche, `fiche` renvoie tout ce dont l'écran a besoin pour dessiner ses onglets, mais le contenu des onglets n'est pas encore servi. `site-detail` reste en place : rien ne casse.

**Files:**
- Modify: `supabase/functions/admin-dossiers/index.ts`

**Interfaces:**
- Consumes: `ONGLETS` (task 2), `grouperChamps` (task 3), `normaliserManifeste` (task 4), `preparerRelais` / `relaisConfigure` (existants).
- Produces: réponse de `fiche` = `{ disponible: true, dossier, sections, compteurs, vues, funnel, actions, actionsErreur }` où `compteurs: Record<string, number>` est indexé par clé d'onglet, `vues: string[]` liste les onglets disponibles, `actions: ActionFiche[]`, `actionsErreur: string | null`.

- [ ] **Step 1: Ajouter les imports et une fonction d'appel du relais**

Dans `supabase/functions/admin-dossiers/index.ts`, ajouter aux imports existants :

```ts
import { ONGLETS } from "./onglets.ts";
import { grouperChamps } from "./champs.ts";
import { type ActionFiche, normaliserManifeste } from "./manifeste.ts";
```

Puis, sous les helpers existants (`json`), ajouter :

```ts
// Un seul point d'appel du relais : toutes les actions inter-projets passent
// ici. Renvoie la charge JSON du site ou leve une ErreurRelais.
async function appelerRelais(
  site: Awaited<ReturnType<typeof chargerSite>>,
  corps: Record<string, unknown>,
): Promise<unknown> {
  const cible = preparerRelais(site);
  if (!cible) throw new ErreurRelais("Site sans canal d'administration configure");
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
    throw new ErreurRelais(`Site ${site.id}: HTTP ${reponse.status}`);
  }
  return charge;
}

// Le manifeste est demande POUR CE DOSSIER : c'est ainsi qu'un site n'expose
// une action que quand elle a un sens (credits pro sur un dossier b2b).
// Un relais en panne ne doit pas rendre la fiche illisible : on renvoie une
// liste vide et le motif.
async function chargerManifeste(
  site: Awaited<ReturnType<typeof chargerSite>>,
  dossierId: string,
): Promise<{ actions: ActionFiche[]; erreur: string | null }> {
  if (!relaisConfigure(site)) return { actions: [], erreur: null };
  try {
    const charge = await appelerRelais(site, { action: "manifeste", dossier_id: dossierId });
    return { actions: normaliserManifeste(charge), erreur: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin-dossiers] manifeste", message);
    return { actions: [], erreur: message };
  }
}
```

- [ ] **Step 2: Remplacer le corps de l'action `fiche`**

Remplacer le bloc `if (action === "fiche") { … }` par :

```ts
      if (action === "fiche") {
        const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
        if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
        const [dossier] = await sql`
          SELECT * FROM ${sql(schemaVues)}.baikal_dossiers WHERE dossier_id = ${dossierId}`;
        if (!dossier) return json({ data: null, error: "Dossier introuvable" }, 404);

        // Onglets reellement disponibles chez ce site : une vue absente n'est
        // pas une erreur, c'est un onglet qui ne s'affiche pas. unnest sur
        // deux tableaux parametres = une seule requete, sans un seul nom
        // d'objet concatene dans du SQL brut.
        const cles = Object.keys(ONGLETS);
        const nomsVues = cles.map((cle) => ONGLETS[cle].vue);
        const presentes = await sql`
          SELECT cle, to_regclass(${schemaVues} || '.' || vue) IS NOT NULL AS ok
          FROM unnest(${cles}::text[], ${nomsVues}::text[]) AS t(cle, vue)`;
        const vues = presentes.filter((v) => v.ok).map((v) => v.cle as string);

        // Compteurs : les libelles d'onglets ("Documents (3)") et le grisage
        // des onglets vides en dependent. Une requete par vue plutot qu'un
        // UNION ALL compose : la connexion est en max:1 de toute facon, et
        // sept count indexes sur dossier_id ne se discutent pas.
        const compteurs: Record<string, number> = {};
        for (const cle of vues) {
          const [c] = await sql`
            SELECT count(*) AS n FROM ${sql(schemaVues)}.${sql(ONGLETS[cle].vue)}
            WHERE dossier_id = ${dossierId}`;
          compteurs[cle] = Number(c.n);
        }

        // Champs declares : la vue est optionnelle, comme tout le reste.
        const [champsVue] = await sql`
          SELECT to_regclass(${schemaVues + ".baikal_dossier_champs"}) IS NOT NULL AS ok`;
        const sections = champsVue.ok
          ? grouperChamps(
            await sql`
              SELECT * FROM ${sql(schemaVues)}.baikal_dossier_champs
              WHERE dossier_id = ${dossierId}`,
          )
          : [];

        const manifeste = await chargerManifeste(site, dossierId);

        return json({
          data: {
            disponible: true,
            dossier: {
              ...dossier,
              canal: canalVente(dossier.attribution as Record<string, unknown> | null),
            },
            sections,
            compteurs,
            vues,
            funnel,
            actions: manifeste.actions,
            actionsErreur: manifeste.erreur,
          },
          error: null,
        });
      }
```

- [ ] **Step 3: Vérifier que la fonction se type et démarre**

Run: `deno check supabase/functions/admin-dossiers/index.ts`
Expected: aucune erreur de type.

Run: `deno test supabase/functions/admin-dossiers/`
Expected: PASS — les modules purs restent verts (l'index n'est pas testé unitairement, il est vérifié au déploiement).

- [ ] **Step 4: Déployer et appeler l'action sur un dossier réel**

Run: `npx supabase functions deploy admin-dossiers`

Puis ouvre `/clients` sur le site pack-vendeur dans le navigateur (préview `baikal-dev`), ouvre une fiche, et lis la réponse réseau de `admin-dossiers` : elle doit contenir `sections`, `compteurs`, `vues`, `actions`. Tant que Pré-état-daté n'a pas publié ses vues, `sections` est vide et `vues` ne contient que `emails` et `events` — c'est le comportement attendu, pas une panne.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-dossiers/index.ts
git commit -m "feat(fiche): action fiche enrichie (sections, compteurs, capacites, manifeste)"
```

---

### Task 6: Action `onglet` — contenu paginé d'un onglet

**Files:**
- Modify: `supabase/functions/admin-dossiers/index.ts`

**Interfaces:**
- Consumes: `resoudreOnglet`, `triEffectif`, `paginationOnglet` (task 2).
- Produces: réponse de `onglet` = `{ disponible: boolean, lignes: Record<string, unknown>[], total: number, page: number, parPage: number }`.

- [ ] **Step 1: Compléter les imports**

Dans `index.ts`, remplacer l'import de la task 5 par :

```ts
import { ONGLETS, paginationOnglet, resoudreOnglet, triEffectif } from "./onglets.ts";
```

- [ ] **Step 2: Ajouter l'action, juste après le bloc `fiche`**

```ts
      if (action === "onglet") {
        const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
        if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
        const def = resoudreOnglet(body.onglet);
        if (!def) return json({ data: null, error: `Onglet inconnu: ${body.onglet}` }, 400);

        const [presente] = await sql`
          SELECT to_regclass(${schemaVues + "." + def.vue}) IS NOT NULL AS ok`;
        if (!presente.ok) return json({ data: { disponible: false }, error: null });

        const colonnesOnglet = new Set(
          (await sql`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = ${schemaVues} AND table_name = ${def.vue}`)
            .map((c) => c.column_name as string),
        );
        const tri = triEffectif(def, colonnesOnglet);
        const { page, parPage } = paginationOnglet(body);

        const lignes = await sql`
          SELECT *, count(*) OVER() AS total_lignes
          FROM ${sql(schemaVues)}.${sql(def.vue)}
          WHERE dossier_id = ${dossierId}
          ${tri ? sql`ORDER BY ${sql.unsafe(tri)}` : sql``}
          LIMIT ${parPage} OFFSET ${(page - 1) * parPage}`;

        let total = lignes.length > 0 ? Number(lignes[0].total_lignes) : 0;
        if (lignes.length === 0 && page > 1) {
          // count(*) OVER() ne survit pas a une page vide : meme repli que la
          // liste des dossiers, sinon le total disparait au-dela du dernier
          // resultat.
          const [compte] = await sql`
            SELECT count(*) AS total FROM ${sql(schemaVues)}.${sql(def.vue)}
            WHERE dossier_id = ${dossierId}`;
          total = Number(compte.total);
        }

        return json({
          data: {
            disponible: true,
            lignes: lignes.map(({ total_lignes: _t, ...l }) => l),
            total,
            page,
            parPage,
          },
          error: null,
        });
      }
```

> `sql.unsafe(tri)` est sûr ici et **seulement** ici : `tri` est construit par `triEffectif` à partir de la table `ONGLETS` en dur, jamais à partir du corps de la requête. Ne généralise pas ce motif.

- [ ] **Step 3: Vérifier le typage**

Run: `deno check supabase/functions/admin-dossiers/index.ts`
Expected: aucune erreur.

- [ ] **Step 4: Déployer et appeler l'action**

Run: `npx supabase functions deploy admin-dossiers`

Vérifie avec un onglet qui existe déjà chez PED :

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/admin-dossiers" -H "Authorization: Bearer $JETON" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"action":"onglet","appId":"pack-vendeur","dossierId":"<un id reel>","onglet":"emails"}'
```

Expected: `{"data":{"disponible":true,"lignes":[…],"total":N,"page":1,"parPage":50}}`. Avec `"onglet":"documents"` avant publication des vues PED : `{"data":{"disponible":false}}` — pas une erreur.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-dossiers/index.ts
git commit -m "feat(fiche): action onglet, lecture paginee d'une vue contractuelle"
```

---

### Task 7: Action `fichier` et `site-action` adossée au manifeste

Sortie de cette tâche : la liste d'actions en dur `ACTIONS_SITE` disparaît de Baikal. C'est le site qui dit ce qu'il sait faire.

**Files:**
- Modify: `supabase/functions/admin-dossiers/index.ts`

**Interfaces:**
- Consumes: `appelerRelais`, `chargerManifeste` (task 5), `trouverAction` (task 4).
- Produces: réponse de `fichier` = la charge du site, attendue `{ url, expire_le }`.

- [ ] **Step 1: Compléter l'import du manifeste**

```ts
import { type ActionFiche, normaliserManifeste, trouverAction } from "./manifeste.ts";
```

- [ ] **Step 2: Remplacer tout le bloc relais existant**

Supprimer le bloc `if (action === "site-detail" || action === "site-action") { … }` **en entier**, y compris la constante `ACTIONS_SITE`, et le remplacer par :

```ts
    // Chemin relais : plus que deux usages, l'ouverture d'un fichier et
    // l'execution d'une action declaree par le site. La liste des actions
    // n'est plus connue de Baikal : elle vient du manifeste du site.
    if (action === "fichier" || action === "site-action") {
      const dossierId = typeof body.dossierId === "string" ? body.dossierId : "";
      if (!dossierId) return json({ data: null, error: "dossierId requis" }, 400);
      if (!relaisConfigure(site)) {
        return json({ data: null, error: "Site sans canal d'administration configure" }, 400);
      }

      if (action === "fichier") {
        const cible = body.cible === "resultat" ? "resultat" : "document";
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return json({ data: null, error: "id requis" }, 400);
        const charge = await appelerRelais(site, {
          action: "fichier",
          dossier_id: dossierId,
          cible,
          id,
        });
        return json({ data: charge, error: null });
      }

      // site-action : on redemande le manifeste pour ce dossier, ce qui
      // remplace exactement l'ancienne liste en dur -- une action absente du
      // manifeste n'est pas relayee.
      const manifeste = await chargerManifeste(site, dossierId);
      if (manifeste.erreur) {
        return json({ data: null, error: `Manifeste indisponible: ${manifeste.erreur}` }, 502);
      }
      const def = trouverAction(manifeste.actions, body.actionSite);
      if (!def) {
        return json({ data: null, error: `Action site inconnue: ${body.actionSite}` }, 400);
      }
      if (def.superAdmin) {
        const { data: profil } = await caller
          .from("profiles").select("app_role").eq("id", user.id).single();
        if (profil?.app_role !== "super_admin") {
          return json({ data: null, error: "Action reservee au super_admin" }, 403);
        }
      }

      // Les parametres sont relayes tels quels : c'est l'EF du site qui les
      // valide, elle seule connait ses bornes metier.
      const parametres: Record<string, unknown> = {};
      for (const p of def.parametres) {
        if (body.parametres && typeof body.parametres === "object") {
          const fourni = (body.parametres as Record<string, unknown>)[p.id];
          if (fourni !== undefined) parametres[p.id] = fourni;
        }
      }
      const charge = await appelerRelais(site, {
        action: def.id,
        dossier_id: dossierId,
        ...parametres,
      });
      return json({ data: charge, error: null });
    }
```

- [ ] **Step 3: Vérifier qu'aucune trace de `site-detail` ne subsiste**

Run: `grep -rn "site-detail\|ACTIONS_SITE" supabase/functions/`
Expected: aucun résultat.

Run: `deno check supabase/functions/admin-dossiers/index.ts`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier que la suite complète passe toujours**

Run: `deno test supabase/functions/admin-dossiers/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-dossiers/index.ts
git commit -m "refactor(fiche): actions issues du manifeste du site, fin de la liste en dur"
```

> À ce stade l'Edge Function ne sert plus `site-detail` : le front actuel perd ses cinq onglets d'extension. C'est attendu et c'est pourquoi les tâches 8 à 12 s'enchaînent sans déploiement intermédiaire en production. Si tu dois t'arrêter ici, ne déploie pas.

---

### Task 8: Front — formats et descriptions de colonnes

**Files:**
- Create: `src/components/console/fiche/formats.jsx`
- Create: `src/components/console/fiche/colonnes.js`

**Interfaces:**
- Consumes: `fmtDate`, `fmtDateHeure`, `fmtEur` de `src/components/console/badges-clients.jsx`.
- Produces: `formaterValeur(valeur, format)` → nœud React ou chaîne ; `COLONNES` → `Record<string, {cle, libelle, format, mono?}[]>` indexé par clé d'onglet.

- [ ] **Step 1: Écrire `formats.jsx`**

```jsx
/**
 * formats.jsx - Baikal Console
 * ============================================================================
 * Un seul endroit decide comment s'ecrit une valeur. Les sites fournissent
 * du brut et un nom de format ; Baikal applique le sien. C'est ce qui evite
 * que chaque produit invente sa facon d'ecrire un montant ou une date.
 * ============================================================================
 */
import { fmtDate, fmtDateHeure, fmtEur } from '../badges-clients';

export function fmtOctets(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formaterValeur(valeur, format = 'texte') {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  switch (format) {
    case 'euro':
      return fmtEur(valeur);
    case 'date':
      return fmtDate(valeur);
    case 'datetime':
      return fmtDateHeure(valeur);
    case 'pourcent': {
      const v = Number(valeur);
      return Number.isFinite(v) ? `${Math.round(v)} %` : '—';
    }
    case 'nombre': {
      const v = Number(valeur);
      return Number.isFinite(v) ? v.toLocaleString('fr-FR') : '—';
    }
    case 'octets':
      return fmtOctets(valeur);
    case 'booleen':
      return valeur === true || valeur === 'true' ? 'Oui' : 'Non';
    case 'lien':
      return (
        <a
          href={String(valeur)}
          target="_blank"
          rel="noreferrer"
          className="text-baikal-cyan hover:underline break-all"
        >
          {String(valeur)}
        </a>
      );
    case 'mono':
      return <span className="font-mono text-xs">{String(valeur)}</span>;
    default:
      return String(valeur);
  }
}

export const CLASSES_NIVEAU = {
  attention: 'text-amber-300',
  danger: 'text-red-300',
};
```

- [ ] **Step 2: Écrire `colonnes.js`**

```js
/**
 * colonnes.js - Baikal Console
 * ============================================================================
 * Description des colonnes de chaque onglet de type liste. C'est la seule
 * connaissance "metier" du front, et elle ne parle que du contrat commun :
 * aucun nom de table ni de produit n'apparait ici.
 *
 * Une colonne dont la cle est absente de la ligne n'est pas rendue : c'est la
 * regle "pas de colonne, pas de section" appliquee cote affichage.
 * ============================================================================
 */
export const COLONNES = {
  documents: [
    { cle: 'libelle', libelle: 'Pièce' },
    { cle: 'type', libelle: 'Type', format: 'mono' },
    { cle: 'nature', libelle: 'Nature' },
    { cle: 'pages', libelle: 'Pages', format: 'nombre' },
    { cle: 'taille_octets', libelle: 'Taille', format: 'octets' },
    { cle: 'depose_le', libelle: 'Déposé le', format: 'datetime' },
    { cle: 'source', libelle: 'Source' },
    { cle: 'statut', libelle: 'Statut' },
  ],
  resultats: [
    { cle: 'libelle', libelle: 'Livrable' },
    { cle: 'nature', libelle: 'Nature' },
    { cle: 'version', libelle: 'Version', format: 'nombre' },
    { cle: 'produit_le', libelle: 'Produit le', format: 'datetime' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'consulte_le', libelle: 'Consulté le', format: 'datetime' },
    { cle: 'telechargements', libelle: 'Téléch.', format: 'nombre' },
    { cle: 'url_publique', libelle: 'Lien', format: 'lien' },
  ],
  emails: [
    { cle: 'envoye_le', libelle: 'Envoyé le', format: 'datetime' },
    { cle: 'sujet', libelle: 'Sujet' },
    { cle: 'destinataire', libelle: 'Destinataire' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'ouvert_le', libelle: 'Ouvert le', format: 'datetime' },
    { cle: 'erreur', libelle: 'Erreur' },
  ],
  ia: [
    { cle: 'survenu_le', libelle: 'Date', format: 'datetime' },
    { cle: 'modele', libelle: 'Modèle', format: 'mono' },
    { cle: 'operation', libelle: 'Opération' },
    { cle: 'tokens_total', libelle: 'Tokens', format: 'nombre' },
    { cle: 'cout_usd', libelle: 'Coût' },
    { cle: 'latence_ms', libelle: 'Latence', format: 'nombre' },
    { cle: 'statut', libelle: 'Statut' },
  ],
};

// Libelles et rendu de chaque onglet. L'ordre de ce tableau est l'ordre a
// l'ecran : produit, entree, sortie, ce qu'on a envoye, ce qu'il a dit, les
// coulisses, le brut, le parcours.
export const ONGLETS_FICHE = [
  { cle: 'vue', libelle: 'Vue', rendu: 'fiche' },
  { cle: 'documents', libelle: 'Documents', rendu: 'liste' },
  { cle: 'resultats', libelle: 'Résultat', rendu: 'liste' },
  { cle: 'emails', libelle: 'Emails', rendu: 'liste' },
  { cle: 'chat', libelle: 'Chat', rendu: 'conversation' },
  { cle: 'ia', libelle: 'Logs IA', rendu: 'liste' },
  { cle: 'donnees', libelle: 'Données', rendu: 'blocs' },
  { cle: 'events', libelle: 'Events', rendu: 'timeline' },
];
```

- [ ] **Step 3: Vérifier le lint**

Run: `npm run lint`
Expected: aucun warning (le projet est en `--max-warnings 0`).

- [ ] **Step 4: Commit**

```bash
git add src/components/console/fiche/formats.jsx src/components/console/fiche/colonnes.js
git commit -m "feat(fiche): formats communs et description des colonnes"
```

---

### Task 9: Front — les cinq composants de rendu

**Files:**
- Create: `src/components/console/fiche/OngletFiche.jsx`
- Create: `src/components/console/fiche/OngletListe.jsx`
- Create: `src/components/console/fiche/OngletTimeline.jsx`
- Create: `src/components/console/fiche/OngletConversation.jsx`
- Create: `src/components/console/fiche/OngletBlocs.jsx`

**Interfaces:**
- Consumes: `formaterValeur`, `CLASSES_NIVEAU` (task 8), `Vide`, `LigneVide` de `../etats`, `BadgeCanal`, `fmtDateHeure`, `fmtEur`, `fmtDate` de `../badges-clients`.
- Produces: cinq composants, tous appelés avec `{ lignes, total, page, parPage, onPage }` sauf `OngletFiche` (`{ dossier, sections }`) ; `OngletListe` prend en plus `{ colonnes, onOuvrir }`.

- [ ] **Step 1: Écrire `OngletFiche.jsx`**

Le noyau reprend l'actuel `OngletVue` de `FicheDossier.jsx` (lignes 44-90), les sections déclarées sont nouvelles.

```jsx
/**
 * OngletFiche.jsx - Baikal Console
 * ============================================================================
 * Onglet Vue : le noyau commun (contact, transaction, origine, abonnement)
 * puis les sections declarees par le site. Baikal ne connait aucun des
 * libelles declares : il les range et applique le format demande.
 * ============================================================================
 */
import { BadgeCanal, fmtDate, fmtDateHeure, fmtEur } from '../badges-clients';
import { CLASSES_NIVEAU, formaterValeur } from './formats';

function Ligne({ libelle, className, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">{libelle}</dt>
      <dd className={`text-sm mt-0.5 ${className || 'text-white'}`}>{children ?? '—'}</dd>
    </div>
  );
}

export default function OngletFiche({ dossier: d, sections }) {
  const aAbonnement = d && 'abo_statut' in d;
  return (
    <div className="space-y-6">
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

      {(sections || []).map((s) => (
        <div key={s.section}>
          {s.section && (
            <h4 className="text-xs uppercase tracking-wide text-baikal-text opacity-60 mb-3 pb-1 border-b border-baikal-border">
              {s.section}
            </h4>
          )}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {s.champs.map((c, i) => (
              <Ligne
                key={`${c.libelle}-${i}`}
                libelle={c.libelle}
                className={CLASSES_NIVEAU[c.niveau] || 'text-white'}
              >
                {formaterValeur(c.valeur, c.format)}
              </Ligne>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Écrire `OngletListe.jsx`**

```jsx
/**
 * OngletListe.jsx - Baikal Console
 * ============================================================================
 * Tableau generique des onglets de liste (Documents, Resultat, Emails,
 * Logs IA). Une colonne absente de TOUTES les lignes n'est pas rendue : c'est
 * la regle "pas de colonne, pas de section" appliquee a l'affichage. La
 * colonne details, quand elle existe, se replie sous la ligne.
 * ============================================================================
 */
import { useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { LigneVide, Vide } from '../etats';
import { formaterValeur } from './formats';

function LigneDetails({ details, colonnes }) {
  return (
    <tr className="border-t border-baikal-border/30 bg-baikal-bg/40">
      <td colSpan={colonnes} className="px-4 py-2">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(details).map(([cle, valeur]) => (
            <div key={cle}>
              <dt className="text-[11px] uppercase tracking-wide text-baikal-text opacity-60">{cle}</dt>
              <dd className="text-xs text-white">{String(valeur)}</dd>
            </div>
          ))}
        </dl>
      </td>
    </tr>
  );
}

export default function OngletListe({
  colonnes, lignes, total, page, parPage, onPage, onOuvrir, vide,
}) {
  const [deplie, setDeplie] = useState(null);
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;

  // Une colonne n'est affichee que si au moins une ligne la porte.
  const visibles = colonnes.filter((c) => lignes.some((l) => l[c.cle] !== undefined && l[c.cle] !== null));
  const aDetails = lignes.some((l) => l.details && Object.keys(l.details).length > 0);
  const aOuvrir = Boolean(onOuvrir) && lignes.some((l) => l.ouvrable);
  const nbColonnes = visibles.length + (aDetails ? 1 : 0) + (aOuvrir ? 1 : 0);
  const pages = Math.max(1, Math.ceil(total / parPage));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
              {aDetails && <th className="py-2 w-6"></th>}
              {visibles.map((c) => <th key={c.cle} className="py-2 pr-4">{c.libelle}</th>)}
              {aOuvrir && <th className="py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && <LigneVide colonnes={nbColonnes} message={vide} />}
            {lignes.map((l, i) => {
              const id = l.document_id || l.resultat_id || i;
              const porteDetails = l.details && Object.keys(l.details).length > 0;
              return (
                <>
                  <tr key={id} className="border-t border-baikal-border/50">
                    {aDetails && (
                      <td className="py-2">
                        {porteDetails && (
                          <button
                            onClick={() => setDeplie(deplie === id ? null : id)}
                            className="text-baikal-text hover:text-baikal-cyan"
                            aria-label="Détails"
                          >
                            <ChevronRight
                              className={`w-4 h-4 transition-transform ${deplie === id ? 'rotate-90' : ''}`}
                            />
                          </button>
                        )}
                      </td>
                    )}
                    {visibles.map((c) => (
                      <td key={c.cle} className="py-2 pr-4 max-w-[260px] truncate">
                        {formaterValeur(l[c.cle], c.format)}
                      </td>
                    ))}
                    {aOuvrir && (
                      <td className="py-2">
                        {l.ouvrable && (
                          <button
                            onClick={() => onOuvrir(l)}
                            className="inline-flex items-center gap-1 text-baikal-cyan hover:underline text-xs"
                          >
                            Ouvrir <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {deplie === id && porteDetails && (
                    <LigneDetails key={`${id}-details`} details={l.details} colonnes={nbColonnes} />
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-baikal-text">
          <span>
            Page {page} sur {pages} · {(page - 1) * parPage + 1}–
            {Math.min(page * parPage, total)} / {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 rounded-md border border-baikal-border disabled:opacity-40 hover:border-baikal-cyan"
            >
              Précédent
            </button>
            <button
              onClick={() => onPage(page + 1)}
              disabled={page >= pages}
              className="px-2 py-1 rounded-md border border-baikal-border disabled:opacity-40 hover:border-baikal-cyan"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

> Le `<>` sans clé autour de deux `<tr>` déclenche un warning React. Utilise `<Fragment key={id}>` importé de `react` à la place de `<>` dans le `map` — corrige-le avant le lint, il est en `--max-warnings 0`.

- [ ] **Step 3: Écrire `OngletTimeline.jsx`**

```jsx
/**
 * OngletTimeline.jsx - Baikal Console
 * ============================================================================
 * Onglet Events : le parcours client. Le libelle du site prime, le type brut
 * sert de repli -- un produit qui ne nomme pas ses evenements reste lisible.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';

const COULEUR_ACTEUR = {
  client: 'text-baikal-cyan',
  admin: 'text-amber-300',
  systeme: 'text-baikal-text',
};

export default function OngletTimeline({ lignes, vide }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  return (
    <ul className="space-y-2">
      {lignes.map((ev, i) => (
        <li key={i} className="text-sm text-baikal-text flex items-start gap-3">
          <span className="whitespace-nowrap text-xs opacity-60 mt-0.5">
            {fmtDateHeure(ev.survenu_le)}
          </span>
          <div className="min-w-0">
            <span className={`text-xs ${ev.libelle ? 'text-white' : 'font-mono text-white'}`}>
              {ev.libelle || ev.type}
            </span>
            {ev.acteur && (
              <span className={`ml-2 text-[11px] ${COULEUR_ACTEUR[ev.acteur] || 'opacity-60'}`}>
                {ev.acteur}
              </span>
            )}
            {ev.detail?.page && (
              <span className="ml-2 text-xs opacity-60 break-all">{ev.detail.page}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Écrire `OngletConversation.jsx`**

```jsx
/**
 * OngletConversation.jsx - Baikal Console
 * ============================================================================
 * Onglet Chat : les echanges, dans l'ordre chronologique. Le role vient du
 * contrat (client / assistant / agent) -- aucun produit n'est nomme ici.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';

const STYLE_ROLE = {
  client: 'bg-baikal-bg border-baikal-border',
  assistant: 'bg-baikal-surface border-baikal-cyan/40',
  agent: 'bg-amber-900/10 border-amber-500/40',
};
const NOM_ROLE = { client: 'Client', assistant: 'Assistant', agent: 'Équipe' };

export default function OngletConversation({ lignes, vide }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  return (
    <ul className="space-y-3">
      {lignes.map((m, i) => (
        <li
          key={m.message_id || i}
          className={`p-3 rounded-md border ${STYLE_ROLE[m.role] || STYLE_ROLE.client}`}
        >
          <div className="flex items-center gap-2 text-xs text-baikal-text opacity-60">
            <span className="text-white">{NOM_ROLE[m.role] || m.role}</span>
            <span>{fmtDateHeure(m.survenu_le)}</span>
            {m.canal && <span>· {m.canal}</span>}
            {m.contexte && <span className="break-all">· {m.contexte}</span>}
          </div>
          <p className="text-sm text-baikal-text mt-1 whitespace-pre-wrap">{m.contenu}</p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Écrire `OngletBlocs.jsx`**

```jsx
/**
 * OngletBlocs.jsx - Baikal Console
 * ============================================================================
 * Onglet Donnees : le mouchard brut, un accordeon par bloc. Aucune structure
 * n'est supposee -- c'est precisement l'interet de cet onglet.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';

export default function OngletBlocs({ lignes, vide }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  return (
    <div className="space-y-2">
      {lignes.map((b, i) => (
        <details key={b.bloc || i} className="border border-baikal-border rounded-md">
          <summary className="px-3 py-2 text-sm text-baikal-text cursor-pointer select-none flex items-center gap-2">
            <span className="text-white">{b.libelle || b.bloc}</span>
            {b.maj_le && (
              <span className="text-xs opacity-60">· {fmtDateHeure(b.maj_le)}</span>
            )}
          </summary>
          <pre className="m-2 p-2 bg-baikal-bg border border-baikal-border rounded text-[11px] text-baikal-text overflow-x-auto max-h-96 overflow-y-auto">
            {JSON.stringify(b.contenu, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Vérifier le lint**

Run: `npm run lint`
Expected: aucun warning. Si React signale une clé manquante dans `OngletListe`, applique la correction `Fragment` signalée au Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/components/console/fiche/
git commit -m "feat(fiche): cinq rendus generiques (fiche, liste, timeline, conversation, blocs)"
```

---

### Task 10: Front — barre d'actions pilotée par le manifeste

**Files:**
- Create: `src/components/console/fiche/BarreActions.jsx`

**Interfaces:**
- Consumes: `dossiersService.executerActionSite` (task 11 modifie sa signature — utilise dès maintenant `(appId, dossierId, actionSite, parametres)`), `ConfirmModal` de `../../ui/ConfirmModal`.
- Produces: `<BarreActions appId dossierId actions isSuperAdmin onFait />`.

- [ ] **Step 1: Écrire le composant**

```jsx
/**
 * BarreActions.jsx - Baikal Console
 * ============================================================================
 * Les boutons de la fiche sont construits a partir du manifeste renvoye par
 * le site : Baikal ne connait ni les libelles, ni les types d'email, ni les
 * bornes. Le manifeste est calcule par dossier, donc une action qui n'a pas
 * de sens ici n'apparait pas.
 *
 * super_admin filtre l'affichage ET le relais, mais l'autorisation qui fait
 * foi reste celle de l'EF du site.
 * ============================================================================
 */
import { useState } from 'react';
import {
  AlertTriangle, Check, Coins, Download, Mail, RefreshCw, Send, Trash2,
} from 'lucide-react';
import ConfirmModal from '../../ui/ConfirmModal';
import { dossiersService } from '../../../services/dossiers.service';

const ICONES = {
  send: Send,
  refresh: RefreshCw,
  coins: Coins,
  trash: Trash2,
  mail: Mail,
  download: Download,
  check: Check,
  alert: AlertTriangle,
};

function ChampParametre({ parametre, valeur, onChange }) {
  const classe = 'px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs '
    + 'text-baikal-text focus:outline-none focus:border-baikal-cyan';
  if (parametre.type === 'choix') {
    return (
      <select value={valeur} onChange={(e) => onChange(e.target.value)} className={classe}>
        {parametre.options.map((o) => (
          <option key={o.valeur} value={o.valeur}>{o.libelle}</option>
        ))}
      </select>
    );
  }
  if (parametre.type === 'nombre') {
    return (
      <input
        type="number"
        min={parametre.min}
        max={parametre.max}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className={`${classe} w-16`}
        aria-label={parametre.libelle}
      />
    );
  }
  if (parametre.type === 'booleen') {
    return (
      <label className="flex items-center gap-1 text-xs text-baikal-text">
        <input
          type="checkbox"
          checked={valeur === true || valeur === 'true'}
          onChange={(e) => onChange(e.target.checked)}
        />
        {parametre.libelle}
      </label>
    );
  }
  return (
    <input
      type="text"
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      placeholder={parametre.libelle}
      className={classe}
      aria-label={parametre.libelle}
    />
  );
}

function valeurInitiale(parametre) {
  if (parametre.defaut !== null) return parametre.defaut;
  if (parametre.type === 'choix') return parametre.options[0].valeur;
  if (parametre.type === 'nombre') return String(parametre.min || 1);
  if (parametre.type === 'booleen') return false;
  return '';
}

export default function BarreActions({ appId, dossierId, actions, isSuperAdmin, onFait }) {
  const visibles = (actions || []).filter((a) => !a.superAdmin || isSuperAdmin);
  const [valeurs, setValeurs] = useState(() => {
    const initial = {};
    for (const a of visibles) {
      for (const p of a.parametres) initial[`${a.id}:${p.id}`] = valeurInitiale(p);
    }
    return initial;
  });
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  if (visibles.length === 0) return null;

  const lancer = async (action) => {
    setEnCours(action.id);
    setMessage(null);
    const parametres = {};
    for (const p of action.parametres) parametres[p.id] = valeurs[`${action.id}:${p.id}`];
    const { data, error } = await dossiersService.executerActionSite(
      appId, dossierId, action.id, parametres,
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
        {visibles.map((action) => {
          const Icone = ICONES[action.icone] || null;
          const danger = action.variante === 'danger';
          return (
            <span key={action.id} className={`flex items-center gap-1.5 ${danger ? 'ml-auto' : ''}`}>
              {action.parametres.map((p) => (
                <ChampParametre
                  key={p.id}
                  parametre={p}
                  valeur={valeurs[`${action.id}:${p.id}`]}
                  onChange={(v) => setValeurs((etat) => ({ ...etat, [`${action.id}:${p.id}`]: v }))}
                />
              ))}
              <button
                onClick={() => (action.confirmation
                  ? setConfirmation(action)
                  : lancer(action))}
                disabled={enCours !== null}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs disabled:opacity-50 ${
                  danger
                    ? 'border-red-500/50 text-red-300 hover:bg-red-900/20'
                    : 'border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan'
                }`}
              >
                {Icone && (
                  <Icone
                    className={`w-3.5 h-3.5 ${
                      enCours === action.id && action.icone === 'refresh' ? 'animate-spin' : ''
                    }`}
                  />
                )}
                {enCours === action.id ? 'En cours…' : action.libelle}
              </button>
            </span>
          );
        })}
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {message.texte}
        </p>
      )}
      {confirmation && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation;
            setConfirmation(null);
            lancer(action);
          }}
          title={confirmation.confirmation.titre}
          message={confirmation.confirmation.message}
          confirmLabel={confirmation.confirmation.bouton}
          variant={confirmation.variante === 'danger' ? 'danger' : 'info'}
          icon={ICONES[confirmation.icone] || AlertTriangle}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier le lint**

Run: `npm run lint`
Expected: aucun warning.

- [ ] **Step 3: Commit**

```bash
git add src/components/console/fiche/BarreActions.jsx
git commit -m "feat(fiche): barre d'actions construite depuis le manifeste du site"
```

---

### Task 11: Front — coquille `Fiche.jsx`, service, branchement de la page

**Files:**
- Create: `src/components/console/fiche/Fiche.jsx`
- Modify: `src/services/dossiers.service.js`
- Modify: `src/pages/Clients.jsx`

**Interfaces:**
- Consumes: tous les composants des tâches 8-10, `useDonneesCachees`, `useAuth`.
- Produces: `dossiersService.getOnglet(appId, dossierId, onglet, page, parPage)`, `dossiersService.getFichier(appId, dossierId, cible, id)`, `<Fiche appId dossierId onClose />`.

- [ ] **Step 1: Mettre à jour le service**

Dans `src/services/dossiers.service.js`, remplacer `getDetailSite` et `executerActionSite` par :

```js
  getOnglet(appId, dossierId, onglet, page = 1, parPage = 50) {
    return appelerEdge('admin-dossiers', {
      action: 'onglet', appId, dossierId, onglet, page, parPage,
    });
  },
  getFichier(appId, dossierId, cible, id) {
    return appelerEdge('admin-dossiers', { action: 'fichier', appId, dossierId, cible, id });
  },
  executerActionSite(appId, dossierId, actionSite, parametres = {}) {
    return appelerEdge('admin-dossiers', {
      action: 'site-action', appId, dossierId, actionSite, parametres,
    });
  },
```

> `parametres` est désormais un objet imbriqué, plus un étalement à plat : c'est ce qu'attend l'Edge Function depuis la tâche 7.

- [ ] **Step 2: Écrire `Fiche.jsx`**

```jsx
/**
 * Fiche.jsx - Baikal Console
 * ============================================================================
 * Fiche d'une transaction : huit onglets identiques pour tous les produits,
 * lus dans les vues contractuelles du site. Un onglet dont le site n'a pas la
 * vue ne s'affiche pas -- ce n'est pas une erreur, c'est une capacite absente.
 *
 * Chaque onglet charge son contenu a l'ouverture (useDonneesCachees garde le
 * deja-vu) : la fiche ne tire jamais huit lots de donnees d'un coup.
 * ============================================================================
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDonneesCachees } from '../../../hooks/useDonneesCachees';
import { dossiersService } from '../../../services/dossiers.service';
import { Chargement, Erreur } from '../etats';
import { BadgeEtape } from '../badges-clients';
import { COLONNES, ONGLETS_FICHE } from './colonnes';
import BarreActions from './BarreActions';
import OngletBlocs from './OngletBlocs';
import OngletConversation from './OngletConversation';
import OngletFiche from './OngletFiche';
import OngletListe from './OngletListe';
import OngletTimeline from './OngletTimeline';

const VIDES = {
  documents: 'Aucune pièce déposée sur ce dossier.',
  resultats: "Aucun livrable produit pour l'instant.",
  emails: 'Aucun email envoyé.',
  chat: 'Aucun échange dans l’outil.',
  ia: 'Aucun appel IA sur ce dossier.',
  donnees: 'Aucune donnée brute exposée par ce site.',
  events: 'Aucun événement.',
};

function ContenuOnglet({ appId, dossierId, onglet, version, onOuvrir }) {
  const [page, setPage] = useState(1);
  const { donnees, erreur } = useDonneesCachees(
    `onglet:${appId}:${dossierId}:${onglet.cle}:${page}:${version}`,
    () => dossiersService.getOnglet(appId, dossierId, onglet.cle, page),
    appId,
  );
  if (erreur) return <Erreur message={erreur} />;
  if (!donnees) return <Chargement />;

  const commun = {
    lignes: donnees.lignes || [],
    total: donnees.total || 0,
    page: donnees.page || 1,
    parPage: donnees.parPage || 50,
    onPage: setPage,
    vide: VIDES[onglet.cle],
  };
  if (onglet.rendu === 'conversation') return <OngletConversation {...commun} />;
  if (onglet.rendu === 'timeline') return <OngletTimeline {...commun} />;
  if (onglet.rendu === 'blocs') return <OngletBlocs {...commun} />;

  const total = onglet.cle === 'ia'
    ? (donnees.lignes || []).reduce((s, l) => s + (Number(l.cout_usd) || 0), 0)
    : null;
  return (
    <div className="space-y-3">
      {total !== null && total > 0 && (
        <p className="text-sm text-baikal-text">
          Coût de cette page : <span className="text-white font-semibold">{total.toFixed(4)} $</span>
        </p>
      )}
      <OngletListe
        {...commun}
        colonnes={COLONNES[onglet.cle] || []}
        onOuvrir={onOuvrir ? (ligne) => onOuvrir(onglet.cle, ligne) : null}
      />
    </div>
  );
}

export default function Fiche({ appId, dossierId, onClose }) {
  const [onglet, setOnglet] = useState('vue');
  const [version, setVersion] = useState(0);
  const [erreurFichier, setErreurFichier] = useState(null);
  const { isSuperAdmin } = useAuth();
  const { donnees, erreur } = useDonneesCachees(
    `fiche:${appId}:${dossierId}:${version}`,
    () => dossiersService.getFiche(appId, dossierId),
    appId,
  );
  const d = donnees?.dossier;
  const vues = donnees?.vues || [];
  const compteurs = donnees?.compteurs || {};

  // L'ouverture d'un fichier passe par le site : lui seul sait signer une URL.
  const ouvrir = async (cleOnglet, ligne) => {
    setErreurFichier(null);
    const cible = cleOnglet === 'resultats' ? 'resultat' : 'document';
    const id = ligne.resultat_id || ligne.document_id;
    const { data, error } = await dossiersService.getFichier(appId, dossierId, cible, id);
    if (error) {
      setErreurFichier(error.message);
      return;
    }
    if (data?.url) window.open(data.url, '_blank', 'noreferrer');
  };

  const onglets = d
    ? ONGLETS_FICHE.filter((o) => o.cle === 'vue' || vues.includes(o.cle))
    : [];
  const actif = onglets.find((o) => o.cle === onglet) || onglets[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-4xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {d && <BadgeEtape statut={d.statut} payeLe={d.paye_le} funnel={donnees?.funnel} />}
              <h3 className="text-white font-semibold truncate">
                {d?.email || d?.contact_nom || dossierId}
              </h3>
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

        {d && (
          <BarreActions
            appId={appId}
            dossierId={dossierId}
            actions={donnees.actions}
            isSuperAdmin={isSuperAdmin}
            onFait={() => setVersion((v) => v + 1)}
          />
        )}

        {onglets.length > 0 && (
          <nav className="flex gap-1 px-4 border-b border-baikal-border overflow-x-auto">
            {onglets.map((o) => {
              const n = compteurs[o.cle];
              return (
                <button
                  key={o.cle}
                  onClick={() => setOnglet(o.cle)}
                  className={`px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors
                    ${actif?.cle === o.cle
                      ? 'border-baikal-cyan text-baikal-cyan'
                      : 'border-transparent text-baikal-text hover:text-white'}
                    ${n === 0 ? 'opacity-50' : ''}`}
                >
                  {o.libelle}{n !== undefined ? ` (${n})` : ''}
                </button>
              );
            })}
          </nav>
        )}

        <div className="p-4 space-y-3">
          {erreur && <Erreur message={erreur} />}
          {donnees?.actionsErreur && (
            <p className="text-xs text-amber-300">
              Actions indisponibles : {donnees.actionsErreur}
            </p>
          )}
          {erreurFichier && <Erreur message={erreurFichier} />}
          {!donnees && !erreur && <Chargement />}
          {d && actif?.cle === 'vue' && (
            <OngletFiche dossier={d} sections={donnees.sections} />
          )}
          {d && actif && actif.cle !== 'vue' && (
            <ContenuOnglet
              key={actif.cle}
              appId={appId}
              dossierId={dossierId}
              onglet={actif}
              version={version}
              onOuvrir={['documents', 'resultats'].includes(actif.cle) ? ouvrir : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Brancher la page**

Dans `src/pages/Clients.jsx`, remplacer l'import de `FicheDossier` par :

```jsx
import Fiche from '../components/console/fiche/Fiche';
```

et l'usage `<FicheDossier … />` par `<Fiche … />` (mêmes props : `appId`, `dossierId`, `onClose`).

Run: `grep -n "FicheDossier" src/pages/Clients.jsx`
Expected: aucun résultat.

- [ ] **Step 4: Lint et build**

Run: `npm run lint`
Expected: aucun warning.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Commit**

```bash
git add src/components/console/fiche/Fiche.jsx src/services/dossiers.service.js src/pages/Clients.jsx
git commit -m "feat(fiche): coquille a huit onglets et chargement par onglet"
```

---

### Task 12: Bascule — suppression de l'ancien rendu et contrôle de parité

Ne commence cette tâche que lorsque Pré-état-daté a publié ses six vues et ses deux actions (tâche 1).

**Files:**
- Delete: `src/components/console/FicheDossier.jsx`
- Delete: `src/components/console/extensions/ped.jsx` (et le dossier `extensions/`)

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: rien ; c'est une suppression et une vérification.

- [ ] **Step 1: Vérifier qu'aucun import ne subsiste**

Run: `grep -rn "FicheDossier\|EXTENSIONS_FICHE\|extensions/ped\|getDetailSite" src/`
Expected: aucun résultat. S'il en reste, corrige l'appelant avant de supprimer.

- [ ] **Step 2: Supprimer les fichiers**

```bash
git rm src/components/console/FicheDossier.jsx src/components/console/extensions/ped.jsx
```

- [ ] **Step 3: Lint et build**

Run: `npm run lint`
Expected: aucun warning.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 4: Déployer l'Edge Function**

Run: `npx supabase functions deploy admin-dossiers`

- [ ] **Step 5: Contrôle de parité, à l'écran**

Ouvre la préview `baikal-dev`, va sur `/clients` avec le site pack-vendeur, choisis un dossier **payé et complet** (documents déposés, PDF généré, échanges de chat). Compare chaque onglet avec l'onglet Dossiers du `/admin` de Pré-état-daté, sur le même dossier :

| À vérifier | Attendu |
|---|---|
| Vue | mêmes champs métier (adresse, ville, lot, surface, copropriété, syndic), même montant, même origine |
| Documents | même nombre de pièces, mêmes noms, mêmes tailles ; « Ouvrir » télécharge bien le fichier |
| Résultat | PDF ouvrable, lien de partage identique, même date de consultation notaire |
| Emails | même nombre d'envois, mêmes statuts |
| Chat | même nombre d'échanges, question puis réponse dans l'ordre |
| Logs IA | même nombre d'appels, coût identique au centième |
| Données | mêmes blocs JSON |
| Events | mêmes événements, même ordre |
| Boutons | les cinq actions PED présentes, « Purger » en rouge et visible du seul super_admin |

Écart toléré : aucun. Un écart de comptage signale une vue mal filtrée côté PED (dossiers de test, lignes supprimées) — corrige la vue, pas l'affichage.

- [ ] **Step 6: Vérifier un site sans vues**

Bascule le sélecteur de site sur voirie ou MonsieurDPE et ouvre une fiche. Attendu : l'onglet Vue s'affiche, les onglets sans vue sont absents, aucun message d'erreur, aucun bouton. C'est la preuve que l'agnosticisme tient.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(fiche): suppression du rendu specifique Pre-etat-date"
```

---

## Auto-revue du plan

**Couverture de la spec :**

| Section de la spec | Tâche |
|---|---|
| §3.1 règle de capacité | 5 (compteurs + `vues`), 6 (`disponible:false`), 9 (colonnes absentes) |
| §3.2 motif commun | 8 (`colonnes.js`), 9 (`OngletListe`) |
| §3.3 champs déclarés | 3 (`champs.ts`), 9 (`OngletFiche`) |
| §3.4 à §3.10 vues | 1 (prompt PED), 2 (`ONGLETS`), 8 (colonnes) |
| §4 actions de l'EF | 5 (`fiche`), 6 (`onglet`), 7 (`fichier`) |
| §5 manifeste | 4 (normalisation), 7 (relais), 10 (rendu) |
| §6 5 rendus | 9, 11 |
| §7 états vides et erreurs | 6, 9, 11 (`actionsErreur`, `erreurFichier`) |
| §8 chantier PED | 1 |
| §9 lots | 1 = lot 1 ; 2-12 = lot 2 ; le lot 3 est hors plan (aucun code) |
| §10 parité | 12 |

**Cohérence des noms** (vérifiée d'une tâche à l'autre) : `resoudreOnglet` / `triEffectif` / `paginationOnglet` (2) sont appelés tels quels en 6 ; `grouperChamps` (3) en 5 ; `normaliserManifeste` / `trouverAction` (4) en 5 et 7 ; `formaterValeur` (8) en 9 ; `COLONNES` / `ONGLETS_FICHE` (8) en 11 ; `getOnglet` / `getFichier` / `executerActionSite(…, parametres)` (11) sont utilisés par `Fiche.jsx` et `BarreActions.jsx`. Les clés d'onglet (`documents`, `resultats`, `emails`, `chat`, `ia`, `donnees`, `events`) sont identiques dans `ONGLETS` (EF) et `ONGLETS_FICHE` (front) — toute divergence casserait silencieusement un onglet.

**Point de vigilance pour l'exécutant :** après la tâche 7, l'Edge Function ne répond plus à `site-detail` alors que le front ne sait pas encore lire les nouveaux onglets. Enchaîne les tâches 8 à 12 sans déployer en production entre les deux.
