/**
 * prospects.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-prospects : la base adressable du site
 * selectionne, lue en direct dans sa vue contractuelle baikal_prospects
 * (spec 2026-08-27). Baikal ne stocke aucun prospect.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function appelerEdge(corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-prospects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corps),
    });
    const json = await response.json();
    if (!response.ok || json.error) {
      return { data: null, error: new Error(json.error || `HTTP ${response.status}`) };
    }
    return { data: json.data, error: null };
  } catch (error) {
    console.error('[admin-prospects]', error);
    return { data: null, error };
  }
}

export const prospectsService = {
  getListe(appId, criteres = {}) {
    return appelerEdge({ action: 'liste', appId, ...criteres });
  },
  getFiche(appId, email) {
    return appelerEdge({ action: 'fiche', appId, email });
  },
  executerAction(appId, email, actionSite, params = {}) {
    return appelerEdge({ action: 'action', appId, email, actionSite, ...params });
  },
  importer(appId, lignes) {
    return appelerEdge({ action: 'importer', appId, lignes });
  },
};
