import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  agregerVentes,
  bornes,
  categorieVente,
  chargesSurPeriode,
  debutJour,
  fenetresSynthese,
  filtreRemboursement,
  jourLocal,
  moisSerie,
  periodeVentes,
  ponctuellesSurPeriode,
  remboursementHt,
  resultat,
  type VenteArchive,
} from "./fenetres.ts";

const PARIS = "Europe/Paris";
// Snapshot de l'audit : 26/11/2026 20:15 a Paris.
const AUDIT = new Date("2026-11-26T19:15:00Z");

Deno.test("debutJour : minuit local, y compris aux changements d'heure", () => {
  assertEquals(debutJour("2026-11-20", PARIS), "2026-11-19T23:00:00.000Z");
  assertEquals(debutJour("2026-07-15", PARIS), "2026-07-14T22:00:00.000Z");
  assertEquals(debutJour("2026-03-29", PARIS), "2026-03-28T23:00:00.000Z");
  assertEquals(debutJour("2026-03-30", PARIS), "2026-03-29T22:00:00.000Z");
  assertEquals(debutJour("2026-10-25", PARIS), "2026-10-24T22:00:00.000Z");
  assertEquals(debutJour("2026-10-26", PARIS), "2026-10-25T23:00:00.000Z");
  assertEquals(debutJour("2026-01-01", "UTC"), "2026-01-01T00:00:00.000Z");
});

Deno.test("jourLocal : le soir en UTC est deja le lendemain a Paris", () => {
  assertEquals(jourLocal(new Date("2026-11-26T23:30:00Z"), PARIS), "2026-11-27");
  assertEquals(jourLocal(new Date("2026-11-26T23:30:00Z"), "UTC"), "2026-11-26");
});

Deno.test("fenetresSynthese : 7 jours civils Paris, comme le bandeau", () => {
  const f = fenetresSynthese(AUDIT, PARIS);
  assertEquals(f["7j"], { du: "2026-11-20", au: "2026-11-26" });
  assertEquals(f.mois, { du: "2026-11-01", au: "2026-11-26" });
  assertEquals(f.annee, { du: "2026-01-01", au: "2026-11-26" });
  // La vente du 20/11 a 15:42 (Paris) entre dans la fenetre ; l'ancien
  // glissant UTC (maintenant - 144 h) commencait le 20/11 a 20:15 et l'excluait.
  const b = bornes(f["7j"], PARIS);
  assertEquals(b, { debut: "2026-11-19T23:00:00.000Z", fin: "2026-11-26T23:00:00.000Z" });
  const vente = "2026-11-20T14:42:00.000Z";
  assertEquals(vente >= b.debut && vente < b.fin, true);
  const ancienDebut = new Date(AUDIT.getTime() - 6 * 86_400_000).toISOString();
  assertEquals(vente >= ancienDebut, false);
});

Deno.test("moisSerie : mois civils locaux, le mois en cours s'arrete a aujourd'hui", () => {
  const m = moisSerie(AUDIT, PARIS, 3);
  assertEquals(m, [
    { mois: "2026-09", du: "2026-09-01", au: "2026-09-30" },
    { mois: "2026-10", du: "2026-10-01", au: "2026-10-31" },
    { mois: "2026-11", du: "2026-11-01", au: "2026-11-26" },
  ]);
  // Le 31/12 a 23:30 a Paris est encore decembre, pas janvier.
  const fin = moisSerie(new Date("2026-12-31T22:30:00Z"), PARIS, 1);
  assertEquals(fin, [{ mois: "2026-12", du: "2026-12-01", au: "2026-12-31" }]);
  assertEquals(moisSerie(new Date("2026-12-31T23:30:00Z"), PARIS, 1)[0].mois, "2027-01");
});

Deno.test("periodeVentes : annee civile par defaut, 3/6/12 mois, dates libres", () => {
  assertEquals(periodeVentes({}, AUDIT, PARIS), { du: "2026-01-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ periode: "3m" }, AUDIT, PARIS), { du: "2026-09-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ periode: "6m" }, AUDIT, PARIS), { du: "2026-06-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ periode: "12m" }, AUDIT, PARIS), { du: "2025-12-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ du: "2026-07-01", au: "2026-09-30" }, AUDIT, PARIS), { du: "2026-07-01", au: "2026-09-30" });
  assertEquals(periodeVentes({ du: "2026-09-30", au: "2026-07-01" }, AUDIT, PARIS), { du: "2026-07-01", au: "2026-09-30" });
  assertEquals(periodeVentes({ du: "n'importe", au: "2026-09-30" }, AUDIT, PARIS), { du: "2026-01-01", au: "2026-11-26" });
});

