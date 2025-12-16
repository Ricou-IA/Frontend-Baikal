/**
 * Prompts Service - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - vertical → app
 * VERSION: 2.0.0 - Ajout gemini_system_prompt
 * 
 * MODIFICATIONS:
 * - agent_prompts → config.agent_prompts (schéma)
 * - vertical_id → app_id (colonne)
 * - verticals → config.apps (table + schéma)
 * - organizations → core.organizations (schéma)
 * - Jointures: verticals:vertical_id → apps:app_id
 * - NOUVEAU: gemini_system_prompt pour le mode PDF complet
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
 * @param {string} filters.app_id - Filtrer par app (ex: vertical_id)
 * @param {boolean} filters.is_active - Filtrer par statut actif
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export const getPrompts = async (filters = {}) => {
  try {
    // Requête principale sans jointures (les vues ne supportent pas les relations PostgREST)
    let query = supabase
      .from('agent_prompts')
      .select('*')
      .order('agent_type', { ascending: true })
      .order('app_id', { ascending: true, nullsFirst: true })
      .order('org_id', { ascending: true, nullsFirst: true });

    // Appliquer les filtres
    if (filters.agent_type) {
      query = query.eq('agent_type', filters.agent_type);
    }
    if (filters.app_id) {
      query = query.eq('app_id', filters.app_id);
    }
    if (filters.vertical_id) {
      console.warn('[prompts.service] filters.vertical_id is deprecated. Use filters.app_id instead.');
      query = query.eq('app_id', filters.vertical_id);
    }
    if (typeof filters.is_active === 'boolean') {
      query = query.eq('is_active', filters.is_active);
    }

    const { data: promptsData, error } = await query;
    if (error) throw error;

    // Récupérer les organizations et apps séparément
    const orgIds = [...new Set(promptsData?.filter(p => p.org_id).map(p => p.org_id) || [])];
    const appIds = [...new Set(promptsData?.filter(p => p.app_id).map(p => p.app_id) || [])];

    let orgsMap = {};
    let appsMap = {};

    if (orgIds.length > 0) {
      const { data: orgsData } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      if (orgsData) {
        orgsMap = orgsData.reduce((acc, org) => { acc[org.id] = org; return acc; }, {});
      }
    }

    if (appIds.length > 0) {
      const { data: appsData } = await supabase
        .from('apps')
        .select('id, name')
        .in('id', appIds);
      if (appsData) {
        appsMap = appsData.reduce((acc, app) => { acc[app.id] = app; return acc; }, {});
      }
    }

    // Fusionner les données
    const mappedData = (promptsData || []).map(item => ({
      ...item,
      organizations: item.org_id ? orgsMap[item.org_id] : null,
      apps: item.app_id ? appsMap[item.app_id] : null,
      // Alias pour compatibilité
      vertical_id: item.app_id,
      verticals: item.app_id ? appsMap[item.app_id] : null,
    }));

    return { data: mappedData, error: null };
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
    // Requête principale sans jointures (les vues ne supportent pas les relations PostgREST)
    const { data, error } = await supabase
      .from('agent_prompts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Récupérer organization et app séparément si nécessaire
    let organization = null;
    let app = null;

    if (data?.org_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', data.org_id)
        .single();
      organization = orgData;
    }

    if (data?.app_id) {
      const { data: appData } = await supabase
        .from('apps')
        .select('id, name')
        .eq('id', data.app_id)
        .single();
      app = appData;
    }

    // MIGRATION: Alias pour compatibilité
    const mappedData = data ? {
      ...data,
      organizations: organization,
      apps: app,
      vertical_id: data.app_id,
      verticals: app,
    } : null;

    return { data: mappedData, error: null };
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

    // MIGRATION: vertical_id → app_id
    const appId = promptData.app_id || promptData.vertical_id || null;
    const orgId = promptData.org_id || null;

    // Insert sans jointures (les vues ne supportent pas les relations PostgREST)
    const { data, error } = await supabase
      .from('agent_prompts')
      .insert({
        name: promptData.name,
        description: promptData.description || null,
        agent_type: promptData.agent_type,
        app_id: appId,
        org_id: orgId,
        system_prompt: promptData.system_prompt,
        gemini_system_prompt: promptData.gemini_system_prompt || null,  // NOUVEAU
        parameters,
        is_active: promptData.is_active ?? true,
      })
      .select('*')
      .single();

    if (error) throw error;

    // Récupérer organization et app séparément si nécessaire
    let organization = null;
    let app = null;

    if (orgId) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', orgId)
        .single();
      organization = orgData;
    }

    if (appId) {
      const { data: appData } = await supabase
        .from('apps')
        .select('id, name')
        .eq('id', appId)
        .single();
      app = appData;
    }

    // MIGRATION: Alias pour compatibilité
    const mappedData = data ? {
      ...data,
      organizations: organization,
      apps: app,
      vertical_id: data.app_id,
      verticals: app,
    } : null;

    return { data: mappedData, error: null };
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
    // MIGRATION: Support des deux noms de colonnes
    if (promptData.app_id !== undefined) updateData.app_id = promptData.app_id || null;
    if (promptData.vertical_id !== undefined) {
      console.warn('[prompts.service] vertical_id is deprecated. Use app_id instead.');
      updateData.app_id = promptData.vertical_id || null;
    }
    if (promptData.org_id !== undefined) updateData.org_id = promptData.org_id || null;
    if (promptData.system_prompt !== undefined) updateData.system_prompt = promptData.system_prompt;
    // NOUVEAU: gemini_system_prompt
    if (promptData.gemini_system_prompt !== undefined) updateData.gemini_system_prompt = promptData.gemini_system_prompt || null;
    if (promptData.parameters !== undefined) updateData.parameters = promptData.parameters;
    if (promptData.is_active !== undefined) updateData.is_active = promptData.is_active;

    // Update sans jointures (les vues ne supportent pas les relations PostgREST)
    const { data, error } = await supabase
      .from('agent_prompts')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    // Récupérer organization et app séparément si nécessaire
    let organization = null;
    let app = null;

    if (data?.org_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', data.org_id)
        .single();
      organization = orgData;
    }

    if (data?.app_id) {
      const { data: appData } = await supabase
        .from('apps')
        .select('id, name')
        .eq('id', data.app_id)
        .single();
      app = appData;
    }

    // MIGRATION: Alias pour compatibilité
    const mappedData = data ? {
      ...data,
      organizations: organization,
      apps: app,
      vertical_id: data.app_id,
      verticals: app,
    } : null;

    return { data: mappedData, error: null };
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
    // MIGRATION: config.agent_prompts
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
    // MIGRATION: vertical_id → app_id
    const newPromptData = {
      name: overrides.name || `${original.name} (copie)`,
      description: overrides.description ?? original.description,
      agent_type: overrides.agent_type || original.agent_type,
      app_id: overrides.app_id ?? overrides.vertical_id ?? original.app_id,
      org_id: overrides.org_id ?? original.org_id,
      system_prompt: overrides.system_prompt || original.system_prompt,
      gemini_system_prompt: overrides.gemini_system_prompt ?? original.gemini_system_prompt,  // NOUVEAU
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
// APPS (anciennement VERTICALES)
// ============================================

/**
 * Récupère toutes les apps actives
 * MIGRATION: verticals → config.apps
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export const getApps = async () => {
  try {
    // MIGRATION: verticals → config.apps
    const { data, error } = await supabase
      .from('apps')
      .select('id, name, description, icon, color')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error fetching apps:', error);
    return { data: null, error };
  }
};

/**
 * Alias pour compatibilité ascendante
 * @deprecated Utiliser getApps()
 */
