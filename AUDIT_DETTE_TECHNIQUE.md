# Audit de Dette Technique - Frontend Baikal

**Date de l'audit**: 04/01/2026
**Version analysée**: Commit `0dea45e`
**Total lignes de code**: ~32,000 lignes (src/)
**Dernière mise à jour**: 04/01/2026

---

## Actions Réalisées (Quick Wins)

### ✅ Structure préparée pour Option B (architecture par feature)

```
src/
├── features/                    # NOUVEAU
│   └── users/
│       ├── config.js            # APP_ROLES, getAppRoleConfig
│       ├── index.js             # Export centralisé
│       └── components/
│           ├── index.js
│           ├── UserAvatar.jsx
│           ├── AppRoleBadge.jsx
│           ├── UserRow.jsx
│           ├── PendingUserRow.jsx
│           ├── CreateUserModal.jsx
│           ├── AssignOrgModal.jsx
│           ├── EditRoleModal.jsx
│           └── RemoveUserModal.jsx
│
├── shared/                      # NOUVEAU
│   └── utils/
│       ├── index.js             # Export centralisé
│       └── dateFormatter.js     # formatDate centralisé
```

### ✅ Alias Vite ajoutés

```javascript
// vite.config.js
'@features': path.resolve(__dirname, './src/features'),
'@shared': path.resolve(__dirname, './src/shared'),
```

### ✅ Code mort supprimé (5 fichiers)

| Fichier supprimé | Raison |
|------------------|--------|
| `src/components/ErrorBoundary.jsx` | Import cassé (`../utils/errors` inexistant) + jamais utilisé |
| `src/components/UserMenu.jsx` | Jamais importé nulle part |
| `src/components/admin/InviteMemberModal.jsx` | Marqué deprecated, jamais utilisé |
| `src/components/admin/MembersList.jsx` | Jamais importé nulle part |
| `src/components/admin/UsersList.jsx` | Jamais importé nulle part |

### ✅ Utilitaire dateFormatter créé

```javascript
// Utilisation
import { formatDate, formatDateTime, formatRelative } from '@shared/utils';

formatDate('2024-01-15');           // "15/01/2024"
formatDateTime('2024-01-15T14:30'); // "15/01/2024 à 14:30"
formatRelative(new Date());         // "il y a 2 heures"
```

---

## Résumé Exécutif

| Catégorie | Sévérité | Impact | Statut |
|-----------|----------|--------|--------|
| Fichiers monolithiques | CRITIQUE | Maintenabilité nulle | ✅ Users.jsx migré (1593→675 lignes) |
| Duplication de code | CRITIQUE | Maintenance x10 | ✅ formatDate + ConfirmModal résolus |
| Absence de tests | CRITIQUE | Qualité non garantie | 🔴 Non résolu |
| Code mort | HAUTE | Confusion, imports cassés | ✅ **RÉSOLU** (5 fichiers supprimés) |
| Console.log en production | HAUTE | Sécurité/Performance | 🔴 Non résolu |
| Absence de TypeScript | HAUTE | Bugs runtime | 🔴 Non résolu |
| Styles inline Tailwind | MOYENNE | Réutilisabilité faible | 🔴 Non résolu |
| Incohérences de patterns | MOYENNE | Confusion développeurs | 🔴 Non résolu |

---

## 1. Fichiers Monolithiques (CRITIQUE)

### Fichiers dépassant 1000 lignes

| Fichier | Lignes | Problème | Statut |
|---------|--------|----------|--------|
| `src/pages/admin/Users.jsx` | 1593 | 8+ sous-composants internes | 🟡 Composants extraits dans `@features/users` |
| `src/pages/admin/Projects.jsx` | 1326 | 6+ sous-composants internes | 🔴 À faire |
| `src/pages/IngestionContent.jsx` | 1292 | Logique non décomposée | 🔴 À faire |
| `src/pages/admin/Invitations.jsx` | 1056 | Trop de responsabilités | 🔴 À faire |

### Users.jsx - Composants extraits

Les composants suivants ont été extraits vers `src/features/users/components/` :
- ✅ `UserAvatar`
- ✅ `AppRoleBadge`
- ✅ `UserRow`
- ✅ `PendingUserRow`
- ✅ `CreateUserModal`
- ✅ `AssignOrgModal`
- ✅ `EditRoleModal`
- ✅ `RemoveUserModal`

**Prochaine étape** : Modifier `Users.jsx` pour importer depuis `@features/users/components`.

---

## 2. Duplication de Code (CRITIQUE)

