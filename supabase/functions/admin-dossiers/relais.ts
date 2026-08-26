// Canal d'administration inter-projets du module Clients : Baikal appelle
// l'Edge Function d'administration du site (pv-admin-dossiers chez PED).
// L'anon key PUBLIQUE du site passe le gateway verify_jwt ; l'autorisation
// reelle est le secret partage X-Baikal-Key, verifie cote site.
import type { Site } from "../_shared/sites.ts";

export class ErreurRelais extends Error {}

export interface CibleRelais {
  url: string;
  headers: Record<string, string>;
}

export function relaisConfigure(site: Site): boolean {
  return Boolean(
    site.env_url && site.env_dossiers_fn && site.env_secret_ref && site.env_anon_key,
  );
}

export function preparerRelais(site: Site): CibleRelais | null {
  if (!relaisConfigure(site)) return null;
  const cle = Deno.env.get(site.env_secret_ref!);
  if (!cle) {
    throw new ErreurRelais(
      `Secret ${site.env_secret_ref} absent des Edge Function Secrets`,
    );
  }
  return {
    url: `${site.env_url!.replace(/\/+$/, "")}/functions/v1/${site.env_dossiers_fn}`,
    headers: {
      "Content-Type": "application/json",
      "apikey": site.env_anon_key!,
      "Authorization": `Bearer ${site.env_anon_key}`,
      "X-Baikal-Key": cle,
    },
  };
}
