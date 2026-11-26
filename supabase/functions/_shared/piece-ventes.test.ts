// Donnees fictives : ce depot est public.
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  calculerPiece,
  corpsPiece,
  ecartAdmis,
  moisPrecedent,
  periode,
  seRecouvrent,
  type VenteMois,
} from "./piece-ventes.ts";

const v = (p: Partial<VenteMois>): VenteMois => ({
  stripe_payment_intent_id: "pi_" + Math.random().toString(36).slice(2),
  jour_paiement: "2026-10-15",
  jour_remboursement: null,
  montant_ttc: 10,
  montant_rembourse: 0,
  offre: "offre-a",
  perimetre: "b2c",
  exclue: false,
  ...p,
});

Deno.test("periode : un mois, ses bornes et son libelle", () => {
  const p = periode("2026-02", "2026-02");
  assertEquals(p.premierJour, "2026-02-01");
  assertEquals(p.dernierJour, "2026-02-28");
  assertEquals(p.libelle, "février 2026");
});

Deno.test("periode : plusieurs mois, datee du dernier jour du dernier mois", () => {
  const p = periode("2026-03", "2026-11");
  assertEquals(p.dernierJour, "2026-11-30");
  assertEquals(p.libelle, "de mars à novembre 2026");
  assertEquals(periode("2025-12", "2026-01").libelle, "de décembre 2025 à janvier 2026");
});

Deno.test("periode : mal formee ou inversee, refus", () => {
  assertThrows(() => periode("2026-13", "2026-13"));
  assertThrows(() => periode("2026-05", "2026-04"));
});

Deno.test("recouvrement de deux periodes", () => {
  assert(seRecouvrent({ du: "2026-03-01", au: "2026-11-30" }, { du: "2026-11-01", au: "2026-11-30" }));
  assert(!seRecouvrent({ du: "2026-10-01", au: "2026-10-31" }, { du: "2026-11-01", au: "2026-11-30" }));
});

Deno.test("piece : les ventes se regroupent par offre et par prix", () => {
  const p = periode("2026-10", "2026-10");
  const piece = calculerPiece(
    [v({}), v({}), v({ montant_ttc: 7.5 }), v({ jour_paiement: "2026-09-30" })],
    [],
    p,
    "Produit Exemple",
  );
  assertEquals(piece.nb_ventes, 3);
  assertEquals(piece.lignes.length, 2);
  assertEquals(piece.lignes[0].quantite, 2);
  assertEquals(piece.lignes[0].libelle, "Ventes en ligne octobre 2026 : Produit Exemple à 10,00 € TTC");
  assertEquals(piece.ttc, 27.5);
});

Deno.test("piece : gratuites, exclues et facturees une a une restent dehors ; les pros ont leur ligne", () => {
  const p = periode("2026-10", "2026-10");
  const facturee = v({ stripe_payment_intent_id: "pi_facturee" });
  const piece = calculerPiece(
    [v({}), v({ montant_ttc: 0 }), v({ perimetre: "b2b", montant_ttc: 50 }), v({ exclue: true }), facturee],
    [{ stripe_payment_intent_id: "pi_facturee", date_facture: "2026-10-20", numero: "F-1" }],
    p,
    null,
  );
  assertEquals(piece.nb_ventes, 2);
  assertEquals(piece.ttc, 60);
  assertEquals(piece.hors_piece, {
    gratuites: 1,
    facturees_individuellement: { nombre: 1, ttc: 10 },
    exclues: 1,
    deja_sur_une_piece: { nombre: 0, ttc: 0 },
  });
  assertEquals(piece.lignes[1].libelle, "Ventes aux professionnels octobre 2026 : offre-a à 50,00 € TTC (factures Stripe)");
  // Sans nom de produit, le nom interne de l'offre.
  assert(piece.lignes[0].libelle.includes("offre-a"));
});

Deno.test("piece : un remboursement vient en negatif, au mois du remboursement", () => {
  const p = periode("2026-11", "2026-11");
  const piece = calculerPiece(
    [
      v({ jour_paiement: "2026-11-03" }),
      v({ jour_paiement: "2026-10-28", jour_remboursement: "2026-11-02", montant_rembourse: 10 }),
    ],
    [],
    p,
    null,
  );
  assertEquals(piece.lignes.map((l) => l.nature), ["ventes", "remboursements"]);
  assertEquals(piece.ttc, 0);
});

Deno.test("piece : une vente facturee apres son mois sort de la piece suivante", () => {
  const p = periode("2026-11", "2026-11");
  const piece = calculerPiece(
    [v({ stripe_payment_intent_id: "pi_tardive", jour_paiement: "2026-10-10" }), v({ jour_paiement: "2026-11-05" })],
    [{ stripe_payment_intent_id: "pi_tardive", date_facture: "2026-11-12", numero: "F-7" }],
    p,
    null,
  );
  const retrait = piece.lignes.find((l) => l.nature === "factures_individuelles");
  assertEquals(retrait?.ttc, -10);
  assert(retrait?.libelle.includes("F-7"));
  assertEquals(piece.ttc, 0);
});