### 2.1 Fonction `formatDate` - 10+ duplications

**Statut** : ✅ Utilitaire créé, migrations principales terminées

Fichier centralisé : `src/shared/utils/dateFormatter.js`

Fichiers migrés :
- ✅ `src/pages/admin/Users.jsx` → Composants extraits vers @features/users
- ✅ `src/pages/admin/Projects.jsx` → `import { formatDate } from '@shared/utils'`
- ✅ `src/pages/admin/Invitations.jsx` → `import { formatDate } from '@shared/utils'`
- ✅ `src/components/admin/PromptsTable.jsx` → `import { formatDate } from '@shared/utils'`
- ✅ `src/components/admin/OrganizationSettings.jsx` → `import { formatDateLong } from '@shared/utils'`

Fichiers conservés (formats spécifiques) :
- `src/components/admin/LegifranceAdmin.jsx` - Format 'short' dans StatCard
- `src/config/rag-layers.config.js` - formatRelativeDate personnalisé
- `src/components/admin/legifrance/` - Formats courts spécifiques UI

### 2.2 Composant ConfirmModal - 2 implémentations

**Statut** : ✅ RÉSOLU

- ✅ Supprimé de `Modal.jsx` (42 lignes retirées)
- ✅ Conservé uniquement dans `ConfirmModal.jsx` (version complète)
- ✅ Import mis à jour dans `Prompts.jsx`

### 2.3 Badges définis localement

- `AppRoleBadge()` - ✅ Extrait vers `@features/users/components/AppRoleBadge.jsx`
- `StatusBadge()` dans `src/pages/admin/Projects.jsx:105` - 🔴 À extraire
- `ProjectRoleBadge()` dans `src/pages/admin/Projects.jsx:120` - 🔴 À extraire
- `LayerBadge()` dans `src/pages/Validation.jsx:58` - 🔴 À extraire

---

## 3. Absence Totale de Tests (CRITIQUE)

```bash
$ find src -name "*.test.js" -o -name "*.spec.js"
# Aucun résultat
```

**Impact**:
- Aucune garantie de non-régression
- Refactoring risqué
- Qualité non mesurable

**Recommandation**: Implémenter Jest + React Testing Library.

---

## 4. Console.log en Production (HAUTE)

```
206 occurrences dans 43 fichiers
```

Exemples critiques:
- `src/contexts/AuthContext.jsx:100-107` - Log d'erreurs d'authentification
- `src/services/documents.service.js` - 16 occurrences
- `src/services/organization.service.js` - 14 occurrences

**Recommandation**:
1. Créer un logger centralisé avec niveaux
2. Désactiver en production via `import.meta.env.PROD`

---

## 5. Absence de TypeScript (HAUTE)

Le projet utilise uniquement JavaScript/JSX malgré:
- `@types/react` et `@types/react-dom` dans devDependencies
- Aucun fichier `.ts` ou `.tsx`
- Aucun `tsconfig.json`

**Impact**:
- Erreurs de type uniquement détectables au runtime
- IntelliSense limité
- Documentation des APIs implicite

**Recommandation**: Migration progressive vers TypeScript.

---

## 6. Styles Inline Tailwind (MOYENNE)

### Problème

Les pages admin contiennent des centaines de classes inline non réutilisables:

```jsx
// src/pages/admin/Users.jsx:128-132
className={`
    ${sizeClasses[size]}
    bg-baikal-cyan/20 text-baikal-cyan
    rounded-full flex items-center justify-center font-mono font-bold
`}
```

### Statistiques
- `src/pages/admin/Users.jsx`: 58+ className attributes
- `src/pages/admin/Projects.jsx`: 36+ className attributes

**Recommandation**: Utiliser `@apply` dans CSS ou créer des composants UI.

---

## 7. Incohérences de Patterns

### 7.1 Nommage des états de chargement

| Pattern | Fichiers utilisant |
|---------|-------------------|
| `[loading, setLoading]` | Prompts.jsx, IngestionContent.jsx, Users.jsx |
| `[isLoading, setIsLoading]` | Validation.jsx |
| `[loadingX, setLoadingX]` | Users.jsx (4 variantes) |

**Recommandation**: Standardiser sur `[isLoading, setIsLoading]`.

### 7.2 Hook useAsync sous-utilisé

Le hook `src/hooks/useAsync.js` existe mais n'est utilisé que dans ~3 fichiers sur 15+ pages.

**Recommandation**: Migrer toutes les pages vers useAsync.

