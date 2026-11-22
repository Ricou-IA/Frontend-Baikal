// Client de l'API publique de Pennylane (v2) pour la facturation des ventes.
// Entrees-sorties uniquement : ce qui decide d'un montant ou d'un corps de
// requete est dans facturation.ts.
//
// Le jeton vit dans le secret ADMIN_PENNYLANE_TOKEN. Il n'est jamais journalise,
// ni rendu dans une reponse.
//
// Constats repris de la documentation (lue le 22/11/2026) et de Majord'home :
//   - pagination par `limit` + `cursor` ; reponse { items, has_more, next_cursor } ;
//   - `filter` est un tableau JSON encode ; un filtre peut etre IGNORE par l'API :
//     tout resultat se revalide localement ;
//   - 25 requetes par 5 secondes : sur un 429 on attend `retry-after` ;
//   - le PDF d'une facture tout juste finalisee n'est pas toujours pret :
//     `public_file_url` reste vide quelques instants. Le mail part de Resend,
//     pas de Pennylane.
// deno-lint-ignore-file no-explicit-any
import type { CompteLu } from "./facturation.ts";

const BASE = "https://app.pennylane.com/api/external/v2";
const ESSAIS_429 = 3;

export class ErreurPennylane extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly etape: string,
  ) {
    super(message);
  }
}

function jeton(): string {
  const j = Deno.env.get("ADMIN_PENNYLANE_TOKEN");
  if (!j) throw new ErreurPennylane("Secret ADMIN_PENNYLANE_TOKEN absent", 500, "configuration");
  return j;
}

function messageErreur(data: any): string {
  const m = data?.error ?? data?.message ?? data?.errors ?? data;
  const texte = typeof m === "string" ? m : JSON.stringify(m ?? "");
  return texte.slice(0, 400);
}

/** Un appel. Rend { statut, data } pour tout statut < 500 que l'appelant sait
 *  lire ; leve ErreurPennylane sinon. `attendus` liste les statuts acceptes. */