Deno.test("piece : une vente facturee dans son propre mois n'est ni comptee ni retiree", () => {
  const p = periode("2026-11", "2026-11");
  const piece = calculerPiece(
    [v({ stripe_payment_intent_id: "pi_x", jour_paiement: "2026-11-10" })],
    [{ stripe_payment_intent_id: "pi_x", date_facture: "2026-11-12", numero: "F-8" }],
    p,
    null,
  );
  assertEquals(piece.lignes.length, 0);
});

Deno.test("corps : brouillon date du dernier jour, une ligne par groupe, prix HT en chaine", () => {
  const p = periode("2026-10", "2026-10");
  const piece = calculerPiece(
    [v({ montant_ttc: 24.99 }), v({ montant_ttc: 24.99 }), v({ jour_remboursement: "2026-10-20", montant_rembourse: 12, jour_paiement: "2026-09-01" })],
    [],
    p,
    "Produit Exemple",
  );
  const corps = corpsPiece({ piece, customerId: 1, ledgerAccountId: 2, taux: 0.2, reference: "ref" }) as any;
  assertEquals(corps.draft, true);
  assertEquals(corps.date, "2026-10-31");
  assertEquals(corps.invoice_lines.length, 2);
  assertEquals(corps.invoice_lines[0].quantity, 2);
  assertEquals(corps.invoice_lines[0].raw_currency_unit_price, "20.825");
  assertEquals(corps.invoice_lines[1].raw_currency_unit_price, "-10");
  assertEquals(corps.invoice_lines[0].vat_rate, "FR_200");
  assertEquals(ecartAdmis(piece), 0.02);
});

Deno.test("corps : une piece vide ne part pas", () => {
  const piece = calculerPiece([], [], periode("2026-10", "2026-10"), null);
  assertThrows(() => corpsPiece({ piece, customerId: 1, ledgerAccountId: 2, taux: 0.2, reference: "r" }));
});

Deno.test("corps : un rattrapage se date du jour ou il est passe", () => {
  const piece = calculerPiece([v({})], [], periode("2026-03", "2026-10"), null);
  const corps = corpsPiece({ piece, customerId: 1, ledgerAccountId: 2, taux: 0.2, reference: "r", date: "2026-11-22" }) as any;
  assertEquals(corps.date, "2026-11-22");
  assertThrows(() => corpsPiece({ piece, customerId: 1, ledgerAccountId: 2, taux: 0.2, reference: "r", date: "22/11" }));
});

Deno.test("cron : le mois precedent, y compris en janvier", () => {
  assertEquals(moisPrecedent("2026-12-01"), "2026-11");
  assertEquals(moisPrecedent("2027-01-01"), "2026-12");
});

// --- Pieces deja faites : une vente n'est jamais portee deux fois ------------

import {
  aucunPorte,
  ecartsFactures,
  porter,
  rattacherPiece,
  ventesHorsPiece,
} from "./piece-ventes.ts";

Deno.test("piece : chaque vente, remboursement et retrait devient un mouvement", () => {
  const p = periode("2026-10", "2026-10");
  const piece = calculerPiece(
    [
      v({ stripe_payment_intent_id: "pi_a" }),
      v({ stripe_payment_intent_id: "pi_b", jour_paiement: "2026-09-10", montant_rembourse: 10, jour_remboursement: "2026-10-02" }),
      v({ stripe_payment_intent_id: "pi_c", jour_paiement: "2026-09-12" }),
    ],
    [{ stripe_payment_intent_id: "pi_c", date_facture: "2026-10-05", numero: "F-1" }],
    p,
    null,
  );
  assertEquals(piece.mouvements, [
    { stripe_payment_intent_id: "pi_a", nature: "vente", montant_ttc: 10 },
    { stripe_payment_intent_id: "pi_b", nature: "remboursement", montant_ttc: -10 },
    { stripe_payment_intent_id: "pi_c", nature: "retrait_facture", montant_ttc: -10 },
  ]);
});

Deno.test("piece : les ventes deja portees par une piece ne sont plus proposees", () => {
  // Le cas d'octobre 2026 en petit : 3 ventes, 1 facturee seule, 2 deja sur
  // une piece de mars a octobre. Le brouillon d'octobre ne propose plus rien.
  const p = periode("2026-10", "2026-10");
  const ventes = [
    v({ stripe_payment_intent_id: "pi_1", jour_paiement: "2026-10-03" }),
    v({ stripe_payment_intent_id: "pi_2", jour_paiement: "2026-10-12" }),
    v({ stripe_payment_intent_id: "pi_3", jour_paiement: "2026-10-31" }),
  ];
  const factures = [{ stripe_payment_intent_id: "pi_2", date_facture: "2026-10-15", numero: "F-1" }];
  const portes = porter(aucunPorte(), [
    { stripe_payment_intent_id: "pi_1", nature: "vente", montant_ttc: 10 },
    { stripe_payment_intent_id: "pi_3", nature: "vente", montant_ttc: 10 },
  ]);
  const piece = calculerPiece(ventes, factures, p, null, portes);
  assertEquals(piece.lignes.length, 0);
  assertEquals(piece.nb_ventes, 0);
  assertEquals(piece.hors_piece.deja_sur_une_piece, { nombre: 2, ttc: 20 });
  assertEquals(piece.hors_piece.facturees_individuellement.nombre, 1);
});

