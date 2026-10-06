/**
 * edge.js - Baikal Console
 * ============================================================================
 * Appel d'une Edge Function Baikal avec la session de la personne connectee,
 * et lecture du motif renvoye par le SITE quand un relais est refuse.
 * Partage par les services qui relaient des actions a un site (dossiers,
 * comptes) : un seul endroit decide comment une erreur de relais se lit.
 * ============================================================================
 */
import { supabase } from '../lib/supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Quand le relais vers l'EF d'un site est refuse, admin-dossiers joint la
// reponse REELLE du site sous `detail` ({statut_site, corps}). C'est la que
// vit le motif metier -- "credits insuffisants", "dossier verrouille" -- que
// la spec 7 exige de montrer : sans lui, l'utilisateur ne lit qu'un
// "Site x: HTTP 403" qui ne lui apprend rien.
export function motifDuSite(detail) {
  const corps = detail && typeof detail === 'object' ? detail.corps : null;
  if (typeof corps === 'string') return corps.trim();
  if (!corps || typeof corps !== 'object') return '';
  // Les noms courants d'un motif d'erreur, plus `brut` : le repli que pose
  // l'Edge Function quand la reponse du site n'etait pas du JSON.
  const motif = corps.error ?? corps.message ?? corps.erreur ?? corps.brut;
  if (typeof motif !== 'string') return '';
  // `brut` est le repli de l'EF quand la reponse du site n'etait pas du JSON :
  // il peut porter 500 caracteres de HTML. Le message doit rester lisible.
  const propre = motif.trim();
  return propre.length > 200 ? `${propre.slice(0, 200)}…` : propre;
}

export async function appelerEdge(fonction, corps) {
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
      // Le message principal reste en tete, le motif du site le complete --
      // et seulement s'il apporte autre chose, pour ne pas ecrire deux fois
      // la meme phrase.
      const principal = json.error || `HTTP ${response.status}`;
      const motif = motifDuSite(json.detail);
      const texte = motif && !principal.includes(motif) ? `${principal} — ${motif}` : principal;
      return { data: null, error: new Error(texte) };
    }
    return { data: json.data, error: null };
  } catch (error) {
    console.error(`[${fonction}]`, error);
    return { data: null, error };
  }
}

