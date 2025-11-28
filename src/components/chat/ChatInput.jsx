import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';

/**
 * ChatInput - Champ de saisie fixé en bas avec auto-resize
 * 
 * @param {Function} onSendMessage - Callback appelé avec le message
 * @param {boolean} isLoading - Désactive l'input pendant le chargement
 * @param {string} placeholder - Placeholder personnalisé
 */
const ChatInput = ({ 
  onSendMessage, 
  isLoading = false, 
  placeholder = "Posez votre question..." 
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize du textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [message]);

  // Gestion de l'envoi
  const handleSubmit = (e) => {
    e?.preventDefault();
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isLoading) return;

    onSendMessage(trimmedMessage);
    setMessage('');
    
    // Reset hauteur textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // Gestion des touches (Entrée pour envoyer, Shift+Entrée pour nouvelle ligne)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = message.trim().length > 0 && !isLoading;

  return (
    <div className="border-t border-slate-200 bg-white/80 backdrop-blur-xl">
      <div className="max-w-4xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className={`
            flex items-end gap-3 p-2 
            bg-white rounded-2xl 
            border-2 transition-all duration-200
            shadow-sm hover:shadow-md
            ${isLoading 
              ? 'border-slate-200 bg-slate-50' 
              : 'border-slate-200 focus-within:border-indigo-400 focus-within:shadow-indigo-100'
            }
          `}>
            {/* Textarea auto-resize */}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              rows={1}
              className={`
                flex-1 px-3 py-2.5 
                text-[15px] text-slate-800 placeholder-slate-400
                bg-transparent resize-none 
                outline-none
                disabled:text-slate-400 disabled:cursor-not-allowed
                min-h-[44px] max-h-[150px]
              `}
              style={{ lineHeight: '1.5' }}
            />

            {/* Bouton Envoi */}
            <button
              type="submit"
              disabled={!canSend}
              className={`
                flex-shrink-0 p-3 rounded-xl
                transition-all duration-200 ease-out
                ${canSend
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md hover:shadow-lg hover:from-indigo-700 hover:to-indigo-800 active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }
              `}
              aria-label="Envoyer le message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Indicateur de raccourci */}
          <div className="flex justify-between items-center mt-2 px-2">
            <p className="text-[11px] text-slate-400">
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Entrée</kbd>
              {' '}pour envoyer • {' '}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">Shift + Entrée</kbd>
              {' '}nouvelle ligne
            </p>
            
            {/* Compteur de caractères (optionnel) */}
            {message.length > 500 && (
              <p className={`text-[11px] ${message.length > 2000 ? 'text-red-500' : 'text-slate-400'}`}>
                {message.length} / 2000
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;




