// Facture a la demande d'une vente Stripe, emise dans Pennylane (plan
// facturation, lot 2). Tout ce qui decide d'un montant, d'un refus ou du corps
// d'une requete est ici, pur et teste ; admin-finance fait les entrees-sorties.
//
// Regles d'Eric (expert-comptable, 21 et 22/11/2026) :
//   - HT = arrondi(TTC / (1 + taux)), TVA = TTC - HT : la facture sort
//     EXACTEMENT au TTC encaisse ;
//   - facture datee du jour de l'emission, avec la mention du paiement ;
//   - une vente = une facture ; une vente remboursee ne se facture pas ici.
//
// Aucune donnee nominative ne sort de ce module vers la base : le client saisi
// ne sert qu'a construire le corps envoye a Pennylane.

// --- Montants ---------------------------------------------------------------

function arrondi2(n: number): number {
  // Number.EPSILON : 20.825 est stocke 20.824999..., l'arrondi commercial doit
  // rendre 20.83 et non 20.82.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface Montants {
  ttc: number;
  ht: number;
  tva: number;
}

/** HT arrondi, TVA par difference : HT + TVA = TTC, toujours. */
export function montantsFacture(ttc: number, taux: number): Montants {
  const ht = arrondi2(ttc / (1 + taux));
  return { ttc: arrondi2(ttc), ht, tva: arrondi2(ttc - ht) };
}

/** Prix unitaire HT envoye a Pennylane : 6 decimales au plus (au-dela, l'API
 *  refuse la ligne), sans zeros de fin. C'est Pennylane qui recalcule les
 *  totaux : `controlerTotaux` verifie ensuite qu'il retombe sur le TTC. */
export function prixUnitaireHt(ttc: number, taux: number): string {
  const brut = (ttc / (1 + taux)).toFixed(6);
  return brut.includes(".") ? brut.replace(/0+$/, "").replace(/\.$/, "") : brut;
}

/** Pennylane arrondit le HT de chaque ligne, puis calcule la TVA sur ce HT
 *  arrondi (constate le 22/11/2026 : 20,825 EUR HT donne 20,83 + 4,17 = 25,00).
 *  Une seule ligne ne peut donc pas toujours retomber sur le TTC encaisse. */
export function uneLigneSuffit(ttc: number, taux: number): boolean {
  const m = montantsFacture(ttc, taux);
  return Math.round(m.ht * 100) + Math.round(m.ht * 100 * taux + 1e-9) === Math.round(m.ttc * 100);
}

export interface Decoupage {
  principale: number;
  complement: number;
}

/** Deux lignes dont les HT font le HT voulu et dont les TVA, arrondies ligne
 *  par ligne, font la TVA voulue. Le complement est le plus petit possible.
 *  Les decoupages qui tombent pile sur un demi-centime sont ecartes : leur
 *  arrondi dependrait de la regle de Pennylane. null = aucun decoupage. */
export function decoupageDeuxLignes(ttc: number, taux: number): Decoupage | null {
  const m = montantsFacture(ttc, taux);
  const ht = Math.round(m.ht * 100);
  const tva = Math.round(m.tva * 100);
  const demi = (x: number) => Math.abs((x % 1) - 0.5) < 1e-6;
  for (let b = 1; b < ht && b <= 99; b++) {
    const a = ht - b;
    const ta = a * taux;
    const tb = b * taux;
    if (demi(ta) || demi(tb)) continue;
    if (Math.round(ta) + Math.round(tb) === tva) {
      return { principale: a / 100, complement: b / 100 };
    }
  }
  return null;
}

const CODES_TVA: Array<[number, string]> = [
  [0.2, "FR_200"],
  [0.1, "FR_100"],
  [0.055, "FR_55"],
];

/** Code de TVA de Pennylane pour un taux du registre. Un taux sans code ne
 *  retombe jamais sur 20 % en silence. */
export function codeTva(taux: number): string {
  const trouve = CODES_TVA.find(([t]) => Math.abs(t - taux) < 1e-9);
  if (!trouve) throw new Error(`Taux de TVA sans code Pennylane : ${taux}`);
  return trouve[1];
}

// --- La vente est-elle facturable ? ------------------------------------------

export interface VenteAFacturer {
  stripe_payment_intent_id: string;
  paid_at: string | null;
  montant_ttc: number;
  montant_rembourse: number;
  offre: string;
  exclue?: boolean;
}

export interface SiteFacturation {
  compte_produit: string | null;
  tva_taux: number | null;
}

export type Facturable = { ok: true } | { ok: false; raison: string };

