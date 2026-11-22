// Facture a la demande d'une vente (plan facturation, lot 2) : les
// entrees-sorties. Les regles sont dans _shared/facturation.ts, l'API de
// Pennylane dans _shared/pennylane.ts.
//
// Deux gestes, chaque etape enregistree avant la suivante pour qu'un arret en
// chemin se reprenne sans rien refaire :
//   1. « Creer le brouillon » : client (cherche par e-mail, cree s'il manque)
//      -> brouillon -> controle des totaux rendus par Pennylane. Le brouillon
//      RESTE dans Pennylane, ou il peut etre relu ; aucun numero n'est consomme.
//   2. « Finaliser et envoyer » : relecture du brouillon, controle des totaux,
//      finalisation (la facture prend son numero), puis envoi du PDF par Resend
//      a l'adresse de la fiche du client (rejouable : le PDF met parfois
//      quelques instants a etre pret).
//   Un brouillon se supprime tant qu'il n'est pas finalise.
//
// Rien de nominatif n'est ecrit en base ni journalise : le nom, l'adresse et
// l'e-mail ne font que traverser la fonction, de Stripe et de l'ecran vers
// Pennylane, puis de Pennylane vers Resend.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, lecteurSite } from "../_shared/sites.ts";
import {
  choisirCompte,
  codeTva,
  controlerTotaux,
  corpsClient,
  corpsFacture,
  decisionReprise,
  designationFacture,
  ECART_MAX,
  etatAffiche,
  expediteurFacture,
  type LigneFacture,
  mailFacture,
  montantsFacture,
  referenceFacture,
  validerClient,
  type VenteAFacturer,
  venteFacturable,
} from "../_shared/facturation.ts";
import { refStripeValide } from "../_shared/finance-comptes.ts";
import {
  chercherClient,
  comptesDuNumero,
  creerBrouillon,
  creerClient,
  daterBrouillon,
  emailsDuClient,
  ErreurPennylane,
  finaliser,
  lireFacture,
  moi,
  pdfFacture,
  supprimerBrouillon,
} from "../_shared/pennylane.ts";
import { envoyerResend } from "../_shared/mailing/envoi.ts";

const TVA_DEFAUT = 0.20;

/** Refus metier : l'appelant le rend tel quel, avec son statut HTTP. */
export class RefusFacture extends Error {
  constructor(message: string, readonly statut = 409) {
    super(message);
  }
}

interface Contexte {
  vente: VenteAFacturer & { id: string; app_id: string };
  site: {
    id: string;
    compte_produit: string | null;
    tva_taux: number;
    stripe_key_ref: string | null;
    facture_libelle: string | null;
    name: string;
    nom_public: string | null;
    expediteur_nom: string | null;
    expediteur_email: string | null;
    resend_key_ref: string | null;
  };
}

async function charger(admin: SupabaseClient, appId: string, venteId: string): Promise<Contexte> {
  const { data: v, error: errVente } = await admin.schema("admin").from("ventes_enrichies")
    .select("id, app_id, stripe_payment_intent_id, paid_at, montant_ttc, montant_rembourse, offre, exclue")
    .eq("id", venteId).eq("app_id", appId).maybeSingle();
  if (errVente) throw new Error(`lecture de la vente: ${errVente.message}`);
  if (!v) throw new RefusFacture("Vente introuvable pour ce site", 404);

  const { data: s, error: errSite } = await admin.schema("config").from("apps")
    .select(
      "id, name, compte_produit, tva_taux, stripe_key_ref, facture_libelle, nom_public, expediteur_nom, expediteur_email, resend_key_ref",
    ).eq("id", appId).maybeSingle();
  if (errSite) throw new Error(`lecture du site: ${errSite.message}`);
  if (!s) throw new RefusFacture("Site introuvable", 404);

  return {
    vente: {
      ...v,
      montant_ttc: Number(v.montant_ttc),
      montant_rembourse: Number(v.montant_rembourse ?? 0),
      offre: String(v.offre ?? ""),
    },
    site: { ...s, tva_taux: Number(s.tva_taux ?? TVA_DEFAUT) },
  };
}

async function ligneDe(admin: SupabaseClient, paymentIntent: string): Promise<(LigneFacture & any) | null> {
  const { data, error } = await admin.schema("admin").from("factures")
    .select("*").eq("stripe_payment_intent_id", paymentIntent).maybeSingle();
  if (error) throw new Error(`lecture de la facture: ${error.message}`);
  return data ?? null;
}

