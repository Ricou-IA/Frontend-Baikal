import React, { useState } from 'react';
import { User, Bot, FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

/**
 * ChatBubble - Affiche un message unique (User ou AI)
 * 
 * @param {Object} message - { role: 'user' | 'ai', content: string, sources?: array, timestamp?: Date }
 */
const ChatBubble = ({ message }) => {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = message.role === 'user';
  const hasSources = message.sources && message.sources.length > 0;

  // Formatage du timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div
      className={`flex w-full mb-4 animate-fadeIn ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Avatar AI (gauche) */}
      {!isUser && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shadow-sm border border-slate-200/50">
            <Bot className="w-5 h-5 text-slate-600" />
          </div>
        </div>
      )}

      {/* Contenu du message */}
      <div
        className={`max-w-[75%] ${
          isUser ? 'order-1' : 'order-2'
        }`}
      >
        {/* Bulle principale */}
        <div
          className={`px-4 py-3 rounded-2xl shadow-sm transition-all duration-200 ${
            isUser
              ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-md'
              : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-md'
          }`}
        >
          {/* Contenu texte */}
          <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${
            isUser ? 'text-white' : 'text-slate-700'
          }`}>
            {message.content}
          </p>

          {/* Timestamp */}
          {message.timestamp && (
            <p className={`text-[11px] mt-2 ${
              isUser ? 'text-indigo-200' : 'text-slate-400'
            }`}>
              {formatTime(message.timestamp)}
            </p>
          )}
        </div>

        {/* Section Sources (uniquement pour AI) */}
        {!isUser && hasSources && (
          <div className="mt-2">
            {/* Toggle Sources */}
            <button
              onClick={() => setSourcesExpanded(!sourcesExpanded)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors duration-200 group"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="font-medium">
                {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
              </span>
              {sourcesExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 transition-transform" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 transition-transform" />
              )}
            </button>

            {/* Liste des sources (accordéon) */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                sourcesExpanded ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="flex flex-wrap gap-2">
                {message.sources.map((source, index) => (
                  <SourceChip key={index} source={source} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Avatar User (droite) */}
      {isUser && (
        <div className="flex-shrink-0 ml-3 order-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <User className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * SourceChip - Affiche une source sous forme de chip cliquable
 */
const SourceChip = ({ source }) => {
  // Source peut être un string ou un objet { title, url, type }
  const isObject = typeof source === 'object';
  const title = isObject ? source.title : source;
  const url = isObject ? source.url : null;
  const type = isObject ? source.type : 'document';

  // Icône selon le type
  const getIcon = () => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-3 h-3" />;
      case 'web':
        return <ExternalLink className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  const ChipContent = () => (
    <>
      {getIcon()}
      <span className="truncate max-w-[200px]">{title}</span>
    </>
  );

  const baseClasses = `
    inline-flex items-center gap-1.5 px-2.5 py-1.5 
    text-xs font-medium text-slate-600 
    bg-slate-50 hover:bg-slate-100 
    border border-slate-200 rounded-lg 
    transition-all duration-200 
    hover:shadow-sm hover:border-slate-300
  `;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} cursor-pointer hover:text-indigo-600`}
      >
        <ChipContent />
      </a>
    );
  }

  return (
    <span className={baseClasses}>
      <ChipContent />
    </span>
  );
};

export default ChatBubble;










