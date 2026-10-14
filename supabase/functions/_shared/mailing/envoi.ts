// Envoi Resend et verification des webhooks (Svix), quotas et coupe-circuit.
// Les fonctions de decision sont pures (envoi.test.ts).

// ------ Quota du jour et coupe-circuit ------

export const PLAFOND_JOUR_DEFAUT = 200;
export const LOT_MAX = 50;
export const ECHANTILLON_MIN = 50;
export const SEUIL_REBONDS = 0.05;
export const SEUIL_PLAINTES = 0.003;

export function tailleLot(plafond: number | null, envoyesAujourdhui: number): number {
  const p = plafond && plafond > 0 ? plafond : PLAFOND_JOUR_DEFAUT;
  return Math.max(0, Math.min(LOT_MAX, p - envoyesAujourdhui));
}

// Les rebonds DEFINITIFS et les plaintes grillent la reputation du domaine :
// passe un echantillon minimal, la campagne s'arrete seule.
export function evaluerDisjoncteur(
  s: { envoyes: number; rebondsDurs: number; plaintes: number },
): { coupe: false } | { coupe: true; motif: string } {
  if (s.envoyes < ECHANTILLON_MIN) return { coupe: false };
  const tauxRebonds = s.rebondsDurs / s.envoyes;
  const tauxPlaintes = s.plaintes / s.envoyes;
  if (tauxRebonds > SEUIL_REBONDS) {
    return {
      coupe: true,
      motif: `Coupe-circuit : ${s.rebondsDurs} rebonds définitifs sur ${s.envoyes} envois ` +
        `(${(tauxRebonds * 100).toFixed(1)} % > 5 %). Nettoyer la liste avant de reprendre.`,
    };
  }
  if (tauxPlaintes > SEUIL_PLAINTES) {
    return {
      coupe: true,
      motif: `Coupe-circuit : ${s.plaintes} plainte(s) pour spam sur ${s.envoyes} envois ` +
        `(${(tauxPlaintes * 100).toFixed(2)} % > 0,3 %).`,
    };
  }
  return { coupe: false };
}

// Minuit local du fuseau du site, en instant UTC. Calcule en TypeScript,
// jamais en SQL (CLAUDE.md : postgres.js envoie ses parametres sans type).
export function debutJourLocal(fuseau: string, maintenant = new Date()): Date {
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(maintenant).map((p) => [p.type, p.value]),
  );
  // Decalage du fuseau a cet instant = heure murale lue comme UTC - instant.
  const murale = Date.UTC(+parties.year, +parties.month - 1, +parties.day,
    +parties.hour, +parties.minute, +parties.second);
  const decalage = murale - Math.floor(maintenant.getTime() / 1000) * 1000;
  const minuitMural = Date.UTC(+parties.year, +parties.month - 1, +parties.day);
  return new Date(minuitMural - decalage);
}

// ------ Resend ------

export interface MessageResend {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  // Resend dedoublonne 24 h sur cette cle : un lot rejoue apres un crash ne
  // renvoie pas le mail deja parti.
  idempotencyKey?: string;
}

export interface ResultatEnvoi {
  ok: boolean;
  id?: string;
  erreur?: string;
  // Erreur de configuration (cle invalide, domaine non verifie) : inutile de
  // continuer le lot, chaque envoi echouerait pareil.
  fatale?: boolean;
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function envoyerResend(cle: string, m: MessageResend): Promise<ResultatEnvoi> {
  const corps = JSON.stringify({
    from: m.from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
    ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    ...(m.headers ? { headers: m.headers } : {}),
    ...(m.tags ? { tags: m.tags } : {}),
  });
  for (let essai = 0; essai < 3; essai++) {
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cle}`,
          "Content-Type": "application/json",
          ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
        },
        body: corps,
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      if (essai < 2) { await attendre(1000); continue; }
      return { ok: false, erreur: `Resend injoignable: ${(e as Error).message}` };
    }
    if (res.ok) {
      const data = await res.json();
      return { ok: true, id: data.id };
    }
    const texte = (await res.text()).slice(0, 300);
    if (res.status === 429 && essai < 2) { await attendre(1500 * (essai + 1)); continue; }
    return {
      ok: false,
      erreur: `Resend ${res.status}: ${texte}`,
      fatale: res.status === 401 || res.status === 403,
    };
  }
  return { ok: false, erreur: "Resend : trop de requêtes" };
}

// ------ Webhook Resend (Svix) ------
//
// Contenu signe : "<svix-id>.<svix-timestamp>.<corps brut>", HMAC-SHA256 avec
// la cle base64 qui suit "whsec_", signature base64 dans "v1,<sig>" (plusieurs
// possibles, separees par des espaces). Fenetre de 5 minutes contre le rejeu.

function base64VersOctets(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function octetsVersBase64(o: Uint8Array): string {
  let bin = "";
  for (const x of o) bin += String.fromCharCode(x);
  return btoa(bin);
}

export async function signerSvix(secret: string, id: string, horodatage: string, corps: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    "raw", base64VersOctets(secret.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${id}.${horodatage}.${corps}`));
  return octetsVersBase64(new Uint8Array(sig));
}

export async function verifierSvix(
  secret: string,
  entetes: { id: string | null; horodatage: string | null; signature: string | null },
  corps: string,
  maintenant = Date.now(),
): Promise<boolean> {
  const { id, horodatage, signature } = entetes;
  if (!id || !horodatage || !signature) return false;
  const t = Number(horodatage);
  if (!Number.isFinite(t) || Math.abs(maintenant / 1000 - t) > 300) return false;
  const attendue = await signerSvix(secret, id, horodatage, corps);
  return signature.split(" ").some((s) => {
    const [, valeur] = s.split(",");
    if (!valeur || valeur.length !== attendue.length) return false;
    let diff = 0;
    for (let i = 0; i < valeur.length; i++) diff |= valeur.charCodeAt(i) ^ attendue.charCodeAt(i);
    return diff === 0;
  });
}

// Type d'evenement Resend -> type du module mailing-v1. null = ignore.
export function typeEvenement(type: unknown): string | null {
  const t = typeof type === "string" ? type.replace(/^email\./, "") : "";
  return ["delivered", "opened", "clicked", "bounced", "complained"].includes(t) ? t : null;
}

// Tags Resend : objet {nom: valeur} dans les webhooks, tableau a l'envoi.
export function lireTag(tags: unknown, nom: string): string | null {
  if (Array.isArray(tags)) {
    const t = tags.find((x) => x && typeof x === "object" && (x as { name?: unknown }).name === nom);
    const v = (t as { value?: unknown } | undefined)?.value;
    return typeof v === "string" ? v : null;
  }
  if (tags && typeof tags === "object") {
    const v = (tags as Record<string, unknown>)[nom];
    return typeof v === "string" ? v : null;
  }
  return null;
}

// Du lundi au vendredi dans le fuseau du site (les jours feries ne sont pas
// connus : comme pv-email-cron, seul le week-end est saute).
export function estJourOuvre(fuseau: string, maintenant = new Date()): boolean {
  const jour = new Intl.DateTimeFormat("en-US", { timeZone: fuseau, weekday: "short" }).format(maintenant);
  return jour !== "Sat" && jour !== "Sun";
}
