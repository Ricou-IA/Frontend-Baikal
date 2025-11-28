# Documentation RAG-Brain - Edge Function Supabase

## 📋 Vue d'ensemble

`rag-brain` est une Edge Function Supabase qui implémente un système RAG (Retrieval-Augmented Generation) utilisant :
- **OpenAI Embeddings** (`text-embedding-3-small`) pour la recherche sémantique
- **OpenAI GPT-4o-mini** pour la génération de réponses
- **Supabase Vector Search** via la fonction RPC `match_documents`

## 🔗 Endpoint

```
POST https://[VOTRE_PROJECT_ID].supabase.co/functions/v1/rag-brain
```

## 📥 Format de la requête

### Headers requis
```
Authorization: Bearer [ACCESS_TOKEN]
apikey: [ANON_KEY]
Content-Type: application/json
```

### Body (JSON)

```json
{
  "query": "Votre question ici",
  "vertical_id": "id-de-la-verticale",
  "match_threshold": 0.5,      // Optionnel, défaut: 0.7
  "match_count": 5             // Optionnel, défaut: 5
}
```

### Paramètres

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| `query` | string | ✅ Oui | - | La question de l'utilisateur |
| `vertical_id` | string | ✅ Oui | - | L'ID de la verticale pour filtrer les documents |
| `match_threshold` | number | ❌ Non | 0.7 | Seuil de similarité (0-1). Plus bas = plus de résultats |
| `match_count` | number | ❌ Non | 5 | Nombre maximum de documents à retourner |

## 📤 Format de la réponse

### Succès (200)

```json
{
  "success": true,
  "answer": "Réponse générée par l'IA basée sur le contexte...",
  "sources": [
    {
      "id": "doc-id-1",
      "content": "Aperçu du contenu...",
      "metadata": {},
      "similarity": 0.85
    }
  ],
  "processing_time_ms": 1234
}
```

### Erreur (400/500)

```json
{
  "success": false,
  "error": "Message d'erreur détaillé",
  "processing_time_ms": 500
}
```

## 🔧 Configuration requise

### Variables d'environnement (Edge Function)

Les variables suivantes doivent être configurées dans Supabase Dashboard → Functions → rag-brain → Settings :

- `SUPABASE_URL` : URL de votre projet Supabase
- `SUPABASE_SERVICE_ROLE_KEY` : Clé service role (accès complet)
- `OPENAI_API_KEY` : Clé API OpenAI

### Fonction RPC requise

La fonction `match_documents` doit exister dans votre base de données Supabase :

```sql
-- Exemple de signature attendue
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  filter_vertical TEXT,
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
```

## 🎯 Flux de traitement

1. **Validation** : Vérifie que `query` et `vertical_id` sont présents
2. **Embedding** : Génère l'embedding de la question via OpenAI
3. **Recherche** : Appelle `match_documents` pour trouver les documents similaires
4. **Construction du contexte** : Assemble les documents trouvés avec leurs métadonnées
5. **Génération** : Envoie le contexte + question à GPT-4o-mini
6. **Réponse** : Retourne la réponse avec les sources utilisées

## 📝 Prompt système

Le prompt système est défini dans l'Edge Function :

```
Tu es un assistant expert spécialisé. Tu réponds aux questions en te basant UNIQUEMENT sur le contexte fourni.

RÈGLES STRICTES:
1. Base tes réponses EXCLUSIVEMENT sur le contexte fourni ci-dessous.
2. Si le contexte ne contient pas l'information demandée, dis-le clairement.
3. Ne jamais inventer d'informations non présentes dans le contexte.
4. Cite les sources pertinentes quand c'est possible.
5. Réponds en français de manière claire et professionnelle.
```

## 🔍 Dépannage

### Erreur : "Le champ 'query' est requis"
- Vérifiez que le body contient bien `query` (pas `message` ou autre)
- Vérifiez que `query` n'est pas vide ou composé uniquement d'espaces

### Erreur : "Le champ 'vertical_id' est requis"
- Vérifiez que le body contient `vertical_id`
- Assurez-vous que l'utilisateur/organisation a une verticale configurée

### Erreur : "OpenAI Embedding Error"
- Vérifiez que `OPENAI_API_KEY` est correcte
- Vérifiez vos crédits OpenAI
- Vérifiez que le modèle `text-embedding-3-small` est disponible