async function noter(admin: SupabaseClient, id: string, champs: Record<string, unknown>): Promise<void> {
  const { error } = await admin.schema("admin").from("factures")
    .update({ ...champs, maj_le: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`enregistrement de la facture: ${error.message}`);
}

/** Ce que la liste et l'ecran lisent d'une ligne : jamais l'identifiant interne
 *  de Pennylane, jamais un message d'erreur brut au-dela de 300 caracteres. */
function resume(ligne: any): Record<string, unknown> | null {
  if (!ligne) return null;
  return {
    etat: etatAffiche(ligne),
    numero: ligne.numero ?? null,
    date_facture: ligne.date_facture ?? null,
    envoyee_le: ligne.envoyee_le ?? null,
    erreur: ligne.erreur ? String(ligne.erreur).slice(0, 300) : null,
  };
}

/** Etat de facturation des ventes d'une liste, par payment_intent. */
export async function facturesDesVentes(
  admin: SupabaseClient,
  appId: string,
  paymentIntents: string[],
): Promise<Record<string, unknown>> {
  const parPi: Record<string, unknown> = {};
  for (let i = 0; i < paymentIntents.length; i += 200) {
    const lot = paymentIntents.slice(i, i + 200);
    const { data, error } = await admin.schema("admin").from("factures")
      .select("stripe_payment_intent_id, statut, etape, pennylane_invoice_id, numero, date_facture, envoyee_le, erreur, maj_le")
      .eq("app_id", appId).in("stripe_payment_intent_id", lot);
    if (error) throw new Error(`lecture des factures: ${error.message}`);
    for (const l of data ?? []) parPi[l.stripe_payment_intent_id] = resume(l);
  }
  return parPi;
}

// --- Le payeur, lu en direct dans Stripe ---------------------------------------

async function lirePayeur(ctx: Contexte): Promise<Record<string, string>> {
  const cles: string[] = [];
  const ref = ctx.site.stripe_key_ref;
  if (ref && refStripeValide(ref) && Deno.env.get(ref)) cles.push(Deno.env.get(ref)!);
  const commune = Deno.env.get("ADMIN_STRIPE_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY");
  if (commune) cles.push(commune);
  if (cles.length === 0) throw new Error("Aucune clé Stripe pour lire le payeur");

  // Le compte du site d'abord, le compte commun ensuite : une vente ancienne a
  // pu etre encaissee dans le compte commun avant que le site ait le sien.
  let dernier = 0;
  for (const cle of cles) {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_intents/${
        encodeURIComponent(ctx.vente.stripe_payment_intent_id)
      }?expand[]=latest_charge`,
      { headers: { Authorization: `Bearer ${cle}` } },
    );
    dernier = res.status;
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Stripe a répondu ${res.status} à la lecture du paiement`);
    const pi = await res.json();
    const charge = typeof pi?.latest_charge === "object" ? pi.latest_charge : null;
    const f = charge?.billing_details ?? {};
    const a = f.address ?? {};
    return {
      nom: String(f.name ?? ""),
      email: String(f.email ?? pi?.receipt_email ?? ""),
      adresse: [a.line1, a.line2].filter(Boolean).join(", "),
      code_postal: String(a.postal_code ?? ""),
      ville: String(a.city ?? ""),
      pays: String(a.country ?? "FR"),
    };
  }
  throw new Error(`Paiement introuvable dans Stripe (dernier statut ${dernier})`);
}

/** Le libelle du dossier chez le site (l'adresse du bien pour un pre-etat
 *  date), lu dans sa vue baikal_dossiers par le payment_intent. null si le site
 *  ne publie ni la vue ni la colonne : la designation s'en passe. */
async function libelleDossier(admin: SupabaseClient, ctx: Contexte): Promise<string | null> {
  const site = await chargerSite(admin, ctx.site.id);
  const sql = lecteurSite(site, 5000);
  try {
    for (const schema of [site.db_schema, "public"].filter((s): s is string => Boolean(s))) {
      const [r] = await sql`SELECT to_regclass(${schema + ".baikal_dossiers"}) IS NOT NULL AS ok`;
      if (!r.ok) continue;
      const lignes = await sql`
        SELECT * FROM ${sql(schema)}.baikal_dossiers
        WHERE stripe_payment_intent_id = ${ctx.vente.stripe_payment_intent_id} LIMIT 1`;
      const libelle = lignes[0]?.libelle;
      return typeof libelle === "string" && libelle.trim() ? libelle.trim() : null;
    }
    return null;
  } finally {
    await sql.end();
  }
}

