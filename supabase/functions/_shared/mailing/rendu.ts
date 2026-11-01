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

// ------ Casse de {{nom}} et {{commune}} ------
//
// Les bases des sites portent ce que les annuaires ont saisi : « PARIS »,
// « Aix-En-Provence », « Era 12 Eme Avenue », des entites HTML
// (« Pont-l&#x27;Eveque »). On remet la casse a l'envoi, sans jamais
// ajouter d'accent ni de tiret.

const ENTITES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decoderEntites(x: string): string {
  return x.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (brut, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : brut;
    }
    return ENTITES[e.toLowerCase()] ?? brut;
  });
}

// « 12 Eme », « 12EME », « 12ème » → « 12ᵉ » ; « 1ER » → « 1er » ;
// « 1ERE » → « 1re » ; « 8E » → « 8e ».
function ordinaux(x: string): string {
  return x
    .replace(/(?<![\p{L}\d])1\s*[eèé]re(?!\p{L})/giu, "1re")
    .replace(/(?<![\p{L}\d])1\s*er(?!\p{L})/giu, "1er")
    .replace(/(?<![\p{L}\d])(\d+)\s*[eèé]me(?!\p{L})/giu, "$1ᵉ")
    .replace(/(?<![\p{L}\d])(\d+)E(?!\p{L})/gu, "$1e");
}

// Premiere lettre en majuscule, apres une ponctuation (« (PARIS) ») mais
// jamais apres un chiffre (« 15E » → « 15e »).
function majuscule(mot: string): string {
  return mot.toLowerCase().replace(/^([^\p{L}\d]*)(\p{L})/u, (_m, avant, l) => avant + l.toUpperCase());
}

interface Recasage {
  // Le mot (en minuscules) est-il un mot de liaison, apres `precedent` ?
  liaison: (mot: string, precedent: string) => boolean;
  // Ecriture imposee d'un sigle, ou null.
  forme?: (mot: string) => string | null;
  // Casse deja mixte : seuls les mots de liaison ecrits « En », « Sur »
  // sont repris, tout le reste est garde tel quel.
  liaisonsSeulement?: boolean;
}

// Mot par mot, separateurs (espaces, tirets) gardes. Un mot de liaison ne
// passe en minuscules qu'entre deux separateurs de meme nature : jamais en
// tete ni en fin (« Castelnau-le-Lez »), ni entre un tiret et une espace
// (« Ingrandes-Le Fresne sur Loire », commune nouvelle). « d' » et « l' » se
// detachent du mot qu'ils precedent : « D'ANGELY » → « d'Angely ».
function recaser(x: string, r: Recasage): string {
  const p = x.replaceAll("’", "'").split(/([\s-]+)/);
  const nature = (sep: string | undefined) => (sep === undefined ? null : sep.includes("-") ? "-" : " ");
  return p.map((m, i) => {
    if (i % 2 === 1 || m === "") return m;
    const premier = i === 0;
    const interieur = !premier && i < p.length - 1 && nature(p[i - 1]) === nature(p[i + 1]);
    const bas = m.toLowerCase();
    const precedent = (p[i - 2] ?? "").toLowerCase();
    if (interieur && r.liaison(bas, precedent)) {
      return r.liaisonsSeulement && m !== majuscule(m) ? m : bas;
    }
    if (r.liaisonsSeulement) return m;
    const elision = /^([dl])'(.+)$/i.exec(m);
    if (elision) return `${premier ? elision[1].toUpperCase() : elision[1].toLowerCase()}'${majuscule(elision[2])}`;
    return r.forme?.(m) ?? majuscule(m);
  }).join("");
}

function uniforme(x: string): boolean {
  return x === x.toUpperCase() || x === x.toLowerCase();
}

const LIAISONS_COMMUNE = new Set([
  "en", "de", "des", "du", "la", "le", "les", "sur", "sous", "lès", "pres", "près", "et", "aux", "au", "à",
  "d", "l", "del", "dels", "di",
]);

