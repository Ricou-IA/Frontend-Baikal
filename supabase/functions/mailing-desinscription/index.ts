// mailing-desinscription : desinscription des campagnes Baikal, ecrite CHEZ
// LE SITE (mail_desinscrire) dans la liste d'exclusion que tous ses envois
// lisent.
//
// Deux appelants :
//  - la page publique /desinscription de la console (lien du pied de mail) :
//    POST JSON {t, c, test, confirmer} — sans `confirmer`, renvoie seulement
//    le site et l'adresse a afficher (un prefetch ne desinscrit personne) ;
//  - le client mail via List-Unsubscribe-Post (RFC 8058, un clic) : POST
//    form-urlencoded "List-Unsubscribe=One-Click" sur l'URL ?t=&c=.
// Pas de page HTML ici : Supabase sert le HTML des fonctions en text/plain.
// Securite : le jeton HMAC (site + adresse) ; verify_jwt off.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite } from "../_shared/sites.ts";
import { chargerConfigMailing, ecrivain } from "../_shared/mailing/site.ts";
import { verifierJeton } from "../_shared/mailing/rendu.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  const url = new URL(req.url);
  let jeton = url.searchParams.get("t") ?? "";
  let campagneId = url.searchParams.get("c");
  let test = url.searchParams.get("test") === "1";
  let confirmer = false;

  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const b = await req.json().catch(() => ({}));
    jeton = typeof b.t === "string" ? b.t : jeton;
    campagneId = typeof b.c === "string" ? b.c : campagneId;
    test = b.test === true || b.test === "1" || test;
    confirmer = b.confirmer === true;
  } else {
    // List-Unsubscribe-Post : le client mail confirme par construction.
    const f = await req.text();
    confirmer = /List-Unsubscribe=One-Click/i.test(f);
  }

  const secret = Deno.env.get("ADMIN_UNSUBSCRIBE_SECRET");
  const qui = secret && jeton ? await verifierJeton(secret, jeton) : null;
  if (!qui) return json({ error: "Lien de désinscription invalide" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const site = await chargerSite(admin, qui.appId).catch(() => null);
  if (!site) return json({ error: "Lien de désinscription invalide" }, 400);

  if (!confirmer) return json({ site: site.name, email: qui.email, test, fait: false });

  // Un mail de test ne desinscrit personne : l'adresse est celle de l'operateur.
  if (!test) {
    try {
      const cfg = await chargerConfigMailing(admin, site.id);
      const uuid = campagneId && /^[0-9a-f-]{36}$/i.test(campagneId) ? campagneId : null;
      await ecrivain(admin, site, cfg).desinscrire(qui.email, "demande", uuid);
    } catch (e) {
      console.error("[mailing-desinscription]", site.id, e);
      return json({ error: "La désinscription n'a pas pu être enregistrée. Réessayez dans un instant." }, 500);
    }
  }
  return json({ site: site.name, email: qui.email, test, fait: true });
});
