// Rendu d'un mail de campagne : variables, enveloppe, version texte, jeton de
// desinscription. Pur (hors crypto.subtle), teste dans rendu.test.ts.

export interface ValeursMail {
  nom?: string | null;
  email?: string | null;
  commune?: string | null;
  site?: string | null;
}

export const VARIABLES = ["nom", "email", "commune", "site"] as const;

function echapperHtml(x: string): string {
  return x.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// {{nom}} ou {{nom|Madame, Monsieur}} : la valeur si elle existe, sinon le
// repli, sinon rien. Les valeurs viennent de la base du site : echappees en
// HTML (jamais pour l'objet, qui est du texte).
export function remplacerVariables(gabarit: string, valeurs: ValeursMail, html = true): string {
  return gabarit.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (brut, cle: string, repli?: string) => {
    const k = cle.toLowerCase();
    if (!(VARIABLES as readonly string[]).includes(k)) return brut;
    const v = valeurs[k as keyof ValeursMail];
    const texte = (typeof v === "string" && v.trim() !== "") ? v.trim() : (repli ?? "").trim();
    return html ? echapperHtml(texte) : texte;
  });
}

export interface Enveloppe {
  corpsHtml: string;
  nomSite: string;
  domaine: string | null;
  lienDesinscription: string | null;
}

// Pied commun : qui ecrit, et comment ne plus recevoir. Obligatoire (CNIL,
// et Gmail/Yahoo exigent la desinscription des envois en volume).
function pied(e: Enveloppe): string {
  const qui = e.domaine
    ? `${echapperHtml(e.nomSite)} · <a href="https://${echapperHtml(e.domaine)}" style="color:#6b7280">${echapperHtml(e.domaine)}</a>`
    : echapperHtml(e.nomSite);
  const desinscription = e.lienDesinscription
    ? `<br><a href="${echapperHtml(e.lienDesinscription)}" style="color:#6b7280">Se désinscrire</a>`
    : "";
  return `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:18px;color:#6b7280">` +
    `Vous recevez ce message de la part de ${qui}.${desinscription}</div>`;
}

// Un corps qui est deja un document complet (<html>) recoit le pied avant
// </body> ; un fragment est pose dans un gabarit sobre.
export function envelopper(e: Enveloppe): string {
  if (/<html[\s>]/i.test(e.corpsHtml)) {
    return /<\/body>/i.test(e.corpsHtml)
      ? e.corpsHtml.replace(/<\/body>/i, `${pied(e)}</body>`)
      : e.corpsHtml + pied(e);
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:#ffffff">` +
    `<div style="max-width:600px;margin:0 auto;padding:24px 20px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#111827">` +
    `${styliserBoutons(e.corpsHtml)}${pied(e)}</div></body></html>`;
}

// ------ Nettoyage du corps ------
//
// Le corps vient de l'editeur de la console ou de l'IA : on ne garde qu'une
// liste blanche de balises, sans aucun attribut sauf href (http, https,
// mailto) et data-bouton sur un lien. Tout le reste est retire, jamais
// interprete : un mail ne doit porter ni script, ni style, ni image pistee.

const BALISES = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "h2", "h3"]);

export function nettoyerCorps(html: string): string {
  return html
    .replace(/<(script|style|head|title|iframe|object)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (brut, nom: string, attrs: string) => {
      const n = nom.toLowerCase();
      if (!BALISES.has(n)) return "";
      if (brut.startsWith("</")) return `</${n}>`;
      if (n === "a") {
        const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /href\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? "";
        const sur = /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim().replaceAll('"', "%22") : "";
        const bouton = /data-bouton/i.test(attrs) ? " data-bouton" : "";
        return sur ? `<a href="${sur}"${bouton}>` : "<a>";
      }
      return n === "br" ? "<br>" : `<${n}>`;
    });
}

// Un lien marque data-bouton devient un bouton (styles en ligne : les
// clients mail ignorent les feuilles de style).
export function styliserBoutons(html: string): string {
  return html.replace(/<a href="([^"]*)" data-bouton>([\s\S]*?)<\/a>/g, (_m, href, texte) =>
    `<a href="${href}" style="display:inline-block;margin:8px 0;padding:12px 22px;background:#111827;color:#ffffff;` +
    `text-decoration:none;border-radius:8px;font-weight:600">${texte}</a>`);
}

// Version texte derivee du HTML : sans elle, les filtres anti-spam penalisent.
export function versTexte(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const t = txt.replace(/<[^>]+>/g, "").trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ------ Jeton de desinscription ------
//
// base64url(JSON {s: app_id, e: email}) + "." + HMAC-SHA256 hex. Le site et
// l'adresse voyagent ensemble et signes : on ne peut desinscrire personne
// d'autre en modifiant l'URL.

function b64url(texte: string): string {
  const octets = new TextEncoder().encode(texte);
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function deB64url(x: string): string {
  const b = x.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signerJeton(secret: string, appId: string, email: string): Promise<string> {
  const charge = b64url(JSON.stringify({ s: appId, e: email.trim().toLowerCase() }));
  return `${charge}.${await hmacHex(secret, charge)}`;
}

export async function verifierJeton(
  secret: string,
  jeton: string,
): Promise<{ appId: string; email: string } | null> {
  const [charge, sig] = jeton.split(".");
  if (!charge || !sig) return null;
  const attendu = await hmacHex(secret, charge);
  if (attendu.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const { s, e } = JSON.parse(deB64url(charge));
    return typeof s === "string" && typeof e === "string" ? { appId: s, email: e } : null;
  } catch {
    return null;
  }
}