Deno.test("filtreRemboursement : valeur inconnue = toutes", () => {
  assertEquals(filtreRemboursement("remboursees"), "remboursees");
  assertEquals(filtreRemboursement("non_remboursees"), "non_remboursees");
  assertEquals(filtreRemboursement("x"), "toutes");
  assertEquals(filtreRemboursement(undefined), "toutes");
});

Deno.test("charges : prorata 12/365 en jours civils de la fenetre", () => {
  const c = [{ montant_mensuel_eur: 10, debut: "2026-09-01", fin: null }];
  // 01/09 -> 26/11 = 87 jours.
  assertEquals(chargesSurPeriode(c, { du: "2026-01-01", au: "2026-11-26" }), 28.6);
  // Septembre clos : 30 jours, pas 31.
  assertEquals(chargesSurPeriode(c, { du: "2026-09-01", au: "2026-09-30" }), 9.86);
  assertEquals(chargesSurPeriode(c, { du: "2026-08-01", au: "2026-08-31" }), 0);
  const p = [{ montant_eur: 100, jour: "2026-11-20" }, { montant_eur: 5.5, jour: "2026-11-27" }];
  assertEquals(ponctuellesSurPeriode(p, { du: "2026-11-20", au: "2026-11-26" }), 100);
});

Deno.test("categorieVente : payante, gratuite (0 EUR), pack de credits", () => {
  assertEquals(categorieVente({ montant_ttc: 24.99, offre: "pre-etat-date", perimetre: "b2c" }), "payante");
  assertEquals(categorieVente({ montant_ttc: 0, offre: "pre-etat-date", perimetre: "b2c" }), "gratuite");
  assertEquals(categorieVente({ montant_ttc: 118.8, offre: "credits-pro-5", perimetre: "b2b" }), "pack");
  assertEquals(categorieVente({ montant_ttc: 24, offre: "autre", perimetre: "b2b" }), "pack");
});

Deno.test("remboursementHt : l'arrondi de l'archive, 24,99 -> 20,82", () => {
  assertEquals(remboursementHt(24.99, 0.2), 20.82);
  assertEquals(remboursementHt(0, 0.2), 0);
});

function vente(ttc: number, ht: number, o: Partial<VenteArchive> = {}): VenteArchive {
  return { montant_ttc: ttc, montant_ht: ht, frais_stripe_eur: 0, montant_rembourse: 0, offre: "pre-etat-date", perimetre: "b2c", ...o };
}

// Fixture rejouant l'annee 2026 de Pack vendeur au 26/11 20:00 (lue en
// lecture seule dans admin.ventes) : 124 ventes B2C a 24,99, 8 gratuites,
// 2 packs (24,00 et 118,80), deux remboursements de 24,99.
function annee2026(): VenteArchive[] {
  const v: VenteArchive[] = [];
  for (let i = 0; i < 124; i++) v.push(vente(24.99, 20.82, { montant_rembourse: i < 2 ? 24.99 : 0 }));
  for (let i = 0; i < 8; i++) v.push(vente(0, 0));
  v.push(vente(24, 20, { offre: "credits-pro-1", perimetre: "b2b" }));
  v.push(vente(118.8, 99, { offre: "credits-pro-5", perimetre: "b2b" }));
  return v;
}

Deno.test("agregerVentes : brut, net et ventilation de l'annee (cibles de l'audit)", () => {
  const t = agregerVentes(annee2026(), 0.2);
  assertEquals(t.ventes, 134);
  assertEquals(t.ventilation, { payantes: 124, gratuites: 8, packs: 2 });
  assertEquals(t.ca_ttc, 3241.56);
  assertEquals(t.ca_ht, 2700.68);
  assertEquals(t.remboursements, 49.98);
  assertEquals(t.remboursements_ht, 41.64);
  assertEquals(t.ca_net_ttc, 3191.58);
  assertEquals(t.ca_net_ht, 2659.04);
});

Deno.test("agregerVentes : 7 jours au 26/11 = 7 ventes, 174,93 TTC, 145,74 HT", () => {
  const t = agregerVentes(Array.from({ length: 7 }, () => vente(24.99, 20.82)), 0.2);
  assertEquals([t.ventes, t.ca_ttc, t.ca_ht], [7, 174.93, 145.74]);
});

Deno.test("resultat : le remboursement sort en HT (+8,34 sur l'annee)", () => {
  const t = agregerVentes(annee2026(), 0.2);
  const couts = { cout_ia: 0, charges_fixes: 0, charges_ponctuelles: 0, ads: null };
  const ht = resultat(t, couts);
  // L'ancien calcul retranchait le TTC rembourse d'un CA HT.
  const ancien = Number((t.ca_ht - t.frais_stripe - t.remboursements).toFixed(2));
  assertEquals(ht, 2659.04);
  assertEquals(Number((ht - ancien).toFixed(2)), 8.34);
  assertEquals(resultat(t, { ...couts, ads: 10 }), 2649.04);
});
