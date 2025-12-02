# Instructions : Fonction RPC pour vérifier les emails existants

## 📋 Étape 1 : Créer la fonction RPC dans Supabase

1. Connectez-vous à votre **Dashboard Supabase**
2. Allez dans **SQL Editor** (dans le menu de gauche)
3. Cliquez sur **New Query**
4. Copiez-collez le contenu du fichier `supabase_check_email.sql` dans l'éditeur
5. Cliquez sur **Run** (ou appuyez sur `Ctrl+Enter` / `Cmd+Enter`)

## ✅ Vérification

Pour vérifier que la fonction a été créée correctement :

1. Dans le **SQL Editor**, exécutez cette requête de test :
```sql
SELECT check_email_exists('test@example.com');
```

2. La fonction doit retourner `false` (ou `true` si l'email existe réellement)

## 🔒 Sécurité

La fonction utilise `SECURITY DEFINER` pour accéder à `auth.users`, qui n'est normalement pas accessible directement depuis les fonctions RPC. Les permissions sont configurées pour permettre l'exécution aux utilisateurs anonymes et authentifiés.

## 🚀 Utilisation

Une fois la fonction créée, le code frontend l'utilisera automatiquement lors de l'inscription pour vérifier si un email existe déjà avant de tenter la création du compte.

## ⚠️ Note

Si la fonction RPC n'existe pas encore dans Supabase, le code frontend continuera de fonctionner mais utilisera uniquement les erreurs retournées directement par Supabase Auth (détection moins fiable).

