/**
 * dossiers.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-dossiers : liste et fiche des dossiers
 * clients du site selectionne, lus en direct dans les vues contractuelles
 * baikal_dossiers du site (spec 2026-08-26). Aucune archive nominative
 * cote Baikal.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function appelerEdge(fonction, corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/${fonction}`, {
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
    console.error(`[${fonction}]`, error);
    return { data: null, error };
  }
}

export const dossiersService = {
  getListe(appId, criteres = {}) {
    return appelerEdge('admin-dossiers', { action: 'liste', appId, ...criteres });
  },
  getFiche(appId, dossierId) {
    return appelerEdge('admin-dossiers', { action: 'fiche', appId, dossierId });
  },
  getOnglet(appId, dossierId, onglet, page = 1, parPage = 50) {
    return appelerEdge('admin-dossiers', {
      action: 'onglet', appId, dossierId, onglet, page, parPage,
    });
  },
  getFichier(appId, dossierId, cible, id) {
    return appelerEdge('admin-dossiers', { action: 'fichier', appId, dossierId, cible, id });
  },
  executerActionSite(appId, dossierId, actionSite, parametres = {}) {
    return appelerEdge('admin-dossiers', {
      action: 'site-action', appId, dossierId, actionSite, parametres,
    });
  },
};
