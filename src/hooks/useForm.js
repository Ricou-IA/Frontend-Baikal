/**
 * useForm - Hook pour gestion de formulaires
 * ============================================================================
 * Gère les valeurs, validation, erreurs et soumission de formulaires.
 * 
 * @example
 * const { values, errors, handleChange, handleSubmit, isValid } = useForm({
 *   initialValues: { email: '', password: '' },
 *   validate: (values) => {
 *     const errors = {};
 *     if (!values.email) errors.email = 'Email requis';
 *     if (!values.password) errors.password = 'Mot de passe requis';
 *     return errors;
 *   },
 *   onSubmit: async (values) => {
 *     await loginUser(values);
 *   }
 * });
 * ============================================================================
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * @typedef {Object} UseFormOptions
 * @property {Object} initialValues - Valeurs initiales du formulaire
 * @property {Function} [validate] - Fonction de validation (retourne un objet d'erreurs)
 * @property {Function} [onSubmit] - Fonction appelée à la soumission
 * @property {boolean} [validateOnChange=false] - Valider à chaque changement
 * @property {boolean} [validateOnBlur=true] - Valider au blur
 */

/**
 * Hook pour gérer les formulaires
 * 
 * @param {UseFormOptions} options - Options de configuration
 * @returns {Object} - État et handlers du formulaire
 */
export function useForm(options = {}) {
  const {
    initialValues = {},
    validate = () => ({}),
    onSubmit = () => {},
    validateOnChange = false,
    validateOnBlur = true,
  } = options;

  // État du formulaire
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);

  /**
   * Valide le formulaire entier
   * @returns {Object} - Objet d'erreurs
   */
  const validateForm = useCallback(() => {
    const validationErrors = validate(values);
    setErrors(validationErrors);
    return validationErrors;
  }, [values, validate]);

  /**
   * Valide un champ spécifique
   * @param {string} name - Nom du champ
   * @returns {string|undefined} - Message d'erreur ou undefined
   */
  const validateField = useCallback((name) => {
    const validationErrors = validate(values);
    const fieldError = validationErrors[name];
    setErrors(prev => ({ ...prev, [name]: fieldError }));
    return fieldError;
  }, [values, validate]);

  /**
   * Gère le changement d'un champ
   * @param {Event|string} eventOrName - Événement ou nom du champ
   * @param {any} [value] - Valeur (si eventOrName est un nom)
   */
  const handleChange = useCallback((eventOrName, value) => {
    let name, newValue;

    if (typeof eventOrName === 'string') {
      // Appel direct: handleChange('email', 'test@test.com')
      name = eventOrName;
      newValue = value;
    } else {
      // Événement: handleChange(event)
      const target = eventOrName.target;
      name = target.name;
      newValue = target.type === 'checkbox' ? target.checked : target.value;
    }

    setValues(prev => ({ ...prev, [name]: newValue }));

    // Validation au changement si activée
    if (validateOnChange) {
      const validationErrors = validate({ ...values, [name]: newValue });
      setErrors(prev => ({ ...prev, [name]: validationErrors[name] }));
    }
  }, [values, validate, validateOnChange]);

  /**
   * Gère le blur d'un champ
   * @param {Event|string} eventOrName - Événement ou nom du champ
   */
  const handleBlur = useCallback((eventOrName) => {
    const name = typeof eventOrName === 'string' 
      ? eventOrName 
      : eventOrName.target.name;

    setTouched(prev => ({ ...prev, [name]: true }));

    // Validation au blur si activée
    if (validateOnBlur) {
      validateField(name);
    }
  }, [validateOnBlur, validateField]);

  /**
   * Gère la soumission du formulaire
   * @param {Event} [event] - Événement de soumission
   */
  const handleSubmit = useCallback(async (event) => {
    if (event) {
      event.preventDefault();
    }

    setSubmitCount(prev => prev + 1);

    // Marque tous les champs comme touchés
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setTouched(allTouched);

    // Valide le formulaire
    const validationErrors = validateForm();
    const hasErrors = Object.keys(validationErrors).length > 0;

    if (hasErrors) {
      return;
    }

    // Soumission
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      // L'erreur est gérée par le composant parent
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validateForm, onSubmit]);

  /**
   * Réinitialise le formulaire
   * @param {Object} [newValues] - Nouvelles valeurs initiales
   */
  const reset = useCallback((newValues = initialValues) => {
    setValues(newValues);
    setErrors({});
    setTouched({});
    setSubmitCount(0);
    setIsSubmitting(false);
  }, [initialValues]);

  /**
   * Définit une valeur spécifique
   * @param {string} name - Nom du champ
   * @param {any} value - Nouvelle valeur
   */
  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, []);

  /**
   * Définit une erreur spécifique
   * @param {string} name - Nom du champ
   * @param {string} error - Message d'erreur
   */
  const setError = useCallback((name, error) => {
    setErrors(prev => ({ ...prev, [name]: error }));
  }, []);

  /**
   * Définit plusieurs valeurs à la fois
   * @param {Object} newValues - Objet de valeurs
   */
  const setMultipleValues = useCallback((newValues) => {
    setValues(prev => ({ ...prev, ...newValues }));
  }, []);

  // Vérifie si le formulaire est valide
  const isValid = useMemo(() => {
    return Object.keys(validate(values)).length === 0;
  }, [values, validate]);

  // Vérifie si le formulaire a été modifié
  const isDirty = useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(initialValues);
  }, [values, initialValues]);

  // Récupère les props pour un champ input
  const getFieldProps = useCallback((name) => ({
    name,
    value: values[name] ?? '',
    onChange: handleChange,
    onBlur: handleBlur,
  }), [values, handleChange, handleBlur]);

  // Récupère les métadonnées d'un champ
  const getFieldMeta = useCallback((name) => ({
    value: values[name],
    error: errors[name],
    touched: touched[name] ?? false,
    hasError: touched[name] && !!errors[name],
  }), [values, errors, touched]);

  return {
    // État
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
    submitCount,

    // Actions
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    setValue,
    setError,
    setMultipleValues,
    validateForm,
    validateField,

    // Helpers
    getFieldProps,
    getFieldMeta,
  };
}

export default useForm;
