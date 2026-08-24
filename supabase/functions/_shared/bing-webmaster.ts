// =============================================================================
// Bing Webmaster Tools — API JSON (porte de Pack Vendeur, multi-sites).
// =============================================================================
// Pourquoi : sur Pré-état-daté, Bing pese ~25 % des clics organiques avec un
// CTR 3x meilleur, et classe page 1 des requetes ou Google laisse en page 3.
// « Bing » agrege Bing + Yahoo + DuckDuckGo + Ecosia (meme index).
//
// LIMITES DE L'API (verifiees cote PV, interface IWebmasterApi) :
//   1. GetQueryStats / GetPageStats n'acceptent AUCUNE plage de dates : agregat
//      courant seulement. Aucun rattrapage historique possible — on n'archive
//      qu'a partir du jour ou on commence.
//   2. GetRankAndTrafficStats renvoie une serie quotidienne — seule source
//      datee, donc seule capable d'alimenter de vrais mois civils.
//   3. Les citations IA (rapport « AI Performance ») ne sont pas exposees.
//
// Multi-sites : contrairement a PV (une seule propriete), chaque appel prend
// `siteUrl` — la propriete DOIT etre verifiee telle quelle dans le compte Bing
// (attention aux variantes www/non-www). Une forme non verifiee rend une
// erreur explicite, pas des zeros.
// Cle : secret `BING_WEBMASTER_API_KEY` (une seule pour tout le compte).
// Absente → l'appelant se contente de Google, pas de plantage.
// =============================================================================

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

export function loadBingApiKey(): string | null {
  return Deno.env.get("BING_WEBMASTER_API_KEY") || null;
}

type BingResult<T> =
  | { status: "success"; rows: T[] }
  | { status: "error"; error: string; httpStatus?: number };

async function bingCall<T>(
  apiKey: string,
  siteUrl: string,
  method: string,
  extra: Record<string, string> = {},
): Promise<BingResult<T>> {
  const params = new URLSearchParams({ apikey: apiKey, siteUrl, ...extra });
  const url = `${API_BASE}/${method}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return { status: "error", error: `network: ${(e as Error).message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    // La cle est dans `url` : ne jamais loguer l'URL.
    return {
      status: "error",
      error: `HTTP ${res.status} on ${method}: ${text.slice(0, 300)}`,
      httpStatus: res.status,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "error", error: `${method}: reponse non JSON (${text.slice(0, 200)})` };
  }

  // L'API enveloppe les resultats dans { d: [...] } (heritage WCF).
  const rows = (parsed as { d?: T[] }).d;
  if (!Array.isArray(rows)) {
    return { status: "error", error: `${method}: enveloppe inattendue (${text.slice(0, 200)})` };
  }
  return { status: "success", rows };
}

/** Dates .NET serialisees en `/Date(1785000000000)/` → 'YYYY-MM-DD'. */
export function parseDotNetDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.match(/\/Date\((-?\d+)/);
  if (!m) return null;
  const d = new Date(Number(m[1]));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export interface BingQueryStat {
  Query?: string;
  Clicks?: number;
  Impressions?: number;
  AvgImpressionPosition?: number;
  AvgClickPosition?: number;
}

export interface BingPageStat {
  Query?: string; // l'API reutilise le champ `Query` pour l'URL de la page
  Clicks?: number;
  Impressions?: number;
  AvgImpressionPosition?: number;
  AvgClickPosition?: number;
}

export interface BingDailyStat {
  Date?: string;
  Clicks?: number;
  Impressions?: number;
}

/** Top requetes — agregat courant, NON date (cf. limite 1). */
export function bingQueryStats(apiKey: string, siteUrl: string) {
  return bingCall<BingQueryStat>(apiKey, siteUrl, "GetQueryStats");
}

/** Top pages — agregat courant, NON date (cf. limite 1). */
export function bingPageStats(apiKey: string, siteUrl: string) {
  return bingCall<BingPageStat>(apiKey, siteUrl, "GetPageStats");
}

/** Serie quotidienne clics/impressions — la seule source datee (cf. limite 2). */
export function bingRankAndTrafficStats(apiKey: string, siteUrl: string) {
  return bingCall<BingDailyStat>(apiKey, siteUrl, "GetRankAndTrafficStats");
}
