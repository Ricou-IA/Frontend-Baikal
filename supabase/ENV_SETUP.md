# Configuration des variables d'environnement pour les webhooks N8N

## Vue d'ensemble des webhooks

Il existe **deux webhooks N8N distincts** pour deux workflows différents :

1. **Webhook Documents** : Pour l'ingestion de documents standards (PDF, Word, Excel, etc.)
   - URL : `https://n8n.srv1102213.hstgr.cloud/webhook-test/ingest`
   - Utilisé par : `SmartUploader` (composant d'upload de documents)

2. **Webhook Factures** : Pour le traitement spécifique des factures commerciales
   - URL : `https://n8n.srv1102213.hstgr.cloud/webhook/ingest-commercial-doc`
   - Utilisé par : `InvoiceUploader` (composant d'upload de factures)

**Important :** Ces deux webhooks lancent des workflows N8N différents et doivent être configurés séparément.

## Variables à configurer

### 1. N8N_WEBHOOK_URL (Côté Serveur - Edge Functions)

Cette variable est utilisée dans la fonction Supabase Edge Function `process-audio` pour envoyer les transcriptions audio à N8N.

**Où :** `supabase/functions/process-audio/index.ts`

### Configuration de N8N_WEBHOOK_URL

#### Méthode 1 : Via le Dashboard Supabase (Recommandé)

1. Connectez-vous à votre **Dashboard Supabase**
2. Allez dans **Settings** (Paramètres) dans le menu de gauche
3. Cliquez sur **Edge Functions** dans le menu
4. Allez dans l'onglet **Secrets**
5. Ajoutez ou modifiez la variable :
   - **Name**: `N8N_WEBHOOK_URL`
   - **Value**: `https://n8n.srv1102213.hstgr.cloud/webhook-test/ingest`
6. Cliquez sur **Save**

#### Méthode 2 : Via la CLI Supabase

Si vous avez la CLI Supabase installée :

```bash
supabase secrets set N8N_WEBHOOK_URL=https://n8n.srv1102213.hstgr.cloud/webhook-test/ingest
```

---

### 2. VITE_N8N_INGEST_WEBHOOK_URL (Côté Client - Frontend - Documents)

Cette variable est utilisée dans le composant `SmartUploader` pour appeler le webhook N8N **pour les documents standards** (pas les factures).

**Où :** `src/components/SmartUploader.jsx`

**Workflow N8N :** Lance le workflow d'ingestion standard pour les documents (vectorisation, tagging par verticales, etc.)

**Note :** Cette variable est optionnelle. Si elle n'est pas définie, l'appel N8N ne sera pas effectué.

### Configuration de VITE_N8N_INGEST_WEBHOOK_URL

1. Créez ou modifiez le fichier `.env.local` à la racine du projet
2. Ajoutez la ligne suivante :
   ```
   VITE_N8N_INGEST_WEBHOOK_URL=https://n8n.srv1102213.hstgr.cloud/webhook-test/ingest
   ```
3. Redémarrez le serveur de développement (`npm run dev`)

---

### 3. VITE_N8N_INVOICE_WEBHOOK_URL (Côté Client - Frontend - Factures)

Cette variable est utilisée dans le composant `InvoiceUploader` pour appeler le webhook N8N **dédié aux factures commerciales**.

**Où :** `src/components/InvoiceUploader.jsx`

**Workflow N8N :** Lance le workflow spécifique de traitement des factures (extraction de données commerciales, OCR, etc.)

**Note :** Cette variable est optionnelle. Si elle n'est pas définie, l'appel N8N ne sera pas effectué. Le flux des factures est complètement découplé du système d'upload de documents standard.

### Configuration de VITE_N8N_INVOICE_WEBHOOK_URL

1. Créez ou modifiez le fichier `.env.local` à la racine du projet
2. Ajoutez la ligne suivante :
   ```
   VITE_N8N_INVOICE_WEBHOOK_URL=https://n8n.srv1102213.hstgr.cloud/webhook/ingest-commercial-doc
   ```
3. Redémarrez le serveur de développement (`npm run dev`)

**Important :** Les factures sont uploadées dans un bucket Supabase Storage séparé (`invoices`) et utilisent un webhook N8N distinct pour un traitement spécifique.

## Vérification

### Pour N8N_WEBHOOK_URL (Serveur)
1. Vérifier dans le Dashboard Supabase (Settings > Edge Functions > Secrets)
2. Tester la fonction `process-audio` et vérifier les logs

### Pour VITE_N8N_INGEST_WEBHOOK_URL (Client)
1. Vérifier que la variable est définie dans `.env.local`
2. Tester l'upload d'un document via `SmartUploader` et vérifier que l'appel est bien fait vers N8N

### Pour VITE_N8N_INVOICE_WEBHOOK_URL (Client - Factures)
1. Vérifier que la variable est définie dans `.env.local`
2. Tester l'upload d'une facture via `InvoiceUploader` et vérifier que l'appel est bien fait vers N8N
3. Vérifier que le fichier est bien uploadé dans le bucket `invoices` (et non `documents`)

## Autres variables nécessaires

Les fonctions Edge Functions nécessitent également ces variables (déjà configurées) :
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

