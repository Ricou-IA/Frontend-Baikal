// admin-comptes : administration des COMPTES (auth.users), en deux périmètres.
//
// Règle décidée par Eric le 08/09/2026 : utilisateur = client, un compte
// appartient à celui qui le vend.
//   - périmètre « baikal » (scope: 'baikal') : les clients de Baikal, ceux qui
//     administrent des sites depuis la console — super admins, admins délégués
//     (admin.droits_sites) et comptes créés ici (core.profiles.app_id = 'baikal').
//     Réservé au super admin. C'est l'onglet Comptes de l'étage Baikal.
//   - périmètre « site » (scope: <app_id>) : les clients d'un site à
//     organisations (core.profiles.app_id = site). Le propriétaire du site
//     (super admin, ou module users en écriture dans droits_sites) voit tout le
//     site ; un org_admin du site ne voit et n'agit que sur son organisation,
//     jamais sur un autre org_admin. C'est la page Utilisateurs du site.
//
// Actions (toutes POST, {action, scope, ...}) :
//   list {search?}                   -> comptes du périmètre, avec état auth
//   create {email, fullName?, password?}
//                                    -> périmètre baikal seulement ; compte
//                                       confirmé d'office, mot de passe généré si
//                                       absent, renvoyé UNE fois
//   set-password {userId, password?} -> nouveau mot de passe (généré si absent)
//   recovery-link {userId, redirectTo}
//                                    -> lien de réinitialisation à transmettre
//                                       soi-même (indépendant de l'email Supabase)
//   rename {userId, fullName}
//   set-email {userId, email}        -> changé et confirmé d'office
//   ban {userId, bloque}             -> blocage (ban 100 ans) / déblocage
// La suppression reste dans l'EF delete-user.
//
// Garde-fous : la cible doit appartenir au périmètre ; jamais soi-même pour
// ban ; jamais le mot de passe, l'email ni le lien d'un AUTRE super admin (le
// rétrograder d'abord). Journal dans core.role_changes_log (change_type =
// account_*).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