// Commune : « LE PUY-EN-VELAY » → « Le Puy-en-Velay », « AIX EN PROVENCE »
// → « Aix en Provence » (les tirets manquants ne sont pas inventes). Une
// commune deja mixte n'a que ses liaisons reprises : « Aix-En-Provence » →
// « Aix-en-Provence », mais « Palau-del-Vidre » et « Carnon plage » restent.
export function casseCommune(x: string | null | undefined): string | null {
  if (!x?.trim()) return x ?? null;
  const v = decoderEntites(x).trim();
  return ordinaux(recaser(v, { liaison: (m) => LIAISONS_COMMUNE.has(m), liaisonsSeulement: !uniforme(v) }));
}

// Sigles d'un nom recase, sous leur forme de marque : formes sociales et
// reseaux d'agences (« iad » s'ecrit en minuscules, « Orpi » en nom
// propre) ; un mot de 2 a 4 lettres sans voyelle (« SCP », « JLM ») reste
// en majuscules.
const SIGLES = new Map(
  ["ERA", "SAFTI", "SCI", "SARL", "SAS", "SASU", "EURL", "SA", "SNC", "SELARL", "SELAS", "SCP", "FNAIM",
    "UNIS", "CIC", "LCL", "BNP", "SNPI", "EI", "EIRL", "iad", "Orpi"].map((s) => [s.toUpperCase(), s]),
);

function sigle(mot: string): string | null {
  const m = mot.toUpperCase();
  if (SIGLES.has(m)) return SIGLES.get(m)!;
  return /^\p{Lu}{2,4}$/u.test(m) && !/[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ]/.test(m) ? m : null;
}

// Mots d'activite : un nom qui en porte un est une agence, pas une personne.
const ACTIVITES = new Set([
  "agence", "agences", "immobilier", "immobiliere", "immobiliers", "conseil", "conseils", "transaction",
  "transactions", "groupe", "group", "cabinet", "notaire", "notaires", "office", "invest", "investissement",
  "patrimoine", "habitat", "gestion", "home", "homes", "realty", "property", "properties", "estate",
  "sarl", "sas", "sasu", "sci", "eurl", "selarl", "snc", "france", "international",
]);