Deno.test("piece : un remboursement ou un retrait deja passe ne revient pas", () => {
  const p = periode("2026-11", "2026-11");
  const ventes = [
    v({ stripe_payment_intent_id: "pi_r", jour_paiement: "2026-10-03", montant_rembourse: 10, jour_remboursement: "2026-11-02" }),
    v({ stripe_payment_intent_id: "pi_f", jour_paiement: "2026-10-04" }),
  ];
  const factures = [{ stripe_payment_intent_id: "pi_f", date_facture: "2026-11-05", numero: "F-2" }];
  const portes = porter(aucunPorte(), [
    { stripe_payment_intent_id: "pi_r", nature: "remboursement", montant_ttc: -10 },
    { stripe_payment_intent_id: "pi_f", nature: "retrait_facture", montant_ttc: -10 },
  ]);
  const piece = calculerPiece(ventes, factures, p, null, portes);
  assertEquals(piece.lignes.length, 0);
  assertEquals(piece.mouvements.length, 0);
});

const enregistreeEssai = {
  id: "00000000-0000-4000-8000-0000000000aa",
  du: "2026-03-01",
  au: "2026-10-31",
  montant_ttc: 20,
  nb_ventes: 2,
  cree_le: "2026-11-22T16:06:49Z",
};

Deno.test("rattachement : la piece est rejouee avec les seules factures connues a sa creation", () => {
  const ventes = [
    v({ stripe_payment_intent_id: "pi_1", jour_paiement: "2026-04-03" }),
    v({ stripe_payment_intent_id: "pi_2", jour_paiement: "2026-10-12" }),
    v({ stripe_payment_intent_id: "pi_3", jour_paiement: "2026-10-31" }),
  ];
  const factures = [
    // connue avant la piece : la vente en etait sortie
    { stripe_payment_intent_id: "pi_2", date_facture: "2026-10-15", numero: "F-1", cree_le: "2026-10-15T09:00:00Z" },
    // facturee APRES la piece : la vente y etait bien comptee
    { stripe_payment_intent_id: "pi_3", date_facture: "2026-11-24", numero: "F-2", cree_le: "2026-11-24T09:00:00Z" },
  ];
  const r = rattacherPiece(ventes, factures, { ...enregistreeEssai }, null);
  assert(r.concorde);
  assertEquals(r.recalcul, { nb_ventes: 2, ttc: 20 });
  assertEquals(r.mouvements.map((m) => m.stripe_payment_intent_id), ["pi_1", "pi_3"]);
});

Deno.test("rattachement : un recalcul qui ne retrouve pas les totaux ne concorde pas", () => {
  const ventes = [v({ stripe_payment_intent_id: "pi_1", jour_paiement: "2026-04-03" })];
  const r = rattacherPiece(ventes, [], { ...enregistreeEssai }, null);
  assertEquals(r.concorde, false);
  assertEquals(r.recalcul, { nb_ventes: 1, ttc: 10 });
});

Deno.test("anomalie : une facture individuelle qui ne porte pas le montant encaisse", () => {
  const ventes = [v({ stripe_payment_intent_id: "pi_exemple_ecart", montant_ttc: 24.99 })];
  const a = ecartsFactures(ventes, [
    { stripe_payment_intent_id: "pi_exemple_ecart", date_facture: "2026-10-15", numero: "F-1", montant_ttc: 25 },
  ]);
  assertEquals(a.length, 1);
  assertEquals(a[0].type, "facture_ecart_montant");
  assert(a[0].message.includes("25,00 € TTC pour 24,99 €"));
  assert(a[0].message.includes("+0,01"));
  // Pas d'ecart, pas d'anomalie.
  assertEquals(ecartsFactures(ventes, [
    { stripe_payment_intent_id: "pi_exemple_ecart", date_facture: "2026-10-15", numero: "F-1", montant_ttc: 24.99 },
  ]).length, 0);
});

Deno.test("anomalie : une vente d'une periode couverte que la piece ne porte pas", () => {
  const ventes = [
    v({ stripe_payment_intent_id: "pi_1", jour_paiement: "2026-10-03" }),
    v({ stripe_payment_intent_id: "pi_2", jour_paiement: "2026-10-31" }),
    v({ stripe_payment_intent_id: "pi_3", jour_paiement: "2026-11-02" }),
    v({ stripe_payment_intent_id: "pi_4", jour_paiement: "2026-10-20", montant_ttc: 0 }),
  ];
  const portes = porter(aucunPorte(), [{ stripe_payment_intent_id: "pi_1", nature: "vente", montant_ttc: 10 }]);
  const a = ventesHorsPiece(ventes, [], [{ id: "p1", du: "2026-03-01", au: "2026-10-31" }], portes);
  assertEquals(a.length, 1);
  assertEquals(a[0].type, "vente_hors_piece");
  assert(a[0].message.startsWith("Vente du 31/10/2026"));
});
