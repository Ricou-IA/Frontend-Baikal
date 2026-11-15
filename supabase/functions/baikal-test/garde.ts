// Les garde-fous de baikal-test. La fonction est publique et ouvre une
// connexion vers un hôte choisi par un inconnu : sans ces refus, elle
// servirait à sonder le réseau de la plateforme. PUR, sans dépendance.
//
//   - Postgres uniquement, utilisateur et mot de passe exigés, SSL jamais coupé ;
//   - refus de localhost, des adresses privées et des noms internes à la
//     plateforme, y compris quand un nom public RÉSOUT vers une adresse privée
//     (ipInterdite se rejoue sur chaque adresse résolue) ;
//   - dix tests par adresse IP et par heure ;
//   - la connexion n'est jamais écrite ni journalisée : il n'en reste qu'une
//     empreinte, et les erreurs sont redites sans hôte ni identifiant.

export interface Connexion {
  hote: string;
  port: number;
  utilisateur: string;
  motDePasse: string;
  base: string;
}

export type LectureConnexion = { ok: true; connexion: Connexion } | { ok: false; erreur: string };

const FORME = "Connexion attendue sous la forme postgresql://utilisateur:motdepasse@hôte:port/base.";

export function lireConnexion(saisie: unknown): LectureConnexion {
  const refus = (erreur: string): LectureConnexion => ({ ok: false, erreur });
  if (typeof saisie !== "string") return refus(FORME);
  const texte = saisie.trim();
  if (texte.length > 2000) return refus("Connexion trop longue.");
  const schema = /^([a-z][a-z0-9+.-]*):\/\//i.exec(texte)?.[1]?.toLowerCase();
  if (!schema) return refus(FORME);
  if (schema !== "postgres" && schema !== "postgresql") {
    return refus(`Baikal ne lit que Postgres : cette connexion est de type « ${schema} ».`);
  }
  let url: URL;
  try {
    url = new URL(texte);
  } catch {
    return refus(FORME);
  }
  let utilisateur: string, motDePasse: string, base: string;
  try {
    utilisateur = decodeURIComponent(url.username);
    motDePasse = decodeURIComponent(url.password);
    base = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
  } catch {
    return refus(FORME);
  }
  if (!url.hostname) return refus(FORME);
  if (!utilisateur) return refus("Il manque l'utilisateur : " + FORME);
  if (!motDePasse) return refus("Il manque le mot de passe : " + FORME);
  if (url.searchParams.get("sslmode") === "disable") {
    return refus("SSL exigé : Baikal ne se connecte qu'en chiffré, retirez sslmode=disable.");
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return refus("Ce port n'est pas un port de base de données (attendu : 1024 à 65535, 5432 ou 6543 le plus souvent).");
  }
  const interdit = hoteInterdit(url.hostname);
  if (interdit) return refus(interdit);
  return { ok: true, connexion: { hote: url.hostname.replace(/^\[|\]$/g, ""), port, utilisateur, motDePasse, base } };
}

// ---------------------------------------------------------------------------
// Hôtes et adresses
// ---------------------------------------------------------------------------

const REFUS_HOTE = "Cette adresse n'est pas joignable depuis Baikal : il faut l'adresse publique de votre base.";

// Quatre octets décimaux SANS zéro initial : « 0177.0.0.1 » se lit en octal
// (127.0.0.1) chez certains résolveurs, il n'est donc pas une adresse ici.
function ipv4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const textes = m.slice(1);
  if (textes.some((t) => t.length > 1 && t.startsWith("0"))) return null;
  const octets = textes.map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function v4Interdite([a, b]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19));
}

// Les huit groupes d'une IPv6, quelle que soit son écriture (« :: », zéros
// initiaux, IPv4 en queue). Une adresse se juge sur ses groupes, jamais sur
// son texte : « 0:0:0:0:0:0:0:1 » est ::1.
function ipv6(adresse: string): number[] | null {
  let texte = adresse;
  const queue = /(^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(texte);
  if (queue) {
    const v4 = ipv4(queue[2]);
    if (!v4) return null;
    const hexa = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]].map((n) => n.toString(16)).join(":");
    texte = texte.slice(0, texte.length - queue[2].length) + hexa;
  }
  const moities = texte.split("::");
  if (moities.length > 2) return null;
  const groupes = (partie: string) => (partie ? partie.split(":") : []);
  const tete = groupes(moities[0]);
  const fin = moities.length === 2 ? groupes(moities[1]) : [];
  const manquants = 8 - tete.length - fin.length;
  if (moities.length === 2 ? manquants < 1 : manquants !== 0) return null;
  const tous = [...tete, ...Array(moities.length === 2 ? manquants : 0).fill("0"), ...fin];
  if (!tous.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return tous.map((g) => parseInt(g, 16));
}