function sansAccent(x: string): string {
  return x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// « Prénom NOM » : 2 a 5 mots, aucun mot d'activite (ni « immo » dans un
// mot : « Saphir Immo », « Babimmo »).
function personne(v: string): boolean {
  const mots = v.split(/\s+/).filter(Boolean);
  if (mots.length < 2 || mots.length > 5) return false;
  return !mots.some((m) => {
    const s = sansAccent(m).replace(/[^\p{L}]/gu, "");
    return ACTIVITES.has(s) || s.includes("immo");
  });
}

// Dans une personne, chaque mot tout en majuscules (2 lettres ou plus)
// passe en nom propre, tiret et apostrophe compris : « D'AURIA » →
// « D'Auria », « MARTIN-DUPONT » → « Martin-Dupont » ; une elision deja en
// minuscule est gardee (« d'AMÉCOURT » → « d'Amécourt »). Un sigle de la
// liste ou un mot sans voyelle reste tel qu'il est ecrit.
function nomDePersonne(v: string): string {
  return v.split(/(\s+)/).map((m) => {
    const [, elision = "", reste = m] = /^([dl]['’])(.+)$/.exec(m) ?? [];
    const lettres = reste.replace(/[^\p{L}]/gu, "");
    if (lettres.length < 2 || lettres !== lettres.toUpperCase() || sigle(lettres) !== null) return m;
    return elision + reste.split(/([-'’])/).map((s, i) => (i % 2 === 1 ? s : majuscule(s))).join("");
  }).join("");
}

// Nom tout en majuscules ou tout en minuscules : recase entierement. Dans un
// nom, le/la/les ne passent en minuscules qu'apres de, a, sur, sous
// (« Agence de la Gare », mais « Jean Le Blanc »). Casse mixte : une
// personne a ses mots en majuscules repris (« Lionel CODINA » → « Lionel
// Codina », « LE TONQUEZE Renée » → « Le Tonqueze Renée ») ; une agence
// (« ERA Immobilier », « Agence ABC Immo ») se garde telle quelle. Les
// ordinaux sont toujours repris.
const LIAISONS_NOM = new Set(["de", "des", "du", "et", "en", "sur", "sous", "aux", "au", "à", "lès"]);
const AVANT_ARTICLE = new Set(["de", "à", "sur", "sous"]);

export function casseNom(x: string | null | undefined): string | null {
  if (!x?.trim()) return x ?? null;
  const v = decoderEntites(x).trim();
  if (!uniforme(v)) return ordinaux(personne(v) ? nomDePersonne(v) : v);
  return ordinaux(recaser(v, {
    liaison: (m, prec) => LIAISONS_NOM.has(m) || (["le", "la", "les"].includes(m) && AVANT_ARTICLE.has(prec)),
    forme: sigle,
  }));
}

export interface Enveloppe {
  corpsHtml: string;
  nomSite: string;
  domaine: string | null;
  lienDesinscription: string | null;
}

// Nom que lit le destinataire (pied, {{site}}) : config.apps.nom_public, la
// marque (« Pre-etat-date.ai »), sinon config.apps.name, le nom de la console
// (« Pack Vendeur »). Jamais expediteur_nom : il peut etre une personne
// (« Eric de MonsieurDPE »).
export function nomPublic(nomPublicSite: string | null | undefined, nomConsole: string): string {
  return nomPublicSite?.trim() || nomConsole;
}

// Casse et accents ignores : « Pré-état-daté.ai » et « pre-etat-date.ai »
// sont le meme nom.
function memeNom(a: string, b: string): boolean {
  const n = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return n(a) === n(b);
}

// Pied commun : qui ecrit, et comment ne plus recevoir. Obligatoire (CNIL,
// et Gmail/Yahoo exigent la desinscription des envois en volume). Un nom egal
// au domaine n'est ecrit qu'une fois, en lien.
function pied(e: Enveloppe): string {
  const lien = (texte: string) =>
    `<a href="https://${echapperHtml(e.domaine!)}" style="color:#6b7280">${echapperHtml(texte)}</a>`;
  const qui = !e.domaine
    ? echapperHtml(e.nomSite)
    : memeNom(e.nomSite, e.domaine)
    ? lien(e.nomSite)
    : `${echapperHtml(e.nomSite)} · ${lien(e.domaine)}`;
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
// clients mail ignorent les feuilles de style). Seul dans son paragraphe —
// le cas de l'editeur —, il devient une cellule de tableau coloree : le fond
// et la marge portes par un <a> (inline-block, padding) sont ignores par
// Outlook et d'autres clients, qui n'affichaient qu'un texte souligne
// surligne de noir (recette du 19/10/2026). Ailleurs, repli en lien style.
const STYLE_LIEN_BOUTON = "color:#ffffff;text-decoration:none;font-weight:600;display:inline-block";

export function styliserBoutons(html: string): string {
  return html
    .replace(/<p>\s*<a href="([^"]*)" data-bouton>([\s\S]*?)<\/a>\s*<\/p>/g, (_m, href, texte) =>
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0">` +
      `<tr><td bgcolor="#111827" style="background:#111827;border-radius:8px;padding:12px 22px">` +
      `<a href="${href}" style="${STYLE_LIEN_BOUTON}">${texte}</a></td></tr></table>`)
    .replace(/<a href="([^"]*)" data-bouton>([\s\S]*?)<\/a>/g, (_m, href, texte) =>
      `<a href="${href}" style="${STYLE_LIEN_BOUTON};margin:8px 0;padding:12px 22px;background:#111827;` +
      `border-radius:8px">${texte}</a>`);
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
