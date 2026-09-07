// Demandes d'accès à Baikal (EF baikal-demande).
// `deposer` est public : appelé depuis la landing sans session, avec la clé
// anon seule (verify_jwt off côté EF). `lister` et `setStatut` exigent une
// session super_admin, vérifiée dans l'EF.
import { appelerEdge } from './seo.service';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const demandesService = {
  async deposer(demande) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/baikal-demande`, {
        method: 'POST',
        headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deposer', ...demande }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.error) {
        return { data: null, error: new Error(json.error || `HTTP ${response.status}`) };
      }
      return { data: json.data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },
  lister() {
    return appelerEdge('baikal-demande', { action: 'lister' });
  },
  setStatut(id, statut) {
    return appelerEdge('baikal-demande', { action: 'statut', id, statut });
  },
};
