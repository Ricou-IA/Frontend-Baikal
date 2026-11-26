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
//   - les ventes aux pros, facturees une a une par Stripe, y entrent sur des
//     lignes a part (decision du 22/11/2026) : la piece porte tout le chiffre
//     d'affaires encaisse par le compte Stripe du site ;
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
  /** TTC porte par la facture (pour l'ecart avec l'encaissement). */
  montant_ttc?: number;
  /** Instant de creation de la ligne dans Baikal (ISO). Sert a rejouer une
   *  piece telle qu'elle a ete calculee le jour de sa creation. */
  cree_le?: string;
}

export type NatureMouvement = "vente" | "remboursement" | "retrait_facture";

/** Un mouvement porte par une piece : ce qui devient une ligne de
 *  admin.pieces_ventes_lignes (unique par vente et par nature). */
export interface Mouvement {
  stripe_payment_intent_id: string;
  nature: NatureMouvement;
  montant_ttc: number;
}

/** Ce que les pieces existantes portent deja, par nature. */
export interface DejaPortes {
  vente: Set<string>;
  remboursement: Set<string>;
  retrait_facture: Set<string>;
}

export function aucunPorte(): DejaPortes {
  return { vente: new Set(), remboursement: new Set(), retrait_facture: new Set() };
}

