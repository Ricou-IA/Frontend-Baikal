/**
 * Input - Composant input réutilisable
 * ============================================================================
 * Champ de saisie avec label, erreur, icônes et helper text.
 * 
 * @example
 * <Input
 *   label="Email"
 *   type="email"
 *   placeholder="vous@exemple.com"
 *   error="Email invalide"
 *   leftIcon={<Mail />}
 * />
 * ============================================================================
 */

import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Styles de base de l'input
 */
const baseInputStyles = `
  w-full px-4 py-2.5
  bg-white border rounded-lg
  text-slate-800 placeholder-slate-400
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-offset-0
  disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
`;

/**
 * États de l'input
 */
const inputStates = {
  default: `
    border-slate-300
    hover:border-slate-400
    focus:border-indigo-500 focus:ring-indigo-500/20
  `,
  error: `
    border-red-500
    hover:border-red-600
    focus:border-red-500 focus:ring-red-500/20
  `,
  success: `
    border-green-500
    hover:border-green-600
    focus:border-green-500 focus:ring-green-500/20
  `,
};

/**
 * Tailles
 */
const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-4 py-3 text-base',
};

/**
 * @typedef {Object} InputProps
 * @property {string} [label]
 * @property {string} [error]
 * @property {string} [helperText]
 * @property {React.ReactNode} [leftIcon]
 * @property {React.ReactNode} [rightIcon]
 * @property {'sm'|'md'|'lg'} [size='md']
 * @property {boolean} [showPasswordToggle=false]
 * @property {string} [className]
 * @property {string} [containerClassName]
 */

/**
 * Composant Input
 */
const Input = forwardRef(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  size = 'md',
  showPasswordToggle = false,
  type = 'text',
  className,
  containerClassName,
  id,
  disabled,
  required,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  
  // ID auto-généré si non fourni
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  // Détermine le type réel (pour le toggle password)
  const inputType = type === 'password' && showPassword ? 'text' : type;
  
  // État visuel
  const state = error ? 'error' : 'default';
  
  // Afficher le toggle password ?
  const hasPasswordToggle = type === 'password' && showPasswordToggle;

  return (
    <div className={cn('w-full', containerClassName)}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Container input */}
      <div className="relative">
        {/* Icône gauche */}
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-slate-400 w-5 h-5">{leftIcon}</span>
          </div>
        )}

        {/* Input */}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          disabled={disabled}
          required={required}
          className={cn(
            baseInputStyles,
            inputStates[state],
            sizes[size],
            leftIcon && 'pl-10',
            (rightIcon || hasPasswordToggle) && 'pr-10',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />

        {/* Icône droite ou toggle password */}
        {(rightIcon || hasPasswordToggle) && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            {hasPasswordToggle ? (
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-slate-400 hover:text-slate-600 focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            ) : (
              <span className="text-slate-400 w-5 h-5">{rightIcon}</span>
            )}
          </div>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-1.5 text-sm text-red-600"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Helper text */}
      {helperText && !error && (
        <p
          id={`${inputId}-helper`}
          className="mt-1.5 text-sm text-slate-500"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Composant Textarea
 */
const Textarea = forwardRef(({
  label,
  error,
  helperText,
  className,
  containerClassName,
  id,
  disabled,
  required,
  rows = 4,
  ...props
}, ref) => {
  const inputId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
  const state = error ? 'error' : 'default';

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <textarea
        ref={ref}
        id={inputId}
        disabled={disabled}
        required={required}
        rows={rows}
        className={cn(
          baseInputStyles,
          inputStates[state],
          'resize-none',
          className
        )}
        aria-invalid={error ? 'true' : 'false'}
        {...props}
      />

      {error && (
        <p className="mt-1.5 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className="mt-1.5 text-sm text-slate-500">
          {helperText}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export { Input, Textarea };
export default Input;