/** Ouverture de la fenetre : la vente, ses montants, le payeur lu dans Stripe. */
export async function preparerFacture(admin: SupabaseClient, appId: string, venteId: string) {
  const ctx = await charger(admin, appId, venteId);
  const facturable = venteFacturable(ctx.vente, ctx.site);
  const existante = await ligneDe(admin, ctx.vente.stripe_payment_intent_id);
  let payeur: Record<string, string> | null = null;
  let payeurErreur: string | null = null;
  let dossier: string | null = null;
  if (facturable.ok) {
    try {
      payeur = await lirePayeur(ctx);
    } catch (e) {
      // La fenetre reste utilisable : tout se saisit a la main.
      payeurErreur = (e as Error).message;
    }
    try {
      dossier = await libelleDossier(admin, ctx);
    } catch (e) {
      // Sans le libelle du dossier, la designation se complete a la main.
      console.error("[admin-finance] libelle du dossier illisible:", (e as Error).message);
    }
  }
  return {
    facturable: facturable.ok,
    raison: facturable.ok ? null : facturable.raison,
    montants: montantsFacture(ctx.vente.montant_ttc, ctx.site.tva_taux),
    designation: designationFacture(ctx.site.facture_libelle, dossier, ctx.vente.offre),
    paye_le: ctx.vente.paid_at,
    compte_produit: ctx.site.compte_produit,
    payeur,
    payeur_erreur: payeurErreur,
    facture: resume(existante),
  };
}

// --- Les trois gestes : brouillon, envoi, suppression ----------------------------

async function compteDuSite(ctx: Contexte): Promise<number> {
  const numero = String(ctx.site.compte_produit);
  const id = choisirCompte(await comptesDuNumero(numero), numero, codeTva(ctx.site.tva_taux));
  if (id === null) {
    throw new RefusFacture(`Le compte de produits ${numero} n'existe pas dans Pennylane.`, 409);
  }
  return id;
}

async function clientPennylane(client: any): Promise<{ id: number; existant: boolean }> {
  const connu = await chercherClient(client.email);
  if (connu) return { id: connu.id, existant: true };
  const { chemin, corps } = corpsClient(client);
  return { id: await creerClient(chemin, corps), existant: false };
}

