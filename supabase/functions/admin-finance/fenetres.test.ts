// Donnees de test SYNTHETIQUES : ce depot est public, aucun chiffre d'un site
// reel n'y entre (CLAUDE.md). 24,99 est un prix de catalogue public, garde pour
// verifier l'arrondi de l'archive.
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
// Un jeudi soir a Paris : 20:15 locales, 19:15 UTC.
const MAINTENANT = new Date("2026-11-26T19:15:00Z");

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

Deno.test("fenetresSynthese : 7 jours civils locaux, comme le bandeau", () => {
  const f = fenetresSynthese(MAINTENANT, PARIS);
  assertEquals(f["7j"], { du: "2026-11-20", au: "2026-11-26" });
  assertEquals(f.mois, { du: "2026-11-01", au: "2026-11-26" });
  assertEquals(f.annee, { du: "2026-01-01", au: "2026-11-26" });
  // Une vente du premier jour, avant l'heure courante, entre dans la fenetre ;
  // l'ancien glissant UTC (maintenant - 144 h) l'excluait.
  const b = bornes(f["7j"], PARIS);
  assertEquals(b, { debut: "2026-11-19T23:00:00.000Z", fin: "2026-11-26T23:00:00.000Z" });
  const vente = "2026-11-20T09:00:00.000Z";
  assertEquals(vente >= b.debut && vente < b.fin, true);
  const ancienDebut = new Date(MAINTENANT.getTime() - 6 * 86_400_000).toISOString();
  assertEquals(vente >= ancienDebut, false);
});

Deno.test("moisSerie : mois civils locaux, le mois en cours s'arrete a aujourd'hui", () => {
  const m = moisSerie(MAINTENANT, PARIS, 3);
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
  assertEquals(periodeVentes({}, MAINTENANT, PARIS), { du: "2026-01-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ periode: "3m" }, MAINTENANT, PARIS), { du: "2026-09-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ periode: "6m" }, MAINTENANT, PARIS), { du: "2026-06-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ periode: "12m" }, MAINTENANT, PARIS), { du: "2025-12-01", au: "2026-11-26" });
  assertEquals(periodeVentes({ du: "2026-07-01", au: "2026-09-30" }, MAINTENANT, PARIS), { du: "2026-07-01", au: "2026-09-30" });
  assertEquals(periodeVentes({ du: "2026-09-30", au: "2026-07-01" }, MAINTENANT, PARIS), { du: "2026-07-01", au: "2026-09-30" });
  assertEquals(periodeVentes({ du: "n'importe", au: "2026-09-30" }, MAINTENANT, PARIS), { du: "2026-01-01", au: "2026-11-26" });
});

Deno.test("filtreRemboursement : valeur inconnue = toutes", () => {
  assertEquals(filtreRemboursement("remboursees"), "remboursees");
  assertEquals(filtreRemboursement("non_remboursees"), "non_remboursees");
  assertEquals(filtreRemboursement("x"), "toutes");
  assertEquals(filtreRemboursement(undefined), "toutes");
});

Deno.test("charges : prorata 12/365 en jours civils de la fenetre", () => {
  // 30 EUR/mois depuis le 15/09 : 15/09 -> 26/11 = 73 jours = 72,00 EUR.
  const c = [{ montant_mensuel_eur: 30, debut: "2026-09-15", fin: null }];
  assertEquals(chargesSurPeriode(c, { du: "2026-01-01", au: "2026-11-26" }), 72);
  assertEquals(chargesSurPeriode(c, { du: "2026-08-01", au: "2026-08-31" }), 0);
  // Septembre clos : 30 jours, pas 31 (36,50 x 12 / 365 x 30 = 36,00).
  const s = [{ montant_mensuel_eur: 36.5, debut: "2026-01-01", fin: null }];
  assertEquals(chargesSurPeriode(s, { du: "2026-09-01", au: "2026-09-30" }), 36);
  const p = [{ montant_eur: 100, jour: "2026-11-20" }, { montant_eur: 5.5, jour: "2026-11-27" }];
  assertEquals(ponctuellesSurPeriode(p, { du: "2026-11-20", au: "2026-11-26" }), 100);
});

Deno.test("categorieVente : payante, gratuite (0 EUR), pack de credits", () => {
  assertEquals(categorieVente({ montant_ttc: 24.99, offre: "produit", perimetre: "b2c" }), "payante");
  assertEquals(categorieVente({ montant_ttc: 0, offre: "produit", perimetre: "b2c" }), "gratuite");
  assertEquals(categorieVente({ montant_ttc: 60, offre: "credits-pro-2", perimetre: "b2b" }), "pack");
  assertEquals(categorieVente({ montant_ttc: 60, offre: "autre", perimetre: "b2b" }), "pack");
});

Deno.test("remboursementHt : l'arrondi de l'archive, 24,99 -> 20,82", () => {
  assertEquals(remboursementHt(24.99, 0.2), 20.82);
  assertEquals(remboursementHt(0, 0.2), 0);
});

function vente(ttc: number, ht: number, o: Partial<VenteArchive> = {}): VenteArchive {
  return { montant_ttc: ttc, montant_ht: ht, frais_stripe_eur: 0, montant_rembourse: 0, offre: "produit", perimetre: "b2c", ...o };
}

// Fixture synthetique : 5 ventes a 24,99 (dont 1 remboursee), 2 gratuites,
// 1 pack de credits a 60,00 TTC.
function jeu(): VenteArchive[] {
  const v: VenteArchive[] = [];
  for (let i = 0; i < 5; i++) v.push(vente(24.99, 20.82, { montant_rembourse: i === 0 ? 24.99 : 0 }));
  v.push(vente(0, 0), vente(0, 0));
  v.push(vente(60, 50, { offre: "credits-pro-2", perimetre: "b2b" }));
  return v;
}

Deno.test("agregerVentes : brut, net et ventilation", () => {
  const t = agregerVentes(jeu(), 0.2);
  assertEquals(t.ventes, 8);
  assertEquals(t.ventilation, { payantes: 5, gratuites: 2, packs: 1 });
  assertEquals(t.ca_ttc, 184.95);
  assertEquals(t.ca_ht, 154.1);
  assertEquals(t.remboursements, 24.99);
  assertEquals(t.remboursements_ht, 20.82);
  assertEquals(t.ca_net_ttc, 159.96);
  assertEquals(t.ca_net_ht, 133.28);
});

Deno.test("agregerVentes : les centimes HT de l'archive s'additionnent tels quels", () => {
  const t = agregerVentes(Array.from({ length: 3 }, () => vente(24.99, 20.82)), 0.2);
  assertEquals([t.ventes, t.ca_ttc, t.ca_ht], [3, 74.97, 62.46]);
});

Deno.test("resultat : le remboursement sort en HT, pas en TTC", () => {
  const t = agregerVentes(jeu(), 0.2);
  const couts = { cout_ia: 0, charges_fixes: 0, charges_ponctuelles: 0, ads: null };
  const ht = resultat(t, couts);
  // L'ancien calcul retranchait le TTC rembourse d'un CA HT : il otait la TVA
  // du remboursement une seconde fois (24,99 - 20,82 = 4,17 par remboursement).
  const ancien = Number((t.ca_ht - t.frais_stripe - t.remboursements).toFixed(2));
  assertEquals(ht, 133.28);
  assertEquals(Number((ht - ancien).toFixed(2)), 4.17);
  assertEquals(resultat(t, { ...couts, ads: 10 }), 123.28);
});
