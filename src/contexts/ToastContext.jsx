/**
 * ToastContext - Système de notifications toast
 * ============================================================================
 * Fournit un contexte global pour afficher des notifications toast.
 * 
 * @example
 * // Dans App.jsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * 
 * // Dans un composant
 * const { success, error, warning, info } = useToast();
 * success('Profil mis à jour !');
 * ============================================================================
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X 
} from 'lucide-react';
import { cn } from '../utils/cn';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

const TOAST_DURATIONS = {
  SHORT: 3000,
  NORMAL: 5000,
  LONG: 8000,
};

const TOAST_CONFIG = {
  success: {
    icon: CheckCircle2,
    className: 'bg-green-50 border-green-200 text-green-800',
    iconClassName: 'text-green-500',
    progressClassName: 'bg-green-500',
  },
  error: {
    icon: AlertCircle,
    className: 'bg-red-50 border-red-200 text-red-800',
    iconClassName: 'text-red-500',
    progressClassName: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    className: 'bg-amber-50 border-amber-200 text-amber-800',
    iconClassName: 'text-amber-500',
    progressClassName: 'bg-amber-500',
  },
  info: {
    icon: Info,
    className: 'bg-blue-50 border-blue-200 text-blue-800',
    iconClassName: 'text-blue-500',
    progressClassName: 'bg-blue-500',
  },
};

// ============================================================================
// CONTEXT
// ============================================================================

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast doit être utilisé dans un ToastProvider');
  }
  return context;
}

/**
 * Version safe de useToast qui retourne null si pas dans un provider
 * Utile pour les hooks qui peuvent fonctionner avec ou sans toast
 */
export function useToastSafe() {
  return useContext(ToastContext);
}

// ============================================================================
// PROVIDER
// ============================================================================

export function ToastProvider({ 
  children, 
  position = 'top-right',
  maxToasts = 5,
}) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef({});

  const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const removeToast = useCallback((id) => {
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((options) => {
    const id = generateId();
    const duration = options.duration ?? TOAST_DURATIONS.NORMAL;

    const newToast = {
      id,
      type: options.type || TOAST_TYPES.INFO,
      message: options.message,
      title: options.title,
      duration,
      createdAt: Date.now(),
    };

    setToasts(prev => {
      const updated = [...prev, newToast];
      if (updated.length > maxToasts) {
        const toRemove = updated.slice(0, updated.length - maxToasts);
        toRemove.forEach(t => {
          if (timeoutsRef.current[t.id]) {
            clearTimeout(timeoutsRef.current[t.id]);
            delete timeoutsRef.current[t.id];
          }
        });
        return updated.slice(-maxToasts);
      }
      return updated;
    });

    if (duration) {
      timeoutsRef.current[id] = setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [maxToasts, removeToast]);

  const success = useCallback((message, options = {}) => {
    return addToast({ type: TOAST_TYPES.SUCCESS, message, ...options });
  }, [addToast]);

  const error = useCallback((message, options = {}) => {
    return addToast({ 
      type: TOAST_TYPES.ERROR, 
      message, 
      duration: TOAST_DURATIONS.LONG,
      ...options 
    });
  }, [addToast]);

  const warning = useCallback((message, options = {}) => {
    return addToast({ type: TOAST_TYPES.WARNING, message, ...options });
  }, [addToast]);

  const info = useCallback((message, options = {}) => {
    return addToast({ type: TOAST_TYPES.INFO, message, ...options });
  }, [addToast]);

  const clearAll = useCallback(() => {
    Object.values(timeoutsRef.current).forEach(clearTimeout);
    timeoutsRef.current = {};
    setToasts([]);
  }, []);

  const value = {
    toasts,
    addToast,
    removeToast,
    clearAll,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} position={position} />
    </ToastContext.Provider>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ToastContainer({ toasts, onClose, position }) {
  const positions = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col gap-2 pointer-events-none',
        positions[position]
      )}
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

function Toast({ toast, onClose }) {
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'pointer-events-auto w-80 max-w-sm relative',
        'flex items-start gap-3 p-4',
        'bg-white border rounded-xl shadow-lg',
        config.className
      )}
      role="alert"
    >
      <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconClassName)} />

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-medium text-sm mb-0.5">{toast.title}</p>
        )}
        <p className="text-sm">{toast.message}</p>
      </div>

      <button
        onClick={() => onClose(toast.id)}
        className={cn(
          'flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors',
          config.iconClassName
        )}
        aria-label="Fermer"
      >
        <X className="w-4 h-4" />
      </button>

      {toast.duration && (
        <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-xl">
          <div
            className={cn('h-full', config.progressClassName)}
            style={{
              animation: `toast-progress ${toast.duration}ms linear forwards`,
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

export { ToastContext, TOAST_TYPES, TOAST_DURATIONS };
export default ToastProvider;
