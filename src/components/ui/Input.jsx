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
  bg-black border rounded-md
  text-white placeholder-baikal-text
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-offset-baikal-bg
  disabled:bg-baikal-bg disabled:text-baikal-text disabled:cursor-not-allowed
`;

/**
 * États de l'input
 */
const inputStates = {
  default: `
    border-baikal-border
    hover:border-baikal-cyan/50
    focus:border-baikal-cyan focus:ring-baikal-cyan/20
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
          className="block text-xs font-mono text-baikal-text mb-1.5 uppercase"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      {/* Container input */}
      <div className="relative">
        {/* Icône gauche */}
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-baikal-text w-5 h-5">{leftIcon}</span>
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
                className="text-baikal-text hover:text-baikal-cyan focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            ) : (
              <span className="text-baikal-text w-5 h-5">{rightIcon}</span>
            )}
          </div>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-1.5 text-sm text-red-400 font-mono"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Helper text */}
      {helperText && !error && (
        <p
          id={`${inputId}-helper`}
          className="mt-1.5 text-sm text-baikal-text font-sans"
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
          className="block text-xs font-mono text-baikal-text mb-1.5 uppercase"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
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
        <p className="mt-1.5 text-sm text-red-400 font-mono" role="alert">
          {error}
        </p>
      )}

      {helperText && !error && (
        <p className="mt-1.5 text-sm text-baikal-text font-sans">
          {helperText}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export { Input, Textarea };
export default Input;
