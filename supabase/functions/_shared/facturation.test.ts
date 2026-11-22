import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  choisirCompte,
  codeTva,
  controlerTotaux,
  corpsClient,
  corpsFacture,
  decisionReprise,
  decoupageDeuxLignes,
  etatAffiche,
  type LigneFacture,
  mentionPaiement,
  montantsFacture,
  prixUnitaireHt,
  validerClient,
  uneLigneSuffit,
  type VenteAFacturer,
  venteFacturable,
} from "./facturation.ts";

// Donnees fictives : aucun client, aucun compte, aucun identifiant reel.
const vente: VenteAFacturer = {
  stripe_payment_intent_id: "pi_fictif_1",
  paid_at: "2026-11-12T09:30:00Z",
  montant_ttc: 24.99,
  montant_rembourse: 0,
  offre: "Offre d'essai",
};
const site = { compte_produit: "70699", tva_taux: 0.2 };

Deno.test("montants : HT arrondi, TVA par difference, le total retombe sur le TTC", () => {
  assertEquals(montantsFacture(24.99, 0.2), { ttc: 24.99, ht: 20.83, tva: 4.16 });
  assertEquals(montantsFacture(9.9, 0.2), { ttc: 9.9, ht: 8.25, tva: 1.65 });
  assertEquals(montantsFacture(19, 0.2), { ttc: 19, ht: 15.83, tva: 3.17 });
  assertEquals(montantsFacture(99, 0.2), { ttc: 99, ht: 82.5, tva: 16.5 });
});

Deno.test("montants : HT + TVA = TTC pour tous les prix au centime jusqu'a 300 euros", () => {
  for (let c = 1; c <= 30000; c++) {
    const ttc = c / 100;
    const m = montantsFacture(ttc, 0.2);
    assertEquals(Math.round((m.ht + m.tva) * 100), c);
  }
});

Deno.test("prix unitaire HT : six decimales au plus, sans zeros de fin", () => {
  assertEquals(prixUnitaireHt(24.99, 0.2), "20.825");
  assertEquals(prixUnitaireHt(9.9, 0.2), "8.25");
  assertEquals(prixUnitaireHt(19, 0.2), "15.833333");
  assertEquals(prixUnitaireHt(120, 0.2), "100");
});

Deno.test("une ligne : Pennylane retombe juste sur certains prix, pas sur d'autres", () => {
  assertEquals(uneLigneSuffit(24.99, 0.2), false); // 20,83 + 4,17 = 25,00
  assertEquals(uneLigneSuffit(9.9, 0.2), true); // 8,25 + 1,65
  assertEquals(uneLigneSuffit(99, 0.2), true);
  assertEquals(uneLigneSuffit(19, 0.2), true); // 15,83 + 3,17
});

Deno.test("deux lignes : les HT font le HT voulu, les TVA par ligne font la TVA voulue", () => {
  assertEquals(decoupageDeuxLignes(24.99, 0.2), { principale: 20.82, complement: 0.01 });
});

Deno.test("deux lignes : tout prix au centime jusqu'a 300 euros a une ecriture juste", () => {
  for (let c = 50; c <= 30000; c++) {
    const ttc = c / 100;
    if (uneLigneSuffit(ttc, 0.2)) continue;
    const d = decoupageDeuxLignes(ttc, 0.2);
    if (!d) throw new Error(`aucun decoupage pour ${ttc}`);
    const a = Math.round(d.principale * 100);
    const b = Math.round(d.complement * 100);
    assertEquals(a + b + Math.round(a * 0.2) + Math.round(b * 0.2), c);
  }
});

Deno.test("corps facture : en deux lignes, chacune sur le meme compte et le meme taux", () => {
  const corps = corpsFacture({
    customerId: 42,
    date: "2026-11-22",
    vente,
    designation: "Offre d'essai",
    ledgerAccountId: 3,
    taux: 0.2,
    reference: "pi_fictif_1",
    decoupage: { principale: 20.82, complement: 0.01, libelleComplement: "Complément" },
  }) as { invoice_lines: Array<Record<string, unknown>> };
  assertEquals(corps.invoice_lines.map((l) => [l.label, l.raw_currency_unit_price, l.vat_rate, l.ledger_account_id]), [
    ["Offre d'essai", "20.82", "FR_200", 3],
    ["Complément", "0.01", "FR_200", 3],
  ]);
});

Deno.test("code de TVA : un taux inconnu ne retombe jamais sur 20 %", () => {
  assertEquals(codeTva(0.2), "FR_200");
  assertEquals(codeTva(0.055), "FR_55");
  assertThrows(() => codeTva(0.196));
});

