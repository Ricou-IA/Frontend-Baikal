// baikal-demande : le canal de demandes de la landing publique de Baikal.
//
// POST sans session (verify_jwt off) :
//   {action:'deposer', email, site?, pile?, message?, origine?, site_web?}
//     -> insère (ou met à jour, même email) dans admin.demandes.
//        `site_web` est un honeypot : rempli = robot, on répond OK sans écrire.
// POST avec session super_admin :
//   {action:'lister'}                 -> les demandes, plus récentes d'abord
//   {action:'statut', id, statut}     -> nouvelle | contactee | branchee | ecartee
//
// Garde-fous du dépôt anonyme : taille des champs bornée, email vérifié,
// 5 dépôts max par adresse IP et par heure (compteur en mémoire de l'instance,
// suffisant pour une landing à faible trafic ; l'index unique sur l'email
// borne de toute façon le nombre de lignes).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PILES = ["postgres_stripe", "postgres", "autre_base", "autre"];
const STATUTS = ["nouvelle", "contactee", "branchee", "ecartee"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function texte(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Compteur par IP : {ip: [timestamps]} — vit le temps de l'instance.
const depots = new Map<string, number[]>();
function tropDeDepots(ip: string): boolean {
  const maintenant = Date.now();
  const recents = (depots.get(ip) ?? []).filter((t) => maintenant - t < 3_600_000);
  recents.push(maintenant);
  depots.set(ip, recents);
  return recents.length > 5;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ data: null, error: "Corps JSON attendu" }, 400);
  }
  const action = String(corps.action ?? "deposer");

  // -------------------------------------------------------------------------
  // Dépôt anonyme
  // -------------------------------------------------------------------------
  if (action === "deposer") {
    // Honeypot : un humain ne voit pas ce champ.
    if (texte(corps.site_web, 10)) return json({ data: { ok: true }, error: null });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
    if (tropDeDepots(ip)) return json({ data: null, error: "Trop de demandes, réessayez plus tard" }, 429);

    const email = texte(corps.email, 200)?.toLowerCase() ?? "";
    if (!EMAIL.test(email)) return json({ data: null, error: "Adresse email invalide" }, 400);
    const pileBrute = texte(corps.pile, 30) ?? "autre";
    const ligne = {
      email,
      site: texte(corps.site, 200),
      pile: PILES.includes(pileBrute) ? pileBrute : "autre",
      message: texte(corps.message, 2000),
      origine: texte(corps.origine, 500),
    };
    // Même email = mise à jour de la demande (index unique sur lower(email)).
    const { error } = await admin.schema("admin").from("demandes")
      .upsert(ligne, { onConflict: "email" });
    if (error) {
      console.error("[baikal-demande] insert", error);
      return json({ data: null, error: "Enregistrement impossible, réessayez" }, 500);
    }
    return json({ data: { ok: true }, error: null });
  }

  // -------------------------------------------------------------------------
  // Lecture et suivi : super_admin seulement
  // -------------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ data: null, error: "Non authentifie" }, 401);
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ data: null, error: "Non authentifie" }, 401);
  const { data: profile } = await caller
    .from("profiles").select("app_role").eq("id", user.id).single();
  if (profile?.app_role !== "super_admin") return json({ data: null, error: "Acces refuse" }, 403);

  if (action === "lister") {
    const { data, error } = await admin.schema("admin").from("demandes")
      .select("id, email, site, pile, message, origine, statut, cree_le")
      .order("cree_le", { ascending: false })
      .limit(500);
    if (error) return json({ data: null, error: error.message }, 500);
    return json({ data, error: null });
  }

  if (action === "statut") {
    const id = texte(corps.id, 40);
    const statut = texte(corps.statut, 20) ?? "";
    if (!id || !STATUTS.includes(statut)) return json({ data: null, error: "Statut inconnu" }, 400);
    const { error } = await admin.schema("admin").from("demandes")
      .update({ statut }).eq("id", id);
    if (error) return json({ data: null, error: error.message }, 500);
    return json({ data: { ok: true }, error: null });
  }

  return json({ data: null, error: `Action inconnue: ${action}` }, 400);
});
