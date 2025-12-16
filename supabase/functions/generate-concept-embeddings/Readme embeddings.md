# 🧠 BAIKAL GraphRAG - Génération des Embeddings Concepts

## 📋 Objectif

Générer les embeddings (vecteurs 1536 dimensions) pour les 39 concepts ARPET afin de permettre le **matching sémantique** entre les questions utilisateurs et les concepts de l'ontologie.

## 🏗️ Architecture

```
Question utilisateur
        │
        ▼
┌───────────────────┐
│ Embedding OpenAI  │
│ (text-embedding-  │
│  3-small)         │
└───────────────────┘
        │
        ▼
┌───────────────────┐     ┌─────────────────────────────┐
│ Similarité cosine │ ──► │ config.concepts.embedding   │
│ avec concepts     │     │ (39 vecteurs pré-calculés)  │
└───────────────────┘     └─────────────────────────────┘
        │
        ▼
Top K concepts matchés → Expansion GraphRAG
```

## 📁 Fichiers fournis

| Fichier | Description |
|---------|-------------|
| `01_check_concepts.sql` | Vérification avant génération |
| `02_verify_embeddings.sql` | Vérification après génération |
| `scripts/generate_concept_embeddings.mjs` | Script Node.js standalone |
| `supabase/functions/generate-concept-embeddings/` | Edge Function Supabase |

## 🚀 Méthode 1 : Script Node.js (recommandé)

### Prérequis
```bash
npm install @supabase/supabase-js
```

### Exécution

```bash
# Mode simulation (dry run)
SUPABASE_URL=https://votre-projet.supabase.co \
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
OPENAI_API_KEY=sk-... \
DRY_RUN=true \
node scripts/generate_concept_embeddings.mjs

# Exécution réelle
SUPABASE_URL=https://votre-projet.supabase.co \
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
OPENAI_API_KEY=sk-... \
node scripts/generate_concept_embeddings.mjs
```

### Output attendu
```
═══════════════════════════════════════════════════════════════
  BAIKAL GraphRAG - Génération des embeddings concepts
═══════════════════════════════════════════════════════════════
  App: arpet
  Mode: 🚀 PRODUCTION
  Batch size: 20
═══════════════════════════════════════════════════════════════

📥 Récupération des concepts sans embedding...
   Trouvé: 39 concepts à traiter

📋 Aperçu des concepts:
─────────────────────────────────────────────────────────────────
   🏷️  Domaines (racines): 6
      • Acteurs et Responsabilités
      • Conformité et Qualité
      • Contractuel
      • Paiement et Situations
      • Planning et Délais
      • Réception et Garanties
   📄 Concepts: 33
      • Acte d'engagement
      • Assurance construction
      ...

🔄 Génération des embeddings...
─────────────────────────────────────────────────────────────────
   Batch 1/2... ✅ 20 concepts
   Batch 2/2... ✅ 19 concepts

═══════════════════════════════════════════════════════════════
  RÉSULTAT
═══════════════════════════════════════════════════════════════
  ✅ Succès: 39/39
═══════════════════════════════════════════════════════════════
```

## 🚀 Méthode 2 : Edge Function Supabase

### Déploiement
```bash
cd supabase
supabase functions deploy generate-concept-embeddings
```

### Appel
```bash
curl -X POST https://votre-projet.supabase.co/functions/v1/generate-concept-embeddings \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"app_id": "arpet", "dry_run": false}'
```

## ✅ Vérification post-génération

Exécuter `02_verify_embeddings.sql` dans Supabase SQL Editor :

```sql
-- Résultat attendu
┌───────┬───────────────┬────────────────┐
│ total │ avec_embedding│ sans_embedding │
├───────┼───────────────┼────────────────┤
│ 39    │ 39            │ 0              │
└───────┴───────────────┴────────────────┘
```

## 📊 Texte embedé par concept

Le script construit le texte ainsi :
```
{name} : {description}
```

Exemples :
- `"Délais d'exécution : Gestion des durées contractuelles, prolongations et délais d'exécution des marchés"`
- `"DTU : Documents Techniques Unifiés, normes de construction françaises"`

## 🔧 Configuration avancée

| Variable | Défaut | Description |
|----------|--------|-------------|
| `APP_ID` | `arpet` | Application cible |
| `DRY_RUN` | `false` | Mode simulation |
| `BATCH_SIZE` | `20` | Concepts par appel OpenAI |

## 💰 Coût estimé

- **Modèle** : `text-embedding-3-small`
- **Prix** : $0.02 / 1M tokens
- **39 concepts** : ~5000 tokens ≈ **$0.0001** (négligeable)

## ⏭️ Étape suivante

Une fois les embeddings générés, passer à :
- **Étape 2** : Création de `match_documents_v10` (fonction SQL de retrieval)