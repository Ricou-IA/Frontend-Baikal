import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { construireVentes, reunirVentes } from "./capture.ts";
import type { CompteStripe, SiteRegistre } from "../_shared/finance-comptes.ts";
import type { LigneMapping } from "../_shared/finance-mapping.ts";
import type { SessionStripe, TxStripe } from "../_shared/stripe.ts";

const mapping: LigneMapping[] = [
  { cle_type: "product", cle: "prod_U3Ld", app_id: "pack-vendeur", offre: "pre-etat-date" },
];
const tva = { "pack-vendeur": 0.20 };

function charge(pi: string, montant: number, frais: number, created = 1785000000): TxStripe {
  return { id: `txn_${pi}`, type: "charge", amount_eur: montant, fee_eur: frais, created, payment_intent: pi };
}
function sessionPv(pi: string): SessionStripe {
  return {
    payment_intent: pi,
    metadata: {},
    produits: [{ product: "prod_U3Ld", price: null, libelle: "" }],
  };
}

Deno.test("une charge donne une vente, HT calcule comme cote Pack Vendeur", () => {
  const ventes = construireVentes([charge("pi_1", 24.99, 0.62)], [sessionPv("pi_1")], mapping, tva);

  assertEquals(ventes.length, 1);
  assertEquals(ventes[0].app_id, "pack-vendeur");
  assertEquals(ventes[0].offre, "pre-etat-date");
  assertEquals(ventes[0].montant_ttc, 24.99);
  assertEquals(ventes[0].montant_ht, 20.82); // (24.99 / 1.20).toFixed(2)
  assertEquals(ventes[0].frais_stripe_eur, 0.62);
  assertEquals(ventes[0].montant_rembourse, 0);
});

Deno.test("un remboursement n'annule pas la vente, il devient un cout", () => {
  const tx: TxStripe[] = [
    charge("pi_1", 24.99, 0.62),
    { id: "txn_r", type: "refund", amount_eur: -24.99, fee_eur: 0, created: 1785100000, payment_intent: "pi_1" },
  ];

  const ventes = construireVentes(tx, [sessionPv("pi_1")], mapping, tva);

  assertEquals(ventes.length, 1);
  assertEquals(ventes[0].montant_ttc, 24.99); // le CA reste
  assertEquals(ventes[0].montant_rembourse, 24.99);
  assertEquals(ventes[0].rembourse_le, new Date(1785100000 * 1000).toISOString());
});

Deno.test("un encaissement sans site reconnu est archive en inconnu, pas ignore", () => {
  const ventes = construireVentes([charge("pi_9", 9.9, 0.4)], [], [], {});

  assertEquals(ventes.length, 1);
  assertEquals(ventes[0].app_id, "inconnu");
  assertEquals(ventes[0].offre, "inconnu");
  assertEquals(ventes[0].montant_ht, 8.25); // tva par defaut 20 % quand le site est inconnu
});

Deno.test("deux paiements distincts donnent deux ventes", () => {
  const ventes = construireVentes(
    [charge("pi_1", 24.99, 0.62), charge("pi_2", 24.99, 0.62, 1785200000)],
    [sessionPv("pi_1"), sessionPv("pi_2")],
    mapping,
    tva,
  );
  assertEquals(ventes.length, 2);
});

Deno.test("les mouvements qui ne sont pas des ventes sont ecartes", () => {
  const tx: TxStripe[] = [
    { id: "txn_p", type: "payout", amount_eur: -500, fee_eur: 0, created: 1785000000, payment_intent: null },
    { id: "txn_f", type: "stripe_fee", amount_eur: -2, fee_eur: 0, created: 1785000000, payment_intent: null },
  ];
  assertEquals(construireVentes(tx, [], mapping, tva).length, 0);
});

Deno.test("une vente a 0 EUR (coupon 100 %) est comptee", () => {
  const ventes = construireVentes([charge("pi_c", 0, 0)], [sessionPv("pi_c")], mapping, tva);

  assertEquals(ventes.length, 1);
  assertEquals(ventes[0].montant_ttc, 0);
  assertEquals(ventes[0].montant_ht, 0);
});

// --- Un compte Stripe par site : la capture rejouee ne deplace aucune vente.
// Registre et comptes fictifs : aucun nom de secret reel.
const registre: SiteRegistre[] = [
  { id: "pack-vendeur", db_schema: "pack_vendeur", stripe_key_ref: null, is_active: true },
  { id: "site-a", db_schema: "aaa", stripe_key_ref: "ADMIN_STRIPE_A_KEY", is_active: true },
];
const compteCommun: CompteStripe = { ref: null, sites: [], siteSeul: null };
const compteA: CompteStripe = { ref: "ADMIN_STRIPE_A_KEY", sites: ["site-a"], siteSeul: "site-a" };

/** Une passe complete : le compte commun puis le compte du site A. */
function passe() {
  const commun = construireVentes(
    [charge("pi_1", 24.99, 0.62), charge("pi_2", 12, 0.4), charge("pi_3", 5, 0.3)],
    [
      sessionPv("pi_1"),
      { payment_intent: "pi_2", metadata: { application: "aaa" }, produits: [] },
      // pi_3 : aucune session, rien au mapping.
    ],
    mapping,
    tva,
    { compte: compteCommun, sites: registre },
  );
  const propre = construireVentes(
    [charge("pi_4", 9.9, 0.4)],
    [], // prix construit a la volee : le mapping ne resout rien
    mapping,
    tva,
    { compte: compteA, sites: registre },
  );
  return reunirVentes([commun, propre]);
}

Deno.test("chaque vente est rangee au bon site, compte par compte", () => {
  const { ventes, doublons } = passe();
  const parPi = Object.fromEntries(ventes.map((v) => [v.stripe_payment_intent_id, v.app_id]));

  assertEquals(doublons, []);
  assertEquals(parPi, {
    pi_1: "pack-vendeur", // par le mapping
    pi_2: "site-a", // marqueur du site traduit vers l'id du registre
    pi_3: "inconnu", // non resolue dans le compte commun : signalee, pas devinee
    pi_4: "site-a", // non resolue dans le compte d'un seul site
  });
});

Deno.test("rejouer la capture rend les memes ventes, sans doublon ni changement de site", () => {
  assertEquals(passe(), passe());
  assertEquals(passe().ventes.length, 4);
});

Deno.test("un paiement vu dans deux comptes garde son premier site et se signale", () => {
  const a = construireVentes([charge("pi_x", 10, 0.3)], [sessionPv("pi_x")], mapping, tva, {
    compte: compteCommun,
    sites: registre,
  });
  const b = construireVentes([charge("pi_x", 10, 0.3)], [], mapping, tva, { compte: compteA, sites: registre });

  const { ventes, doublons } = reunirVentes([a, b]);
  assertEquals(ventes.length, 1);
  assertEquals(ventes[0].app_id, "pack-vendeur");
  assertEquals(doublons, ["pi_x"]);
});
