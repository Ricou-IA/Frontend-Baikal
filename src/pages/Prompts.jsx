/**
 * Prompts.jsx - Baikal Console
 * ============================================================================
 * Page de gestion des prompts système.
 * Affichage par sections (type d'agent) avec lignes full width.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Info, AlertCircle, Edit, Copy, Trash2, Lock, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmModal } from '../components/ui/Modal';
import promptsService from '../services/prompts.service';
import {
  canAccessPrompts,
  AGENT_TYPES,
  AGENT_TYPES_SORTED,
  PROMPT_MESSAGES,
  getPromptScope,
  isDefaultPrompt,
  HIERARCHY_EXPLANATION,
} from '../config/prompts';

// ============================================================================
// COMPOSANT TOGGLE SWITCH
// ============================================================================

function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
        ${enabled ? 'bg-indigo-600' : 'bg-slate-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

// ============================================================================
// COMPOSANT BADGE DE SCOPE
// ============================================================================

function ScopeBadge({ prompt }) {
  const scope = getPromptScope(prompt);
  
  let scopeText = scope.icon + ' ' + scope.label;
  if (prompt.vertical_id && prompt.verticals?.name) {
    scopeText = scope.icon + ' ' + prompt.verticals.name;
  }
  if (prompt.org_id && prompt.organizations?.name) {
    scopeText = '📐 ' + (prompt.verticals?.name || prompt.vertical_id) + ' → 🏢 ' + prompt.organizations.name;
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded whitespace-nowrap ${scope.bgColor} ${scope.textColor}`}>
      {scopeText}
    </span>
  );
}

// ============================================================================
// COMPOSANT LIGNE DE PROMPT
// ============================================================================

function PromptRow({ prompt, onEdit, onDuplicate, onDelete, onToggleStatus }) {
  const isDefault = isDefaultPrompt(prompt);
  const usageCount = prompt.usage_count || 0;

  return (
    <div className="flex items-center py-3 px-4 hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
      {/* Icône cadenas ou espace réservé */}
      <div className="w-6 flex-shrink-0">
        {isDefault ? (
          <Lock className="w-4 h-4 text-slate-400" />
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}
      </div>

      {/* Nom et description */}
      <div className="flex-1 min-w-0 pr-4">
        <button
          onClick={() => onEdit(prompt)}
          className="font-medium text-slate-900 hover:text-indigo-600 truncate block text-left"
        >
          {prompt.name}
        </button>
        {prompt.description && (
          <p className="text-sm text-slate-500 truncate">{prompt.description}</p>
        )}
      </div>

      {/* Scope */}
      <div className="hidden sm:flex w-40 justify-center px-2">
        <ScopeBadge prompt={prompt} />
      </div>

      {/* Usage count */}
      <div className="hidden md:block w-28 text-sm text-slate-500 text-right px-2">
        {usageCount > 0 ? `${usageCount.toLocaleString()} requêtes` : 'Aucune requête'}
      </div>

      {/* Toggle */}
      <div className="w-14 flex justify-center px-2">
        <ToggleSwitch
          enabled={prompt.is_active}
          onChange={(value) => onToggleStatus(prompt, value)}
        />
      </div>

      {/* Actions */}
      <div className="w-28 flex items-center justify-end gap-1">
        <button
          onClick={() => onEdit(prompt)}
          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          title="Modifier"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDuplicate(prompt)}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Dupliquer"
        >
          <Copy className="w-4 h-4" />
        </button>
        {!isDefault ? (
          <button
            onClick={() => onDelete(prompt)}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-8 h-8 inline-block" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT SECTION PAR TYPE D'AGENT
// ============================================================================

function AgentSection({ agentType, prompts, onEdit, onDuplicate, onDelete, onToggleStatus }) {
  const agent = AGENT_TYPES[agentType];
  if (!agent) return null;

  const agentPrompts = prompts.filter(p => p.agent_type === agentType);
  
  return (
    <div className="mb-8">
      {/* Header de section */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{agent.icon}</span>
        <h2 className="text-lg font-semibold text-slate-900">{agent.label.toUpperCase()}</h2>
        <span className="text-sm text-slate-500">({agentPrompts.length} prompt{agentPrompts.length > 1 ? 's' : ''})</span>
      </div>

      {/* Liste des prompts */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {agentPrompts.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            Aucun prompt configuré pour cet agent
          </div>
        ) : (
          agentPrompts.map((prompt) => (
            <PromptRow
              key={prompt.id}
              prompt={prompt}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onToggleStatus={onToggleStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

function Prompts({ embedded = false }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success, error: showError } = useToast();

  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    prompt: null,
    loading: false,
  });

  const hasAccess = canAccessPrompts(profile);

  useEffect(() => {
    if (hasAccess) {
      loadData();
    }
  }, [hasAccess]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await promptsService.getPrompts();
      if (fetchError) throw fetchError;
      setPrompts(data || []);
    } catch (err) {
      console.error('Error loading prompts:', err);
      setError(PROMPT_MESSAGES.loadError);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (prompt) => {
    navigate(`/admin/prompts/${prompt.id}`);
  };

  const handleDuplicate = async (prompt) => {
    try {
      const { data, error: dupError } = await promptsService.duplicatePrompt(prompt.id);
      if (dupError) throw dupError;
      setPrompts((prev) => [...prev, data]);
      success(PROMPT_MESSAGES.duplicated);
      navigate(`/admin/prompts/${data.id}`);
    } catch (err) {
      console.error('Error duplicating prompt:', err);
      showError(PROMPT_MESSAGES.duplicateError);
    }
  };

  const handleDeleteClick = (prompt) => {
    if (isDefaultPrompt(prompt)) {
      showError(PROMPT_MESSAGES.cannotDeleteDefault);
      return;
    }
    setDeleteModal({ isOpen: true, prompt, loading: false });
  };

  const confirmDelete = async () => {
    if (!deleteModal.prompt) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));

    try {
      const { error: delError } = await promptsService.deletePrompt(deleteModal.prompt.id);
      if (delError) throw delError;
      setPrompts((prev) => prev.filter((p) => p.id !== deleteModal.prompt.id));
      success(PROMPT_MESSAGES.deleted);
      setDeleteModal({ isOpen: false, prompt: null, loading: false });
    } catch (err) {
      console.error('Error deleting prompt:', err);
      showError(PROMPT_MESSAGES.deleteError);
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleToggleStatus = async (prompt, newStatus) => {
    try {
      const { data, error: toggleError } = await promptsService.togglePromptStatus(prompt.id, newStatus);
      if (toggleError) throw toggleError;
      setPrompts((prev) => prev.map((p) => (p.id === prompt.id ? data : p)));
      success(newStatus ? PROMPT_MESSAGES.activated : PROMPT_MESSAGES.deactivated);
    } catch (err) {
      console.error('Error toggling status:', err);
      showError(PROMPT_MESSAGES.toggleError);
    }
  };

  // Accès refusé
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Accès refusé</h2>
            <p className="text-slate-600 mb-6">
              Vous n'avez pas les droits pour gérer les prompts.
            </p>
            <Button variant="primary" onClick={() => navigate('/admin')}>
              Retour à l'administration
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mode embedded (dans Admin.jsx)
  if (embedded) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Gestion des Prompts</h2>
            <p className="text-sm text-slate-500 mt-1">
              Configurez les prompts système pour chaque type d'agent
            </p>
          </div>
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => navigate('/admin/prompts/new')}
          >
            Nouveau prompt
          </Button>
        </div>

        {/* Info hiérarchie */}
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-indigo-700">
              <p className="font-medium mb-1">Hiérarchie des prompts</p>
              <p>{HIERARCHY_EXPLANATION}</p>
            </div>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={loadData} className="ml-auto text-sm font-medium hover:underline">
              Réessayer
            </button>
          </div>
        )}

        {/* Contenu */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-slate-500">Chargement des prompts...</span>
          </div>
        ) : (
          AGENT_TYPES_SORTED.map((agent) => (
            <AgentSection
              key={agent.id}
              agentType={agent.id}
              prompts={prompts}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDeleteClick}
              onToggleStatus={handleToggleStatus}
            />
          ))
        )}

        {/* Modal suppression */}
        <ConfirmModal
          isOpen={deleteModal.isOpen}
          onClose={() => setDeleteModal({ isOpen: false, prompt: null, loading: false })}
          onConfirm={confirmDelete}
          title="Supprimer le prompt"
          message={PROMPT_MESSAGES.deleteConfirm}
          confirmText="Supprimer"
          variant="danger"
          loading={deleteModal.loading}
        />
      </div>
    );
  }

  // Page complète (standalone)
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-slate-800">Gestion des Prompts</h1>
                <p className="text-sm text-slate-500">Configuration des prompts système</p>
              </div>
            </div>

            <Button
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/admin/prompts/new')}
            >
              Nouveau prompt
            </Button>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info hiérarchie */}
        <div className="mb-8 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-indigo-700">
              <p className="font-medium mb-1">Hiérarchie des prompts</p>
              <p>{HIERARCHY_EXPLANATION}</p>
            </div>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={loadData} className="ml-auto text-sm font-medium hover:underline">
              Réessayer
            </button>
          </div>
        )}

        {/* Sections par agent */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-slate-500">Chargement des prompts...</span>
          </div>
        ) : (
          AGENT_TYPES_SORTED.map((agent) => (
            <AgentSection
              key={agent.id}
              agentType={agent.id}
              prompts={prompts}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDeleteClick}
              onToggleStatus={handleToggleStatus}
            />
          ))
        )}
      </main>

      {/* Modal suppression */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, prompt: null, loading: false })}
        onConfirm={confirmDelete}
        title="Supprimer le prompt"
        message={PROMPT_MESSAGES.deleteConfirm}
        confirmText="Supprimer"
        variant="danger"
        loading={deleteModal.loading}
      />
    </div>
  );
}

export default Prompts;
