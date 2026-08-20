import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// envoi.ts est une COPIE locale de admin-partenariats/envoi.ts : le deploiement par
// bundle MCP ne suit pas les imports inter-dossiers. Garder les deux copies en phase.
import { normalizeEmail, verifyUnsubscribeToken } from "./envoi.ts";

function escapeHtml(texte: string): string {
  return texte
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(corps: string): Response {
  return new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Desinscription</title>` +
    `<body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:0 16px">${corps}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

serve(async (req) => {
  const url = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const valide = email && token && await verifyUnsubscribeToken(email, token);
  if (!valide) return page(`<p>Lien invalide.</p>`);

  if (req.method === "GET") {
    return page(
      `<p>Ne plus recevoir d'emails a l'adresse <strong>${escapeHtml(normalizeEmail(email))}</strong> ?</p>` +
      `<form method="post"><button type="submit" ` +
      `style="padding:10px 20px;cursor:pointer">Confirmer la desinscription</button></form>`,
    );
  }

  if (req.method === "POST") {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    // Desinscription globale : l'email est retire de TOUS les sites.
    const { error } = await admin.schema("admin").from("prospects")
      .update({ statut: "desinscrit", maj_le: new Date().toISOString() })
      .eq("email", normalizeEmail(email));
    if (error) return page(`<p>Erreur, reessayez plus tard.</p>`);
    return page(`<p>C'est fait. Vous ne recevrez plus d'emails de notre part.</p>`);
  }

  return page(`<p>Methode non supportee.</p>`);
});