async function appel(
  etape: string,
  methode: string,
  chemin: string,
  corps?: unknown,
  attendus: number[] = [200, 201, 204],
): Promise<{ statut: number; data: any }> {
  for (let essai = 0;; essai++) {
    const res = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${jeton()}`,
        Accept: "application/json",
        ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
    if (res.status === 429 && essai < ESSAIS_429) {
      const attente = Number.parseInt(res.headers.get("retry-after") ?? "2", 10) || 2;
      await new Promise((r) => setTimeout(r, Math.min(attente, 10) * 1000));
      continue;
    }
    const brut = res.status === 204 ? "" : await res.text();
    let data: any = null;
    try {
      data = brut ? JSON.parse(brut) : null;
    } catch {
      data = brut;
    }
    if (!attendus.includes(res.status)) {
      throw new ErreurPennylane(
        `Pennylane a répondu ${res.status} (${etape}) : ${messageErreur(data)}`,
        res.status,
        etape,
      );
    }
    return { statut: res.status, data };
  }
}

function filtre(conditions: unknown[]): string {
  return encodeURIComponent(JSON.stringify(conditions));
}

/** Societe et perimetres du jeton. Lecture seule. */
export async function moi(): Promise<{ societe: string | null; perimetres: string[] }> {
  const { data } = await appel("jeton", "GET", "/me");
  return {
    societe: data?.company?.name ?? null,
    perimetres: Array.isArray(data?.scopes) ? data.scopes.map(String) : [],
  };
}

/** Toutes les declinaisons d'un numero de compte (une par taux de TVA). */
export async function comptesDuNumero(numero: string): Promise<CompteLu[]> {
  const trouves = new Map<number, CompteLu>();
  let curseur: string | null = null;
  for (let page = 0; page < 20; page++) {
    let chemin = `/ledger_accounts?limit=100&filter=${
      filtre([{ field: "number", operator: "start_with", value: numero }])
    }`;
    if (curseur) chemin += `&cursor=${encodeURIComponent(curseur)}`;
    const { data } = await appel("plan comptable", "GET", chemin);
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    // Revalidation locale : le filtre peut etre ignore.
    for (const c of items) {
      if (String(c?.number) === numero) {
        trouves.set(Number(c.id), {
          id: Number(c.id),
          number: String(c.number),
          vat_rate: c.vat_rate ?? null,
          country_alpha2: c.country_alpha2 ?? null,
          enabled: c.enabled ?? null,
        });
      }
    }
    curseur = data?.has_more && data?.next_cursor ? String(data.next_cursor) : null;
    if (!curseur) break;
  }
  return [...trouves.values()];
}

/** Le client qui porte cette adresse e-mail, ou null. S'il y en a plusieurs,
 *  le plus ancien : c'est celui que la comptabilite connait deja. */
export async function chercherClient(email: string): Promise<{ id: number; nom: string } | null> {
  const { data } = await appel(
    "recherche du client",
    "GET",
    `/customers?limit=100&filter=${filtre([{ field: "emails", operator: "in", value: [email] }])}`,
  );
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const memes = items
    .filter((c) => Array.isArray(c?.emails) && c.emails.some((e: unknown) => String(e).toLowerCase() === email))
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (memes.length === 0) return null;
  return { id: Number(memes[0].id), nom: String(memes[0].name ?? "") };
}

export async function creerClient(chemin: string, corps: Record<string, unknown>): Promise<number> {
  const { data } = await appel("création du client", "POST", chemin, corps, [200, 201]);
  const id = Number(data?.id);
  if (!Number.isFinite(id)) {
    throw new ErreurPennylane("Pennylane n'a pas rendu l'identifiant du client", 502, "création du client");
  }
  return id;
}

export interface FactureLue {
  id: number;
  brouillon: boolean;
  numero: string | null;
  date: string | null;
  reference: string | null;
  /** Le client de la facture : c'est a sa fiche que le mail est adresse. */
  clientId: number | null;
  /** Adresse du PDF, a duree limitee ; null tant que Pennylane ne l'a pas genere. */
  pdfUrl: string | null;
  brut: any;
}

function lire(data: any): FactureLue {
  const id = Number(data?.id);
  if (!Number.isFinite(id)) {
    throw new ErreurPennylane("Pennylane n'a pas rendu l'identifiant de la facture", 502, "facture");
  }
  return {
    id,
    brouillon: data?.draft === true || data?.status === "draft",
    numero: data?.invoice_number ? String(data.invoice_number) : null,
    date: data?.date ? String(data.date) : null,
    reference: data?.external_reference ? String(data.external_reference) : null,
    clientId: Number.isFinite(Number(data?.customer?.id)) && data?.customer?.id != null
      ? Number(data.customer.id)
      : null,
    pdfUrl: typeof data?.public_file_url === "string" && data.public_file_url ? data.public_file_url : null,
    brut: data,
  };
}

export async function creerBrouillon(corps: Record<string, unknown>): Promise<FactureLue> {
  const { data } = await appel("création du brouillon", "POST", "/customer_invoices", corps, [200, 201]);
  return lire(data);
}

/** La facture, ou null si elle n'existe plus (brouillon supprime dans Pennylane). */
export async function lireFacture(id: number): Promise<FactureLue | null> {
  const { statut, data } = await appel(
    "lecture de la facture",
    "GET",
    `/customer_invoices/${id}`,
    undefined,
    [200, 404],
  );
  return statut === 404 ? null : lire(data);
}

/** Change la date d'un brouillon (et son echeance) : une facture est datee du
 *  jour ou elle devient definitive, pas du jour ou le brouillon a ete cree. */
export async function daterBrouillon(id: number, jour: string): Promise<FactureLue> {
  const { data } = await appel(
    "date du brouillon",
    "PUT",
    `/customer_invoices/${id}`,
    { date: jour, deadline: jour },
    [200],
  );
  return lire(data);
}

/** Les adresses e-mail de la fiche d'un client. */
export async function emailsDuClient(id: number): Promise<string[]> {
  const { data } = await appel("lecture du client", "GET", `/customers/${id}`);
  const emails: unknown[] = Array.isArray(data?.emails) ? data.emails : [];
  return emails.map((e) => String(e).trim()).filter((e) => e.includes("@"));
}

/** Le PDF d'une facture definitive, en octets. null = Pennylane ne l'a pas
 *  encore genere : ce n'est pas une erreur, l'envoi se rejoue plus tard. */
export async function pdfFacture(id: number): Promise<Uint8Array | null> {
  const facture = await lireFacture(id);
  if (!facture?.pdfUrl) return null;
  const res = await fetch(facture.pdfUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new ErreurPennylane(`Le PDF de la facture a répondu ${res.status}`, 502, "lecture du PDF");
  }
  const octets = new Uint8Array(await res.arrayBuffer());
  // « %PDF » : on n'envoie jamais au client autre chose qu'un PDF.
  if (octets.length < 5 || octets[0] !== 0x25 || octets[1] !== 0x50 || octets[2] !== 0x44 || octets[3] !== 0x46) {
    throw new ErreurPennylane("Le fichier rendu par Pennylane n'est pas un PDF", 502, "lecture du PDF");
  }
  return octets;
}

/** Rend la facture definitive : elle prend son numero et ne se modifie plus. */
export async function finaliser(id: number): Promise<FactureLue> {
  const { data } = await appel("finalisation", "PUT", `/customer_invoices/${id}/finalize`, undefined, [200]);
  return lire(data);
}

/** Supprime un brouillon (jamais une facture definitive : Pennylane le refuse).
 *  Un brouillon deja disparu (404) est un brouillon supprime. */
export async function supprimerBrouillon(id: number): Promise<void> {
  await appel("suppression du brouillon", "DELETE", `/customer_invoices/${id}`, undefined, [204, 404]);
}
