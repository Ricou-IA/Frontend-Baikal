// Droits par site des admins delegues (table admin.droits_sites).
// Source de verite : la RPC public.mes_droits_sites(), appelee avec le client
// CALLER (Authorization de l'utilisateur) — super_admin recoit toutes les
// apps actives, un delegue ses sites, les autres un tableau vide.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class ErreurAcces extends Error {}

export async function sitesAutorises(caller: SupabaseClient): Promise<string[]> {
  const { data, error } = await caller.rpc("mes_droits_sites");
  if (error) {
    throw new ErreurAcces(`Lecture des droits impossible: ${error.message}`);
  }
  return Array.isArray(data) ? data : [];
}

export function exigerSite(sites: string[], appId: string): void {
  if (!appId || !sites.includes(appId)) {
    throw new ErreurAcces("Acces refuse pour ce site");
  }
}