export function ipInterdite(ip: string): boolean {
  const adresse = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = ipv4(adresse);
  if (v4) return v4Interdite(v4);
  // Ni IPv4 ni IPv6 lisible (identifiant de zone compris) : on refuse.
  const g = ipv6(adresse);
  if (!g) return true;
  const enV4 = (haut: number, bas: number) => v4Interdite([haut >> 8, haut & 255, bas >> 8, bas & 255]);
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(7) && g[7] <= 1) return true; // :: et ::1
  if (zeros(5) && g[5] === 0xffff) return enV4(g[6], g[7]); // IPv4 enrobée
  if (zeros(6)) return enV4(g[6], g[7]); // IPv4 « compatible »
  if (g[0] === 0x64 && g[1] === 0xff9b) return enV4(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return enV4(g[1], g[2]); // 6to4
  return (g[0] & 0xfe00) === 0xfc00 || // fc00::/7, locales uniques
    (g[0] & 0xff80) === 0xfe80 || // fe80::/9 : lien (fe80::/10) et site (fec0::/10)
    (g[0] & 0xff00) === 0xff00; // multidiffusion
}

// Rend la raison du refus, ou null si l'hôte peut être tenté.
export function hoteInterdit(saisi: string): string | null {
  const hote = saisi.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hote) return REFUS_HOTE;
  if (hote.includes(":") || ipv4(hote)) return ipInterdite(hote) ? REFUS_HOTE : null;
  // Une adresse écrite en entier, en hexadécimal ou en octal contourne la
  // lecture par octets : refusée d'office.
  if (/^[0-9.]+$/.test(hote) || /^0x/.test(hote)) return REFUS_HOTE;
  if (hote === "localhost" || /\.(localhost|internal|local|lan|home\.arpa)$/.test(hote)) return REFUS_HOTE;
  // Un nom sans point est un nom du réseau interne (supabase_db, kong, db).
  if (!hote.includes(".")) return REFUS_HOTE;
  return null;
}

// ---------------------------------------------------------------------------
// Débit, jeton, empreinte
// ---------------------------------------------------------------------------

// Compteur en mémoire de l'instance, comme baikal-demande : suffisant pour une
// page sans lien, et la borne dure reste le délai de chaque test.
export function limiteur(max: number, fenetreMs: number): (ip: string, maintenant: number) => boolean {
  const passages = new Map<string, number[]>();
  return (ip, maintenant) => {
    const recents = (passages.get(ip) ?? []).filter((t) => maintenant - t < fenetreMs);
    recents.push(maintenant);
    passages.set(ip, recents);
    return recents.length > max;
  };
}

const hex = (octets: Uint8Array) => [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");

// 128 bits tirés au hasard : le jeton EST le droit de relire le résultat.
export function nouveauJeton(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export function jetonValide(jeton: unknown): jeton is string {
  return typeof jeton === "string" && /^[0-9a-f]{32}$/.test(jeton);
}

// L'hôte n'est jamais gardé en clair : son empreinte suffit à savoir que deux
// tests visent la même base. Le sel (un secret du projet) empêche de la
// retrouver en essayant des noms d'hôtes.
export async function empreinte(c: Pick<Connexion, "hote" | "port" | "base">, sel: string): Promise<string> {
  const encodeur = new TextEncoder();
  const cle = await crypto.subtle.importKey("raw", encodeur.encode(sel), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cle, encodeur.encode(`${c.hote}:${c.port}/${c.base}`));
  return hex(new Uint8Array(signature));
}

// ---------------------------------------------------------------------------
// Les erreurs de connexion, redites sans rien qui identifie la base
// ---------------------------------------------------------------------------

export function messageConnexion(erreur: unknown): string {
  const e = (erreur ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  if (code === "28P01" || code === "28000") return "Connexion refusée : utilisateur ou mot de passe incorrect.";
  if (code === "3D000") return "La base demandée n'existe pas sur ce serveur.";
  if (code === "ECONNREFUSED") return "Le serveur refuse la connexion sur ce port.";
  if (code === "CONNECT_TIMEOUT" || code === "ETIMEDOUT") return "Le serveur n'a pas répondu en 10 s : vérifiez l'adresse, le port et le pare-feu.";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Hôte introuvable : vérifiez l'adresse.";
  if (/ssl|tls/i.test(code) || /does not support SSL|SSL|TLS/.test(message)) {
    return "Le serveur n'accepte pas SSL : Baikal exige une connexion chiffrée.";
  }
  // Le message brut peut citer l'hôte ou l'utilisateur : seul un code sobre passe.
  return "Connexion impossible." + (/^[A-Z0-9_]{2,30}$/.test(code) ? ` (code ${code})` : "");
}
