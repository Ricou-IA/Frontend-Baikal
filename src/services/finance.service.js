/**
 * finance.service.js - Baikal Console
 * ============================================================================
 * Acces a l'Edge Function admin-finance. La page ne lit que l'archive :
 * aucun appel Stripe depuis le navigateur.
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

export const financeService = {
  getSynthese(appId) {
    return appelerEdge('admin-finance', { action: 'synthese', appId });
  },
  getSerie(appId, mois = 12) {
    return appelerEdge('admin-finance', { action: 'serie', appId, mois });
  },
  getVentes(appId, debut, fin) {
    return appelerEdge('admin-finance', { action: 'ventes', appId, debut, fin });
  },
  getCharges(appId) {
    return appelerEdge('admin-finance', { action: 'charges', appId });
  },
  creerCharge(appId, charge) {
    return appelerEdge('admin-finance', { action: 'charge-creer', appId, ...charge });
  },
  supprimerCharge(id) {
    return appelerEdge('admin-finance', { action: 'charge-supprimer', id });
  },
};

export { appelerEdge };
