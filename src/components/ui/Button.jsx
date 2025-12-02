/**
 * Button - Composant bouton réutilisable
 * ============================================================================
 * Bouton avec variantes, tailles et états.
 * 
 * @example
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Valider
 * </Button>
 * 
 * <Button variant="danger" loading>
 *   Supprimer
 * </Button>
 * 
 * <Button variant="ghost" leftIcon={<Plus />}>
 *   Ajouter
 * </Button>
 * ============================================================================
 */

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Styles de base du bouton
 */
const baseStyles = `
  inline-flex items-center justify-center
  font-medium rounded-lg
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-offset-2
  disabled:opacity-50 disabled:cursor-not-allowed
`;

/**
 * Variantes de style
 */
const variants = {
  primary: `
    bg-indigo-600 text-white
    hover:bg-indigo-700
    focus:ring-indigo-500
  `,
  secondary: `
    bg-slate-100 text-slate-700
    hover:bg-slate-200
    focus:ring-slate-500
  `,
  danger: `
    bg-red-600 text-white
    hover:bg-red-700
    focus:ring-red-500
  `,
  success: `
    bg-green-600 text-white
    hover:bg-green-700
    focus:ring-green-500
  `,
  warning: `
    bg-amber-500 text-white
    hover:bg-amber-600
    focus:ring-amber-500
  `,
  ghost: `
    bg-transparent text-slate-600
    hover:bg-slate-100
    focus:ring-slate-500
  `,
  outline: `
    bg-transparent text-indigo-600
    border border-indigo-600
    hover:bg-indigo-50
    focus:ring-indigo-500
  `,
  link: `
    bg-transparent text-indigo-600
    hover:text-indigo-700 hover:underline
    focus:ring-indigo-500
    p-0
  `,
};

/**
 * Tailles
 */
const sizes = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
  xl: 'px-6 py-3 text-lg gap-2.5',
};

/**
 * Tailles des icônes
 */
const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
};

/**
 * @typedef {Object} ButtonProps
 * @property {'primary'|'secondary'|'danger'|'success'|'warning'|'ghost'|'outline'|'link'} [variant='primary']
 * @property {'xs'|'sm'|'md'|'lg'|'xl'} [size='md']
 * @property {boolean} [disabled=false]
 * @property {boolean} [loading=false]
 * @property {React.ReactNode} [leftIcon]
 * @property {React.ReactNode} [rightIcon]
 * @property {boolean} [fullWidth=false]
 * @property {'button'|'submit'|'reset'} [type='button']
 * @property {string} [className]
 * @property {React.ReactNode} children
 */

/**
 * Composant Button
 */
const Button = forwardRef(({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  type = 'button',
  className,
  children,
  ...props
}, ref) => {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {/* Loading spinner ou icône gauche */}
      {loading ? (
        <Loader2 className={cn(iconSizes[size], 'animate-spin')} />
      ) : leftIcon ? (
        <span className={iconSizes[size]}>{leftIcon}</span>
      ) : null}

      {/* Contenu */}
      {children}

      {/* Icône droite */}
      {rightIcon && !loading && (
        <span className={iconSizes[size]}>{rightIcon}</span>
      )}
    </button>
  );
});

Button.displayName = 'Button';

export { Button };
export default Button;
