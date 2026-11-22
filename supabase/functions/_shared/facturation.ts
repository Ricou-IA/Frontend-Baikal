// Facture a la demande d'une vente Stripe, emise dans Pennylane (plan
// facturation, lot 2). Tout ce qui decide d'un montant, d'un refus ou du corps
// d'une requete est ici, pur et teste ; admin-finance fait les entrees-sorties.
//
// Regles d'Eric (expert-comptable, 21 et 22/11/2026) :
//   - la facture se calcule comme Pennylane la calcule, en une ligne :
//     HT = arrondi(encaisse / (1 + taux)), TVA = arrondi(HT x taux),
//     TTC = HT + TVA. Pour certains prix, ce TTC differe d'un centime de
//     l'encaisse (24,99 encaisses -> 20,83 + 4,17 = 25,00 factures) : l'ecart
//     est accepte, affiche avant l'emission, et borne a un centime ;
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
  /** TTC FACTURE (HT + TVA), qui peut differer d'un centime de l'encaisse. */
  ttc: number;
  ht: number;
  tva: number;
}

export interface MontantsFacture extends Montants {
  /** Ce que Stripe a encaisse. */
  encaisse: number;
  /** TTC facture - encaisse : 0, +0,01 ou -0,01. */
  ecart: number;
}

/** Les montants de la facture, calcules comme Pennylane : le HT s'arrondit,
 *  la TVA se calcule sur ce HT arrondi. */
export function montantsFacture(encaisse: number, taux: number): MontantsFacture {
  const ht = arrondi2(encaisse / (1 + taux));
  const tva = arrondi2(ht * taux);
  const ttc = arrondi2(ht + tva);
  return { encaisse: arrondi2(encaisse), ht, tva, ttc, ecart: arrondi2(ttc - encaisse) };
}

/** Au-dela d'un centime, ce n'est plus un arrondi : la facture ne part pas. */
export const ECART_MAX = 0.01;

/** Prix unitaire HT envoye a Pennylane : 6 decimales au plus (au-dela, l'API
 *  refuse la ligne), sans zeros de fin. C'est Pennylane qui recalcule les
 *  totaux : `controlerTotaux` verifie ensuite qu'ils sont ceux annonces. */