export const getVerticals = async () => {
  console.warn('[prompts.service] getVerticals is deprecated. Use getApps instead.');
  return getApps();
};

// ============================================
// ORGANISATIONS
// ============================================

/**
 * Récupère les organisations, optionnellement filtrées par app
 * MIGRATION: organizations → core.organizations, vertical_id → app_id
 * @param {string} appId - ID de l'app (optionnel, ex: verticalId)
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export const getOrganizations = async (appId = null) => {
  try {
    // MIGRATION: organizations → core.organizations
    let query = supabase
      .from('organizations')
      .select('id, name, plan')
      .order('name', { ascending: true });

    // Note: La colonne vertical_id/app_id n'existe peut-être plus sur organizations
    // Si elle existe encore, décommenter ci-dessous:
    // if (appId) {
    //   query = query.eq('app_id', appId);
    // }

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
 * MIGRATION: vertical_id → app_id
 * @param {string} agentType - Type d'agent
 * @param {string|null} appId - ID de l'app (ex: verticalId)
 * @param {string|null} orgId - ID de l'organisation
 * @param {string|null} excludeId - ID à exclure (pour l'édition)
 * @returns {Promise<{exists: boolean, error: Error|null}>}
 */
export const checkPromptExists = async (agentType, appId, orgId, excludeId = null) => {
  try {
    // MIGRATION: config.agent_prompts, app_id
    let query = supabase
      .from('agent_prompts')
      .select('id')
      .eq('agent_type', agentType);

    // MIGRATION: vertical_id → app_id
    if (appId) {
      query = query.eq('app_id', appId);
    } else {
      query = query.is('app_id', null);
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
  // Nouveau nom
  getApps,
  // Alias deprecated
  getVerticals,
  // Organisations
  getOrganizations,
  checkPromptExists,
};

export default promptsService;
