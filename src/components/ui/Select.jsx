/**
 * Select - Composant select réutilisable
 * ============================================================================
 * Menu déroulant avec label, erreur et options.
 * 
 * @example
 * <Select
 *   label="Type d'agent"
 *   value={agentType}
 *   onChange={(e) => setAgentType(e.target.value)}
 *   options={[
 *     { value: 'librarian', label: 'Bibliothécaire' },
 *     { value: 'router', label: 'Routeur' },
 *   ]}
 *   placeholder="Sélectionner un type"
 * />
 * ============================================================================
 */

import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Styles de base du select
 */
const baseSelectStyles = `
  w-full px-4 py-2.5 pr-10
  bg-black border rounded-md
  text-white
  transition-colors duration-200
  focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-offset-baikal-bg
  disabled:bg-baikal-bg disabled:text-baikal-text disabled:cursor-not-allowed
  appearance-none cursor-pointer
`;

/**
 * États du select
 */
const selectStates = {
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
 * @typedef {Object} SelectOption
 * @property {string} value - Valeur de l'option
 * @property {string} label - Label affiché
 * @property {boolean} [disabled] - Option désactivée
 */

/**
 * @typedef {Object} SelectProps
 * @property {string} [label] - Label du champ
 * @property {string} [error] - Message d'erreur
 * @property {string} [helperText] - Texte d'aide
 * @property {SelectOption[]} options - Options du select
 * @property {string} [placeholder] - Placeholder (première option vide)
 * @property {'sm'|'md'|'lg'} [size='md'] - Taille
 * @property {string} [className] - Classes CSS additionnelles
 * @property {string} [containerClassName] - Classes CSS du container
 */

/**
 * Composant Select
 */
const Select = forwardRef(({
  label,
  error,
  helperText,
  options = [],
  placeholder,
  size = 'md',
  className,
  containerClassName,
  id,
  disabled,
  required,
  value,
  ...props
}, ref) => {
  // ID auto-généré si non fourni
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;
  
  // État visuel
  const state = error ? 'error' : 'default';

  return (
    <div className={cn('w-full', containerClassName)}>
      {/* Label */}
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-mono text-baikal-text mb-1.5 uppercase"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      {/* Container select */}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          value={value}
          className={cn(
            baseSelectStyles,
            selectStates[state],
            sizes[size],
            !value && 'text-baikal-text',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          {...props}
        >
          {/* Placeholder */}
          {placeholder && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          
          {/* Options */}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>

        {/* Icône chevron */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown className="w-5 h-5 text-baikal-text" />
        </div>
      </div>

      {/* Message d'erreur */}
      {error && (
        <p
          id={`${selectId}-error`}
          className="mt-1.5 text-sm text-red-400 font-mono"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Helper text */}
      {helperText && !error && (
        <p
          id={`${selectId}-helper`}
          className="mt-1.5 text-sm text-baikal-text font-sans"
        >
          {helperText}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export { Select };
export default Select;