/** Le jour d'aujourd'hui a Paris, AAAA-MM-JJ : c'est la date d'une facture. */
function aujourdhui(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

const OCCUPEE = "Une opération est déjà en cours pour cette vente. Réessayez dans deux minutes.";

/** Prend la ligne d'une vente : personne d'autre n'y touche tant qu'elle est
 *  « en_cours ». Zero ligne mise a jour = un autre clic l'a prise entre-temps. */
async function prendre(admin: SupabaseClient, ligne: any): Promise<any> {
  const { data, error } = await admin.schema("admin").from("factures")
    .update({ statut: "en_cours", erreur: null, maj_le: new Date().toISOString() })
    .eq("id", ligne.id).eq("maj_le", ligne.maj_le).eq("statut", ligne.statut)
    .select("*");
  if (error) throw new Error(`prise de la vente: ${error.message}`);
  if (!data || data.length === 0) throw new RefusFacture(OCCUPEE);
  return data[0];
}

export interface DemandeBrouillon {
  appId: string;
  venteId: string;
  client: unknown;
  designation?: string;
  userId: string | null;
}

/** Premier geste : le client et le brouillon sont crees dans Pennylane, les
 *  totaux controles. Le brouillon y reste, aucun numero n'est consomme. */
export async function creerBrouillonFacture(admin: SupabaseClient, d: DemandeBrouillon) {
  const ctx = await charger(admin, d.appId, d.venteId);
  const facturable = venteFacturable(ctx.vente, ctx.site);
  if (!facturable.ok) throw new RefusFacture(facturable.raison);
  const saisie = validerClient(d.client);
  if (!saisie.ok) throw new RefusFacture(saisie.erreurs.join(" "), 400);

  const attendus = montantsFacture(ctx.vente.montant_ttc, ctx.site.tva_taux);
  if (Math.abs(attendus.ecart) > ECART_MAX + 1e-9) {
    throw new RefusFacture("L'écart entre le montant facturé et le montant encaissé dépasse un centime.");
  }
  const designation = (d.designation ?? "").trim() ||
    designationFacture(ctx.site.facture_libelle, null, ctx.vente.offre);
  const pi = ctx.vente.stripe_payment_intent_id;

  const existante = await ligneDe(admin, pi);
  const decision = decisionReprise(existante, new Date());
  if (decision === "deja_emise") return { deja_emise: true, facture: resume(existante) };
  if (decision === "brouillon") {
    throw new RefusFacture("Un brouillon existe déjà pour cette vente : envoyez-le ou supprimez-le.");
  }
  if (decision === "occupee") throw new RefusFacture(OCCUPEE);

  let ligne: any;
  if (decision === "nouvelle") {
    const { data, error } = await admin.schema("admin").from("factures").insert({
      app_id: ctx.site.id,
      stripe_payment_intent_id: pi,
      statut: "en_cours",
      montant_ttc: attendus.ttc,
      montant_ht: attendus.ht,
      cree_par: d.userId,
    }).select("*").maybeSingle();
    if (error) {
      // Violation d'unicite : un autre clic vient de prendre la vente.
      if (error.code === "23505") throw new RefusFacture(OCCUPEE);
      throw new Error(`prise de la vente: ${error.message}`);
    }
    ligne = data;
  } else {
    ligne = await prendre(admin, existante);
  }

  try {
    // Une operation arretee en chemin a pu laisser une facture chez Pennylane.
    const laissee = ligne.pennylane_invoice_id ? await lireFacture(Number(ligne.pennylane_invoice_id)) : null;
    if (laissee && !laissee.brouillon) {
      if (!laissee.numero) throw new Error("Une facture définitive existe sans numéro dans Pennylane");
      await noter(admin, ligne.id, {
        statut: "emise",
        etape: "finalisee",
        numero: laissee.numero,
        date_facture: laissee.date ?? aujourdhui(),
      });
      return { deja_emise: true, facture: resume(await ligneDe(admin, pi)) };
    }
    if (laissee) await supprimerBrouillon(laissee.id);

    const client = await clientPennylane(saisie.client);
    await noter(admin, ligne.id, { etape: "client", pennylane_invoice_id: null });
    const brouillon = await creerBrouillon(corpsFacture({
      customerId: client.id,
      date: aujourdhui(),
      vente: ctx.vente,
      designation,
      ledgerAccountId: await compteDuSite(ctx),
      taux: ctx.site.tva_taux,
      reference: referenceFacture(pi, new Date()),
    }));
    await noter(admin, ligne.id, { pennylane_invoice_id: brouillon.id });

    const controle = controlerTotaux(brouillon.brut, attendus);
    if (!controle.ok) {
      // Un brouillon aux mauvais montants ne reste pas : il n'aurait qu'un usage,
      // etre envoye par erreur.
      await supprimerBrouillon(brouillon.id);
      await noter(admin, ligne.id, { pennylane_invoice_id: null });
      throw new RefusFacture(`${controle.raison} Le brouillon a été supprimé, rien n'est émis.`);
    }
    await noter(admin, ligne.id, { statut: "brouillon", etape: "brouillon", erreur: null });
    return {
      deja_emise: false,
      client_existant: client.existant,
      rendus: controle.rendus,
      facture: resume(await ligneDe(admin, pi)),
    };
  } catch (e) {
    await noter(admin, ligne.id, { statut: "erreur", erreur: String((e as Error).message).slice(0, 500) });
    throw e;
  }
}

// --- L'envoi du PDF par Resend ---------------------------------------------------

interface Expedition {
  de: string;
  cle: string;
  site: string;
}

/** Ce qu'il faut pour envoyer, verifie AVANT de rendre la facture definitive :
 *  on ne consomme pas un numero pour une facture qu'on ne saura pas envoyer. */
function expedition(ctx: Contexte): Expedition {
  const de = expediteurFacture(ctx.site.expediteur_nom, ctx.site.expediteur_email);
  if (!de) {
    throw new RefusFacture("Ce site n'a pas d'expéditeur d'e-mails : renseignez-le dans Paramétrage.");
  }
  const ref = ctx.site.resend_key_ref;
  const cle = ref && /^[A-Z][A-Z0-9_]{2,63}$/.test(ref) ? Deno.env.get(ref) : null;
  if (!cle) {
    throw new RefusFacture("Ce site n'a pas de compte d'envoi d'e-mails (Resend) : renseignez-le dans Paramétrage.");
  }
  return { de, cle, site: (ctx.site.nom_public ?? "").trim() || ctx.site.name };
}

function base64(octets: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function destinataire(clientId: number | null): Promise<string> {
  const emails = clientId === null ? [] : await emailsDuClient(clientId);
  if (emails.length === 0) {
    throw new RefusFacture("La fiche du client n'a pas d'adresse e-mail dans Pennylane : ajoutez-la, puis renvoyez.");
  }
  return emails[0];
}

/** Envoie la facture definitive. false = le PDF n'est pas encore pret chez
 *  Pennylane : ce n'est pas un echec, l'envoi se rejoue. */
async function envoyerPdf(
  exp: Expedition,
  f: { id: number; numero: string; date: string; clientId: number | null; pi: string },
  essais: number,
): Promise<boolean> {
  const a = await destinataire(f.clientId);
  let pdf: Uint8Array | null = null;
  for (let i = 0; i < essais && !pdf; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 5000));
    pdf = await pdfFacture(f.id);
  }
  if (!pdf) return false;

  const mail = mailFacture({ numero: f.numero, dateFacture: f.date, site: exp.site });
  const r = await envoyerResend(exp.cle, {
    from: exp.de,
    to: a,
    subject: mail.objet,
    html: mail.html,
    text: mail.texte,
    attachments: [{ filename: mail.nomFichier, content: base64(pdf) }],
    // Un double clic ou un rejeu dans la journee ne fait pas partir deux mails.
    idempotencyKey: `facture-${f.pi}`,
  });
  // Le message de Resend peut citer l'adresse : il ne se garde pas en base.
  if (!r.ok) throw new Error(`Resend a refusé l'envoi (${String(r.erreur ?? "").slice(0, 40)})`);
  return true;
}