export function prixUnitaireHt(ttc: number, taux: number): string {
  const brut = (ttc / (1 + taux)).toFixed(6);
  return brut.includes(".") ? brut.replace(/0+$/, "").replace(/\.$/, "") : brut;
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

// --- La designation de la ligne -------------------------------------------------

/** Ce que la fenetre propose (et que l'utilisateur peut corriger) : le libelle
 *  de facturation du site, suivi du libelle du dossier quand le site en publie
 *  un (« Pre-etat date : <adresse du bien> »). A defaut de libelle au registre,
 *  le nom interne de l'offre : il se voit et se corrige. */
export function designationFacture(
  libelleSite: string | null | undefined,
  libelleDossier: string | null | undefined,
  offre: string,
): string {
  const site = (libelleSite ?? "").trim();
  const dossier = (libelleDossier ?? "").trim();
  if (!site) return offre.trim();
  return dossier ? `${site} : ${dossier}` : site;
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
}

/** Toujours un brouillon : la facture n'est finalisee qu'apres controle des
 *  totaux rendus par Pennylane. */
export function corpsFacture(d: DemandeFacture): Record<string, unknown> {
  const designation = d.designation.trim();
  if (!designation) throw new Error("Désignation de la ligne manquante.");
  return {
    customer_id: d.customerId,
    date: d.date,
    deadline: d.date,
    draft: true,
    currency: "EUR",
    language: "fr_FR",
    external_reference: d.reference,
    pdf_invoice_free_text: mentionPaiement(String(d.vente.paid_at), d.vente.stripe_payment_intent_id),
    invoice_lines: [{
      label: designation,
      quantity: 1,
      unit: "piece",
      raw_currency_unit_price: prixUnitaireHt(Number(d.vente.montant_ttc), d.taux),
      vat_rate: codeTva(d.taux),
      ledger_account_id: d.ledgerAccountId,
    }],
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

/** La facture ne se finalise que si Pennylane rend EXACTEMENT les montants
 *  annonces a l'ecran (HT, TVA, TTC facture). Un champ absent est un echec. */
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
      raison: `Pennylane calcule ${ttc.toFixed(2)} € TTC au lieu des ${attendus.ttc.toFixed(2)} € annoncés.`,
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
  statut: "en_cours" | "brouillon" | "emise" | "erreur";
  etape: "client" | "brouillon" | "finalisee" | null;
  pennylane_invoice_id: number | null;
  numero: string | null;
  envoyee_le: string | null;
  maj_le: string;
}

/** Duree pendant laquelle une emission « en cours » bloque la suivante : au-dela,
 *  la fonction qui la portait est morte (limite d'execution depassee). */
export const VERROU_MS = 2 * 60 * 1000;

export type Reprise = "nouvelle" | "deja_emise" | "brouillon" | "occupee" | "reprendre";

export function decisionReprise(ligne: LigneFacture | null, maintenant: Date): Reprise {
  if (!ligne) return "nouvelle";
  if (ligne.statut === "emise") return "deja_emise";
  // Le brouillon attend dans Pennylane : il s'envoie ou se supprime, il ne se
  // recree pas par-dessus.
  if (ligne.statut === "brouillon") return "brouillon";
  if (ligne.statut === "en_cours") {
    const age = maintenant.getTime() - new Date(ligne.maj_le).getTime();
    if (age < VERROU_MS) return "occupee";
  }
  return "reprendre";
}

/** Ce que la liste des ventes affiche pour une vente. */
export type EtatAffiche =
  | "aucune"
  | "en_cours"
  | "brouillon"
  | "erreur"
  | "emise_envoi_en_attente"
  | "emise_envoyee";

export function etatAffiche(ligne: LigneFacture | null): EtatAffiche {
  if (!ligne) return "aucune";
  if (ligne.statut === "emise") return ligne.envoyee_le ? "emise_envoyee" : "emise_envoi_en_attente";
  if (ligne.statut === "brouillon") return "brouillon";
  return ligne.statut === "erreur" ? "erreur" : "en_cours";
}

// --- Le mail qui porte la facture ----------------------------------------------

/** Reference externe du brouillon : le payment_intent, suivi d'un suffixe.
 *  Pennylane garde une reference « deja prise » meme apres la suppression du
 *  brouillon : sans suffixe, un brouillon supprime ne pourrait plus etre refait. */
export function referenceFacture(paymentIntent: string, maintenant: Date): string {
  return `${paymentIntent}-${maintenant.getTime().toString(36)}`;
}

/** L'expediteur du mail, ou null si le site n'en a pas d'enregistre. */
export function expediteurFacture(nom: string | null | undefined, email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e)) return null;
  const n = (nom ?? "").replace(/[<>"\r\n]/g, "").trim();
  return n ? `${n} <${e}>` : e;
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface MailFacture {
  objet: string;
  texte: string;
  html: string;
  nomFichier: string;
}

/** Mail transactionnel : la facture en piece jointe, rien d'autre. Pas de lien
 *  de desinscription, ce n'est pas un envoi commercial. Le montant n'y figure
 *  pas : il est sur la facture. */
export function mailFacture(d: { numero: string; dateFacture: string; site: string }): MailFacture {
  const numero = d.numero.trim();
  const site = d.site.trim();
  const lignes = [
    "Bonjour,",
    `Vous trouverez en pièce jointe la facture n° ${numero} du ${jourFr(d.dateFacture)}, pour votre commande sur ${site}.`,
    "Elle est déjà réglée : vous n'avez rien à payer.",
    `Cordialement,\n${site}`,
  ];
  return {
    objet: `Votre facture ${numero}`,
    texte: lignes.join("\n\n"),
    html: lignes.map((l) => `<p>${echapper(l).replace(/\n/g, "<br>")}</p>`).join(""),
    nomFichier: `facture-${numero.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`,
  };
}