### 7.3 Imports inconsistants

```javascript
// Variante 1 (barrel import)
import { usersService } from '../../services';

// Variante 2 (import direct)
import { usersService } from '../../services/users.service';
```

**Recommandation**: Utiliser uniquement les barrel imports via `index.js`.

---

## 8. TODOs Non Résolus

```javascript
// src/hooks/useOrganization.js:205
// TODO: Implémenter la logique de renvoi d'invitation
```

---

## 9. Services Volumineux

| Service | Lignes |
|---------|--------|
| `documents.service.js` | 759 |
| `organization.service.js` | 631 |
| `users.service.js` | 569 |

**Recommandation**: Découper en sous-modules (ex: `documents/upload.service.js`).

---

## 10. Dépendances Obsolètes

### package.json

```json
{
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0"
  }
}
```

Ces dépendances TypeScript sont inutiles sans TypeScript configuré.

---

## Plan de Remédiation - Mise à Jour

### Phase 1 - Quick Wins ✅ TERMINÉ

| Action | Statut |
|--------|--------|
| Créer structure `features/` et `shared/` | ✅ Fait |
| Ajouter alias Vite | ✅ Fait |
| Créer `dateFormatter.js` centralisé | ✅ Fait |
| Extraire composants Users.jsx | ✅ Fait (8 composants) |
| Supprimer code mort | ✅ Fait (5 fichiers) |
| Migrer imports formatDate | ✅ Fait (5 fichiers migrés) |
| Fusionner ConfirmModal | ✅ Fait (supprimé de Modal.jsx) |
| Connecter Users.jsx à @features/users | ✅ Fait (1593→675 lignes) |

### Phase 2 - Refactoring (3-4 sprints)

5. **Extraire sous-composants**
   - Users.jsx → ✅ Fait
   - Projects.jsx → 6 fichiers (à faire)

6. **Créer composants UI génériques**
   - Badge.jsx
   - TableRow.jsx

7. **Migrer vers useAsync**
   - 15+ pages à mettre à jour

### Phase 3 - Qualité (5-8 sprints)

8. **Ajouter TypeScript**
   - Commencer par les services
   - Puis les hooks
   - Enfin les composants

9. **Implémenter les tests**
   - Unit tests: hooks et services
   - Integration tests: pages critiques

10. **Refactorer les services volumineux**

---

## Métriques à Suivre

| Métrique | Avant | Après Quick Wins | Cible |
|----------|-------|------------------|-------|
| Fichiers > 500 lignes | 12 | 11 (-1: Users.jsx) | 0 |
| Couverture de tests | 0% | 0% | 70% |
| Console.log en prod | 206 | 206 | 0 |
| Duplications formatDate | 10+ | 5 (migrés vers @shared) | 1 |
| ConfirmModal dupliqués | 2 | 1 | 1 |
| Composants avec TypeScript | 0% | 0% | 100% |
| Code mort | 5 fichiers | 0 fichiers | 0 |
| Composants Users extraits | 0 | 8 | 8 |

---

## Fichiers de Référence

### Bons patterns à suivre
- `src/hooks/useAsync.js` - Hook async bien structuré
- `src/shared/utils/dateFormatter.js` - **NOUVEAU** Utilitaire date centralisé
- `src/features/users/components/` - **NOUVEAU** Structure par feature
- `src/utils/cn.js` - Utilitaire Tailwind
- `src/utils/apiHandler.js` - Wrapper API uniforme
- `src/contexts/AuthContext.jsx` - Context bien documenté

### Fichiers prioritaires à refactorer
- ✅ `src/pages/admin/Users.jsx` (1593→675 lignes) - Migrés vers `@features/users`
- `src/pages/admin/Projects.jsx` (1326 lignes)
- `src/services/documents.service.js` (759 lignes)

---

## Prochaines Étapes Recommandées

1. ✅ ~~**Modifier `Users.jsx`** pour importer les composants depuis `@features/users/components`~~
2. ✅ ~~**Migrer les imports `formatDate`** vers `@shared/utils/dateFormatter`~~
3. ✅ ~~**Fusionner ConfirmModal** - supprimé de Modal.jsx~~
4. **Créer `features/projects/`** sur le même modèle que `features/users/`
5. **Ajouter les premiers tests** sur les hooks et utilitaires
6. **Nettoyer les console.log** avec un logger centralisé

---

*Rapport généré automatiquement lors de l'audit technique*
*Dernière mise à jour : 04/01/2026 - Quick Wins Phase 2 terminée*
