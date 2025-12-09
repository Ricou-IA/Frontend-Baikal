import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { callRagBrain } from '../../lib/supabaseClient';
import ChatBubble from './ChatBubble';
import ChatInput from './ChatInput';

// ============================================
// CONFIGURATION
// ============================================

// Verticale par défaut (simulée pour Brique 3)
const DEFAULT_VERTICAL_ID = 'audit';

// Mode démo activé si pas de backend
const DEMO_ALLOWED = import.meta.env.VITE_DEMO_MODE === 'true' || false;

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

/**
 * ChatInterface - Container principal du chat RAG
 * 
 * @param {string} verticalId - ID de la verticale active
 * @param {Function} onError - Callback pour remonter les erreurs
 */
const ChatInterface = ({ 
  verticalId = DEFAULT_VERTICAL_ID,
  onError = null 
}) => {
  // ============================================
  // STATE
  // ============================================
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(DEMO_ALLOWED);
  
  // Ref pour auto-scroll
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // ============================================
  // EFFECTS
  // ============================================

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Message de bienvenue initial
  useEffect(() => {
    const welcomeMessage = {
      id: 'welcome',
      role: 'ai',
      content: getWelcomeMessage(verticalId),
      timestamp: new Date(),
      sources: []
    };
    setMessages([welcomeMessage]);
  }, [verticalId]);

  // ============================================
  // HELPERS
  // ============================================

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateMessageId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Message de bienvenue personnalisé par verticale
  const getWelcomeMessage = (vertical) => {
    const messages = {
      audit: "Bonjour ! Je suis votre assistant IA spécialisé en **Audit**. Je peux vous aider avec les procédures de contrôle, la réglementation comptable, et les bonnes pratiques du métier. Comment puis-je vous aider ?",
      btp: "Bonjour ! Je suis votre assistant IA spécialisé en **BTP**. Je connais les normes de construction, la réglementation sécurité, et les procédures chantier. Quelle est votre question ?",
      juridique: "Bonjour ! Je suis votre assistant IA spécialisé en **Droit**. Je peux vous éclairer sur les textes de loi, la jurisprudence, et les procédures juridiques. En quoi puis-je vous assister ?",
      default: "Bonjour ! Je suis votre assistant IA. Posez-moi vos questions et j'utiliserai ma base de connaissances pour vous répondre avec précision."
    };
    return messages[vertical] || messages.default;
  };

  // ============================================
  // API CALL - RAG BRAIN
  // ============================================

  const callRagBrainAPI = async (query) => {
    // Utiliser la fonction callRagBrain existante
    const { data, error } = await callRagBrain(query, verticalId, {
      matchThreshold: 0.5,
      matchCount: 5
    });

    if (error) {
      throw error;
    }

    // Adapter le format de réponse
    return {
      content: data.answer || 'Réponse reçue.',
      sources: data.sources || []
    };
  };

  // ============================================
  // MODE DEMO - Simulation
  // ============================================

  const simulateDemoResponse = async (query) => {
    // Simule un délai réseau
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Réponses simulées selon la verticale
    const demoResponses = {
      audit: {
        content: `**[Mode Démo]** Concernant votre question sur "${query.substring(0, 50)}...", voici ce que je trouve dans la base de connaissances Audit :\n\nSelon les procédures internes et le Code de Commerce, les contrôles de conformité doivent être documentés selon un format standardisé. Je recommande de consulter la procédure interne P-AUD-003.`,
        sources: [
          { title: 'Code Commerce Art. L823-9', type: 'document' },
          { title: 'Procédure Interne P-AUD-003.pdf', type: 'pdf' },
          { title: 'Guide NEP 2024', type: 'document' }
        ]
      },
      btp: {
        content: `**[Mode Démo]** Pour votre question BTP "${query.substring(0, 50)}...", la réglementation applicable est la suivante :\n\nLe DTU 31.2 encadre les constructions à ossature bois. Les normes sismiques PS-92 s'appliquent dans les zones concernées.`,
        sources: [
          { title: 'DTU 31.2 - Ossature Bois', type: 'document' },
          { title: 'Norme PS-92 Sismique', type: 'pdf' }
        ]
      },
      default: {
        content: `**[Mode Démo]** Ceci est une réponse simulée pour tester l'interface.\n\nVotre question : "${query}"\n\nLe backend RAG n'est pas encore connecté. Activez le mode production en configurant les variables d'environnement.`,
        sources: [
          { title: 'Documentation Test', type: 'document' }
        ]
      }
    };

    return demoResponses[verticalId] || demoResponses.default;
  };

  // ============================================
  // SEND MESSAGE HANDLER
  // ============================================

  const handleSendMessage = useCallback(async (content) => {
    if (!content.trim() || isLoading) return;

    // Clear previous error
    setError(null);

    // Ajouter le message utilisateur
    const userMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      let aiResponse;

      // Mode démo ou appel API réel
      if (isDemoMode) {
        aiResponse = await simulateDemoResponse(content);
      } else {
        try {
          aiResponse = await callRagBrainAPI(content);
        } catch (apiError) {
          if (DEMO_ALLOWED) {
            // Fallback vers mode démo si l'API échoue et que le mode est autorisé
            console.warn('API indisponible, bascule en mode démo:', apiError.message);
            aiResponse = await simulateDemoResponse(content);
            setIsDemoMode(true);
            setError({
              type: 'warning',
              message: 'Backend indisponible. Mode démonstration activé.'
            });
          } else {
            throw apiError;
          }
        }
      }

      // Ajouter la réponse AI
      const aiMessage = {
        id: generateMessageId(),
        role: 'ai',
        content: aiResponse.content,
        sources: aiResponse.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (err) {
      console.error('Erreur envoi message:', err);
      setError({
        type: 'error',
        message: err.message || 'Une erreur est survenue. Veuillez réessayer.'
      });
      
      // Callback parent si fourni
      onError?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isDemoMode, verticalId, onError]);

  // Retry dernier message
  const handleRetry = () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      // Supprimer le dernier message AI (s'il y en a un après le user)
      setMessages(prev => {
        const lastUserIndex = prev.findLastIndex(m => m.role === 'user');
        return prev.slice(0, lastUserIndex + 1);
      });
      handleSendMessage(lastUserMessage.content);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <ChatHeader 
        verticalId={verticalId} 
        isDemoMode={isDemoMode}
        isToggleVisible={DEMO_ALLOWED}
        onToggleDemo={() => {
          if (DEMO_ALLOWED) {
            setIsDemoMode((prev) => !prev)
          }
        }}
      />

      {/* Zone des messages */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <EmptyState verticalId={verticalId} />
          ) : (
            messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))
          )}

          {/* Indicateur de chargement */}
          {isLoading && <TypingIndicator />}

          {/* Message d'erreur */}
          {error && (
            <ErrorBanner 
              error={error} 
              onRetry={handleRetry}
              onDismiss={() => setError(null)}
            />
          )}

          {/* Ancre pour auto-scroll */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input fixé en bas */}
      <ChatInput 
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        placeholder={`Posez votre question ${verticalId ? `(${verticalId})` : ''}...`}
      />
    </div>
  );
};

