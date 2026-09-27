/**
 * modulesSite.service.js - Baikal Console
 * ============================================================================
 * Accès à l'Edge Function admin-modules : catalogue des modules d'un site,
 * état effectif par organisation, ouverture / fermeture — relayés au canal
 * d'administration du site (config.apps.env_admin_fn).
 *
 * Une erreur porte `canal` quand c'est le SITE qui a refusé :
 * { statut_site, code, detail } tels qu'il les a renvoyés (400 unknown_module,
 * 404 org_not_found, 401 unauthorized…). Jamais de succès supposé : sans
 * réponse 200 du site, l'appelant reçoit une erreur.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function texteErreur(json, status) {
  const canal = json?.canal;
  if (canal && (canal.statut_site || canal.code)) {
    const detail = canal.detail == null
      ? ''
      : ` (${Array.isArray(canal.detail) ? canal.detail.join(', ') : String(canal.detail)})`;
    return `Le site a refusé — HTTP ${canal.statut_site ?? '?'} ${canal.code ?? ''}${detail}`.trim();
  }
  return json?.error || `HTTP ${status}`;
}

async function appeler(corps) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Session expirée') };
    const response = await fetch(`${supabaseUrl}/functions/v1/admin-modules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corps),
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok || !json || json.error) {
      const erreur = new Error(texteErreur(json, response.status));
      erreur.canal = json?.canal ?? null;
      return { data: null, error: erreur };
    }
    return { data: json.data, error: null };
  } catch (error) {
    console.error('[admin-modules]', error);
    return { data: null, error };
  }
}

export const modulesSiteService = {
  getCatalogue(appId) {
    return appeler({ action: 'catalogue', appId });
  },
  getOrganisations(appId) {
    return appeler({ action: 'organisations', appId });
  },
  // `modules` : seulement les clés modifiées, { [key]: boolean }.
  enregistrer(appId, orgId, modules) {
    return appeler({ action: 'modules', appId, org_id: orgId, modules });
  },
};
