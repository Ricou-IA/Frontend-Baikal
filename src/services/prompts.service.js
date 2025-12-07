/**
 * Prompts Service - Core RAG Engine
 * ============================================================================
 * Service pour la gestion des prompts d'agents RAG dans Supabase.
 * Fournit les opérations CRUD et les requêtes associées.
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';
import { DEFAULT_PARAMETERS } from '../config/prompts';

// ============================================
// PROMPTS CRUD
// ============================================

/**
 * Récupère tous les prompts avec les informations liées
 * @param {Object} filters - Filtres optionnels
 * @param {string} filters.agent_type - Filtrer par type d'agent
 * @param {string} filters.vertical_id - Filtrer par verticale
 * @param {boolean} filters.is_active - Filtrer par statut actif
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export const getPrompts = async (filters = {}) => {
  try {
    let query = supabase
      .from('agent_prompts')
      .select(`
        *,
        organizations:org_id (
          id,
          name
        ),
        verticals:vertical_id (
          id,
          name
        )
      `)
      .order('agent_type', { ascending: true })
      .order('vertical_id', { ascending: true, nullsFirst: true })
      .order('org_id', { ascending: true, nullsFirst: true });

    // Appliquer les filtres
    if (filters.agent_type) {
      query = query.eq('agent_type', filters.agent_type);
    }
    if (filters.vertical_id) {
      query = query.eq('vertical_id', filters.vertical_id);
    }
    if (typeof filters.is_active === 'boolean') {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return { data: null, error };
  }
};

/**
 * Récupère un prompt par son ID
 * @param {string} id - UUID du prompt
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export const getPromptById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('agent_prompts')
      .select(`
        *,
        organizations:org_id (
          id,
          name
        ),
        verticals:vertical_id (
          id,
          name
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching prompt:', error);
    return { data: null, error };
  }
};

/**
 * Crée un nouveau prompt
 * @param {Object} promptData - Données du prompt
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export const createPrompt = async (promptData) => {
  try {
    // Fusionner les paramètres avec les défauts
    const parameters = {
      ...DEFAULT_PARAMETERS,
      ...promptData.parameters,
    };

    const { data, error } = await supabase
      .from('agent_prompts')
      .insert({
        name: promptData.name,
        description: promptData.description || null,
        agent_type: promptData.agent_type,
        vertical_id: promptData.vertical_id || null,
        org_id: promptData.org_id || null,
        system_prompt: promptData.system_prompt,
        parameters,
        is_active: promptData.is_active ?? true,
      })
      .select(`
        *,
        organizations:org_id (
          id,
          name
        ),
        verticals:vertical_id (
          id,
          name
        )
      `)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error creating prompt:', error);
    return { data: null, error };
  }
};

/**
 * Met à jour un prompt existant
 * @param {string} id - UUID du prompt
 * @param {Object} promptData - Données à mettre à jour
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export const updatePrompt = async (id, promptData) => {
  try {
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    // Ajouter uniquement les champs fournis
    if (promptData.name !== undefined) updateData.name = promptData.name;
    if (promptData.description !== undefined) updateData.description = promptData.description;
    if (promptData.agent_type !== undefined) updateData.agent_type = promptData.agent_type;
    if (promptData.vertical_id !== undefined) updateData.vertical_id = promptData.vertical_id || null;
    if (promptData.org_id !== undefined) updateData.org_id = promptData.org_id || null;
    if (promptData.system_prompt !== undefined) updateData.system_prompt = promptData.system_prompt;
    if (promptData.parameters !== undefined) updateData.parameters = promptData.parameters;
    if (promptData.is_active !== undefined) updateData.is_active = promptData.is_active;

    const { data, error } = await supabase
      .from('agent_prompts')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        organizations:org_id (
          id,
          name
        ),
        verticals:vertical_id (
          id,
          name
        )
      `)
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error updating prompt:', error);
    return { data: null, error };
  }
};

/**
 * Supprime un prompt
 * @param {string} id - UUID du prompt
 * @returns {Promise<{error: Error|null}>}
 */
export const deletePrompt = async (id) => {
  try {
    const { error } = await supabase
      .from('agent_prompts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return { error };
  }
};

/**
 * Duplique un prompt existant
 * @param {string} id - UUID du prompt à dupliquer
 * @param {Object} overrides - Données à modifier (optionnel)
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export const duplicatePrompt = async (id, overrides = {}) => {
  try {
    // Récupérer le prompt original
    const { data: original, error: fetchError } = await getPromptById(id);
    if (fetchError) throw fetchError;

    // Créer la copie
    const newPromptData = {
      name: overrides.name || `${original.name} (copie)`,
      description: overrides.description ?? original.description,
      agent_type: overrides.agent_type || original.agent_type,
      vertical_id: overrides.vertical_id ?? original.vertical_id,
      org_id: overrides.org_id ?? original.org_id,
      system_prompt: overrides.system_prompt || original.system_prompt,
      parameters: overrides.parameters || original.parameters,
      is_active: overrides.is_active ?? false, // Désactivé par défaut
    };

    return await createPrompt(newPromptData);
  } catch (error) {
    console.error('Error duplicating prompt:', error);
    return { data: null, error };
  }
};

/**
 * Active ou désactive un prompt
 * @param {string} id - UUID du prompt
 * @param {boolean} isActive - Nouveau statut
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export const togglePromptStatus = async (id, isActive) => {
  return await updatePrompt(id, { is_active: isActive });
};

// ============================================
// VERTICALES
// ============================================

/**
 * Récupère toutes les verticales actives
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export const getVerticals = async () => {
  try {
    const { data, error } = await supabase
      .from('verticals')
      .select('id, name, description, icon, color')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching verticals:', error);
    return { data: null, error };
  }
};

// ============================================
// ORGANISATIONS
// ============================================

/**
 * Récupère les organisations, optionnellement filtrées par verticale
 * @param {string} verticalId - ID de la verticale (optionnel)
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export const getOrganizations = async (verticalId = null) => {
  try {
    let query = supabase
      .from('organizations')
      .select('id, name, vertical_id, plan')
      .order('name', { ascending: true });

    if (verticalId) {
      query = query.eq('vertical_id', verticalId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return { data: null, error };
  }
};

// ============================================
// VÉRIFICATIONS
// ============================================

/**
 * Vérifie si un prompt existe déjà pour cette combinaison
 * @param {string} agentType - Type d'agent
 * @param {string|null} verticalId - ID de la verticale
 * @param {string|null} orgId - ID de l'organisation
 * @param {string|null} excludeId - ID à exclure (pour l'édition)
 * @returns {Promise<{exists: boolean, error: Error|null}>}
 */
export const checkPromptExists = async (agentType, verticalId, orgId, excludeId = null) => {
  try {
    let query = supabase
      .from('agent_prompts')
      .select('id')
      .eq('agent_type', agentType);

    // Gérer les NULL pour vertical_id
    if (verticalId) {
      query = query.eq('vertical_id', verticalId);
    } else {
      query = query.is('vertical_id', null);
    }

    // Gérer les NULL pour org_id
    if (orgId) {
      query = query.eq('org_id', orgId);
    } else {
      query = query.is('org_id', null);
    }

    // Exclure un ID (pour l'édition)
    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { exists: data && data.length > 0, error: null };
  } catch (error) {
    console.error('Error checking prompt existence:', error);
    return { exists: false, error };
  }
};

// ============================================
// EXPORT PAR DÉFAUT
// ============================================

const promptsService = {
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  duplicatePrompt,
  togglePromptStatus,
  getVerticals,
  getOrganizations,
  checkPromptExists,
};

export default promptsService;
