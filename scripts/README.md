# Scripts d'administration

## 🚀 Création des utilisateurs de test

Le script `seed-test-users.js` permet de créer automatiquement les utilisateurs de test pour valider les différents droits et accès.

### Prérequis

1. **Clé de service Supabase** : Vous devez avoir la clé de service dans votre `.env.local`

   Pour l'obtenir :
   - Allez dans **Supabase Dashboard** > **Settings** > **API**
   - Copiez la **"service_role" key** (⚠️ gardez-la secrète!)
   - Ajoutez-la dans `.env.local` :
     ```
     SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrete_ici
     ```

2. **Variables d'environnement requises** dans `.env.local` :
   ```
   VITE_SUPABASE_URL=https://votre-projet.supabase.co
   VITE_SUPABASE_ANON_KEY=votre_anon_key
   SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
   ```

### Exécution

```bash
# Méthode 1 : Via npm
npm run seed:test-users

# Méthode 2 : Directement
node scripts/seed-test-users.js
```

### Comptes créés

Tous les comptes utilisent le mot de passe : **`Test123!`**

| Email | Rôle | Description |
|-------|------|-------------|
| `orgadmin@test.com` | Org Admin | Administrateur d'organisation |
| `orgadmin2@test.com` | Org Admin | Deuxième administrateur |
| `member1@test.com` | Member | Membre simple (client) |
| `member2@test.com` | Member | Membre simple (provider) |
| `member3@test.com` | Member | Membre sans organisation |

### Fonctionnalités

- ✅ Crée les utilisateurs dans `auth.users`
- ✅ Crée les profils dans `profiles`
- ✅ Ajoute les membres dans `organization_members`
- ✅ Met à jour les utilisateurs existants (idempotent)
- ✅ Crée une organisation de test si aucune n'existe

### Dépannage

**Erreur : "SUPABASE_SERVICE_ROLE_KEY manquant"**
- Vérifiez que la clé est bien dans `.env.local`
- Vérifiez qu'il n'y a pas d'espaces autour du `=`

**Erreur : "Impossible de continuer sans organisation"**
- Le script créera automatiquement une organisation de test
- Ou créez-en une manuellement dans Supabase Dashboard

**Les utilisateurs existent déjà**
- Le script mettra à jour les profils et membres existants
- Pas de problème, vous pouvez réexécuter le script



