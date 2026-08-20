// Resend + token de desinscription (HMAC-SHA256 hex sur l'email minuscule, fail closed).
// ⚠ Ce fichier est COPIE dans admin-desinscription/envoi.ts : le deploiement par
// bundle MCP ne suit pas les imports inter-dossiers. Toute modification doit etre
// reportee dans les deux copies.

const RESEND_API_URL = "https://api.resend.com/emails";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUnsubscribeToken(email: string): Promise<string | null> {
  const secret = Deno.env.get("ADMIN_UNSUBSCRIBE_SECRET");
  if (!secret) return null; // fail closed : pas de secret, pas de lien, pas d'envoi
  return await hmacHex(secret, normalizeEmail(email));
}

export async function verifyUnsubscribeToken(email: string, token: string): Promise<boolean> {
  const attendu = await signUnsubscribeToken(email);
  if (!attendu || attendu.length !== token.length) return false;
  // comparaison a temps constant
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function buildUnsubscribeUrl(email: string): Promise<string | null> {
  const token = await signUnsubscribeToken(email);
  if (!token) return null;
  const base = Deno.env.get("SUPABASE_URL");
  return `${base}/functions/v1/admin-desinscription?e=${encodeURIComponent(normalizeEmail(email))}&t=${token}`;
}

export function renderTemplate(tpl: string, prospect: Record<string, unknown>): string {
  return tpl
    .replaceAll("{{prenom}}", String(prospect.prenom ?? ""))
    .replaceAll("{{nom}}", String(prospect.nom ?? ""))
    .replaceAll("{{entreprise}}", String(prospect.entreprise ?? ""));
}

export async function sendOneEmail(
  fromName: string, fromEmail: string, replyTo: string,
  to: string, subject: string, html: string,
): Promise<{ ok: boolean; resendId?: string; error?: string }> {
  const apiKey = Deno.env.get("ADMIN_RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "Secret ADMIN_RESEND_API_KEY absent" };
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to, subject, html, reply_to: replyTo,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 300)}` };
  }
  const data = await res.json();
  return { ok: true, resendId: data.id };
}