async function envoyerEtNoter(admin: SupabaseClient, ctx: Contexte, exp: Expedition, ligne: any, essais: number) {
  const facture = await lireFacture(Number(ligne.pennylane_invoice_id));
  if (!facture) throw new Error("La facture émise est introuvable dans Pennylane");
  let envoyee = false;
  let envoiErreur: string | null = null;
  try {
    envoyee = await envoyerPdf(exp, {
      id: facture.id,
      numero: String(ligne.numero),
      date: String(ligne.date_facture),
      clientId: facture.clientId,
      pi: ctx.vente.stripe_payment_intent_id,
    }, essais);
    if (envoyee) await noter(admin, ligne.id, { envoyee_le: new Date().toISOString(), erreur: null });
  } catch (e) {
    envoiErreur = (e as Error).message;
    await noter(admin, ligne.id, { erreur: `envoi: ${envoiErreur}`.slice(0, 500) });
  }
  return {
    envoyee,
    envoi_erreur: envoiErreur,
    facture: resume(await ligneDe(admin, ctx.vente.stripe_payment_intent_id)),
  };
}

/** Second geste : le brouillon devient la facture definitive (elle prend son
 *  numero), puis part par e-mail. Rejouable : sur une facture deja emise, seul
 *  l'envoi manquant est refait. */
