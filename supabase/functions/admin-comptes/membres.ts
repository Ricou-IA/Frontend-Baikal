// Canal Membres d'admin-comptes ({ canal: "membres", action, appId, ... }) :
// les membres d'un site en modèle « organisations » qui a sa propre base,
// administrés par le canal du site (config.apps.env_admin_fn).
// Spec : docs/superpowers/specs/2026-11-20-contrat-membres-design.md.
// Contrat côté site : docs/contrats/membres-relais-v1.ts.
//
// Logé dans admin-comptes et non dans une fonction à part : le projet a
// atteint son nombre maximal d'Edge Functions (20/11/2026).
//
// Baikal ne tient aucune copie : la liste, les rôles et l'état de chaque compte
// viennent du site à chaque appel, et chaque geste s'exécute chez lui.
//
// Actions :
//   etat          -> { disponible, actions, roles } lus dans le manifeste du site ;
//                    { disponible: false, motif: "canal" | "contrat" } sinon
//   membres       -> { organisations, membres }            ({ orgId? })
//   creer         -> { membre, motDePasse? }               ({ email, nom?, orgId, role, password? })
//   mot-de-passe  -> { ok, motDePasse? }                   ({ id, password? })
//   bloquer       -> { membre }                            ({ id, bloque })
//   role, renommer, email, lien, retirer : relayées si le site les publie.
// `password` absent = généré ici, rendu UNE fois dans `motDePasse`.
//
// Droits : super admin, ou droit délégué `users` du site (lecture pour
// consulter, écriture pour agir). L'org_admin d'un client n'y a pas accès : il
// gère son équipe chez le site.
// Site en erreur -> 502, `error` = la phrase à afficher, `canal` = le refus tel
// que le site l'a rendu. Pas de réponse -> 504. Jamais de succès supposé.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite } from "../_shared/sites.ts";
import { appelerRelais, ErreurRelais, relaisConfigure } from "../_shared/relais.ts";
import { genererMotDePasse, validerMotDePasse } from "../_shared/mot-de-passe.ts";
import {
  autorise,
  corpsSite,
  erreurCanal,
  lireEtat,
  messageCanal,
  niveauConsole,
  niveauExige,
  porteMotDePasse,
} from "./membres-regles.ts";

export interface ContexteMembres {
  admin: SupabaseClient;
  userId: string;
  email: string | null;
  appRole: string | null;
  body: Record<string, unknown>;
  json: (payload: unknown, status?: number) => Response;
}

export async function traiterCanalMembres(c: ContexteMembres): Promise<Response> {
  const { admin, body, json } = c;
  try {
    const action = String(body.action ?? "");
    const appId = String(body.appId ?? "");
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    const exige = niveauExige(action);
    if (!exige) return json({ data: null, error: `Action inconnue: ${action}` }, 400);

    const { data: droit, error: droitError } = await admin.schema("admin").from("droits_sites")
      .select("modules").eq("user_id", c.userId).eq("app_id", appId).maybeSingle();
    if (droitError) throw new Error("Lecture des droits impossible");
    const possede = niveauConsole(c.appRole, droit?.modules as Record<string, unknown> | null);
    if (!autorise(possede, exige)) return json({ data: null, error: "Acces refuse" }, 403);

    const site = await chargerSite(admin, appId);
    if (!relaisConfigure(site, site.env_admin_fn)) {
      return json({ data: { disponible: false, motif: "canal" }, error: null });
    }

    // Mot de passe : saisi et validé, ou généré. Jamais journalisé.
    let motDePasse: string | null = null;
    let genere = false;
    if (porteMotDePasse(action)) {
      genere = !body.password;
      motDePasse = genere ? genererMotDePasse() : validerMotDePasse(body.password);
      if (!motDePasse) return json({ data: null, error: "Mot de passe : 8 caractères minimum" }, 400);
    }

    const charge = await appelerRelais(
      site,
      site.env_admin_fn,
      corpsSite(action, body, c.email, motDePasse),
      exige === "ecriture" ? 20000 : 10000,
    );

    if (action === "etat") return json({ data: lireEtat(charge), error: null });
    return json({
      data: { ...(charge as Record<string, unknown>), ...(genere ? { motDePasse } : {}) },
      error: null,
    });
  } catch (e) {
    // Le message d'une ErreurRelais ne porte que le site et son statut HTTP.
    console.error("[admin-comptes/membres]", e instanceof Error ? e.message : String(e));
    if (e instanceof ErreurSite) return json({ data: null, error: e.message }, 400);
    if (e instanceof ErreurRelais) {
      const canal = e.statutSortie === 502 ? erreurCanal(e.detail) : null;
      return json(
        { data: null, error: canal ? messageCanal(canal) : e.message, canal },
        e.statutSortie ?? 500,
      );
    }
    return json({ data: null, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
