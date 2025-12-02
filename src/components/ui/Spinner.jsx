/**
 * Spinner - Composant de chargement réutilisable
 * ============================================================================
 * Indicateur de chargement avec différentes tailles et variantes.
 * 
 * @example
 * <Spinner />
 * <Spinner size="lg" />
 * <Spinner variant="primary" />
 * 
 * // Avec overlay
 * <SpinnerOverlay message="Chargement..." />
 * ============================================================================
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Tailles du spinner
 */
const sizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

/**
 * Variantes de couleur
 */
const variants = {
  default: 'text-slate-400',
  primary: 'text-indigo-600',
  secondary: 'text-slate-600',
  white: 'text-white',
  success: 'text-green-600',
  error: 'text-red-600',
};

/**
 * @typedef {Object} SpinnerProps
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [size='md']
 * @property {'default'|'primary'|'secondary'|'white'|'success'|'error'} [variant='default']
 * @property {string} [className]
 */

/**
 * Composant Spinner
 */
export function Spinner({
  size = 'md',
  variant = 'default',
  className,
  ...props
}) {
  return (
    <Loader2
      className={cn(
        'animate-spin',
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

/**
 * Spinner avec texte
 */
export function SpinnerWithText({
  size = 'md',
  variant = 'default',
  text = 'Chargement...',
  className,
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Spinner size={size} variant={variant} />
      <span className={cn('text-sm', variants[variant])}>
        {text}
      </span>
    </div>
  );
}

/**
 * Spinner centré dans un container
 */
export function SpinnerCenter({
  size = 'lg',
  variant = 'primary',
  message,
  className,
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12',
      className
    )}>
      <Spinner size={size} variant={variant} />
      {message && (
        <p className="mt-4 text-sm text-slate-500">{message}</p>
      )}
    </div>
  );
}

/**
 * Spinner overlay plein écran
 */
export function SpinnerOverlay({
  message,
  variant = 'white',
  className,
}) {
  return (
    <div className={cn(
      'fixed inset-0 z-50 flex items-center justify-center',
      'bg-black/50 backdrop-blur-sm',
      className
    )}>
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" variant={variant} />
        {message && (
          <p className="text-white text-sm font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Spinner pour boutons (inline)
 */
export function ButtonSpinner({
  className,
}) {
  return (
    <Loader2 className={cn('w-4 h-4 animate-spin', className)} />
  );
}

/**
 * Composant de chargement pour pages
 */
export function PageLoader({
  message = 'Chargement...',
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" variant="primary" />
        <p className="text-slate-500 text-sm">{message}</p>
      </div>
    </div>
  );
}

/**
 * Skeleton loader pour le contenu
 */
export function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        'animate-pulse bg-slate-200 rounded',
        className
      )}
      {...props}
    />
  );
}

/**
 * Skeleton pour une ligne de texte
 */
export function SkeletonText({
  lines = 1,
  className,
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton pour un avatar
 */
export function SkeletonAvatar({
  size = 'md',
  className,
}) {
  const avatarSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <Skeleton
      className={cn(
        'rounded-full',
        avatarSizes[size],
        className
      )}
    />
  );
}

/**
 * Skeleton pour une carte
 */
export function SkeletonCard({
  className,
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 p-6',
      className
    )}>
      <div className="flex items-center gap-4 mb-4">
        <SkeletonAvatar />
        <div className="flex-1">
          <Skeleton className="h-4 w-1/3 mb-2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export default Spinner;
