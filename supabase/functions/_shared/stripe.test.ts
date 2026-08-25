import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { listerSessions, listerTransactions } from "./stripe.ts";

// Faux fetch : rend les pages dans l'ordre et enregistre les URLs appelees,
// pour verifier la pagination et les parametres imposes (expand notamment).
function fauxFetch(pages: unknown[]) {
  const urls: string[] = [];
  globalThis.fetch = ((url: string | URL) => {
    urls.push(String(url));
    const page = pages[Math.min(urls.length - 1, pages.length - 1)];
    return Promise.resolve(new Response(JSON.stringify(page), { status: 200 }));
  }) as never;
  return urls;
}

Deno.test("listerTransactions convertit les centimes et suit la pagination", async () => {
  const urls = fauxFetch([
    {
      data: [{
        id: "txn_1",
        type: "charge",
        amount: 2499,
        fee: 62,
        created: 1785000000,
        source: { id: "py_1", object: "charge", payment_intent: "pi_1" },
      }],
      has_more: true,
    },
    {
      data: [{
        id: "txn_2",
        type: "refund",
        amount: -2499,
        fee: 0,
        created: 1785100000,
        source: { id: "pyr_1", object: "refund", payment_intent: "pi_1" },
      }],
      has_more: false,
    },
  ]);

  const tx = await listerTransactions("sk_test", new Date(0), new Date());

  assertEquals(tx.length, 2);
  assertEquals(tx[0].amount_eur, 24.99);
  assertEquals(tx[0].fee_eur, 0.62);
  assertEquals(tx[0].payment_intent, "pi_1");
  assertEquals(tx[1].amount_eur, -24.99);
  assertEquals(tx[1].type, "refund");
  assertEquals(urls.length, 2);
  // Sans expand, la transaction ne porte que l'id de charge : pas de payment_intent.
  assertStringIncludes(urls[0], "expand%5B%5D=data.source");
  assertStringIncludes(urls[1], "starting_after=txn_1");
});

Deno.test("listerSessions rend produit, prix et libelle de chaque ligne", async () => {
  const urls = fauxFetch([
    {
      data: [{
        id: "cs_1",
        payment_intent: "pi_1",
        metadata: { application: "dpe", cle: "pack_pro" },
        line_items: {
          data: [{
            description: "MonsieurDPE — Pack pro agence",
            price: { id: "price_1", product: "prod_1" },
          }],
        },
      }],
      has_more: false,
    },
  ]);

  const sessions = await listerSessions("sk_test", new Date(0), new Date());

  assertEquals(sessions.length, 1);
  assertEquals(sessions[0].payment_intent, "pi_1");
  assertEquals(sessions[0].metadata.application, "dpe");
  assertEquals(sessions[0].produits[0].product, "prod_1");
  assertEquals(sessions[0].produits[0].price, "price_1");
  assertEquals(sessions[0].produits[0].libelle, "MonsieurDPE — Pack pro agence");
  assertStringIncludes(urls[0], "expand%5B%5D=data.line_items");
});

Deno.test("une session sans ligne ne casse pas la lecture", async () => {
  fauxFetch([{ data: [{ id: "cs_2", payment_intent: "pi_2", metadata: {} }], has_more: false }]);

  const sessions = await listerSessions("sk_test", new Date(0), new Date());

  assertEquals(sessions[0].produits, []);
});