/** Range des mouvements dans un DejaPortes. */
export function porter(portes: DejaPortes, mouvements: Mouvement[]): DejaPortes {
  for (const m of mouvements) portes[m.nature].add(m.stripe_payment_intent_id);
  return portes;
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
  /** Chaque vente, remboursement ou retrait que la piece porte. */
  mouvements: Mouvement[];
  /** Ce qui n'entre pas dans la piece, pour que rien ne disparaisse sans le dire. */
  hors_piece: {
    gratuites: number;
    facturees_individuellement: { nombre: number; ttc: number };
    exclues: number;
    /** Deja portees par une autre piece : jamais comptees deux fois. */
    deja_sur_une_piece: { nombre: number; ttc: number };
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
  dejaPortes: DejaPortes = aucunPorte(),
): Piece {
  const facturees = new Map(factures.map((f) => [f.stripe_payment_intent_id, f]));
  const hors = {
    gratuites: 0,
    facturees_individuellement: { nombre: 0, ttc: 0 },
    exclues: 0,
    deja_sur_une_piece: { nombre: 0, ttc: 0 },
  };
  const mouvements: Mouvement[] = [];
  const groupes = new Map<string, { offre: string; ttc: number; n: number; pro: boolean }>();
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
      else if (v.montant_ttc <= 0) hors.gratuites++;
      else if (facture) {
        hors.facturees_individuellement.nombre++;
        hors.facturees_individuellement.ttc = arrondi2(hors.facturees_individuellement.ttc + v.montant_ttc);
      } else if (dejaPortes.vente.has(v.stripe_payment_intent_id)) {
        hors.deja_sur_une_piece.nombre++;
        hors.deja_sur_une_piece.ttc = arrondi2(hors.deja_sur_une_piece.ttc + v.montant_ttc);
      } else {
        mouvements.push({ stripe_payment_intent_id: v.stripe_payment_intent_id, nature: "vente", montant_ttc: v.montant_ttc });
        const cle = `${pro ? "pro" : "part"}|${v.offre}|${v.montant_ttc.toFixed(2)}`;
        const g = groupes.get(cle) ?? { offre: v.offre, ttc: v.montant_ttc, n: 0, pro };
        g.n++;
        groupes.set(cle, g);
        nbVentes++;
      }
    }

    // Une vente facturee individuellement se rembourse par un avoir, dans
    // Pennylane : son remboursement n'entre pas ici.
    if (
      !v.exclue && !facture && v.montant_rembourse > 0 && dans(v.jour_remboursement, p) &&
      !dejaPortes.remboursement.has(v.stripe_payment_intent_id)
    ) {
      rembourse = arrondi2(rembourse + v.montant_rembourse);
      nbRemboursements++;
      mouvements.push({
        stripe_payment_intent_id: v.stripe_payment_intent_id,
        nature: "remboursement",
        montant_ttc: -v.montant_rembourse,
      });
    }

    // Facturee individuellement pendant la periode, mais vendue AVANT : la
    // piece de son mois l'avait comptee, celle-ci la retire.
    if (
      facture && !v.exclue && v.montant_ttc > 0 && dans(facture.date_facture, p) &&
      v.jour_paiement !== null && v.jour_paiement < p.premierJour &&
      !dejaPortes.retrait_facture.has(v.stripe_payment_intent_id)
    ) {
      retire = arrondi2(retire + v.montant_ttc);
      numerosRetires.push(facture.numero);
      mouvements.push({
        stripe_payment_intent_id: v.stripe_payment_intent_id,
        nature: "retrait_facture",
        montant_ttc: -v.montant_ttc,
      });
    }
  }

  const lignes: LignePiece[] = [...groupes.values()]
    .sort((a, b) => Number(a.pro) - Number(b.pro) || a.offre.localeCompare(b.offre) || b.ttc - a.ttc)
    .map((g) => ({
      nature: "ventes" as const,
      // Les pros achetent autre chose que le produit grand public : leur ligne
      // porte le nom de l'offre, et rappelle que Stripe a deja facture.
      libelle: g.pro
        ? `Ventes aux professionnels ${p.libelle} : ${g.offre} à ${eur(g.ttc)} € TTC (factures Stripe)`
        : `Ventes en ligne ${p.libelle} : ${(produit ?? "").trim() || g.offre} à ${eur(g.ttc)} € TTC`,
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
    mouvements,
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
  /** Date de la piece, AAAA-MM-JJ. Par defaut le dernier jour de la periode ;
   *  un rattrapage de mois deja declares se date du jour ou il est passe. */
  date?: string;
}): Record<string, unknown> {
  if (d.piece.lignes.length === 0) throw new Error("Aucune ligne : la pièce est vide.");
  if (d.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error("Date de pièce mal formée.");
  const vat = codeTva(d.taux);
  const jour = d.date ?? d.piece.periode.dernierJour;
  return {
    customer_id: d.customerId,
    date: jour,
    deadline: jour,
    draft: true,
    currency: "EUR",
    language: "fr_FR",
    external_reference: d.reference,
    pdf_invoice_free_text:
      `Pièce récapitulative des ventes en ligne, ${d.piece.periode.libelle}. Ventes encaissées par carte bancaire.`,
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

/** Le mois civil qui precede `jour` (AAAA-MM-JJ), au format AAAA-MM. */
export function moisPrecedent(jour: string): string {
  const [an, mois] = jour.split("-").map(Number);
  return mois === 1 ? `${an - 1}-12` : `${an}-${String(mois - 1).padStart(2, "0")}`;
}

// --- Pieces deja faites : rattachement et anomalies ----------------------------

/** Une piece deja enregistree, telle que admin.pieces_ventes la garde. */
export interface PieceEnregistree {
  id: string;
  du: string;
  au: string;
  montant_ttc: number;
  nb_ventes: number;
  cree_le: string;
}

export interface Rattachement {
  piece_id: string;
  /** Les mouvements que la piece portait le jour de sa creation. */
  mouvements: Mouvement[];
  /** Ce que le recalcul retrouve, a comparer aux totaux enregistres. */
  recalcul: { nb_ventes: number; ttc: number };
  /** Le recalcul retrouve le nombre de ventes et le total de la piece. */
  concorde: boolean;
}

/** Rejoue une piece enregistree telle qu'elle a ete calculee le jour de sa
 *  creation : seules les factures individuelles deja connues ce jour-la en
 *  sont sorties. Ne tranche rien : si le recalcul ne retrouve pas les totaux
 *  enregistres, `concorde` est faux et rien ne doit etre rattache. */
export function rattacherPiece(
  ventes: VenteMois[],
  factures: FactureIndividuelle[],
  piece: PieceEnregistree,
  produit: string | null,
  dejaPortes: DejaPortes = aucunPorte(),
): Rattachement {
  const p = periode(piece.du.slice(0, 7), piece.au.slice(0, 7));
  const alors = factures.filter((f) => !f.cree_le || f.cree_le < piece.cree_le);
  const calc = calculerPiece(ventes, alors, p, produit, dejaPortes);
  const concorde = calc.nb_ventes === piece.nb_ventes &&
    Math.abs(calc.ttc - Number(piece.montant_ttc)) <= ecartAdmis(calc) + 1e-9;
  return {
    piece_id: piece.id,
    mouvements: calc.mouvements,
    recalcul: { nb_ventes: calc.nb_ventes, ttc: calc.ttc },
    concorde,
  };
}

export type Anomalie =
  | {
    type: "facture_ecart_montant";
    vente: string;
    numero: string;
    facture_ttc: number;
    encaisse_ttc: number;
    message: string;
  }
  | { type: "piece_non_rattachee"; piece_id: string; message: string }
  | { type: "piece_sans_concordance"; piece_id: string; message: string }
  | { type: "vente_hors_piece"; vente: string; jour: string; ttc: number; piece_id: string; message: string };

function court(pi: string): string {
  return pi.replace(/^pi_/, "").slice(0, 8);
}

/** Les factures individuelles dont le TTC differe de ce que Stripe a encaisse.
 *  Constat seulement : une facture emise se corrige par un avoir, dans
 *  Pennylane, jamais d'ici. */
export function ecartsFactures(ventes: VenteMois[], factures: FactureIndividuelle[]): Anomalie[] {
  const parPi = new Map(ventes.map((v) => [v.stripe_payment_intent_id, v]));
  const res: Anomalie[] = [];
  for (const f of factures) {
    const v = parPi.get(f.stripe_payment_intent_id);
    if (!v || f.montant_ttc === undefined) continue;
    const ecart = arrondi2(f.montant_ttc - v.montant_ttc);
    if (Math.abs(ecart) < 0.005) continue;
    res.push({
      type: "facture_ecart_montant",
      vente: court(f.stripe_payment_intent_id),
      numero: f.numero,
      facture_ttc: f.montant_ttc,
      encaisse_ttc: v.montant_ttc,
      message: `${f.numero} porte ${eur(f.montant_ttc)} € TTC pour ${eur(v.montant_ttc)} € encaissés ` +
        `(écart ${ecart > 0 ? "+" : ""}${eur(ecart)} €). À régulariser dans Pennylane si besoin, rien n'est réécrit d'ici.`,
    });
  }
  return res;
}

/** Les ventes facturables d'une periode deja couverte par une piece, que
 *  cette piece ne porte pas (ni aucune autre) : un oubli a signaler, jamais a
 *  completer d'ici. */
export function ventesHorsPiece(
  ventes: VenteMois[],
  factures: FactureIndividuelle[],
  pieces: Array<{ id: string; du: string; au: string }>,
  portes: DejaPortes,
): Anomalie[] {
  const facturees = new Set(factures.map((f) => f.stripe_payment_intent_id));
  const res: Anomalie[] = [];
  for (const v of ventes) {
    if (v.exclue || v.montant_ttc <= 0 || !v.jour_paiement) continue;
    if (facturees.has(v.stripe_payment_intent_id) || portes.vente.has(v.stripe_payment_intent_id)) continue;
    const couvrante = pieces.find((x) => v.jour_paiement! >= x.du && v.jour_paiement! <= x.au);
    if (!couvrante) continue;
    res.push({
      type: "vente_hors_piece",
      vente: court(v.stripe_payment_intent_id),
      jour: v.jour_paiement,
      ttc: v.montant_ttc,
      piece_id: couvrante.id,
      message: `Vente du ${v.jour_paiement.split("-").reverse().join("/")} (${eur(v.montant_ttc)} €) absente de la pièce ` +
        `du ${couvrante.du.split("-").reverse().join("/")} au ${couvrante.au.split("-").reverse().join("/")}. ` +
        `Signalée seulement : aucune pièce ni avoir n'est créé.`,
    });
  }
  return res;
}
