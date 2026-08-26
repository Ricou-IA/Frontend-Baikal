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

export const seoService = {
  getOverview(appId, days = 28) {
    return appelerEdge('admin-seo', { action: 'overview', appId, days });
  },
  getCompare(appId, days = 28) {
    return appelerEdge('admin-seo', { action: 'compare', appId, days });
  },
  getBingVsGoogle(appId) {
    return appelerEdge('admin-seo', { action: 'bing-vs-google', appId });
  },
  getSerie(appId, mois = 16) {
    return appelerEdge('admin-seo', { action: 'serie', appId, mois });
  },
  getSerieRequete(appId, requete, mois = 16) {
    return appelerEdge('admin-seo', { action: 'serie-requete', appId, requete, mois });
  },
  getAllSites(days = 28) {
    return appelerEdge('admin-seo', { action: 'all-sites', days });
  },
};

export { appelerEdge };
