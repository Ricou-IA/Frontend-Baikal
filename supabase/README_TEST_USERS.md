# Guide d'utilisation des utilisateurs de test

Ce guide explique comment créer et utiliser les utilisateurs de test pour valider les différents droits et accès dans l'application.

## 📋 Prérequis

1. Avoir accès à Supabase Dashboard
2. Connaître l'ID de votre organisation (`org_id`)

## 🚀 Création des utilisateurs de test

### Étape 1 : Trouver votre `org_id`

1. Connectez-vous à Supabase Dashboard
2. Allez dans **Table Editor** > **organizations**
3. Copiez l'ID de votre organisation (colonne `id`)

### Étape 2 : Modifier le script SQL

1. Ouvrez le fichier `supabase/seed_test_users.sql`
2. Remplacez toutes les occurrences de `'VOTRE_ORG_ID'` par votre `org_id` réel
3. Sauvegardez le fichier

### Étape 3 : Exécuter le script

1. Dans Supabase Dashboard, allez dans **SQL Editor**
2. Cliquez sur **New Query**
3. Copiez-collez le contenu du fichier `seed_test_users.sql` (modifié)
4. Cliquez sur **Run** (ou `Ctrl+Enter`)

### Étape 4 : Vérifier la création

Vous devriez voir des messages de confirmation dans les logs :
- ✅ Org Admin créé
- ✅ Member 1 créé
- ✅ Member 2 créé
- ✅ Member 3 créé (sans org)
- ✅ Org Admin 2 créé

## 👥 Comptes créés

Tous les comptes utilisent le mot de passe : **`Test123!`**

| Email | Rôle | Description |
|-------|------|-------------|
| `orgadmin@test.com` | Org Admin | Administrateur d'organisation |
| `orgadmin2@test.com` | Org Admin | Deuxième administrateur |
| `member1@test.com` | Member | Membre simple (client) |
| `member2@test.com` | Member | Membre simple (provider) |
| `member3@test.com` | Member | Membre sans organisation |

## 🔄 Utilisation du Profile Switcher

Une fois les utilisateurs créés, vous pouvez utiliser le **Profile Switcher** dans la page Admin :

1. Connectez-vous avec votre compte **super_admin**
2. Allez dans la page **Administration** (`/admin`)
3. Cliquez sur le bouton **Profile Switcher** (à côté du badge rôle)
4. Sélectionnez le profil de test souhaité
5. L'application se reconnectera automatiquement avec ce profil

## 🧪 Scénarios de test

### Test 1 : Droits d'administration
- **Compte** : `orgadmin@test.com`
- **Test** : Vérifier l'accès à la page Admin, gestion des membres, modification des rôles

### Test 2 : Droits de membre
- **Compte** : `member1@test.com`
- **Test** : Vérifier l'accès limité, impossibilité d'accéder à `/admin`

### Test 3 : Membre sans organisation
- **Compte** : `member3@test.com`
- **Test** : Vérifier le comportement sans organisation

### Test 4 : Modification de rôles
- **Compte** : `orgadmin@test.com`
- **Test** : Modifier le rôle de `member1@test.com` de "member" à "admin"

## ⚠️ Notes importantes

- Les utilisateurs de test sont créés avec des emails fictifs (`@test.com`)
- Le mot de passe est le même pour tous : `Test123!`
- Les utilisateurs sont liés à votre organisation (sauf `member3@test.com`)
- Vous pouvez réexécuter le script sans problème (il utilise `ON CONFLICT DO NOTHING`)

## 🔧 Dépannage

### Les utilisateurs ne se créent pas
- Vérifiez que vous avez remplacé `VOTRE_ORG_ID` dans le script
- Vérifiez que l'`org_id` existe bien dans la table `organizations`
- Consultez les logs d'erreur dans Supabase Dashboard

### Impossible de se connecter avec un compte de test
- Vérifiez que le script s'est exécuté sans erreur
- Vérifiez que vous utilisez le bon mot de passe : `Test123!`
- Essayez de vous connecter directement depuis la page de login

### Le Profile Switcher n'apparaît pas
- Vérifiez que vous êtes connecté en tant que **super_admin**
- Le Profile Switcher n'est visible que pour les super admins

## 🗑️ Suppression des utilisateurs de test

Si vous souhaitez supprimer les utilisateurs de test :

```sql
-- Supprimer les membres de l'organisation
DELETE FROM public.organization_members 
WHERE invited_email IN (
    'orgadmin@test.com',
    'orgadmin2@test.com',
    'member1@test.com',
    'member2@test.com',
    'member3@test.com'
);

-- Supprimer les profils
DELETE FROM public.profiles 
WHERE email IN (
    'orgadmin@test.com',
    'orgadmin2@test.com',
    'member1@test.com',
    'member2@test.com',
    'member3@test.com'
);

-- Supprimer les utilisateurs auth
DELETE FROM auth.users 
WHERE email IN (
    'orgadmin@test.com',
    'orgadmin2@test.com',
    'member1@test.com',
    'member2@test.com',
    'member3@test.com'
);
```



