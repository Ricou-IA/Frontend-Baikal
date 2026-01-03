/**
 * FormInput.jsx - Baikal Console
 * ============================================================================
 * Composant de champ de formulaire réutilisable avec label, hint et erreur.
 * Extrait des modals CategoryModal et ConceptModal pour éviter la duplication.
 *
 * @version 1.0.0
 * ============================================================================
 */

import React from 'react';

/**
 * Composant FormInput réutilisable
 *
 * @param {Object} props
 * @param {string} props.label - Label du champ
 * @param {boolean} props.required - Si le champ est requis
 * @param {string} props.error - Message d'erreur à afficher
 * @param {string} props.hint - Texte d'aide sous le champ
 * @param {React.ReactNode} props.children - Input/Select/Textarea à wrapper
 * @param {string} props.className - Classes CSS additionnelles
 */
export function FormInput({
  label,
  required = false,
  error,
  hint,
  children,
  className = ''
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-white font-mono">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="text-xs text-baikal-text">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-400 font-mono">{error}</p>
      )}
    </div>
  );
}

export default FormInput;