### Erreur : "Erreur recherche"
- Vérifiez que la fonction RPC `match_documents` existe
- Vérifiez que la table de documents contient des embeddings
- Vérifiez les logs Supabase pour plus de détails

### Aucun document trouvé
- Vérifiez que `match_threshold` n'est pas trop élevé (essayez 0.5 ou moins)
- Vérifiez que des documents existent pour cette `vertical_id`
- Vérifiez que les embeddings ont été générés correctement

## 📊 Métriques

- **Temps de traitement** : Inclus dans la réponse (`processing_time_ms`)
- **Nombre de sources** : Disponible dans `sources.length`
- **Similarité moyenne** : Calculable depuis `sources[].similarity`

## 🔐 Sécurité

- L'Edge Function utilise `SUPABASE_SERVICE_ROLE_KEY` pour accéder à la base
- L'authentification utilisateur est requise (via `Authorization` header)
- CORS est configuré pour autoriser les requêtes depuis le frontend

## 🚀 Utilisation depuis le frontend

### Exemple avec le helper `callRagBrain`

```javascript
import { callRagBrain } from '../lib/supabaseClient'

const { data, error } = await callRagBrain(
  "Qu'est-ce que le RAG ?",
  "vertical-id-123",
  {
    matchThreshold: 0.5,
    matchCount: 5
  }
)

if (error) {
  console.error('Erreur:', error.message)
} else {
  console.log('Réponse:', data.answer)
  console.log('Sources:', data.sources)
}
```

## 📚 Structure des sources

Chaque source retournée contient :

```typescript
{
  id: string,              // ID du document
  content: string,          // Aperçu du contenu (200 premiers caractères)
  metadata: object,        // Métadonnées du document
  similarity: number       // Score de similarité (0-1)
}
```

## 🔄 Mise à jour du prompt système

Pour modifier le prompt système :

1. Allez dans Supabase Dashboard → Functions → rag-brain
2. Cliquez sur l'onglet "Code"
3. Modifiez la constante `SYSTEM_PROMPT`
4. Déployez la fonction

## 📝 Notes de maintenance

- **Date de création** : 2025-11-26
- **Dernière mise à jour** : 2025-11-26
- **Version** : 1.0.0
- **Modèle OpenAI Embedding** : `text-embedding-3-small` (768 dimensions)
- **Modèle OpenAI Chat** : `gpt-4o-mini`
- **Temperature** : 0.3 (réponses déterministes)
- **Max tokens** : 2048
- **Match threshold par défaut** : 0.5 (configuré dans le frontend)

## 🐛 Logs et debugging

Les logs sont disponibles dans :
- Supabase Dashboard → Functions → rag-brain → Logs

Les logs incluent :
- `[rag-brain] Requête: "..."`
- `[rag-brain] Verticale: ...`
- `[rag-brain] Génération de l'embedding...`
- `[rag-brain] Recherche de documents...`
- `[rag-brain] X documents trouvés`
- `[rag-brain] Génération de la réponse...`
- `[rag-brain] Réponse générée en Xms`

## ⚙️ Configuration recommandée

### match_threshold
- **0.5** : Plus permissif, plus de résultats (recommandé pour la production - configuré par défaut)
- **0.7** : Équilibré
- **0.9** : Très strict, seulement les meilleures correspondances

### match_count
- **3-5** : Pour des réponses rapides et ciblées (défaut: 5)
- **5-10** : Pour des réponses plus complètes
- **10+** : Peut ralentir la génération et augmenter les coûts

## 🔗 Liens utiles

- [Documentation Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Documentation OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Documentation OpenAI Chat Completions](https://platform.openai.com/docs/guides/text-generation)

## ⚠️ Configuration du vertical_id

**IMPORTANT** : Le `vertical_id` est requis pour chaque requête. 

### Option 1 : Stocker dans la table `organizations`

```sql
ALTER TABLE organizations 
ADD COLUMN vertical_id TEXT;

UPDATE organizations 
SET vertical_id = 'votre-vertical-id' 
WHERE vertical_id IS NULL;
```

### Option 2 : Stocker dans la table `profiles`

```sql
ALTER TABLE profiles 
ADD COLUMN vertical_id TEXT;
```

### Option 3 : Valeur par défaut temporaire

Le frontend utilise actuellement `'default-vertical-id'` comme valeur temporaire avec un avertissement. **Cette valeur doit être remplacée** par une vraie verticale pour que le RAG fonctionne correctement.




