// Droits des admins delegues (table admin.droits_sites).
// Source de verite : les RPC public.mes_droits_sites() et
// public.mes_droits_modules(), appelees avec le client CALLER (Authorization
// de l'utilisateur) — super_admin recoit toutes les apps actives (tout en
// ecriture), un delegue ses sites et ses modules, les autres rien.
//
// Deux niveaux : la presence du site (sitesAutorises / exigerSite) et le
// niveau par module (droitsModules / exigerModule). Un module absent des
// droits est ferme ; 'lecture' autorise la consultation ; 'ecriture' autorise
// toute action qui modifie, envoie, genere ou coute.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class ErreurAcces extends Error {}

export type Niveau = "lecture" | "ecriture";
export type DroitsModules = Record<string, Record<string, Niveau>>;

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

export async function droitsModules(caller: SupabaseClient): Promise<DroitsModules> {
  const { data, error } = await caller.rpc("mes_droits_modules");
  if (error) {
    throw new ErreurAcces(`Lecture des droits impossible: ${error.message}`);
  }
  return (data && typeof data === "object" && !Array.isArray(data))
    ? data as DroitsModules
    : {};
}

export function niveauModule(
  droits: DroitsModules,
  appId: string,
  module: string,
): Niveau | null {
  const n = droits?.[appId]?.[module];
  return n === "lecture" || n === "ecriture" ? n : null;
}

// Lecture : accepte lecture ou ecriture. Ecriture : exige ecriture.
export function exigerModule(
  droits: DroitsModules,
  appId: string,
  module: string,
  niveau: Niveau,
): void {
  const n = niveauModule(droits, appId, module);
  if (!appId || n === null) {
    throw new ErreurAcces(`Acces refuse : module ${module} ferme pour ce site`);
  }
  if (niveau === "ecriture" && n !== "ecriture") {
    throw new ErreurAcces(`Acces refuse : module ${module} en lecture seule pour ce site`);
  }
}
