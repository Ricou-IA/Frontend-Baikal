// Piece de ventes d'un site sur une periode de mois entiers (plan facturation,
// lots 3 et 4 en version courte). Tout ce qui decide d'une ligne ou d'un
// montant est ici, pur et teste ; admin-finance fait les entrees-sorties.
//
// Regles d'Eric (expert-comptable, 21 et 22/11/2026) :
//   - une FACTURE par site au client « Clients particuliers », datee du dernier
//     jour de la periode, sur le compte de produits du site, TVA du site ;
//   - les ventes facturees une a une n'y figurent pas ; une vente facturee
//     individuellement APRES son mois en sort par une ligne negative ;
//   - les remboursements viennent en negatif, au mois du remboursement ;
//   - les ventes aux pros restent facturees par Stripe : hors piece ;
//   - Baikal prepare un brouillon, le comptable le finalise dans Pennylane.
import { codeTva, prixUnitaireHt } from "./facturation.ts";

function arrondi2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export interface Periode {
  /** Premier et dernier mois, AAAA-MM. */
  du: string;
  au: string;
  /** Premier jour de `du` et dernier jour de `au`, AAAA-MM-JJ. */
  premierJour: string;
  dernierJour: string;
  libelle: string;
}

/** Une periode de mois entiers. Leve si elle est mal formee ou inversee. */
export function periode(du: string, au: string): Periode {
  const re = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const a = re.exec(du);
  const b = re.exec(au);
  if (!a || !b) throw new Error("Mois attendu au format AAAA-MM.");
  if (du > au) throw new Error("Le premier mois de la période est après le dernier.");
  const [anA, moisA] = [Number(a[1]), Number(a[2])];
  const [anB, moisB] = [Number(b[1]), Number(b[2])];
  const dernier = new Date(Date.UTC(anB, moisB, 0)).getUTCDate();
  const libelle = du === au
    ? `${MOIS[moisA - 1]} ${anA}`
    : anA === anB
    ? `de ${MOIS[moisA - 1]} à ${MOIS[moisB - 1]} ${anB}`
    : `de ${MOIS[moisA - 1]} ${anA} à ${MOIS[moisB - 1]} ${anB}`;
  return {
    du,
    au,
    premierJour: `${du}-01`,
    dernierJour: `${au}-${String(dernier).padStart(2, "0")}`,
    libelle,
  };
}

/** Deux periodes se recouvrent-elles ? (dates AAAA-MM-JJ) */
export function seRecouvrent(a: { du: string; au: string }, b: { du: string; au: string }): boolean {
  return a.du <= b.au && b.du <= a.au;
}

export interface VenteMois {
  stripe_payment_intent_id: string;
  /** Jour du paiement et du remboursement, AAAA-MM-JJ, dans le fuseau du site. */
  jour_paiement: string | null;
  jour_remboursement: string | null;
  montant_ttc: number;
  montant_rembourse: number;
  offre: string;
  perimetre: string | null;
  exclue: boolean;
}

export interface FactureIndividuelle {
  stripe_payment_intent_id: string;
  /** AAAA-MM-JJ. */
  date_facture: string;
  numero: string;
}

export interface LignePiece {
  nature: "ventes" | "remboursements" | "factures_individuelles";
  libelle: string;
  quantite: number;
  /** TTC d'une unite ; negatif pour une ligne qui retire. */
  ttc_unitaire: number;
  ttc: number;
}

export interface Piece {
  periode: Periode;
  lignes: LignePiece[];
  ttc: number;
  nb_ventes: number;
  /** Ce qui n'entre pas dans la piece, pour que rien ne disparaisse sans le dire. */
  hors_piece: {
    gratuites: number;
    pros: { nombre: number; ttc: number };
    facturees_individuellement: { nombre: number; ttc: number };
    exclues: number;
  };
}

function dans(jour: string | null, p: Periode): boolean {
  return jour !== null && jour >= p.premierJour && jour <= p.dernierJour;
}

