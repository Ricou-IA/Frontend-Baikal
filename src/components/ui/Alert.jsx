/**
 * Alert - Composant alerte réutilisable
 * ============================================================================
 * Affiche des messages d'information, succès, warning ou erreur.
 * 
 * @example
 * <Alert variant="success" title="Succès">
 *   Votre profil a été mis à jour.
 * </Alert>
 * 
 * <Alert variant="error" closable onClose={handleClose}>
 *   Une erreur est survenue.
 * </Alert>
 * ============================================================================
 */

import React, { useState } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  AlertTriangle, 
  X 
} from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Configuration des variantes
 */
const variants = {
  info: {
    container: 'bg-blue-900/20 border-blue-500/50 text-blue-300',
    icon: 'text-blue-400',
    title: 'text-blue-300',
    Icon: Info,
  },
  success: {
    container: 'bg-green-900/20 border-green-500/50 text-green-300',
    icon: 'text-green-400',
    title: 'text-green-300',
    Icon: CheckCircle2,
  },
  warning: {
    container: 'bg-amber-900/20 border-amber-500/50 text-amber-300',
    icon: 'text-amber-400',
    title: 'text-amber-300',
    Icon: AlertTriangle,
  },
  error: {
    container: 'bg-red-900/20 border-red-500/50 text-red-300',
    icon: 'text-red-400',
    title: 'text-red-300',
    Icon: AlertCircle,
  },
};

/**
 * @typedef {Object} AlertProps
 * @property {'info'|'success'|'warning'|'error'} [variant='info']
 * @property {string} [title]
 * @property {boolean} [closable=false]
 * @property {Function} [onClose]
 * @property {boolean} [showIcon=true]
 * @property {React.ReactNode} [icon]
 * @property {string} [className]
 * @property {React.ReactNode} children
 */

/**
 * Composant Alert
 */
export function Alert({
  variant = 'info',
  title,
  closable = false,
  onClose,
  showIcon = true,
  icon,
  className,
  children,
}) {
  const [isVisible, setIsVisible] = useState(true);
  
  const config = variants[variant];
  const IconComponent = icon || config.Icon;

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'flex gap-3 p-4 border rounded-lg',
        config.container,
        className
      )}
      role="alert"
    >
      {/* Icône */}
      {showIcon && (
        <div className={cn('flex-shrink-0 mt-0.5', config.icon)}>
          <IconComponent className="w-5 h-5" />
        </div>
      )}

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className={cn('font-medium mb-1', config.title)}>
            {title}
          </h4>
        )}
        <div className="text-sm">
          {children}
        </div>
      </div>

      {/* Bouton fermer */}
      {closable && (
        <button
          onClick={handleClose}
          className={cn(
            'flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors',
            config.icon
          )}
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Composant AlertInline - Version plus compacte
 */
export function AlertInline({
  variant = 'info',
  className,
  children,
}) {
  const config = variants[variant];
  const IconComponent = config.Icon;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        config.icon,
        className
      )}
      role="alert"
    >
      <IconComponent className="w-4 h-4 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Composant AlertBanner - Version pleine largeur
 */
export function AlertBanner({
  variant = 'info',
  closable = false,
  onClose,
  className,
  children,
}) {
  const [isVisible, setIsVisible] = useState(true);
  
  const config = variants[variant];
  const IconComponent = config.Icon;

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'w-full px-4 py-3 border-b',
        config.container,
        className
      )}
      role="alert"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconComponent className={cn('w-5 h-5 flex-shrink-0', config.icon)} />
          <div className="text-sm">{children}</div>
        </div>
        {closable && (
          <button
            onClick={handleClose}
            className={cn(
              'p-1 rounded hover:bg-black/5 transition-colors',
              config.icon
            )}
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default Alert;

