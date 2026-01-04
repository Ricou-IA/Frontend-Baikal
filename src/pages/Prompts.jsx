/**
 * Prompts.jsx - Baikal Console
 * ============================================================================
 * Page de gestion des prompts système.
 * Affichage par sections (type d'agent) avec lignes full width.
 * 
 * MODIFICATIONS 04/01/2026:
 * - Titre uniforme style Dashboard (icône + PROMPTS + sous-titre)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Info, AlertCircle, Edit, Copy, Trash2, Lock, ArrowLeft, MessageSquareCode } from 'lucide-react';
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
        ${enabled ? 'bg-baikal-cyan' : 'bg-baikal-border'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
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
    <div className="flex items-center py-3 px-4 hover:bg-baikal-bg border-b border-baikal-border last:border-b-0">
      {/* Icône cadenas ou espace réservé */}
      <div className="w-6 flex-shrink-0">
        {isDefault ? (
          <Lock className="w-4 h-4 text-baikal-text" />
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}
      </div>

      {/* Nom et description */}
      <div className="flex-1 min-w-0 pr-4">
        <button
          onClick={() => onEdit(prompt)}
          className="font-medium text-white hover:text-baikal-cyan truncate block text-left font-mono"
        >
          {prompt.name}
        </button>
        {prompt.description && (
          <p className="text-sm text-baikal-text truncate font-sans">{prompt.description}</p>
        )}
      </div>

      {/* Scope */}
      <div className="hidden sm:flex w-40 justify-center px-2">
        <ScopeBadge prompt={prompt} />
      </div>

      {/* Usage count */}
      <div className="hidden md:block w-28 text-sm text-baikal-text text-right px-2 font-mono">
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
          className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
          title="Modifier"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDuplicate(prompt)}
          className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
          title="Dupliquer"
        >
          <Copy className="w-4 h-4" />
        </button>
        {!isDefault ? (
          <button
            onClick={() => onDelete(prompt)}
            className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
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
        <h2 className="text-lg font-mono font-semibold text-white">{agent.label.toUpperCase()}</h2>
        <span className="text-sm text-baikal-text font-mono">({agentPrompts.length} prompt{agentPrompts.length > 1 ? 's' : ''})</span>
      </div>

      {/* Liste des prompts */}
      <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
        {agentPrompts.length === 0 ? (
          <div className="py-8 text-center text-baikal-text font-sans">
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
      <div className="min-h-screen bg-baikal-bg flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-mono font-semibold text-white mb-2">ACCÈS_REFUSÉ</h2>
            <p className="text-baikal-text mb-6 font-sans">
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
        {/* ⭐ Header uniforme style Dashboard */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
              <MessageSquareCode className="w-5 h-5 text-baikal-cyan" />
              PROMPTS
            </h2>
            <p className="text-baikal-text text-sm mt-1 font-sans">
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
        <div className="p-4 bg-baikal-cyan/10 border border-baikal-cyan/50 rounded-md">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-baikal-cyan flex-shrink-0 mt-0.5" />
            <div className="text-sm text-baikal-text">
              <p className="font-medium mb-1 font-mono">HIÉRARCHIE_DES_PROMPTS</p>
              <p className="font-sans">{HIERARCHY_EXPLANATION}</p>
            </div>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="font-mono">{error}</p>
            <button onClick={loadData} className="ml-auto text-sm font-medium hover:underline font-mono">
              Réessayer
            </button>
          </div>
        )}

        {/* Contenu */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-baikal-text font-mono">CHARGEMENT_DES_PROMPTS...</span>
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
    <div className="min-h-screen bg-baikal-bg">
      {/* Header */}
      <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-mono font-semibold text-white flex items-center gap-2">
                  <MessageSquareCode className="w-5 h-5 text-baikal-cyan" />
                  PROMPTS
                </h1>
                <p className="text-sm text-baikal-text font-sans">Configuration des prompts système</p>
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
        <div className="mb-8 p-4 bg-baikal-cyan/10 border border-baikal-cyan/50 rounded-md">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-baikal-cyan flex-shrink-0 mt-0.5" />
            <div className="text-sm text-baikal-text">
              <p className="font-medium mb-1 font-mono">HIÉRARCHIE_DES_PROMPTS</p>
              <p className="font-sans">{HIERARCHY_EXPLANATION}</p>
            </div>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="font-mono">{error}</p>
            <button onClick={loadData} className="ml-auto text-sm font-medium hover:underline font-mono">
              Réessayer
            </button>
          </div>
        )}

        {/* Sections par agent */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
            <span className="ml-3 text-baikal-text font-mono">CHARGEMENT_DES_PROMPTS...</span>
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
