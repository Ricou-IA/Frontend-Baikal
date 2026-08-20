// Client Google Search Console (Search Analytics v3).
// Auth par OAuth refresh token, repris de Pack Vendeur. La propriete interrogee
// est un parametre : une seule paire de credentials, N proprietes partagees au
// meme compte Google.

export const GSC_DATA_LAG_DAYS = 3;

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function getConfig() {
  const clientId = Deno.env.get("GOOGLE_GSC_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_GSC_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_GSC_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Secrets GOOGLE_GSC_OAUTH_* manquants");
  }
  return { clientId, clientSecret, refreshToken };
}

async function fetchAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const cfg = getConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth Google ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  cachedAccessToken = {
    value: json.access_token,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) * 1000),
  };
  return json.access_token;
}

export type GscDimension = "query" | "page" | "country" | "device" | "date";

export interface GscRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function searchAnalytics(
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: GscDimension[] = [],
  rowLimit = 1000,
): Promise<GscRow[]> {
  const accessToken = await fetchAccessToken();
  const url =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const body: Record<string, unknown> = {
    startDate,
    endDate,
    rowLimit: Math.min(Math.max(rowLimit, 1), 5000),
    dataState: "all",
  };
  // dimensions=[] : on OMET la cle, Google rend alors une ligne agregee.
  if (dimensions.length > 0) body.dimensions = dimensions;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`GSC ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return (json.rows ?? []) as GscRow[];
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Fenetre de `days` jours ancree a J-3 (GSC ne consolide pas les 2-3 derniers
// jours ; une fenetre finissant aujourd'hui produirait un faux signal de chute).
export function windowAnchored(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - GSC_DATA_LAG_DAYS);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

// La fenetre de meme longueur immediatement anterieure.
export function previousWindow(days: number): { startDate: string; endDate: string } {
  const current = windowAnchored(days);
  const end = new Date(current.startDate + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}
