/**
 * Configuration Prompts - Core RAG Engine
 * ============================================================================
 * Constantes et configuration pour la gestion des prompts d'agents RAG.
 * ============================================================================
 */

// ============================================
// ACCÈS ET PERMISSIONS
// ============================================

export const PROMPTS_ACCESS = Object.freeze({
  requiredRole: 'super_admin',
});

export const canAccessPrompts = (profile) => {
  if (!profile?.app_role) return false;
  const { requiredRole } = PROMPTS_ACCESS;
  const roleHierarchy = { 'super_admin': 3, 'org_admin': 2, 'user': 1 };
  const userLevel = roleHierarchy[profile.app_role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 999;
  return userLevel >= requiredLevel;
};

// ============================================
// TYPES D'AGENTS
// ============================================

export const AGENT_TYPES = Object.freeze({
  router: {
    id: 'router',
    label: 'Routeur',
    description: 'Agent de routage sémantique des requêtes',
    icon: '🔀',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    borderColor: 'border-green-300',
    order: 1,
  },
  librarian: {
    id: 'librarian',
    label: 'Bibliothécaire',
    description: 'Agent de recherche documentaire RAG',
    icon: '📚',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-300',
    order: 2,
  },
  analyst: {
    id: 'analyst',
    label: 'Analyste',
    description: 'Agent d\'analyse de données et calculs',
    icon: '📊',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-300',
    order: 3,
  },
});

export const AGENT_TYPE_OPTIONS = Object.values(AGENT_TYPES)
  .sort((a, b) => a.order - b.order)
  .map(agent => ({ value: agent.id, label: agent.label }));

export const AGENT_TYPES_SORTED = Object.values(AGENT_TYPES)
  .sort((a, b) => a.order - b.order);

// ============================================
// MODÈLES LLM
// ============================================

export const LLM_MODELS = Object.freeze({
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini (rapide, recommandé)',
    maxOutputTokens: 16384,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    label: 'GPT-4o (documents complexes)',
    maxOutputTokens: 16384,
  },
});

export const LLM_MODEL_OPTIONS = Object.values(LLM_MODELS).map(model => ({
  value: model.id,
  label: model.label,
}));

export const getMaxTokensLimit = (modelId) => {
  return LLM_MODELS[modelId]?.maxOutputTokens || 16384;
};

// ============================================
// PARAMÈTRES PAR DÉFAUT
// ============================================

export const DEFAULT_PARAMETERS = Object.freeze({
  temperature: 0.3,
  max_tokens: 2048,
  model: 'gpt-4o-mini',
  vector_weight: 0.7,
  fulltext_weight: 0.3,
});

export const PARAMETER_LIMITS = Object.freeze({
  temperature: { min: 0, max: 1, step: 0.05, default: 0.3, label: 'Température', description: 'Créativité du modèle (0 = déterministe, 1 = créatif)' },
  max_tokens: { min: 256, max: 16384, step: 256, default: 2048, label: 'Tokens maximum', description: 'Longueur maximale de la réponse' },
  vector_weight: { min: 0, max: 1, step: 0.05, default: 0.7, label: 'Poids vectoriel', description: 'Importance de la recherche sémantique' },
});

// ============================================
// PROMPT SYSTÈME
// ============================================

export const PROMPT_CONFIG = Object.freeze({
  idealLength: 2500,
  maxLength: 50000,
  minLength: 10,
});

export const getPromptLengthStatus = (length) => {
  if (length < PROMPT_CONFIG.minLength) {
    return { status: 'error', message: `Minimum ${PROMPT_CONFIG.minLength} caractères requis` };
  }
  if (length <= PROMPT_CONFIG.idealLength) {
    return { status: 'ideal', message: 'Taille idéale' };
  }
  return { status: 'warning', message: `Au-delà de la taille recommandée (${PROMPT_CONFIG.idealLength.toLocaleString()})` };
};

// ============================================
// SCOPE / HIÉRARCHIE
// ============================================

export const PROMPT_SCOPES = Object.freeze({
  global: { id: 'global', label: 'Global', icon: '🌐', bgColor: 'bg-slate-100', textColor: 'text-slate-700' },
  vertical: { id: 'vertical', label: 'Verticale', icon: '📐', bgColor: 'bg-indigo-100', textColor: 'text-indigo-700' },
  organization: { id: 'organization', label: 'Organisation', icon: '🏢', bgColor: 'bg-purple-100', textColor: 'text-purple-700' },
});

export const getPromptScope = (prompt) => {
  if (prompt.org_id) return PROMPT_SCOPES.organization;
  if (prompt.vertical_id) return PROMPT_SCOPES.vertical;
  return PROMPT_SCOPES.global;
};

export const isDefaultPrompt = (prompt) => {
  return !prompt.vertical_id && !prompt.org_id;
};

export const HIERARCHY_EXPLANATION = 'Hiérarchie des prompts : Organisation > Verticale > Global. Le prompt le plus spécifique est utilisé en priorité.';

// ============================================
// VALIDATION
// ============================================

export const validatePrompt = (prompt) => {
  const errors = {};
  if (!prompt.name || prompt.name.trim().length < 3) {
    errors.name = 'Le nom doit contenir au moins 3 caractères';
  }
  if (!prompt.agent_type || !AGENT_TYPES[prompt.agent_type]) {
    errors.agent_type = 'Le type d\'agent est obligatoire';
  }
  if (!prompt.system_prompt || prompt.system_prompt.trim().length < 10) {
    errors.system_prompt = 'Le prompt doit contenir au moins 10 caractères';
  }
  return { isValid: Object.keys(errors).length === 0, errors };
};

// ============================================
// MESSAGES UI
// ============================================

export const PROMPT_MESSAGES = Object.freeze({
  created: 'Prompt créé avec succès',
  updated: 'Prompt mis à jour avec succès',
  deleted: 'Prompt supprimé avec succès',
  duplicated: 'Prompt dupliqué avec succès',
  activated: 'Prompt activé',
  deactivated: 'Prompt désactivé',
  createError: 'Erreur lors de la création du prompt',
  updateError: 'Erreur lors de la mise à jour du prompt',
  deleteError: 'Erreur lors de la suppression du prompt',
  loadError: 'Erreur lors du chargement des prompts',
  duplicateError: 'Un prompt existe déjà pour cette combinaison agent/verticale/organisation',
  cannotDeleteDefault: 'Le prompt par défaut ne peut pas être supprimé',
  deleteConfirm: 'Êtes-vous sûr de vouloir supprimer ce prompt ?',
});