export function venteFacturable(vente: VenteAFacturer, site: SiteFacturation): Facturable {
  if (!site.compte_produit) {
    return { ok: false, raison: "Aucun compte de produits n'est saisi pour ce site." };
  }
  if (vente.exclue) return { ok: false, raison: "Cette vente est exclue des comptes." };
  if (!vente.paid_at) return { ok: false, raison: "Cette vente n'est pas encaissée." };
  if (!/^pi_/.test(vente.stripe_payment_intent_id)) {
    return { ok: false, raison: "Cette vente n'a pas de paiement Stripe (vente gratuite)." };
  }
  if (!(Number(vente.montant_ttc) > 0)) {
    return { ok: false, raison: "Le montant encaissé est nul." };
  }
  if (Number(vente.montant_rembourse) > 0) {
    return {
      ok: false,
      raison: "Cette vente est remboursée, en tout ou en partie : la facture se fait dans Pennylane.",
    };
  }
  return { ok: true };
}

// --- Le client saisi ----------------------------------------------------------

export interface ClientSaisi {
  type: "particulier" | "societe";
  prenom?: string;
  nom?: string;
  raison_sociale?: string;
  adresse: string;
  code_postal: string;
  ville: string;
  pays?: string;
  email: string;
}

export type ClientValide =
  | { ok: true; client: ClientSaisi }
  | { ok: false; erreurs: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Normalise et controle la saisie. Rien n'est devine : un champ manquant est
 *  une erreur dite, pas une valeur par defaut (sauf le pays, la France). */
// deno-lint-ignore no-explicit-any
export function validerClient(saisie: any): ClientValide {
  const erreurs: string[] = [];
  const type = saisie?.type === "societe" ? "societe" : saisie?.type === "particulier" ? "particulier" : null;
  if (!type) erreurs.push("Particulier ou société : à choisir.");

  const prenom = texte(saisie?.prenom);
  const nom = texte(saisie?.nom);
  const raison = texte(saisie?.raison_sociale);
  if (type === "particulier") {
    if (!prenom) erreurs.push("Prénom manquant.");
    if (!nom) erreurs.push("Nom manquant.");
  }
  if (type === "societe" && !raison) erreurs.push("Raison sociale manquante.");

  const adresse = texte(saisie?.adresse);
  const codePostal = texte(saisie?.code_postal);
  const ville = texte(saisie?.ville);
  const pays = (texte(saisie?.pays) || "FR").toUpperCase();
  const email = texte(saisie?.email).toLowerCase();
  if (!adresse) erreurs.push("Adresse manquante.");
  if (!codePostal) erreurs.push("Code postal manquant.");
  if (!ville) erreurs.push("Ville manquante.");
  if (!/^[A-Z]{2}$/.test(pays)) erreurs.push("Pays : code à deux lettres attendu (FR).");
  if (!EMAIL.test(email)) erreurs.push("E-mail d'envoi invalide.");

  if (erreurs.length > 0 || !type) return { ok: false, erreurs };
  return {
    ok: true,
    client: {
      type,
      ...(type === "particulier" ? { prenom, nom } : { raison_sociale: raison }),
      adresse,
      code_postal: codePostal,
      ville,
      pays,
      email,
    },
  };
}

/** Requete de creation du client dans Pennylane. Les deux schemas refusent
 *  toute propriete en plus : un particulier n'a pas de `name`, une societe n'a
 *  ni `first_name` ni `last_name`. */
export function corpsClient(client: ClientSaisi): { chemin: string; corps: Record<string, unknown> } {
  const commun = {
    emails: [client.email],
    billing_address: {
      address: client.adresse,
      postal_code: client.code_postal,
      city: client.ville,
      country_alpha2: client.pays ?? "FR",
    },
  };
  if (client.type === "societe") {
    return { chemin: "/company_customers", corps: { name: client.raison_sociale, ...commun } };
  }
  return {
    chemin: "/individual_customers",
    corps: { first_name: client.prenom, last_name: client.nom, ...commun },
  };
}

// --- Le compte de produits ------------------------------------------------------

export interface CompteLu {
  id: number;
  number: string;
  vat_rate?: string | null;
  country_alpha2?: string | null;
  enabled?: boolean | null;
}

/** Pennylane tient un identifiant par couple (numero, taux de TVA). On prend la
 *  declinaison du taux voulu (France d'abord), sinon le compte generique.
 *  null = le compte n'existe pas : la facture ne part pas. */
export function choisirCompte(comptes: CompteLu[], numero: string, vat: string): number | null {
  const duNumero = comptes.filter((c) => String(c.number) === numero && c.enabled !== false);
  if (duNumero.length === 0) return null;
  const exacts = duNumero.filter((c) => c.vat_rate === vat);
  const exact = exacts.find((c) => c.country_alpha2 === "FR") ?? exacts[0];
  const generique = duNumero.find((c) => !c.vat_rate || c.vat_rate === "any");
  return (exact ?? generique ?? duNumero[0]).id;
}

// --- Le corps de la facture -----------------------------------------------------

function jourFr(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

/** Mention portee par la facture : elle est emise apres l'encaissement. */
export function mentionPaiement(paidAt: string, paymentIntent: string): string {
  return `Facture acquittée. Payée le ${jourFr(paidAt)} par carte bancaire (référence ${paymentIntent}).`;
}

export interface DemandeFacture {
  customerId: number;
  /** Jour de l'emission, AAAA-MM-JJ. */
  date: string;
  vente: VenteAFacturer;
  designation: string;
  ledgerAccountId: number;
  taux: number;
  /** Reference externe : le payment_intent pour une vraie facture (Pennylane
   *  refuse alors un doublon), une reference jetable pour un essai. */
  reference: string;
  /** Facture en deux lignes (voir decoupageDeuxLignes). Absent : une ligne. */
  decoupage?: Decoupage & { libelleComplement: string };
}

/** Toujours un brouillon : la facture n'est finalisee qu'apres controle des
 *  totaux rendus par Pennylane. */
export function corpsFacture(d: DemandeFacture): Record<string, unknown> {
  const designation = d.designation.trim();
  if (!designation) throw new Error("Désignation de la ligne manquante.");
  const ligne = (label: string, prix: string) => ({
    label,
    quantity: 1,
    unit: "piece",
    raw_currency_unit_price: prix,
    vat_rate: codeTva(d.taux),
    ledger_account_id: d.ledgerAccountId,
  });
  const lignes = d.decoupage
    ? [
      ligne(designation, d.decoupage.principale.toFixed(2)),
      ligne(d.decoupage.libelleComplement, d.decoupage.complement.toFixed(2)),
    ]
    : [ligne(designation, prixUnitaireHt(Number(d.vente.montant_ttc), d.taux))];
  return {
    customer_id: d.customerId,
    date: d.date,
    deadline: d.date,
    draft: true,
    currency: "EUR",
    language: "fr_FR",
    external_reference: d.reference,
    pdf_invoice_free_text: mentionPaiement(String(d.vente.paid_at), d.vente.stripe_payment_intent_id),
    invoice_lines: lignes,
  };
}

// --- Controle de ce que Pennylane a calcule ------------------------------------

export type Controle =
  | { ok: true; rendus: Montants }
  | { ok: false; rendus: Partial<Montants>; raison: string };

// deno-lint-ignore no-explicit-any
function nombre(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? arrondi2(n) : null;
}

/** La facture ne se finalise que si Pennylane retombe au centime sur le TTC
 *  encaisse ET sur le decoupage HT / TVA decide. Un champ absent est un echec. */
// deno-lint-ignore no-explicit-any
export function controlerTotaux(facture: any, attendus: Montants): Controle {
  const ttc = nombre(facture?.currency_amount ?? facture?.amount);
  const ht = nombre(facture?.currency_amount_before_tax);
  const tva = nombre(facture?.currency_tax ?? facture?.tax);
  const rendus = {
    ...(ttc !== null ? { ttc } : {}),
    ...(ht !== null ? { ht } : {}),
    ...(tva !== null ? { tva } : {}),
  };
  if (ttc === null || ht === null || tva === null) {
    return { ok: false, rendus, raison: "Pennylane n'a pas rendu les totaux de la facture." };
  }
  if (ttc !== attendus.ttc) {
    return {
      ok: false,
      rendus,
      raison: `Pennylane calcule ${ttc.toFixed(2)} € TTC pour ${attendus.ttc.toFixed(2)} € encaissés.`,
    };
  }
  if (ht !== attendus.ht || tva !== attendus.tva) {
    return {
      ok: false,
      rendus,
      raison: `Pennylane découpe en HT ${ht.toFixed(2)} € et TVA ${tva.toFixed(2)} €, ` +
        `au lieu de HT ${attendus.ht.toFixed(2)} € et TVA ${attendus.tva.toFixed(2)} €.`,
    };
  }
  return { ok: true, rendus: { ttc, ht, tva } };
}

// --- Reprise : que faire d'une emission deja commencee ? ------------------------

export interface LigneFacture {
  statut: "en_cours" | "emise" | "erreur";
  etape: "client" | "brouillon" | "finalisee" | null;
  pennylane_invoice_id: number | null;
  numero: string | null;
  envoyee_le: string | null;
  maj_le: string;
}

/** Duree pendant laquelle une emission « en cours » bloque la suivante : au-dela,
 *  la fonction qui la portait est morte (limite d'execution depassee). */
export const VERROU_MS = 2 * 60 * 1000;

export type Reprise = "nouvelle" | "deja_emise" | "occupee" | "reprendre";

export function decisionReprise(ligne: LigneFacture | null, maintenant: Date): Reprise {
  if (!ligne) return "nouvelle";
  if (ligne.statut === "emise") return "deja_emise";
  if (ligne.statut === "en_cours") {
    const age = maintenant.getTime() - new Date(ligne.maj_le).getTime();
    if (age < VERROU_MS) return "occupee";
  }
  return "reprendre";
}

/** Ce que la liste des ventes affiche pour une vente. */
export type EtatAffiche = "aucune" | "en_cours" | "erreur" | "emise_envoi_en_attente" | "emise_envoyee";

export function etatAffiche(ligne: LigneFacture | null): EtatAffiche {
  if (!ligne) return "aucune";
  if (ligne.statut === "emise") return ligne.envoyee_le ? "emise_envoyee" : "emise_envoi_en_attente";
  return ligne.statut === "erreur" ? "erreur" : "en_cours";
}