// Blocage « définitif » : Supabase n'a qu'une durée, on met 100 ans.
const BAN_LONG = "876000h";
const APP_BAIKAL = "baikal";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 14 caractères, sans les glyphes ambigus (0/O, 1/l/I), avec au moins une
// minuscule, une majuscule et un chiffre : lisible à l'oral et au téléphone.
function genererMotDePasse(): string {
  const minuscules = "abcdefghjkmnpqrstuvwxyz";
  const majuscules = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const chiffres = "23456789";
  const tout = minuscules + majuscules + chiffres;
  const tirer = (alphabet: string) => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return alphabet[b[0] % alphabet.length];
  };
  const chars = [tirer(minuscules), tirer(majuscules), tirer(chiffres)];
  while (chars.length < 14) chars.push(tirer(tout));
  for (let i = chars.length - 1; i > 0; i--) {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    const j = b[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function validerMotDePasse(mdp: unknown): string | null {
  if (typeof mdp !== "string") return null;
  if (mdp.length < 8 || mdp.length > 72) return null;
  return mdp;
}

type Profil = {
  id: string;
  email: string;
  full_name: string | null;
  app_role: string | null;
  org_id: string | null;
  app_id: string | null;
};

type CompteAuth = {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
};

// Qui appelle, et ce qu'il a le droit de voir dans ce périmètre.
type Perimetre = {
  scope: string;              // 'baikal' ou un app_id
  superAdmin: boolean;
  proprietaire: boolean;      // voit tout le périmètre
  orgId: string | null;       // org_admin : borné à son organisation
};

async function profilParId(admin: SupabaseClient, id: string): Promise<Profil | null> {
  const { data, error } = await admin.schema("core").from("profiles")
    .select("id, email, full_name, app_role, org_id, app_id").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Profil | null;
}

// Tous les comptes auth (pagination de l'API admin, 1000 par page).
async function tousLesComptesAuth(admin: SupabaseClient): Promise<CompteAuth[]> {
  const out: CompteAuth[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...((data?.users ?? []) as CompteAuth[]));
    if ((data?.users ?? []).length < 1000) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Non authentifie" }, 401);
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Non authentifie" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const appelant = await profilParId(admin, user.id);
    if (!appelant) return json({ data: null, error: "Acces refuse" }, 403);

    const body = await req.json();
    const action = String(body.action ?? "");
    const scope = String(body.scope ?? "baikal");

    // ---- Périmètre et droits de l'appelant ---------------------------------
    const superAdmin = appelant.app_role === "super_admin";
    let perimetre: Perimetre;
    if (scope === "baikal") {
      if (!superAdmin) return json({ data: null, error: "Acces refuse" }, 403);
      perimetre = { scope, superAdmin, proprietaire: true, orgId: null };
    } else {
      let proprietaire = superAdmin;
      if (!proprietaire) {
        const { data: droit } = await admin.schema("admin").from("droits_sites")
          .select("modules").eq("user_id", user.id).eq("app_id", scope).maybeSingle();
        proprietaire = (droit?.modules as Record<string, string> | null)?.users === "ecriture";
      }
      const orgAdminDuSite = appelant.app_role === "org_admin" &&
        appelant.app_id === scope && !!appelant.org_id;
      if (!proprietaire && !orgAdminDuSite) {
        return json({ data: null, error: "Acces refuse" }, 403);
      }
      perimetre = {
        scope,
        superAdmin,
        proprietaire,
        orgId: proprietaire ? null : appelant.org_id,
      };
    }

    const journaliser = async (
      cible: { id: string; email: string; app_role: string | null; org_id: string | null },
      type: string,
      metadata: Record<string, unknown> = {},
    ) => {
      const { error } = await admin.schema("core").from("role_changes_log").insert({
        target_user_id: cible.id,
        target_user_email: cible.email,
        change_type: type,
        old_app_role: cible.app_role,
        new_app_role: cible.app_role,
        old_org_id: cible.org_id,
        new_org_id: cible.org_id,
        changed_by: user.id,
        changed_by_email: appelant.email,
        changed_by_role: appelant.app_role,
        reason: typeof body.reason === "string" ? body.reason : null,
        metadata: { source: "admin-comptes", scope, ...metadata },
      });
      if (error) console.error("[admin-comptes] journal role_changes_log:", error.message);
    };

    // Un compte est « de Baikal » s'il administre des sites depuis la console.
    const idsDroits = async (): Promise<Set<string>> => {
      const { data, error } = await admin.schema("admin").from("droits_sites").select("user_id");
      if (error) throw error;
      return new Set((data ?? []).map((d) => d.user_id as string));
    };
    const estCompteBaikal = (p: Profil, droits: Set<string>) =>
      p.app_role === "super_admin" || p.app_id === APP_BAIKAL || droits.has(p.id);

    // Charge la cible et vérifie qu'elle est dans le périmètre de l'appelant.
    // protegerSuperAdmin : l'action permettrait de prendre la main sur le
    // compte (mot de passe, lien, email, blocage) -> jamais un autre super admin.
    const cibleOuErreur = async (protegerSuperAdmin: boolean) => {
      const userId = String(body.userId ?? "");
      if (!userId) return { erreur: json({ data: null, error: "userId requis" }, 400) };
      const cible = await profilParId(admin, userId);
      if (!cible) return { erreur: json({ data: null, error: "Compte introuvable" }, 404) };
      const horsPerimetre = json({ data: null, error: "Ce compte n'est pas dans ce périmètre" }, 403);
      if (perimetre.scope === "baikal") {
        if (!estCompteBaikal(cible, await idsDroits())) return { erreur: horsPerimetre };
      } else {
        if (cible.app_id !== perimetre.scope) return { erreur: horsPerimetre };
        if (cible.app_role === "super_admin") return { erreur: horsPerimetre };
        if (perimetre.orgId) {
          // org_admin : son organisation seulement, jamais un pair org_admin.
          if (cible.org_id !== perimetre.orgId || cible.app_role === "org_admin") {
            return { erreur: json({ data: null, error: "Réservé au propriétaire du site" }, 403) };
          }
        }
      }
      if (protegerSuperAdmin && cible.app_role === "super_admin" && cible.id !== user.id) {
        return {
          erreur: json({
            data: null,
            error: "Impossible sur un autre super admin : le rétrograder d'abord (Super admins).",
          }, 403),
        };
      }
      return { cible };
    };

    switch (action) {
      case "list": {
        const recherche = String(body.search ?? "").trim().toLowerCase();
        const [comptesAuth, profils, droits, orgs] = await Promise.all([
          tousLesComptesAuth(admin),
          admin.schema("core").from("profiles")
            .select("id, email, full_name, app_role, org_id, app_id"),
          admin.schema("admin").from("droits_sites").select("user_id, app_id"),
          admin.schema("core").from("organizations").select("id, name"),
        ]);
        if (profils.error) throw profils.error;
        if (droits.error) throw droits.error;
        if (orgs.error) throw orgs.error;
        const parId = new Map((profils.data ?? []).map((p: Profil) => [p.id, p]));
        const nomOrg = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
        const sitesParUser = new Map<string, number>();
        for (const d of droits.data ?? []) {
          sitesParUser.set(d.user_id, (sitesParUser.get(d.user_id) ?? 0) + 1);
        }
        const avecDroits = new Set(sitesParUser.keys());
        const dansPerimetre = (p: Profil | undefined): boolean => {
          if (!p) return false; // sans profil : n'appartient à personne ici
          if (perimetre.scope === "baikal") return estCompteBaikal(p, avecDroits);
          if (p.app_id !== perimetre.scope) return false;
          if (p.app_role === "super_admin") return false;
          if (perimetre.orgId) return p.org_id === perimetre.orgId;
          return true;
        };
        const maintenant = Date.now();
        const liste = comptesAuth
          .filter((u) => dansPerimetre(parId.get(u.id)))
          .map((u) => {
            const p = parId.get(u.id)!;
            const banni = u.banned_until ? new Date(u.banned_until).getTime() > maintenant : false;
            return {
              userId: u.id,
              email: p.email ?? u.email ?? "",
              nom: p.full_name ?? (u.user_metadata?.full_name as string | undefined) ?? null,
              appRole: p.app_role,
              orgId: p.org_id,
              orgNom: p.org_id ? (nomOrg.get(p.org_id) ?? null) : null,
              appId: p.app_id,
              sites: sitesParUser.get(u.id) ?? 0,
              creeLe: u.created_at,
              derniereConnexion: u.last_sign_in_at ?? null,
              confirme: !!u.email_confirmed_at,
              bloque: banni,
              moi: u.id === user.id,
            };
          })
          .filter((c) =>
            !recherche ||
            c.email.toLowerCase().includes(recherche) ||
            (c.nom ?? "").toLowerCase().includes(recherche) ||
            (c.orgNom ?? "").toLowerCase().includes(recherche)
          )
          .sort((a, b) => a.email.localeCompare(b.email));
        return json({ data: liste, error: null });
      }

      // Tableau de bord des sites (étage Baikal) : le registre config.apps
      // avec ce que Baikal sait compter chez lui — comptes, organisations,
      // admins délégués, demandes. Les clients d'un site en modèle
      // « clients » se comptent dans son module Clients, pas ici.
      case "sites": {
        if (perimetre.scope !== "baikal") {
          return json({ data: null, error: "Réservé à l'étage Baikal" }, 403);
        }
        const [apps, profils, orgs, droits, demandes] = await Promise.all([
          admin.schema("config").from("apps")
            .select("id, name, domaine, is_active, sort_order, modele_comptes, gsc_propriete, stripe_secret_ref")
            .order("sort_order"),
          admin.schema("core").from("profiles").select("id, app_id, app_role, created_at"),
          admin.schema("core").from("organizations").select("id, app_id"),
          admin.schema("admin").from("droits_sites").select("app_id, user_id"),
          admin.schema("admin").from("demandes").select("id, statut"),
        ]);
        for (const r of [apps, profils, orgs, droits, demandes]) if (r.error) throw r.error;
        const compte = (rows: Array<Record<string, unknown>>, cle: string) => {
          const m = new Map<string, number>();
          for (const r of rows) {
            const k = String(r[cle] ?? "");
            if (k) m.set(k, (m.get(k) ?? 0) + 1);
          }
          return m;
        };
        const comptesParApp = compte(profils.data ?? [], "app_id");
        const orgsParApp = compte(orgs.data ?? [], "app_id");
        const adminsParApp = new Map<string, Set<string>>();
        for (const d of droits.data ?? []) {
          if (!adminsParApp.has(d.app_id)) adminsParApp.set(d.app_id, new Set());
          adminsParApp.get(d.app_id)!.add(d.user_id);
        }
        const dernierCompte = new Map<string, string>();
        for (const p of profils.data ?? []) {
          if (!p.app_id) continue;
          const d = dernierCompte.get(p.app_id);
          if (!d || p.created_at > d) dernierCompte.set(p.app_id, p.created_at);
        }
        const nbSuper = (profils.data ?? []).filter((p) => p.app_role === "super_admin").length;
        const nbDemandes = (demandes.data ?? []).length;
        const nbDemandesNouvelles = (demandes.data ?? []).filter((d) => d.statut === "nouvelle").length;
        return json({
          data: {
            superAdmins: nbSuper,
            sites: (apps.data ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              domaine: a.domaine,
              actif: a.is_active,
              modele: a.modele_comptes,
              seo: !!a.gsc_propriete,
              stripe: !!a.stripe_secret_ref,
              comptes: a.id === APP_BAIKAL ? (comptesParApp.get(a.id) ?? 0) + nbSuper : (comptesParApp.get(a.id) ?? 0),
              organisations: orgsParApp.get(a.id) ?? 0,
              admins: adminsParApp.get(a.id)?.size ?? 0,
              demandes: a.id === APP_BAIKAL ? nbDemandes : null,
              demandesNouvelles: a.id === APP_BAIKAL ? nbDemandesNouvelles : null,
              dernierCompte: dernierCompte.get(a.id) ?? null,
            })),
          },
          error: null,
        });
      }

      case "create": {
        if (perimetre.scope !== "baikal") {
          return json({ data: null, error: "La création d'un client de site passe par Nouvel user" }, 400);
        }
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return json({ data: null, error: "email requis" }, 400);
        const fullName = typeof body.fullName === "string" ? body.fullName.trim() || null : null;
        const genere = !body.password;
        const password = genere ? genererMotDePasse() : validerMotDePasse(body.password);
        if (!password) return json({ data: null, error: "Mot de passe : 8 caractères minimum" }, 400);

        const { data: cree, error: cErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (cErr) {
          const deja = /already|exists|registered/i.test(cErr.message);
          return json({
            data: null,
            error: deja ? `Un compte existe déjà pour ${email}` : cErr.message,
          }, 400);
        }
        const nouveauId = cree.user.id;
        // Le trigger handle_new_user crée le profil ; on le complète ensuite.
        // app_id = 'baikal' : c'est ce qui en fait un compte Baikal tant qu'il
        // n'a ni accès délégué ni statut super admin.
        await new Promise((r) => setTimeout(r, 500));
        const { error: pErr } = await admin.schema("core").from("profiles")
          .upsert(
            { id: nouveauId, email, full_name: fullName, app_role: "user", app_id: APP_BAIKAL },
            { onConflict: "id" },
          );
        if (pErr) console.error("[admin-comptes] profil après création:", pErr.message);
        await journaliser(
          { id: nouveauId, email, app_role: "user", org_id: null },
          "account_creation",
          { genere },
        );
        return json({
          data: { userId: nouveauId, email, motDePasse: password, genere },
          error: null,
        });
      }

      case "set-password": {
        const { cible, erreur } = await cibleOuErreur(true);
        if (erreur) return erreur;
        const genere = !body.password;
        const password = genere ? genererMotDePasse() : validerMotDePasse(body.password);
        if (!password) return json({ data: null, error: "Mot de passe : 8 caractères minimum" }, 400);
        const { error } = await admin.auth.admin.updateUserById(cible!.id, { password });
        if (error) return json({ data: null, error: error.message }, 400);
        await journaliser(cible!, "account_password_set", { genere });
        return json({ data: { motDePasse: password, genere }, error: null });
      }

      case "recovery-link": {
        const { cible, erreur } = await cibleOuErreur(true);
        if (erreur) return erreur;
        const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;
        const { data, error } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: cible!.email,
          options: redirectTo ? { redirectTo } : undefined,
        });
        if (error) return json({ data: null, error: error.message }, 400);
        await journaliser(cible!, "account_recovery_link");
        return json({ data: { lien: data.properties?.action_link ?? null }, error: null });
      }

      case "rename": {
        const { cible, erreur } = await cibleOuErreur(false);
        if (erreur) return erreur;
        const fullName = typeof body.fullName === "string" ? body.fullName.trim() || null : null;
        const { error: pErr } = await admin.schema("core").from("profiles")
          .update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("id", cible!.id);
        if (pErr) throw pErr;
        const { error: aErr } = await admin.auth.admin.updateUserById(cible!.id, {
          user_metadata: { full_name: fullName },
        });
        if (aErr) console.error("[admin-comptes] user_metadata:", aErr.message);
        return json({ data: { ok: true, nom: fullName }, error: null });
      }

      case "set-email": {
        const { cible, erreur } = await cibleOuErreur(true);
        if (erreur) return erreur;
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return json({ data: null, error: "email requis" }, 400);
        if (email === cible!.email.toLowerCase()) {
          return json({ data: { ok: true, inchange: true }, error: null });
        }
        const { error: aErr } = await admin.auth.admin.updateUserById(cible!.id, {
          email,
          email_confirm: true,
        });
        if (aErr) {
          const deja = /already|exists|registered/i.test(aErr.message);
          return json({
            data: null,
            error: deja ? `Un compte existe déjà pour ${email}` : aErr.message,
          }, 400);
        }
        const { error: pErr } = await admin.schema("core").from("profiles")
          .update({ email, updated_at: new Date().toISOString() }).eq("id", cible!.id);
        if (pErr) throw pErr;
        await journaliser(cible!, "account_email_change", { ancien: cible!.email, nouveau: email });
        return json({ data: { ok: true, email }, error: null });
      }

      case "ban": {
        const { cible, erreur } = await cibleOuErreur(true);
        if (erreur) return erreur;
        const bloque = body.bloque === true;
        if (cible!.id === user.id) {
          return json({ data: null, error: "Vous ne pouvez pas bloquer votre propre compte" }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(cible!.id, {
          ban_duration: bloque ? BAN_LONG : "none",
        });
        if (error) return json({ data: null, error: error.message }, 400);
        await journaliser(cible!, bloque ? "account_block" : "account_unblock");
        return json({ data: { ok: true, bloque }, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-comptes]", e);
    const message = e instanceof Error
      ? e.message
      : (typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e));
    return json({ data: null, error: message }, 500);
  }
});
