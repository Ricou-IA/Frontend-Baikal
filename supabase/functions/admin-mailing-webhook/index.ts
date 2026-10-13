// admin-mailing-webhook : evenements Resend (delivre, ouvert, clique,
// rebond, plainte) des campagnes Baikal, ecrits dans le journal du site.
//
// Deux facons d'arriver ici :
//  - ?site=<app_id> : le webhook du COMPTE RESEND DU SITE, signe avec le
//    secret nomme par config.apps.resend_webhook_secret_ref ;
//  - sans parametre : le webhook du compte Resend de Baikal
//    (MAILING_RESEND_WEBHOOK_SECRET), le site est lu dans le tag app_id.
//
// Un compte Resend envoie TOUS ses evenements, transactionnels du site
// compris : un resend_id inconnu du journal est ignore (200, sans bruit),
// sinon Resend rejouerait l'evenement indefiniment.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite } from "../_shared/sites.ts";
import { chargerConfigMailing, ecrivain } from "../_shared/mailing/site.ts";
import { lireTag, typeEvenement, verifierSvix } from "../_shared/mailing/envoi.ts";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  const corps = await req.text();
  const siteParam = new URL(req.url).searchParams.get("site");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Secret de signature : celui du compte qui a appele.
  let secret: string | undefined;
  if (siteParam) {
    const cfg = await chargerConfigMailing(admin, siteParam).catch(() => null);
    secret = cfg?.resend_webhook_secret_ref ? Deno.env.get(cfg.resend_webhook_secret_ref) : undefined;
  } else {
    secret = Deno.env.get("MAILING_RESEND_WEBHOOK_SECRET");
  }
  if (!secret) return json({ error: "Webhook non configure" }, 500);

  const valide = await verifierSvix(secret, {
    id: req.headers.get("svix-id"),
    horodatage: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  }, corps);
  if (!valide) return json({ error: "Signature invalide" }, 401);

  let evt: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    evt = JSON.parse(corps);
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }
  const type = typeEvenement(evt.type);
  const resendId = typeof evt.data?.email_id === "string" ? evt.data.email_id : null;
  if (!type || !resendId) return json({ ok: true, ignore: evt.type ?? "sans type" });

  const appId = siteParam ?? lireTag(evt.data?.tags, "app_id");
  // Pas de tag : ce n'est pas un envoi de campagne Baikal.
  if (!appId) return json({ ok: true, ignore: "hors campagne" });

  try {
    const site = await chargerSite(admin, appId);
    const cfg = await chargerConfigMailing(admin, appId);
    const bounce = evt.data?.bounce as { type?: string; subType?: string } | undefined;
    const r = await ecrivain(admin, site, cfg).evenement(
      resendId, type, evt.created_at ?? new Date().toISOString(),
      bounce ? { bounce_type: bounce.type ?? null, bounce_subtype: bounce.subType ?? null } : {},
    );
    return json({ ok: true, ...r });
  } catch (e) {
    const msg = (e as Error).message;
    // Site sans module : rien a ecrire, et rejouer n'y changerait rien.
    if (/n'a pas installe le module|Site inconnu|sans base configuree/.test(msg)) {
      return json({ ok: true, ignore: msg });
    }
    console.error("[admin-mailing-webhook]", appId, e);
    // 500 : Resend rejouera (panne passagere de la base ou du relais).
    return json({ error: msg }, 500);
  }
});