export async function envoyerFacture(admin: SupabaseClient, appId: string, venteId: string) {
  const ctx = await charger(admin, appId, venteId);
  const pi = ctx.vente.stripe_payment_intent_id;
  const lue = await ligneDe(admin, pi);
  if (!lue) throw new RefusFacture("Cette vente n'a pas de brouillon : créez-le d'abord.");
  const exp = expedition(ctx);

  if (lue.statut === "emise") {
    if (lue.envoyee_le) return { deja_emise: true, envoyee: true, envoi_erreur: null, facture: resume(lue) };
    return { deja_emise: true, ...(await envoyerEtNoter(admin, ctx, exp, lue, 2)) };
  }
  const decision = decisionReprise(lue, new Date());
  if (decision === "occupee") throw new RefusFacture(OCCUPEE);
  if (!lue.pennylane_invoice_id) throw new RefusFacture("Cette vente n'a pas de brouillon : créez-le d'abord.");

  const facturable = venteFacturable(ctx.vente, ctx.site);
  if (!facturable.ok) throw new RefusFacture(facturable.raison);
  const attendus = montantsFacture(ctx.vente.montant_ttc, ctx.site.tva_taux);

  const ligne = await prendre(admin, lue);
  let emise = false;
  try {
    let facture = await lireFacture(Number(ligne.pennylane_invoice_id));
    if (!facture) {
      throw new RefusFacture("Le brouillon n'existe plus dans Pennylane : supprimez-le ici, puis recréez-le.");
    }
    if (facture.brouillon) {
      // Le destinataire se verifie avant le numero, pas apres.
      await destinataire(facture.clientId);
      const jour = aujourdhui();
      if (facture.date !== jour) facture = await daterBrouillon(facture.id, jour);
      // Le brouillon a pu etre retouche dans Pennylane : il ne part que s'il
      // porte toujours les montants de la vente.
      const controle = controlerTotaux(facture.brut, attendus);
      if (!controle.ok) {
        throw new RefusFacture(`${controle.raison} Le brouillon n'est pas envoyé : corrigez-le ou supprimez-le.`);
      }
      facture = await finaliser(facture.id);
    }
    if (!facture.numero) throw new Error("La facture est finalisée mais Pennylane n'a pas rendu son numéro");

    await noter(admin, ligne.id, {
      statut: "emise",
      etape: "finalisee",
      numero: facture.numero,
      date_facture: facture.date ?? aujourdhui(),
      erreur: null,
    });
    emise = true;
  } catch (e) {
    // Rien n'est emis : la vente retrouve son brouillon, avec la raison du refus.
    if (!emise) {
      await noter(admin, ligne.id, { statut: "brouillon", erreur: String((e as Error).message).slice(0, 500) });
    }
    throw e;
  }
  const emiseLue = await ligneDe(admin, pi);
  return { deja_emise: false, ...(await envoyerEtNoter(admin, ctx, exp, emiseLue, 3)) };
}

/** Abandon d'un brouillon : il disparait de Pennylane et la vente redevient
 *  facturable. Une facture definitive ne se supprime jamais. */
export async function supprimerBrouillonFacture(admin: SupabaseClient, appId: string, venteId: string) {
  const ctx = await charger(admin, appId, venteId);
  const lue = await ligneDe(admin, ctx.vente.stripe_payment_intent_id);
  if (!lue) return { supprime: true };
  if (lue.statut === "emise") {
    throw new RefusFacture("Cette facture est définitive : elle se corrige par un avoir, dans Pennylane.");
  }
  if (decisionReprise(lue, new Date()) === "occupee") throw new RefusFacture(OCCUPEE);

  const ligne = await prendre(admin, lue);
  try {
    if (ligne.pennylane_invoice_id) {
      const facture = await lireFacture(Number(ligne.pennylane_invoice_id));
      if (facture && !facture.brouillon) {
        throw new RefusFacture("Cette facture est déjà définitive dans Pennylane : cliquez sur « Finaliser et envoyer » pour la reprendre.");
      }
      if (facture) await supprimerBrouillon(facture.id);
    }
  } catch (e) {
    await noter(admin, ligne.id, { statut: lue.statut, erreur: String((e as Error).message).slice(0, 500) });
    throw e;
  }
  const { error } = await admin.schema("admin").from("factures")
    .delete().eq("id", ligne.id).neq("statut", "emise");
  if (error) throw new Error(`suppression de la ligne: ${error.message}`);
  return { supprime: true };
}

/** Controle de la configuration, en lecture seule : le jeton, ses perimetres,
 *  et le compte de produits de chaque site ouvert a la facturation. */
export async function diagnosticFacturation(admin: SupabaseClient) {
  const jeton = await moi();
  const { data: sites, error } = await admin.schema("config").from("apps")
    .select("id, compte_produit, tva_taux").not("compte_produit", "is", null).order("id");
  if (error) throw new Error(`lecture du registre: ${error.message}`);
  const comptes = [];
  for (const s of sites ?? []) {
    const numero = String(s.compte_produit);
    const vat = codeTva(Number(s.tva_taux ?? TVA_DEFAUT));
    const lus = await comptesDuNumero(numero);
    const retenu = choisirCompte(lus, numero, vat);
    comptes.push({
      app_id: s.id,
      trouve: retenu !== null,
      declinaisons: lus.map((c) => `${c.country_alpha2 ?? "?"}/${c.vat_rate ?? "?"}`),
      retenue: lus.find((c) => c.id === retenu)?.vat_rate ?? null,
    });
  }
  return { societe: jeton.societe, perimetres: jeton.perimetres, comptes };
}

export { ErreurPennylane };