function eur(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** La piece d'une periode. `produit` : le nom du produit porte par les factures
 *  du site (NULL = le nom interne de l'offre). */
export function calculerPiece(
  ventes: VenteMois[],
  factures: FactureIndividuelle[],
  p: Periode,
  produit: string | null,
): Piece {
  const facturees = new Map(factures.map((f) => [f.stripe_payment_intent_id, f]));
  const hors = {
    gratuites: 0,
    pros: { nombre: 0, ttc: 0 },
    facturees_individuellement: { nombre: 0, ttc: 0 },
    exclues: 0,
  };
  const groupes = new Map<string, { offre: string; ttc: number; n: number }>();
  let rembourse = 0;
  let nbRemboursements = 0;
  let retire = 0;
  const numerosRetires: string[] = [];
  let nbVentes = 0;

  for (const v of ventes) {
    const pro = v.perimetre === "b2b";
    const facture = facturees.get(v.stripe_payment_intent_id);

    if (dans(v.jour_paiement, p)) {
      if (v.exclue) hors.exclues++;
      else if (pro) {
        hors.pros.nombre++;
        hors.pros.ttc = arrondi2(hors.pros.ttc + v.montant_ttc);
      } else if (v.montant_ttc <= 0) hors.gratuites++;
      else if (facture) {
        hors.facturees_individuellement.nombre++;
        hors.facturees_individuellement.ttc = arrondi2(hors.facturees_individuellement.ttc + v.montant_ttc);
      } else {
        const cle = `${v.offre}|${v.montant_ttc.toFixed(2)}`;
        const g = groupes.get(cle) ?? { offre: v.offre, ttc: v.montant_ttc, n: 0 };
        g.n++;
        groupes.set(cle, g);
        nbVentes++;
      }
    }

    // Une vente facturee individuellement se rembourse par un avoir, dans
    // Pennylane : son remboursement n'entre pas ici.
    if (!v.exclue && !pro && !facture && v.montant_rembourse > 0 && dans(v.jour_remboursement, p)) {
      rembourse = arrondi2(rembourse + v.montant_rembourse);
      nbRemboursements++;
    }

    // Facturee individuellement pendant la periode, mais vendue AVANT : la
    // piece de son mois l'avait comptee, celle-ci la retire.
    if (
      facture && !v.exclue && !pro && v.montant_ttc > 0 && dans(facture.date_facture, p) &&
      v.jour_paiement !== null && v.jour_paiement < p.premierJour
    ) {
      retire = arrondi2(retire + v.montant_ttc);
      numerosRetires.push(facture.numero);
    }
  }

  const lignes: LignePiece[] = [...groupes.values()]
    .sort((a, b) => a.offre.localeCompare(b.offre) || b.ttc - a.ttc)
    .map((g) => ({
      nature: "ventes" as const,
      libelle: `Ventes en ligne ${p.libelle} : ${(produit ?? "").trim() || g.offre} à ${eur(g.ttc)} € TTC`,
      quantite: g.n,
      ttc_unitaire: g.ttc,
      ttc: arrondi2(g.n * g.ttc),
    }));
  if (rembourse > 0) {
    lignes.push({
      nature: "remboursements",
      libelle: `Remboursements ${p.libelle} (${nbRemboursements})`,
      quantite: 1,
      ttc_unitaire: -rembourse,
      ttc: -rembourse,
    });
  }
  if (retire > 0) {
    lignes.push({
      nature: "factures_individuelles",
      libelle: `Ventes facturées individuellement (${numerosRetires.sort().join(", ")})`.slice(0, 250),
      quantite: 1,
      ttc_unitaire: -retire,
      ttc: -retire,
    });
  }

  return {
    periode: p,
    lignes,
    ttc: arrondi2(lignes.reduce((s, l) => s + l.ttc, 0)),
    nb_ventes: nbVentes,
    hors_piece: hors,
  };
}

/** Le corps du brouillon. Pennylane recalcule les totaux ligne par ligne : le
 *  TTC rendu peut differer du TTC attendu d'un centime par ligne. */
export function corpsPiece(d: {
  piece: Piece;
  customerId: number;
  ledgerAccountId: number;
  taux: number;
  reference: string;
}): Record<string, unknown> {
  if (d.piece.lignes.length === 0) throw new Error("Aucune ligne : la pièce est vide.");
  const vat = codeTva(d.taux);
  return {
    customer_id: d.customerId,
    date: d.piece.periode.dernierJour,
    deadline: d.piece.periode.dernierJour,
    draft: true,
    currency: "EUR",
    language: "fr_FR",
    external_reference: d.reference,
    pdf_invoice_free_text:
      `Pièce récapitulative des ventes en ligne aux particuliers, ${d.piece.periode.libelle}. Ventes encaissées par carte bancaire.`,
    invoice_lines: d.piece.lignes.map((l) => ({
      label: l.libelle,
      quantity: l.quantite,
      unit: "piece",
      raw_currency_unit_price: l.ttc_unitaire < 0
        ? `-${prixUnitaireHt(-l.ttc_unitaire, d.taux)}`
        : prixUnitaireHt(l.ttc_unitaire, d.taux),
      vat_rate: vat,
      ledger_account_id: d.ledgerAccountId,
    })),
  };
}

/** Ecart admis entre le TTC attendu et celui que Pennylane calcule : un
 *  centime par ligne (l'arrondi du HT, ligne par ligne). */
export function ecartAdmis(piece: Piece): number {
  return arrondi2(piece.lignes.length * 0.01);
}
