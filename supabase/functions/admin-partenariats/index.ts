import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildUnsubscribeUrl, renderTemplate, sendOneEmail } from "./envoi.ts";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Champs de config.apps modifiables par save-site. La creation d'app reste
// une migration : jamais d'insert ici, jamais name/is_active/system_prompt.
const CHAMPS_SITE = [
  "domaine",
  "gsc_propriete",
  "env_url",
  "env_secret_ref",
  "expediteur_nom",
  "expediteur_email",
  "reply_to",
] as const;

// Actions qui ne portent pas sur un site en particulier.
const ACTIONS_SANS_APP_ID = ["resend-status", "list-sites", "save-site"];

function piedDePage(lienDesinscription: string): string {
  return `<p style="margin-top:32px;font-size:12px;color:#888">` +
    `Vous recevez cet email dans le cadre d'une prise de contact professionnelle. ` +
    `<a href="${lienDesinscription}" style="color:#888">Ne plus recevoir d'emails</a></p>`;
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
    // Droits par site : super_admin voit tout, un delegue ses sites, les
    // autres (y compris org_admin sans droit delegue) rien.
    const { data: profile } = await caller
      .from("profiles").select("app_role").eq("id", user.id).single();
    const sites = await sitesAutorises(caller);
    if (profile?.app_role !== "super_admin" && sites.length === 0) {
      return json({ data: null, error: "Acces refuse" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action, appId } = body;
    if (!appId && !ACTIONS_SANS_APP_ID.includes(action)) {
      return json({ data: null, error: "appId requis" }, 400);
    }
    if (appId) exigerSite(sites, appId);

    // Expediteur du site, lu en base. Echoue fort si non configure.
    const chargerExpediteur = async (): Promise<
      { nom: string; email: string; replyTo: string } | null
    > => {
      const { data: app, error } = await admin.schema("config").from("apps")
        .select("expediteur_nom, expediteur_email, reply_to")
        .eq("id", appId).single();
      if (error || !app?.expediteur_email) return null;
      return {
        nom: app.expediteur_nom ?? app.expediteur_email,
        email: app.expediteur_email,
        replyTo: app.reply_to || app.expediteur_email,
      };
    };
    const erreurExpediteur = () =>
      json({ data: null, error: "Pas d'expediteur configure pour ce site (parametrage Sites)" }, 400);

    switch (action) {
      case "list-sites": {
        // Champs env/secret : super_admin uniquement. Un delegue ne voit que
        // ses sites, avec les champs inoffensifs.
        if (profile?.app_role === "super_admin") {
          const { data, error } = await admin.schema("config").from("apps")
            .select("id, name, domaine, gsc_propriete, env_url, env_secret_ref, " +
              "expediteur_nom, expediteur_email, reply_to, is_active")
            .order("sort_order");
          if (error) throw error;
          return json({ data, error: null });
        }
        const { data, error } = await admin.schema("config").from("apps")
          .select("id, name, domaine, expediteur_nom, expediteur_email, reply_to, is_active")
          .in("id", sites)
          .order("sort_order");
        if (error) throw error;
        return json({ data, error: null });
      }

      case "save-site": {
        if (profile?.app_role !== "super_admin") {
          return json({ data: null, error: "Acces refuse" }, 403);
        }
        const s = body.site ?? {};
        if (!s.id) return json({ data: null, error: "site.id requis" }, 400);
        const maj: Record<string, unknown> = {};
        for (const champ of CHAMPS_SITE) {
          if (champ in s) maj[champ] = s[champ] === "" ? null : s[champ];
        }
        if (Object.keys(maj).length === 0) {
          return json({ data: null, error: "Aucun champ a enregistrer" }, 400);
        }
        const { data, error } = await admin.schema("config").from("apps")
          .update(maj).eq("id", s.id).select("id").single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "list-prospects": {
        let q = admin.schema("admin").from("prospects")
          .select("*", { count: "exact" })
          .eq("app_id", appId)
          .order("cree_le", { ascending: false })
          .range(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 50) - 1);
        if (body.type) q = q.eq("type", body.type);
        if (body.statut) q = q.eq("statut", body.statut);
        if (body.recherche) {
          const r = String(body.recherche).replace(/[%,().]/g, " ").trim();
          if (r) q = q.or(`email.ilike.%${r}%,nom.ilike.%${r}%,entreprise.ilike.%${r}%`);
        }
        const { data, error, count } = await q;
        if (error) throw error;
        return json({ data: { prospects: data, total: count }, error: null });
      }

      case "save-prospect": {
        const p = body.prospect ?? {};
        if (!p.email || !p.type) {
          return json({ data: null, error: "email et type requis" }, 400);
        }
        const ligne = {
          app_id: appId,
          type: p.type,
          statut: p.statut ?? "nouveau",
          email: String(p.email).trim().toLowerCase(),
          nom: p.nom ?? null, prenom: p.prenom ?? null,
          entreprise: p.entreprise ?? null, telephone: p.telephone ?? null,
          site_web: p.site_web ?? null, code_postal: p.code_postal ?? null,
          source: p.source ?? "manuel",
          donnees: p.donnees ?? {},
          maj_le: new Date().toISOString(),
        };
        const { data, error } = await admin.schema("admin").from("prospects")
          .upsert(ligne, { onConflict: "app_id,email" }).select().single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "delete-prospect": {
        const { error } = await admin.schema("admin").from("prospects")
          .delete().eq("id", body.prospectId).eq("app_id", appId);
        if (error) throw error;
        return json({ data: { ok: true }, error: null });
      }

      case "import-csv": {
        // Le front a deja parse le CSV : on recoit des lignes normalisees.
        const lignes = Array.isArray(body.lignes) ? body.lignes : [];
        if (lignes.length === 0 || lignes.length > 5000) {
          return json({ data: null, error: "Entre 1 et 5000 lignes attendues" }, 400);
        }
        const valides = lignes
          .filter((l: Record<string, unknown>) =>
            typeof l.email === "string" && l.email.includes("@"))
          .map((l: Record<string, string>) => ({
            app_id: appId,
            type: body.type === "diagnostiqueur" ? "diagnostiqueur" : "agence",
            email: l.email.trim().toLowerCase(),
            nom: l.nom ?? null, prenom: l.prenom ?? null,
            entreprise: l.entreprise ?? null, telephone: l.telephone ?? null,
            site_web: l.site_web ?? null, code_postal: l.code_postal ?? null,
            source: "csv",
            donnees: l.donnees ?? {},
          }));
        // ignoreDuplicates : un email deja present (quel que soit son statut,
        // desinscrit compris) n'est JAMAIS reecrit par un import.
        const { data, error } = await admin.schema("admin").from("prospects")
          .upsert(valides, { onConflict: "app_id,email", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        return json({
          data: {
            recus: lignes.length,
            valides: valides.length,
            inseres: data?.length ?? 0,
            doublons: valides.length - (data?.length ?? 0),
          },
          error: null,
        });
      }

      case "sync-diagnostiqueurs": {
        // Le mapping vit dans admin.sync_diagnostiqueurs, partage avec le
        // cron nocturne admin-sync-diag-prospects (03h30).
        const { data, error } = await admin.schema("admin")
          .rpc("sync_diagnostiqueurs", { p_app_id: appId });
        if (error) throw error;
        return json({ data, error: null });
      }

      case "list-campagnes": {
        const { data, error } = await admin.schema("admin").from("campagnes")
          .select("*").eq("app_id", appId).order("cree_le", { ascending: false });
        if (error) throw error;
        return json({ data, error: null });
      }

      case "save-campagne": {
        const c = body.campagne ?? {};
        const ligne = {
          ...(c.id ? { id: c.id } : {}),
          app_id: appId,
          nom: c.nom ?? "Sans nom",
          objet: c.objet ?? "",
          corps_html: c.corps_html ?? "",
          segment: c.segment ?? {},
        };
        const { data, error } = await admin.schema("admin").from("campagnes")
          .upsert(ligne).select().single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "preview-segment": {
        const s = body.segment ?? {};
        let q = admin.schema("admin").from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("app_id", appId).neq("statut", "desinscrit");
        if (s.type) q = q.eq("type", s.type);
        if (s.statut) q = q.eq("statut", s.statut);
        if (s.departement && /^\d{2,3}$/.test(String(s.departement))) {
          q = q.like("code_postal", `${s.departement}%`);
        }
        const { count, error } = await q;
        if (error) throw error;
        return json({ data: { destinataires: count }, error: null });
      }

      case "send-test": {
        const { data: c, error: cErr } = await admin.schema("admin").from("campagnes")
          .select("*").eq("id", body.campagneId).eq("app_id", appId).single();
        if (cErr || !c) return json({ data: null, error: "Campagne introuvable" }, 404);
        const exp = await chargerExpediteur();
        if (!exp) return erreurExpediteur();
        const lien = await buildUnsubscribeUrl(body.email);
        if (!lien) return json({ data: null, error: "ADMIN_UNSUBSCRIBE_SECRET absent" }, 500);
        const html = renderTemplate(c.corps_html, { prenom: "Test", nom: "Test", entreprise: "Test" })
          + piedDePage(lien);
        const r = await sendOneEmail(exp.nom, exp.email, exp.replyTo, body.email,
          `[TEST] ${c.objet}`, html);
        return r.ok
          ? json({ data: { ok: true }, error: null })
          : json({ data: null, error: r.error }, 502);
      }

      case "send-campaign": {
        const { data: c, error: cErr } = await admin.schema("admin").from("campagnes")
          .select("*").eq("id", body.campagneId).eq("app_id", appId).single();
        if (cErr || !c) return json({ data: null, error: "Campagne introuvable" }, 404);
        if (c.statut === "envoyee") {
          return json({ data: null, error: "Campagne deja envoyee" }, 409);
        }
        // Envoi par lots : LOT_MAX prospects par invocation, pause entre deux
        // envois pour respecter le rate limit Resend (~2/s). Relancer l'action
        // tant que restants > 0.
        const LOT_MAX = 50;
        const pause = () => new Promise((r) => setTimeout(r, 600));
        const exp = await chargerExpediteur();
        if (!exp) return erreurExpediteur();
        let envoyes = 0, erreurs = 0, dejaTraites = 0;
        let traitesDansLot = 0;

        // Envoie a un prospect deja claime et met a jour sa ligne campagne_envois.
        const envoyerA = async (p: { id: string; email: string } & Record<string, unknown>) => {
          const lien = await buildUnsubscribeUrl(p.email);
          if (!lien) {
            await admin.schema("admin").from("campagne_envois")
              .update({ statut: "erreur", erreur: "ADMIN_UNSUBSCRIBE_SECRET absent", maj_le: new Date().toISOString() })
              .eq("campagne_id", c.id).eq("prospect_id", p.id);
            erreurs++;
            return;
          }
          const html = renderTemplate(c.corps_html, p) + piedDePage(lien);
          const r = await sendOneEmail(exp.nom, exp.email, exp.replyTo, p.email, c.objet, html);
          await admin.schema("admin").from("campagne_envois")
            .update(r.ok
              ? { statut: "envoye", resend_id: r.resendId, erreur: null, maj_le: new Date().toISOString() }
              : { statut: "erreur", erreur: r.error, maj_le: new Date().toISOString() })
            .eq("campagne_id", c.id).eq("prospect_id", p.id);
          if (r.ok) {
            envoyes++;
            await admin.schema("admin").from("prospects")
              .update({ statut: "contacte", maj_le: new Date().toISOString() })
              .eq("id", p.id).eq("statut", "nouveau");
          } else {
            erreurs++;
          }
        };

        // 1. Reprendre d'abord les envois orphelins d'un run precedent :
        // claim pose (statut='envoye') mais aucun resend_id enregistre.
        const { data: orphelins, error: oErr } = await admin.schema("admin")
          .from("campagne_envois")
          .select("prospect_id, prospects:prospect_id(*)")
          .eq("campagne_id", c.id).eq("statut", "envoye").is("resend_id", null);
        if (oErr) throw oErr;
        for (const o of orphelins ?? []) {
          if (traitesDansLot >= LOT_MAX) break;
          const p = o.prospects as unknown as ({ id: string; email: string } & Record<string, unknown>) | null;
          if (!p) continue;
          if (traitesDansLot > 0) await pause();
          await envoyerA(p);
          traitesDansLot++;
        }

        // 2. Cibles du segment, en excluant les prospects deja traites
        // (une ligne campagne_envois existe, quel qu'en soit le statut).
        const { data: dejaLignes, error: dErr } = await admin.schema("admin")
          .from("campagne_envois")
          .select("prospect_id").eq("campagne_id", c.id);
        if (dErr) throw dErr;
        const dejaIds = new Set((dejaLignes ?? []).map((l) => l.prospect_id));

        const s = c.segment ?? {};
        let q = admin.schema("admin").from("prospects").select("*")
          .eq("app_id", appId).neq("statut", "desinscrit");
        if (s.type) q = q.eq("type", s.type);
        if (s.statut) q = q.eq("statut", s.statut);
        if (s.departement && /^\d{2,3}$/.test(String(s.departement))) {
          q = q.like("code_postal", `${s.departement}%`);
        }
        const { data: toutes, error: pErr } = await q;
        if (pErr) throw pErr;
        const cibles = (toutes ?? []).filter((p) => !dejaIds.has(p.id));

        let index = 0;
        for (; index < cibles.length; index++) {
          if (traitesDansLot >= LOT_MAX) break;
          const p = cibles[index];
          if (traitesDansLot > 0) await pause();
          // claim atomique : l'unicite (campagne_id, prospect_id) garantit
          // qu'un rejeu de l'action ne renvoie jamais deux fois au meme prospect
          const { error: claimErr } = await admin.schema("admin")
            .from("campagne_envois")
            .insert({ campagne_id: c.id, prospect_id: p.id, statut: "envoye" });
          if (claimErr) {
            if (claimErr.code === "23505") { dejaTraites++; continue; }
            console.error("[admin-partenariats] claim send-campaign", claimErr);
            erreurs++; continue;
          }
          traitesDansLot++;
          await envoyerA(p);
        }
        const restants = cibles.length - index;

        // Cloture : uniquement si tout est traite, qu'au moins un envoi a
        // abouti (ou etait deja fait), et que ce run n'est pas un echec total.
        const echecTotal = envoyes === 0 && erreurs > 0 && dejaTraites === 0;
        if (restants === 0 && envoyes + dejaTraites > 0 && !echecTotal) {
          await admin.schema("admin").from("campagnes")
            .update({ statut: "envoyee", envoyee_le: new Date().toISOString() })
            .eq("id", c.id);
        }
        return json({ data: { envoyes, erreurs, dejaTraites, restants }, error: null });
      }

      case "campaign-stats": {
        const { data: camp, error: campErr } = await admin.schema("admin").from("campagnes")
          .select("id").eq("id", body.campagneId).eq("app_id", appId).single();
        if (campErr || !camp) return json({ data: null, error: "Campagne introuvable" }, 404);
        const { data, error } = await admin.schema("admin").from("campagne_envois")
          .select("statut").eq("campagne_id", body.campagneId);
        if (error) throw error;
        const stats: Record<string, number> = {};
        for (const e of data ?? []) stats[e.statut] = (stats[e.statut] ?? 0) + 1;
        return json({ data: stats, error: null });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[admin-partenariats]", e);
    if (e instanceof ErreurAcces) {
      return json({ data: null, error: e.message }, 403);
    }
    const message = e instanceof Error
      ? e.message
      : (typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e));
    return json({ data: null, error: message }, 500);
  }
});