Deno.test("une vente payee, non remboursee, d'un site ouvert est facturable", () => {
  assertEquals(venteFacturable(vente, site), { ok: true });
});

Deno.test("refus : site sans compte de produits", () => {
  assertEquals(venteFacturable(vente, { compte_produit: null, tva_taux: 0.2 }).ok, false);
});

Deno.test("refus : vente remboursee, meme en partie", () => {
  const r = venteFacturable({ ...vente, montant_rembourse: 5 }, site);
  assertEquals(r.ok, false);
});

Deno.test("refus : vente gratuite, sans paiement Stripe", () => {
  assertEquals(venteFacturable({ ...vente, stripe_payment_intent_id: "cs_fictif", montant_ttc: 0 }, site).ok, false);
  assertEquals(venteFacturable({ ...vente, montant_ttc: 0 }, site).ok, false);
});

Deno.test("refus : vente exclue ou non encaissee", () => {
  assertEquals(venteFacturable({ ...vente, exclue: true }, site).ok, false);
  assertEquals(venteFacturable({ ...vente, paid_at: null }, site).ok, false);
});

const particulier = {
  type: "particulier",
  prenom: " Camille ",
  nom: "Exemple",
  adresse: "1 rue de l'Essai",
  code_postal: "00000",
  ville: "Testville",
  email: " Camille@Exemple.test ",
};

Deno.test("client : la saisie est nettoyee, le pays vaut FR par defaut", () => {
  const r = validerClient(particulier);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.client.prenom, "Camille");
    assertEquals(r.client.email, "camille@exemple.test");
    assertEquals(r.client.pays, "FR");
  }
});

