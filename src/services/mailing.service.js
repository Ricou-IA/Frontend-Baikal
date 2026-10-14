/**
 * mailing.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-mailing : campagnes du site selectionne
 * (spec 2026-10-13). Baikal garde la campagne ; le journal d'envoi vit chez
 * le site et est lu en direct.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function appelerEdge(corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-mailing`, {
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
    console.error('[admin-mailing]', error);
    return { data: null, error };
  }
}

export const mailingService = {
  etat: (appId) => appelerEdge({ action: 'etat', appId }),
  apercu: (appId, population, criteres) => appelerEdge({ action: 'apercu', appId, population, criteres }),
  entonnoir: (appId, criteres) => appelerEdge({ action: 'entonnoir', appId, criteres }),
  rediger: (appId, demande) => appelerEdge({ action: 'rediger', appId, ...demande }),
  stats: (appId, jours) => appelerEdge({ action: 'stats', appId, jours }),
  enregistrer: (appId, campagne) => appelerEdge({ action: 'enregistrer', appId, campagne }),
  rendu: (appId, contenu) => appelerEdge({ action: 'rendu', appId, ...contenu }),
  test: (appId, contenu, destinataire) => appelerEdge({ action: 'test', appId, ...contenu, destinataire }),
  lancer: (appId, campagneId) => appelerEdge({ action: 'lancer', appId, campagneId }),
  suspendre: (appId, campagneId) => appelerEdge({ action: 'suspendre', appId, campagneId }),
  supprimer: (appId, campagneId) => appelerEdge({ action: 'supprimer', appId, campagneId }),
  detail: (appId, campagneId, page = 1, statut = null) =>
    appelerEdge({ action: 'detail', appId, campagneId, page, statut }),
};

// Desinscription publique : pas de session, la securite est le jeton.
export async function desinscrire(params, confirmer) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/mailing-desinscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ ...params, confirmer }),
    });
    const json = await response.json();
    if (!response.ok || json.error) return { data: null, error: new Error(json.error || `HTTP ${response.status}`) };
    return { data: json, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
