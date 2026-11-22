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

Deno.test("piece : gratuites, pros, exclues et facturees une a une restent dehors, et se comptent", () => {
  const p = periode("2026-10", "2026-10");
  const facturee = v({ stripe_payment_intent_id: "pi_facturee" });
  const piece = calculerPiece(
    [v({}), v({ montant_ttc: 0 }), v({ perimetre: "b2b", montant_ttc: 50 }), v({ exclue: true }), facturee],
    [{ stripe_payment_intent_id: "pi_facturee", date_facture: "2026-10-20", numero: "F-1" }],
    p,
    null,
  );
  assertEquals(piece.nb_ventes, 1);
  assertEquals(piece.ttc, 10);
  assertEquals(piece.hors_piece, {
    gratuites: 1,
    pros: { nombre: 1, ttc: 50 },
    facturees_individuellement: { nombre: 1, ttc: 10 },
    exclues: 1,
  });
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