Deno.test("client : chaque champ manquant est dit", () => {
  const r = validerClient({ type: "particulier", email: "pas-un-mail" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.erreurs.length, 6);
});

Deno.test("client : une societe demande sa raison sociale, pas un prenom", () => {
  assertEquals(validerClient({ ...particulier, type: "societe", raison_sociale: "" }).ok, false);
  assertEquals(validerClient({ ...particulier, type: "societe", raison_sociale: "Exemple SAS" }).ok, true);
  assertEquals(validerClient({ ...particulier, type: undefined }).ok, false);
});

Deno.test("corps client : un particulier n'a pas de name, une societe pas de prenom", () => {
  const p = validerClient(particulier);
  if (!p.ok) throw new Error("saisie refusee");
  const cp = corpsClient(p.client);
  assertEquals(cp.chemin, "/individual_customers");
  assertEquals(Object.keys(cp.corps).sort(), ["billing_address", "emails", "first_name", "last_name"]);

  const s = validerClient({ ...particulier, type: "societe", raison_sociale: "Exemple SAS" });
  if (!s.ok) throw new Error("saisie refusee");
  const cs = corpsClient(s.client);
  assertEquals(cs.chemin, "/company_customers");
  assertEquals(Object.keys(cs.corps).sort(), ["billing_address", "emails", "name"]);
  assertEquals(cs.corps.billing_address, {
    address: "1 rue de l'Essai",
    postal_code: "00000",
    city: "Testville",
    country_alpha2: "FR",
  });
});

Deno.test("compte : la declinaison du taux d'abord, la France d'abord, sinon le generique", () => {
  const comptes = [
    { id: 1, number: "70699", vat_rate: "any", country_alpha2: "any" },
    { id: 2, number: "70699", vat_rate: "FR_200", country_alpha2: "any" },
    { id: 3, number: "70699", vat_rate: "FR_200", country_alpha2: "FR" },
    { id: 4, number: "70698", vat_rate: "FR_200", country_alpha2: "FR" },
  ];
  assertEquals(choisirCompte(comptes, "70699", "FR_200"), 3);
  assertEquals(choisirCompte(comptes.slice(0, 2), "70699", "FR_200"), 2);
  assertEquals(choisirCompte(comptes.slice(0, 1), "70699", "FR_200"), 1);
  assertEquals(choisirCompte(comptes, "70600", "FR_200"), null);
});

Deno.test("compte : un compte desactive n'est pas retenu", () => {
  assertEquals(choisirCompte([{ id: 1, number: "70699", vat_rate: "any", enabled: false }], "70699", "FR_200"), null);
});

Deno.test("mention : la date du paiement et sa reference", () => {
  assertEquals(
    mentionPaiement("2026-11-12T09:30:00Z", "pi_fictif_1"),
    "Facture acquittée. Payée le 12/11/2026 par carte bancaire (référence pi_fictif_1).",
  );
});

Deno.test("corps facture : toujours un brouillon, une ligne, datee du jour de l'emission", () => {
  const corps = corpsFacture({
    customerId: 42,
    date: "2026-11-22",
    vente,
    designation: " Offre d'essai ",
    ledgerAccountId: 3,
    taux: 0.2,
    reference: "pi_fictif_1",
  });
  assertEquals(corps, {
    customer_id: 42,
    date: "2026-11-22",
    deadline: "2026-11-22",
    draft: true,
    currency: "EUR",
    language: "fr_FR",
    external_reference: "pi_fictif_1",
    pdf_invoice_free_text: "Facture acquittée. Payée le 12/11/2026 par carte bancaire (référence pi_fictif_1).",
    invoice_lines: [{
      label: "Offre d'essai",
      quantity: 1,
      unit: "piece",
      raw_currency_unit_price: "20.825",
      vat_rate: "FR_200",
      ledger_account_id: 3,
    }],
  });
});

Deno.test("corps facture : pas de ligne sans designation", () => {
  assertThrows(() =>
    corpsFacture({
      customerId: 42,
      date: "2026-11-22",
      vente,
      designation: "  ",
      ledgerAccountId: 3,
      taux: 0.2,
      reference: "pi_fictif_1",
    })
  );
});

const attendus = montantsFacture(24.99, 0.2);

Deno.test("controle : Pennylane retombe au centime, la facture peut etre finalisee", () => {
  const r = controlerTotaux(
    { currency_amount: "24.99", currency_amount_before_tax: "20.83", currency_tax: "4.16" },
    attendus,
  );
  assertEquals(r, { ok: true, rendus: { ttc: 24.99, ht: 20.83, tva: 4.16 } });
});

Deno.test("controle : un centime d'ecart sur le TTC arrete tout", () => {
  const r = controlerTotaux(
    { currency_amount: "25.00", currency_amount_before_tax: "20.83", currency_tax: "4.17" },
    attendus,
  );
  assertEquals(r.ok, false);
});

Deno.test("controle : bon TTC mais autre decoupage HT / TVA : refuse aussi", () => {
  const r = controlerTotaux(
    { currency_amount: "24.99", currency_amount_before_tax: "20.82", currency_tax: "4.17" },
    attendus,
  );
  assertEquals(r.ok, false);
});

Deno.test("controle : des totaux absents ne valent jamais accord", () => {
  assertEquals(controlerTotaux({ currency_amount: "24.99" }, attendus).ok, false);
  assertEquals(controlerTotaux(null, attendus).ok, false);
});

const maintenant = new Date("2026-11-22T10:00:00Z");
const ligne = (p: Partial<LigneFacture>): LigneFacture => ({
  statut: "en_cours",
  etape: null,
  pennylane_invoice_id: null,
  numero: null,
  envoyee_le: null,
  maj_le: "2026-11-22T09:59:30Z",
  ...p,
});

Deno.test("reprise : pas de ligne, emission nouvelle", () => {
  assertEquals(decisionReprise(null, maintenant), "nouvelle");
});

Deno.test("reprise : une facture emise ne se refait jamais", () => {
  assertEquals(decisionReprise(ligne({ statut: "emise", numero: "F-1", pennylane_invoice_id: 9 }), maintenant), "deja_emise");
});

Deno.test("reprise : une emission de moins de deux minutes bloque le double clic", () => {
  assertEquals(decisionReprise(ligne({}), maintenant), "occupee");
});

Deno.test("reprise : une emission abandonnee ou en erreur se reprend", () => {
  assertEquals(decisionReprise(ligne({ maj_le: "2026-11-22T09:50:00Z" }), maintenant), "reprendre");
  assertEquals(decisionReprise(ligne({ statut: "erreur" }), maintenant), "reprendre");
});

Deno.test("affichage : creee mais non envoyee est un etat a part entiere", () => {
  assertEquals(etatAffiche(null), "aucune");
  assertEquals(etatAffiche(ligne({})), "en_cours");
  assertEquals(etatAffiche(ligne({ statut: "erreur" })), "erreur");
  assertEquals(etatAffiche(ligne({ statut: "emise", numero: "F-1" })), "emise_envoi_en_attente");
  assertEquals(
    etatAffiche(ligne({ statut: "emise", numero: "F-1", envoyee_le: "2026-11-22T10:00:00Z" })),
    "emise_envoyee",
  );
});
