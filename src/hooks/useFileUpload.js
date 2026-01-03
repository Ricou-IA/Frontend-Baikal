/**
 * useFileUpload.js - Baikal Console
 * ============================================================================
 * Hook personnalisé pour la gestion du drag & drop et validation de fichiers.
 * Extrait de SmartUploader et InvoiceUploader pour éviter la duplication.
 *
 * @version 1.0.0
 * ============================================================================
 */

import { useState, useRef, useCallback } from 'react';

/**
 * Hook useFileUpload
 *
 * @param {Object} options
 * @param {string[]} options.acceptedTypes - Types MIME acceptés
 * @param {number} options.maxFileSize - Taille max en MB (défaut: 20)
 * @param {function} options.onFileValidated - Callback appelé quand un fichier est validé
 * @param {function} options.onError - Callback appelé en cas d'erreur
 *
 * @returns {Object} - États et handlers pour le drag & drop
 */
export function useFileUpload({
  acceptedTypes = [],
  maxFileSize = 20,
  onFileValidated,
  onError,
} = {}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  /**
   * Valide et définit le fichier sélectionné
   */
  const validateAndSetFile = useCallback((file) => {
    setErrorMessage('');

    // Vérification du type
    if (acceptedTypes.length > 0 && !acceptedTypes.includes(file.type)) {
      const error = `Type de fichier non supporté: ${file.type}`;
      setErrorMessage(error);
      onError?.(error);
      return false;
    }

    // Vérification de la taille
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxFileSize) {
      const error = `Fichier trop volumineux (${fileSizeMB.toFixed(1)} MB). Maximum: ${maxFileSize} MB`;
      setErrorMessage(error);
      onError?.(error);
      return false;
    }

    setSelectedFile(file);
    onFileValidated?.(file);
    return true;
  }, [acceptedTypes, maxFileSize, onFileValidated, onError]);

  /**
   * Handler pour l'entrée dans la zone de drop
   */
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  /**
   * Handler pour la sortie de la zone de drop
   */
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Vérifie qu'on quitte vraiment la zone (pas juste un enfant)
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  /**
   * Handler pour le survol de la zone de drop
   */
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Handler pour le drop d'un fichier
   */
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  }, [validateAndSetFile]);

  /**
   * Handler pour la sélection via input file
   */
  const handleFileInputChange = useCallback((e) => {
    if (e.target.files?.[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  }, [validateAndSetFile]);

  /**
   * Ouvre le sélecteur de fichiers
   */
  const openFileSelector = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Réinitialise l'état
   */
  const reset = useCallback(() => {
    setSelectedFile(null);
    setErrorMessage('');
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Efface le message d'erreur
   */
  const clearError = useCallback(() => {
    setErrorMessage('');
  }, []);

  return {
    // États
    isDragging,
    selectedFile,
    errorMessage,

    // Refs
    fileInputRef,
    dropZoneRef,

    // Handlers pour le drag & drop
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,

    // Autres handlers
    handleFileInputChange,
    openFileSelector,
    validateAndSetFile,

    // Actions
    reset,
    clearError,
    setSelectedFile,
    setErrorMessage,
  };
}

export default useFileUpload;