// ============================================
// SOUS-COMPOSANTS
// ============================================

/**
 * Header du chat avec indicateur de verticale
 */
const ChatHeader = ({ verticalId, isDemoMode, isToggleVisible, onToggleDemo }) => {
  const verticalLabels = {
    audit: 'Audit & Comptabilité',
    btp: 'BTP & Construction',
    juridique: 'Juridique',
    rh: 'Ressources Humaines'
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-sm">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-slate-800">Assistant IA</h1>
          <p className="text-xs text-slate-500">
            {verticalLabels[verticalId] || 'Multi-domaines'}
          </p>
        </div>
      </div>

      {/* Badge Mode Démo */}
      {isToggleVisible && (
        <button
          onClick={onToggleDemo}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isDemoMode ? 'Mode Démo actif' : 'Activer Mode Démo'}
        </button>
      )}
    </div>
  );
};

/**
 * État vide - affiché quand pas de messages
 */
const EmptyState = ({ verticalId }) => (
  <div className="flex flex-col items-center justify-center h-full py-16 text-center">
    <div className="p-4 bg-slate-100 rounded-2xl mb-4">
      <MessageSquare className="w-10 h-10 text-slate-400" />
    </div>
    <h2 className="text-lg font-medium text-slate-700 mb-2">
      Démarrez une conversation
    </h2>
    <p className="text-sm text-slate-500 max-w-md">
      Posez votre première question et je rechercherai dans la base de connaissances 
      {verticalId && ` ${verticalId}`} pour vous fournir une réponse précise avec ses sources.
    </p>
  </div>
);

/**
 * Indicateur de saisie (l'IA réfléchit)
 */
const TypingIndicator = () => (
  <div className="flex items-center gap-3 mb-4 animate-fadeIn">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
      <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
    </div>
    <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-md shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

/**
 * Bannière d'erreur avec option retry
 */
const ErrorBanner = ({ error, onRetry, onDismiss }) => {
  const isWarning = error.type === 'warning';
  
  return (
    <div className={`
      flex items-center gap-3 p-4 mb-4 rounded-xl border animate-fadeIn
      ${isWarning 
        ? 'bg-amber-50 border-amber-200 text-amber-800' 
        : 'bg-red-50 border-red-200 text-red-800'
      }
    `}>
      <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isWarning ? 'text-amber-500' : 'text-red-500'}`} />
      <p className="flex-1 text-sm">{error.message}</p>
      <div className="flex gap-2">
        {!isWarning && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Réessayer
          </button>
        )}
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          Fermer
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;

