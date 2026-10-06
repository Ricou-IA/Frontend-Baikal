// Actions relayées à un site, pour n'importe quel OBJET du contrat (dossier,
// compte) : le site publie un manifeste calculé pour cet objet, Baikal ne
// relaie qu'une action qui y figure, avec les seuls paramètres déclarés.
// Partagé par admin-dossiers (cle dossier_id, canal env_dossiers_fn) et
// admin-comptes-pro (cle compte_id, canal env_admin_fn). Le troisième objet
// n'aura rien à écrire ici.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appelerRelais, relaisConfigure } from "./relais.ts";
import type { Site } from "./sites.ts";
import {
  type ActionFiche,
  normaliserManifeste,
  trouverAction,
} from "../admin-dossiers/manifeste.ts";

export type { ActionFiche };
export type CleObjet = "dossier_id" | "compte_id";
export type Appeler = (
  site: Site,
  fn: string | null,
  corps: Record<string, unknown>,
  timeoutMs?: number,
) => Promise<unknown>;

// Un relais en panne ne doit pas rendre la fiche illisible : liste vide + motif.
export async function chargerManifeste(
  site: Site,
  fn: string | null,
  cle: CleObjet,
  id: string,
  appeler: Appeler = appelerRelais,
): Promise<{ actions: ActionFiche[]; erreur: string | null }> {
  if (!relaisConfigure(site, fn)) return { actions: [], erreur: null };
  try {
    // Budget court : c'est le chemin de l'affichage de la fiche.
    const charge = await appeler(site, fn, { action: "manifeste", [cle]: id }, 8000);
    return { actions: normaliserManifeste(charge), erreur: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[actions-site] manifeste", message);
    return { actions: [], erreur: message };
  }
}

export async function estSuperAdmin(caller: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profil } = await caller.from("profiles").select("app_role").eq("id", userId).single();
  return profil?.app_role === "super_admin";
}

export type ActionPreparee =
  | { ok: true; corps: Record<string, unknown> }
  | { ok: false; statut: 400 | 403; erreur: string };

// Pur : une action absente du manifeste n'est pas relayée ; super_admin est
// vérifié ici ET par le site ; les paramètres sont filtrés sur ceux déclarés
// (le site les valide, lui seul connaît ses bornes).
export function preparerActionSite(
  manifeste: ActionFiche[],
  actionSite: unknown,
  parametres: unknown,
  superAdmin: boolean,
): ActionPreparee {
  const def = trouverAction(manifeste, actionSite);
  if (!def) return { ok: false, statut: 400, erreur: `Action site inconnue: ${actionSite}` };
  if (def.superAdmin && !superAdmin) {
    return { ok: false, statut: 403, erreur: "Action reservee au super_admin" };
  }
  const corps: Record<string, unknown> = { action: def.id };
  if (parametres && typeof parametres === "object") {
    for (const p of def.parametres) {
      const fourni = (parametres as Record<string, unknown>)[p.id];
      if (fourni !== undefined) corps[p.id] = fourni;
    }
  }
  return { ok: true, corps };
}
