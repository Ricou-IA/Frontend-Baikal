/**
 * RAG Service - Core RAG Engine
 * ============================================================================
 * Service centralisé pour les opérations RAG (Retrieval Augmented Generation).
 * Gère les appels à l'API RAG Brain et l'historique des conversations.
 * 
 * @example
 * import { ragService } from '@/services';
 * 
 * const { response, sources, error } = await ragService.sendMessage('Ma question', 'audit');
 * ============================================================================
 */

import { supabase } from '../lib/supabaseClient';

// Configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const DEFAULT_MATCH_THRESHOLD = 0.5;
const DEFAULT_MATCH_COUNT = 5;

/**
 * Service RAG
 */
export const ragService = {
  /**
   * Envoie un message au RAG Brain et obtient une réponse
   * @param {string} query - Question de l'utilisateur
   * @param {string} verticalId - ID de la verticale (audit, btp, juridique, rh)
   * @param {Object} options - Options supplémentaires
   * @param {number} options.matchThreshold - Seuil de similarité (0-1)
   * @param {number} options.matchCount - Nombre de documents à récupérer
   * @param {string} options.conversationId - ID de conversation pour le contexte
   * @returns {Promise<{response: string, sources: Array, error: Error|null}>}
   */
  async sendMessage(query, verticalId = 'audit', options = {}) {
    const {
      matchThreshold = DEFAULT_MATCH_THRESHOLD,
      matchCount = DEFAULT_MATCH_COUNT,
      conversationId = null,
    } = options;

    try {
      // Récupère la session pour l'authentification
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Non authentifié. Veuillez vous connecter.');
      }

      // Appel à la fonction Edge RAG Brain
      const response = await fetch(`${SUPABASE_URL}/functions/v1/rag-brain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          query,
          vertical_id: verticalId,
          match_threshold: matchThreshold,
          match_count: matchCount,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        response: data.response || data.answer || '',
        sources: data.sources || [],
        conversationId: data.conversation_id || conversationId,
        error: null,
      };
    } catch (error) {
      return {
        response: null,
        sources: [],
        conversationId: null,
        error,
      };
    }
  },

  /**
   * Recherche des documents similaires (sans génération de réponse)
   * @param {string} query - Requête de recherche
   * @param {string} verticalId - ID de la verticale
   * @param {Object} options - Options de recherche
   * @returns {Promise<{documents: Array, error: Error|null}>}
   */
  async searchDocuments(query, verticalId = null, options = {}) {
    const {
      matchThreshold = DEFAULT_MATCH_THRESHOLD,
      matchCount = DEFAULT_MATCH_COUNT,
    } = options;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Non authentifié');
      }

      // Utilise la fonction RPC match_documents si disponible
      const { data, error } = await supabase.rpc('match_documents', {
        query_text: query,
        match_threshold: matchThreshold,
        match_count: matchCount,
        filter_vertical: verticalId,
      });

      if (error) throw error;

      return { documents: data || [], error: null };
    } catch (error) {
      return { documents: [], error };
    }
  },

  /**
   * Récupère l'historique des conversations d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @param {Object} options - Options de filtrage
   * @param {number} options.limit - Nombre de conversations
   * @param {string} options.verticalId - Filtrer par verticale
   * @returns {Promise<{conversations: Array, error: Error|null}>}
   */
  async getConversationHistory(userId, options = {}) {
    const { limit = 50, verticalId = null } = options;

    try {
      let query = supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (verticalId) {
        query = query.eq('vertical_id', verticalId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return { conversations: data || [], error: null };
    } catch (error) {
      return { conversations: [], error };
    }
  },

  /**
   * Récupère les messages d'une conversation
   * @param {string} conversationId - ID de la conversation
   * @returns {Promise<{messages: Array, error: Error|null}>}
   */
  async getConversationMessages(conversationId) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return { messages: data || [], error: null };
    } catch (error) {
      return { messages: [], error };
    }
  },

  /**
   * Crée une nouvelle conversation
   * @param {string} userId - ID de l'utilisateur
   * @param {string} verticalId - ID de la verticale
   * @param {string} title - Titre de la conversation
   * @returns {Promise<{conversation: Object|null, error: Error|null}>}
   */
  async createConversation(userId, verticalId, title = 'Nouvelle conversation') {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: userId,
          vertical_id: verticalId,
          title,
        })
        .select()
        .single();

      if (error) throw error;
      return { conversation: data, error: null };
    } catch (error) {
      return { conversation: null, error };
    }
  },

  /**
   * Supprime une conversation
   * @param {string} conversationId - ID de la conversation
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async deleteConversation(conversationId) {
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error };
    }
  },

  /**
   * Récupère les verticales disponibles
   * @returns {Promise<{verticals: Array, error: Error|null}>}
   */
  async getVerticals() {
    try {
      const { data, error } = await supabase
        .from('verticals')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return { verticals: data || [], error: null };
    } catch (error) {
      return { verticals: [], error };
    }
  },

  /**
   * Récupère les statistiques RAG pour un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<{stats: Object|null, error: Error|null}>}
   */
  async getUserStats(userId) {
    try {
      // Compte les conversations
      const { count: conversationCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Compte les messages
      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      return {
        stats: {
          conversations: conversationCount || 0,
          messages: messageCount || 0,
        },
        error: null,
      };
    } catch (error) {
      return { stats: null, error };
    }
  },
};

export default ragService;
