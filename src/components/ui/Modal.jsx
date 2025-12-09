/**
 * Modal - Composant modal réutilisable
 * ============================================================================
 * Fenêtre modale avec overlay, header et footer.
 * Supporte la fermeture par Escape et clic sur l'overlay.
 * 
 * @example
 * <Modal isOpen={isOpen} onClose={handleClose} title="Confirmation">
 *   <p>Êtes-vous sûr de vouloir continuer ?</p>
 *   <ModalFooter>
 *     <Button variant="secondary" onClick={handleClose}>Annuler</Button>
 *     <Button onClick={handleConfirm}>Confirmer</Button>
 *   </ModalFooter>
 * </Modal>
 * ============================================================================
 */

import React, { useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Tailles de modal
 */
const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  full: 'max-w-full mx-4',
};

/**
 * @typedef {Object} ModalProps
 * @property {boolean} isOpen - État d'ouverture
 * @property {Function} onClose - Callback de fermeture
 * @property {string} [title] - Titre du modal
 * @property {'sm'|'md'|'lg'|'xl'|'2xl'|'3xl'|'full'} [size='md']
 * @property {boolean} [closeOnOverlay=true] - Fermer au clic sur l'overlay
 * @property {boolean} [closeOnEscape=true] - Fermer avec Escape
 * @property {boolean} [showCloseButton=true] - Afficher le bouton fermer
 * @property {React.ReactNode} children
 */

/**
 * Composant Modal
 */
export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  closeOnOverlay = true,
  closeOnEscape = true,
  showCloseButton = true,
  className,
  children,
}) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Gestion de la touche Escape
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && closeOnEscape) {
      onClose();
    }
  }, [closeOnEscape, onClose]);

  // Gestion du clic sur l'overlay
  const handleOverlayClick = useCallback((event) => {
    if (event.target === event.currentTarget && closeOnOverlay) {
      onClose();
    }
  }, [closeOnOverlay, onClose]);

  // Effets de montage/démontage
  useEffect(() => {
    if (isOpen) {
      // Sauvegarde le focus actuel
      previousFocusRef.current = document.activeElement;
      
      // Ajoute l'écouteur d'événements
      document.addEventListener('keydown', handleKeyDown);
      
      // Bloque le scroll du body
      document.body.style.overflow = 'hidden';
      
      // Focus sur le modal
      modalRef.current?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      
      // Restaure le focus
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, handleKeyDown]);

  // Ne rend rien si fermé
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-modal="true"
      role="dialog"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Container centré */}
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={handleOverlayClick}
      >
        {/* Modal */}
        <div
          ref={modalRef}
          tabIndex={-1}
          className={cn(
            'relative w-full bg-baikal-surface border border-baikal-border rounded-md',
            'transform transition-all',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            sizes[size],
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-mono font-semibold text-white"
                >
                  {title}
                </h2>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="p-1.5 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Contenu */}
          <div className="px-6 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Footer du modal
 */
export function ModalFooter({
  children,
  className,
  align = 'right',
}) {
  const alignments = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
    between: 'justify-between',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 pt-4 mt-4 border-t border-baikal-border',
        alignments[align],
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Modal de confirmation simple
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmation',
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  variant = 'danger',
  loading = false,
}) {
  const buttonVariants = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-baikal-text font-sans">{message}</p>
      <ModalFooter>
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-baikal-text bg-baikal-surface border border-baikal-border hover:bg-baikal-bg rounded-md transition-colors disabled:opacity-50"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50',
            buttonVariants[variant]
          )}
        >
          {loading ? 'Chargement...' : confirmText}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export default Modal;

