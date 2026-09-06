/**
 * rapport.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-rapport : preparation des faits d'une periode,
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
  preparer(appId, { debut, fin }) {
    return appelerEdge({ action: 'preparer', appId, debut, fin });
  },
  rediger(appId, { debut, fin }, ebauche, highlights) {
    return appelerEdge({ action: 'rediger', appId, debut, fin, ebauche, highlights });
  },
  enregistrer(appId, { debut, fin }, { contenu, ebauche, evolutions, lectureSeo, commentaire, pdfBase64 }) {
    return appelerEdge({
      action: 'enregistrer', appId, debut, fin, contenu, ebauche, evolutions, lecture_seo: lectureSeo, commentaire, pdf_base64: pdfBase64,
    });
  },
  liste(appId) {
    return appelerEdge({ action: 'liste', appId });
  },
  chantiers(appId) {
    return appelerEdge({ action: 'chantiers', appId });
  },
  creerChantier(appId, chantier) {
    return appelerEdge({ action: 'chantier-creer', appId, ...chantier });
  },
  modifierChantier(id, patch) {
    return appelerEdge({ action: 'chantier-modifier', id, ...patch });
  },
  supprimerChantier(id) {
    return appelerEdge({ action: 'chantier-supprimer', id });
  },
};
