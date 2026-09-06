/**
 * rapport.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-rapport : preparation des faits du mois,
 * redaction assistee, archivage du PDF fabrique dans le navigateur.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function appelerEdge(corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-rapport`, {
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
    console.error('[admin-rapport]', error);
    return { data: null, error };
  }
}

export const rapportService = {
  preparer(appId, mois) {
    return appelerEdge({ action: 'preparer', appId, mois });
  },
  rediger(appId, mois, ebauche, highlights) {
    return appelerEdge({ action: 'rediger', appId, mois, ebauche, highlights });
  },
  enregistrer(appId, mois, { contenu, ebauche, evolutions, commentaire, pdfBase64 }) {
    return appelerEdge({
      action: 'enregistrer', appId, mois, contenu, ebauche, evolutions, commentaire, pdf_base64: pdfBase64,
    });
  },
  liste(appId) {
    return appelerEdge({ action: 'liste', appId });
  },
};
