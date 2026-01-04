# Audit de Dette Technique - Frontend Baikal

**Date de l'audit**: 04/01/2026
**Version analysée**: Commit `0dea45e`
**Total lignes de code**: ~32,000 lignes (src/)

---

## Résumé Exécutif

| Catégorie | Sévérité | Impact |
|-----------|----------|--------|
| Fichiers monolithiques | CRITIQUE | Maintenabilité nulle |
| Duplication de code | CRITIQUE | Maintenance x10 |
| Absence de tests | CRITIQUE | Qualité non garantie |
| Console.log en production | HAUTE | Sécurité/Performance |
| Absence de TypeScript | HAUTE | Bugs runtime |
| Styles inline Tailwind | MOYENNE | Réutilisabilité faible |
| Incohérences de patterns | MOYENNE | Confusion développeurs |

---

## 1. Fichiers Monolithiques (CRITIQUE)

### Fichiers dépassant 1000 lignes

| Fichier | Lignes | Problème |
|---------|--------|----------|
| `src/pages/admin/Users.jsx` | 1593 | 8+ sous-composants internes |
| `src/pages/admin/Projects.jsx` | 1326 | 6+ sous-composants internes |
| `src/pages/IngestionContent.jsx` | 1292 | Logique non décomposée |
| `src/pages/admin/Invitations.jsx` | 1056 | Trop de responsabilités |

### Exemple: Users.jsx contient

```
- APP_ROLES (config)
- formatDate() (utilitaire)
- getAppRoleConfig() (utilitaire)
- AppRoleBadge (composant)
- UserAvatar (composant)
- PendingUserRow (composant)
- UserRow (composant)
- CreateUserModal (composant)
- AssignOrgModal (composant)
- EditRoleModal (composant)
- RemoveUserModal (composant)
- Users (composant principal)
```

**Recommandation**: Extraire chaque sous-composant dans son propre fichier.

---

## 2. Duplication de Code (CRITIQUE)

### 2.1 Fonction `formatDate` - 10+ duplications

Fichiers affectés:
- `src/pages/admin/Users.jsx:81-88`
- `src/pages/admin/Projects.jsx:83-88`
- `src/pages/admin/Invitations.jsx:464`
- `src/components/admin/LegifranceAdmin.jsx:29`
- `src/components/admin/UsersList.jsx:163`
- `src/components/admin/PromptsTable.jsx:192`
- `src/config/rag-layers.config.js:387`
- Et 3+ autres fichiers

**Recommandation**: Créer `src/utils/dateFormatter.js`

### 2.2 Composant ConfirmModal - 2 implémentations

| Fichier | Lignes | Features |
|---------|--------|----------|
| `src/components/ui/Modal.jsx:204-245` | 42 | Basique (variant, loading) |
| `src/components/ui/ConfirmModal.jsx` | 201 | Complet (itemPreview, showReasonField, icon, variants) |

**Recommandation**: Supprimer ConfirmModal de Modal.jsx, garder le fichier séparé.

### 2.3 Badges définis localement

- `AppRoleBadge()` dans `src/pages/admin/Users.jsx:104`
- `StatusBadge()` dans `src/pages/admin/Projects.jsx:105`
- `ProjectRoleBadge()` dans `src/pages/admin/Projects.jsx:120`
- `LayerBadge()` dans `src/pages/Validation.jsx:58`

**Recommandation**: Créer `src/components/ui/Badge.jsx` générique.

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

// src/components/admin/index.js:32
// TODO: Remplacer par le nouveau système d'invitations par code
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

## Plan de Remédiation Recommandé

### Phase 1 - Quick Wins (1-2 sprints)

1. **Centraliser formatDate()**
   - Créer `src/utils/dateFormatter.js`
   - Impact: 10+ fichiers

2. **Fusionner ConfirmModal**
   - Garder `src/components/ui/ConfirmModal.jsx`
   - Supprimer lignes 204-245 de Modal.jsx

3. **Supprimer console.log**
   - Créer `src/utils/logger.js`
   - Remplacer 206 occurrences

4. **Standardiser loading state**
   - Renommer en `isLoading` partout

### Phase 2 - Refactoring (3-4 sprints)

5. **Extraire sous-composants**
   - Users.jsx → 8 fichiers
   - Projects.jsx → 6 fichiers

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

| Métrique | Actuel | Cible |
|----------|--------|-------|
| Fichiers > 500 lignes | 12 | 0 |
| Couverture de tests | 0% | 70% |
| Console.log en prod | 206 | 0 |
| Duplications formatDate | 10+ | 1 |
| Composants avec TypeScript | 0% | 100% |

---

## Fichiers de Référence

### Bons patterns à suivre
- `src/hooks/useAsync.js` - Hook async bien structuré
- `src/utils/cn.js` - Utilitaire Tailwind
- `src/utils/apiHandler.js` - Wrapper API uniforme
- `src/contexts/AuthContext.jsx` - Context bien documenté

### Fichiers prioritaires à refactorer
- `src/pages/admin/Users.jsx` (1593 lignes)
- `src/pages/admin/Projects.jsx` (1326 lignes)
- `src/services/documents.service.js` (759 lignes)

---

*Rapport généré automatiquement lors de l'audit technique*
