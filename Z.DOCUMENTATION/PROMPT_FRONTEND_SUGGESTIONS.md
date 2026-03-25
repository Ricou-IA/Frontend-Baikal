# Prompt : Suppression du Wizard + Ajout des Suggestions contextuelles

## Contexte

Tu travailles sur le frontend **ARPET** (React 18 + Vite, JSX, TailwindCSS). L'app utilise un backend Supabase avec une Edge Function `baikal-retrieval` qui gere le RAG (Retrieval-Augmented Generation).

Le backend vient d'etre mis a jour avec une nouvelle feature **Suggestions contextuelles** : apres chaque reponse, le backend peut renvoyer 3 questions de suivi pertinentes basees sur les documents trouves. Cette feature remplace l'ancien mode **Wizard ("Recherche croisee")** qui ne fonctionnait pas bien en UX.

---

## Ce qu'il faut faire

### 1. SUPPRIMER l'ancien Wizard ("Recherche croisee")

L'ancien Wizard est un mode de recherche en 3 etapes ("etape 1/3, etape 2/3...") qui qualifiait la question de l'utilisateur. Il faut :

- **Supprimer** tous les composants, hooks, services et state lies au Wizard / "Recherche croisee"
- **Supprimer** le bouton/toggle qui active le mode Wizard dans l'interface du chat
- **Supprimer** toute logique conditionnelle `if (wizardMode)` ou `if (crossRef)` dans le chat handler
- **Nettoyer** les imports et les fichiers devenus orphelins

Cherche dans le codebase avec ces mots-cles :
- `wizard`, `Wizard`
- `recherche croisée`, `recherche_croisee`, `cross_ref`, `crossRef`
- `etape`, `step 1/3`, `step 2/3`, `step 3/3`
- `enrichissement`, `qualify`, `qualification`

### 2. AJOUTER le support de l'event SSE `suggestions`

#### 2.1. Contrat SSE du backend (baikal-retrieval v2.0)

Le backend envoie les events SSE dans cet ordre :

```
event: step       → { step: "received", message: "Question reçue" }
event: step       → { step: "analyzing", message: "Analyse de la question..." }
event: step       → { step: "memory", message: "Mémoire collective..." }
event: step       → { step: "search", message: "Recherche documentaire..." }
event: step       → { step: "files_found", message: "2 document(s) trouvés" }
event: step       → { step: "mode", message: "🧩 Mode RAG Chunks" }
event: step       → { step: "generating", message: "Génération..." }
event: token      → { content: "La " }          ← x N (streaming)
event: token      → { content: "charte " }
...
event: suggestions → { suggestions: [...] }       ← NOUVEAU (optionnel)
event: sources    → { sources: [...], timings: {...}, ... }
event: done       → {}
```

**L'event `suggestions` est OPTIONNEL** : il n'arrive que si :
- Le frontend a envoye `enable_suggestions: true` dans le body de la requete
- Le backend a reussi a generer des suggestions (timeout 3s, non-fatal)

#### 2.2. Format de l'event `suggestions`

```json
{
  "suggestions": [
    {
      "text": "Quels sont les lieux de dépôt des déblais en excédent ?",
      "source_hint": "31.2."
    },
    {
      "text": "Comment se déroule l'évacuation des déchets sur le chantier ?",
      "source_hint": "16 Evacuation des chantiers et des déchets"
    },
    {
      "text": "Quelles sont les exigences de la norme NFP03-001 ?",
      "source_hint": "Norme NFP03-001"
    }
  ]
}
```

Chaque suggestion a :
- `text` (string) : la question de suivi, en francais, max 80 caracteres
- `source_hint` (string) : indication du document ou de la section source

#### 2.3. Body de la requete vers baikal-retrieval

```javascript
const body = {
  query: "Que dit la charte chantier vert ?",
  user_id: user.id,
  org_id: org.id,
  project_id: project.id,
  stream: true,
  enable_suggestions: true,   // ← NOUVEAU : active les suggestions
  // ... autres params existants (generation_mode, include_app_layer, etc.)
}
```

Le param `enable_suggestions` est un boolean opt-in. La valeur par defaut est `false` (backward compatible).

### 3. AJOUTER un toggle "Assistant" dans le chat

#### 3.1. Comportement du toggle

- **Position** : dans la zone de saisie du chat (a cote du bouton d'envoi ou au-dessus de l'input)
- **Label** : "Assistant" ou "Suggestions" (a adapter au design existant)
- **Etat** : ON/OFF, persiste en localStorage (`arpet_enable_suggestions`)
- **Par defaut** : OFF (l'utilisateur choisit d'activer)
- **Quand ON** : le frontend envoie `enable_suggestions: true` dans le body
- **Quand OFF** : le frontend envoie `enable_suggestions: false` ou ne l'envoie pas

#### 3.2. UX du toggle

Le toggle ne doit PAS etre intrusif. C'est un petit switch discret, style :

```
[💡 Assistant]  ← toggle switch style chip/pill
```

