/**
 * PromptsTable - Tableau des prompts
 * ============================================================================
 * Affiche la liste des prompts avec badges, scope et actions.
 * ============================================================================
 */

import React from 'react';
import {
  Edit,
  Copy,
  Trash2,
  ToggleLeft,
  ToggleRight,
  MoreVertical,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { 
  AGENT_TYPES, 
  getPromptScope,
} from '../../config/prompts';

/**
 * Badge pour le type d'agent
 */
function AgentTypeBadge({ agentType }) {
  const agent = AGENT_TYPES[agentType];
  
  if (!agent) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
        {agentType}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'px-2 py-1 text-xs font-medium rounded-full',
        agent.bgColor,
        agent.textColor
      )}
    >
      {agent.label}
    </span>
  );
}

/**
 * Badge pour le scope du prompt
 */
function ScopeBadge({ prompt }) {
  const scope = getPromptScope(prompt);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base">{scope.icon}</span>
      <span
        className={cn(
          'px-2 py-0.5 text-xs font-medium rounded',
          scope.bgColor,
          scope.textColor
        )}
      >
        {prompt.org_id
          ? prompt.organizations?.name || 'Organisation'
          : prompt.vertical_id
          ? prompt.verticals?.name || prompt.vertical_id
          : 'Global'}
      </span>
    </div>
  );
}

/**
 * Badge de statut actif/inactif
 */
function StatusBadge({ isActive }) {
  return (
    <span
      className={cn(
        'px-2 py-1 text-xs font-medium rounded-full',
        isActive
          ? 'bg-green-100 text-green-700'
          : 'bg-slate-100 text-slate-500'
      )}
    >
      {isActive ? 'Actif' : 'Inactif'}
    </span>
  );
}

/**
 * Menu d'actions pour une ligne
 */
function ActionsMenu({ prompt, onEdit, onDuplicate, onDelete, onToggleStatus }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  // Fermer le menu au clic extérieur
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-10">
          <button
            onClick={() => {
              onEdit(prompt);
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Modifier
          </button>
          
          <button
            onClick={() => {
              onDuplicate(prompt);
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Dupliquer
          </button>
          
          <button
            onClick={() => {
              onToggleStatus(prompt);
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            {prompt.is_active ? (
              <>
                <ToggleLeft className="w-4 h-4" />
                Désactiver
              </>
            ) : (
              <>
                <ToggleRight className="w-4 h-4" />
                Activer
              </>
            )}
          </button>
          
          <hr className="my-1 border-slate-200" />
          
          <button
            onClick={() => {
              onDelete(prompt);
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Ligne du tableau
 */
function PromptRow({ prompt, onEdit, onDuplicate, onDelete, onToggleStatus }) {
  // Formatage de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Aperçu du prompt (50 premiers caractères)
  const promptPreview = prompt.system_prompt?.substring(0, 60) + 
    (prompt.system_prompt?.length > 60 ? '...' : '');

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      {/* Nom et description */}
      <td className="px-4 py-3">
        <div>
          <button
            onClick={() => onEdit(prompt)}
            className="font-medium text-slate-900 hover:text-indigo-600 text-left"
          >
            {prompt.name}
          </button>
          {prompt.description && (
            <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">
              {prompt.description}
            </p>
          )}
        </div>
      </td>

      {/* Type d'agent */}
      <td className="px-4 py-3">
        <AgentTypeBadge agentType={prompt.agent_type} />
      </td>

      {/* Scope */}
      <td className="px-4 py-3">
        <ScopeBadge prompt={prompt} />
      </td>

      {/* Statut */}
      <td className="px-4 py-3">
        <StatusBadge isActive={prompt.is_active} />
      </td>

      {/* Aperçu du prompt */}
      <td className="px-4 py-3 max-w-xs">
        <p className="text-sm text-slate-500 truncate" title={prompt.system_prompt}>
          {promptPreview}
        </p>
      </td>

      {/* Date de modification */}
      <td className="px-4 py-3 text-sm text-slate-500">
        {formatDate(prompt.updated_at)}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {/* Boutons rapides sur desktop */}
          <button
            onClick={() => onEdit(prompt)}
            className="hidden sm:flex p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Modifier"
          >
            <Edit className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => onDuplicate(prompt)}
            className="hidden sm:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Dupliquer"
          >
            <Copy className="w-4 h-4" />
          </button>

          {/* Menu dropdown */}
          <ActionsMenu
            prompt={prompt}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * Tableau des prompts
 */
function PromptsTable({ prompts, onEdit, onDuplicate, onDelete, onToggleStatus }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Nom
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Agent
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Scope
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Statut
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Aperçu
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Modifié
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {prompts.map((prompt) => (
              <PromptRow
                key={prompt.id}
                prompt={prompt}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onToggleStatus={onToggleStatus}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PromptsTable;
