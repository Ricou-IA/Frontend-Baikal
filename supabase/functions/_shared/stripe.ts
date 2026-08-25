// Lecture du compte Stripe pour le module Financier.
// Deux listes paginees par periode, jamais un appel par transaction :
//   - balance_transactions -> l'argent reel (encaisse, frais, remboursements)
//   - checkout/sessions    -> la qualification (produit, prix, metadata)
// Elles se rejoignent sur le payment_intent. C'est ce qui supprime le plafond
// de lookups qui sous-estime les frais dans pv-admin-financial-summary.
const STRIPE_BASE = "https://api.stripe.com/v1";
const PAGE = 100;

export class ErreurStripe extends Error {}

export interface TxStripe {
  id: string;
  type: string; // charge | payment | refund | payment_refund | stripe_fee ...
  amount_eur: number; // negatif pour un remboursement
  fee_eur: number;
  created: number; // epoch secondes
  payment_intent: string | null;
}

export interface LigneProduit {
  product: string | null;
  price: string | null;
  libelle: string;
}

export interface SessionStripe {
  payment_intent: string | null;
  metadata: Record<string, string>;
  produits: LigneProduit[];
}

function centimes(v: unknown): number {
  const n = typeof v === "number" ? v : 0;
  return Number((n / 100).toFixed(2));
}

// deno-lint-ignore no-explicit-any
async function lister(cle: string, chemin: string, base: URLSearchParams): Promise<any[]> {
  const items: unknown[] = [];
  let apres: string | null = null;

  for (;;) {
    const params = new URLSearchParams(base);
    if (apres) params.set("starting_after", apres);
    const res = await fetch(`${STRIPE_BASE}${chemin}?${params}`, {
      headers: { Authorization: `Bearer ${cle}` },
    });
    if (!res.ok) {
      throw new ErreurStripe(`${chemin} a repondu ${res.status}`);
    }
    const page = await res.json();
    const data = Array.isArray(page?.data) ? page.data : [];
    items.push(...data);
    if (!page?.has_more || data.length === 0) break;
    apres = data[data.length - 1]?.id ?? null;
    if (!apres) break;
  }
  // deno-lint-ignore no-explicit-any
  return items as any[];
}

function bornes(debut: Date, fin: Date): URLSearchParams {
  const p = new URLSearchParams();
  p.set("created[gte]", String(Math.floor(debut.getTime() / 1000)));
  p.set("created[lte]", String(Math.floor(fin.getTime() / 1000)));
  p.set("limit", String(PAGE));
  return p;
}

/** Mouvements d'argent de la periode. `expand[]=data.source` est ce qui donne
 *  le payment_intent : sans lui la transaction ne porte que l'id de charge. */
export async function listerTransactions(
  cle: string,
  debut: Date,
  fin: Date,
): Promise<TxStripe[]> {
  const params = bornes(debut, fin);
  params.append("expand[]", "data.source");
  const lignes = await lister(cle, "/balance_transactions", params);

  return lignes.map((t) => ({
    id: String(t.id),
    type: String(t.type ?? ""),
    amount_eur: centimes(t.amount),
    fee_eur: centimes(t.fee),
    created: Number(t.created ?? 0),
    payment_intent: typeof t.source === "object" && t.source
      ? (t.source.payment_intent ?? null)
      : null,
  }));
}

/** Sessions de paiement de la periode, avec leurs lignes de commande. */
export async function listerSessions(
  cle: string,
  debut: Date,
  fin: Date,
): Promise<SessionStripe[]> {
  const params = bornes(debut, fin);
  params.append("expand[]", "data.line_items");
  // Seules les sessions abouties nous interessent : les sessions ouvertes ou
  // expirees n'ont pas de payment_intent encaisse, et elles sont dix fois plus
  // nombreuses — les ramener rendrait toute reprise d'historique interminable.
  params.set("status", "complete");
  const lignes = await lister(cle, "/checkout/sessions", params);

  return lignes.map((s) => ({
    payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : null,
    metadata: (s.metadata ?? {}) as Record<string, string>,
    // deno-lint-ignore no-explicit-any
    produits: ((s.line_items?.data ?? []) as any[]).map((l) => ({
      product: typeof l.price?.product === "string" ? l.price.product : null,
      price: typeof l.price?.id === "string" ? l.price.id : null,
      libelle: String(l.description ?? ""),
    })),
  }));
}