### 4. AFFICHER les suggestions comme des chips cliquables

#### 4.1. Positionnement

Les suggestions s'affichent **sous le dernier message de l'assistant**, avant la zone de saisie. Elles disparaissent des que l'utilisateur tape une nouvelle question ou clique sur une suggestion.

#### 4.2. Design des chips

```
┌─────────────────────────────────────────────────────┐
│ [Message de l'assistant...]                         │
│                                                     │
│ 💡 Questions suggérées :                            │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Quels sont les lieux de dépôt des déblais ?     │ │
│ │ 📄 31.2.                                        │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Comment se déroule l'évacuation des déchets ?   │ │
│ │ 📄 Evacuation des chantiers et des déchets      │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Quelles sont les exigences de la norme NFP03 ?  │ │
│ │ 📄 Norme NFP03-001                              │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘

[Zone de saisie...]
```

Ou en version horizontale compacte (chips inline) :

```
💡 [Dépôt des déblais ?] [Evacuation des déchets ?] [Norme NFP03-001 ?]
```

A adapter selon le design existant du chat. L'important :
- **Cliquables** : au clic, le `text` de la suggestion est envoye comme nouvelle question
- **source_hint visible** : affiche le document source en petit sous ou a cote du texte
- **Disparition** : les chips disparaissent quand l'utilisateur envoie une nouvelle question
- **Animation** : fade-in leger a l'apparition (les suggestions arrivent apres les tokens)

#### 4.3. Comportement au clic

Quand l'utilisateur clique sur une suggestion :

1. Le `text` de la suggestion est envoye comme nouvelle question dans le chat
2. Les chips disparaissent
3. Le flow normal du chat se declenche (nouvelle requete vers baikal-retrieval)
4. `enable_suggestions` reste a `true` (si le toggle est ON) pour recevoir de nouvelles suggestions

### 5. MODIFIER le SSE handler existant

Dans le handler SSE du chat (celui qui traite les events `step`, `token`, `sources`, `done`), ajouter le traitement de l'event `suggestions` :

```javascript
// Dans le handler SSE existant (fetch + ReadableStream ou EventSource)
// Ajouter ce case dans le switch/if des event types :

case 'suggestions':
  // data = { suggestions: [{ text: string, source_hint: string }] }
  const { suggestions } = JSON.parse(data)
  if (suggestions?.length > 0) {
    setSuggestions(suggestions)   // state: SuggestionItem[] | null
  }
  break
```

#### 5.1. State a ajouter

```javascript
// Dans le composant/hook de chat
const [suggestions, setSuggestions] = useState(null)
const [enableSuggestions, setEnableSuggestions] = useState(
  () => localStorage.getItem('arpet_enable_suggestions') === 'true'
)

// Persister le toggle
useEffect(() => {
  localStorage.setItem('arpet_enable_suggestions', String(enableSuggestions))
}, [enableSuggestions])

// Reset suggestions quand on envoie une nouvelle question
const handleSendMessage = (query) => {
  setSuggestions(null)  // clear les chips
  // ... logique existante d'envoi
}

// Handler de clic sur une suggestion
const handleSuggestionClick = (suggestion) => {
  setSuggestions(null)
  handleSendMessage(suggestion.text)  // envoyer comme nouvelle question
}
```

### 6. GERER aussi les events SSE agentic (bonus, si le temps le permet)

Le backend peut aussi envoyer ces events quand le mode agentic est active :

```
event: step → { step: "agentic_start", message: "🧠 Recherche intelligente activée..." }
event: step → { step: "agent_thinking", message: "Réflexion..." }
event: step → { step: "agent_searching", message: "Recherche: [query]..." }
event: step → { step: "agent_found", message: "X résultats trouvés" }
```

Ces events sont des `step` standard — si le chat affiche deja les messages des steps (comme "Recherche documentaire..."), alors ces events agentic s'afficheront automatiquement. Sinon, il faut s'assurer que le handler `step` affiche bien le `message` de chaque step.

---

## Resume des fichiers a toucher

| Action | Fichiers |
|--------|----------|
| Supprimer | Tout ce qui concerne Wizard / Recherche croisee / cross_ref |
| Modifier | SSE handler du chat (ajouter event `suggestions`) |
| Modifier | Service/hook d'appel a baikal-retrieval (ajouter `enable_suggestions` dans le body) |
| Modifier | Composant d'input du chat (ajouter toggle "Assistant") |
| Creer | Composant `SuggestionChips` (chips cliquables sous le message) |
| Modifier | Composant de message ou de liste de messages (afficher les chips) |

## Contraintes

- **React 18 + JSX** (pas de TypeScript)
- **TailwindCSS** pour le styling
- **Francais** dans toute l'UI
- **Pas d'over-engineering** : pas de context provider pour les suggestions, un simple useState suffit
- **Backward compatible** : si `enable_suggestions` est false ou absent, tout fonctionne comme avant
- **Mobile responsive** : les chips doivent etre utilisables sur mobile
