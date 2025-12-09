# Conventions de Code - Baikal Console

## 📁 Structure des fichiers

```
src/
├── components/           # Composants React
│   ├── admin/           # Composants d'administration
│   │   ├── legifrance/  # Sous-composants Légifrance
│   │   └── index.js     # Barrel export
│   ├── chat/            # Composants de chat
│   │   └── index.js     # Barrel export
│   ├── layout/          # Composants de mise en page
│   │   └── index.js     # Barrel export
│   ├── ui/              # Composants UI réutilisables
│   │   └── index.js     # Barrel export
│   └── ErrorBoundary.jsx
├── config/              # Configuration centralisée
│   └── index.js         # Barrel export
├── contexts/            # Contextes React
│   └── index.js         # Barrel export
├── hooks/               # Hooks personnalisés
│   └── index.js         # Barrel export
├── services/            # Services API
│   └── index.js         # Barrel export
├── utils/               # Utilitaires
│   └── index.js         # Barrel export
├── pages/               # Pages de l'application
└── lib/                 # Librairies externes (Supabase)
```

## 📝 Conventions de nommage

| Type | Convention | Exemple |
|------|------------|---------|
| Composants | `PascalCase.jsx` | `UserProfile.jsx` |
| Hooks | `useCamelCase.js` | `useLocalStorage.js` |
| Services | `camelCase.service.js` | `auth.service.js` |
| Utilitaires | `camelCase.js` | `errors.js` |
| Configuration | `camelCase.js` | `constants.js` |
| Contextes | `PascalCase.jsx` | `AuthContext.jsx` |

## 📦 Conventions d'export

### Composants (export default)

```jsx
// ✅ Bon - Export default pour les composants
export default function UserProfile({ user }) {
  return <div>{user.name}</div>;
}

// Dans index.js
export { default as UserProfile } from './UserProfile';
```

### Hooks (export named + default)

```jsx
// ✅ Bon - Export nommé ET default
export function useLocalStorage(key, initialValue) {
  // ...
}

export default useLocalStorage;

// Dans index.js
export { useLocalStorage } from './useLocalStorage';
```

### Services (export const)

```jsx
// ✅ Bon - Export nommé pour les services
export const authService = {
  signIn: async () => { /* ... */ },
  signOut: async () => { /* ... */ },
};

// Dans index.js
export { authService } from './auth.service';
```

### Configuration (export const)

```jsx
// ✅ Bon - Export nommé pour les constantes
export const APP_NAME = 'Baikal Console';
export const APP_ROLES = { /* ... */ };

// Dans index.js
export * from './constants';
```

## 📥 Conventions d'import

### Ordre des imports

```jsx
// 1. React et librairies externes
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Icônes (groupées)
import { Save, X, AlertCircle } from 'lucide-react';

// 3. Contextes
import { useAuth } from '@/contexts/AuthContext';

// 4. Hooks
import { useAsync, useForm } from '@/hooks';

// 5. Services
import { documentsService } from '@/services';

// 6. Composants UI
import { Button, Input, Modal } from '@/components/ui';

// 7. Composants locaux
import { MembersList } from './MembersList';

// 8. Configuration
import { APP_ROLES, ERROR_MESSAGES } from '@/config';

// 9. Utilitaires
import { cn } from '@/utils';
```

### Import depuis les barrel exports (recommandé)

```jsx
// ✅ Bon - Import depuis le barrel
import { useAsync, useForm, useToast } from '@/hooks';
import { Button, Input, Modal } from '@/components/ui';
import { authService, profileService } from '@/services';

// ⚠️ Acceptable - Import direct (pour tree-shaking)
import { useAsync } from '@/hooks/useAsync';

// ❌ Éviter - Import relatif profond
import { useAsync } from '../../hooks/useAsync';
```

## 📄 Structure d'un composant

```jsx
/**
 * NomComposant.jsx - Baikal Console
 * ============================================================================
 * Description courte du composant.
 * 
 * @example
 * <NomComposant prop1="valeur" />
 * ============================================================================
 */

import React, { useState } from 'react';
// ... autres imports

// ============================================================================
// TYPES & CONSTANTES (si nécessaire)
// ============================================================================

const STATUSES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
};

// ============================================================================
// COMPOSANTS INTERNES (si nécessaire)
// ============================================================================

function SubComponent({ children }) {
  return <div>{children}</div>;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

/**
 * Description du composant
 * @param {Object} props
 * @param {string} props.prop1 - Description
 * @param {Function} [props.onAction] - Description (optionnel)
 */
export default function NomComposant({ prop1, onAction }) {
  // États
  const [value, setValue] = useState('');
  
  // Hooks
  const navigate = useNavigate();
  
  // Handlers
  const handleSubmit = () => {
    onAction?.(value);
  };
  
  // Render
  return (
    <div>
      {/* Contenu */}
    </div>
  );
}
```

## 📄 Structure d'un hook

```jsx
/**
 * useNomHook.js - Baikal Console
 * ============================================================================
 * Description du hook.
 * 
 * @example
 * const { data, loading, execute } = useNomHook(params);
 * ============================================================================
 */

import { useState, useCallback } from 'react';

/**
 * Description du hook
 * @param {Object} options - Options de configuration
 * @returns {Object} - État et méthodes
 */
export function useNomHook(options = {}) {
  const [state, setState] = useState(null);
  
  const action = useCallback(() => {
    // ...
  }, []);
  
  return {
    state,
    action,
  };
}

export default useNomHook;
```

## 📄 Structure d'un service

```jsx
/**
 * nom.service.js - Baikal Console
 * ============================================================================
 * Service pour [description].
 * 
 * @example
 * import { nomService } from '@/services';
 * const { data, error } = await nomService.method();
 * ============================================================================
 */

import { supabase } from '@/lib/supabaseClient';

/**
 * Service de gestion de [...]
 */
export const nomService = {
  /**
   * Description de la méthode
   * @param {string} param - Description
   * @returns {Promise<{data: any, error: Error|null}>}
   */
  async method(param) {
    try {
      const { data, error } = await supabase
        .from('table')
        .select('*');
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
};

export default nomService;
```

## ✅ Checklist avant commit

- [ ] Pas de `console.log` en production
- [ ] Pas de `TODO` non résolu
- [ ] Imports ordonnés correctement
- [ ] JSDoc sur les fonctions publiques
- [ ] Export ajouté dans le barrel (`index.js`)
- [ ] Pas de types TypeScript (projet JSX)
- [ ] Fichier nommé selon les conventions

