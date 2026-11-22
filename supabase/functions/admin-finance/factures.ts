// Facture a la demande d'une vente (plan facturation, lot 2) : les
// entrees-sorties. Les regles sont dans _shared/facturation.ts, l'API de
// Pennylane dans _shared/pennylane.ts.
//
// Chaine d'une emission, chaque etape enregistree avant la suivante pour qu'un
// arret en chemin se reprenne sans rien refaire :
//   client (cherche par e-mail, cree s'il manque)
//   -> brouillon -> controle des totaux rendus par Pennylane
//   -> finalisation (la facture prend son numero)
//   -> envoi par e-mail (rejouable : le PDF met parfois quelques minutes).
//
// Rien de nominatif n'est ecrit en base ni journalise : le nom, l'adresse et
// l'e-mail ne font que traverser la fonction, de Stripe et de l'ecran vers
// Pennylane.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  montantsFacture,
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
  envoyerParEmail,
  ErreurPennylane,
  type FactureLue,
  factureParReference,
  finaliser,
  lireFacture,
  moi,
  supprimerBrouillon,
} from "../_shared/pennylane.ts";

const TVA_DEFAUT = 0.20;

/** Refus metier : l'appelant le rend tel quel, avec son statut HTTP. */
export class RefusFacture extends Error {
  constructor(message: string, readonly statut = 409) {
    super(message);
  }
}

interface Contexte {
  vente: VenteAFacturer & { id: string; app_id: string };
  site: { id: string; compte_produit: string | null; tva_taux: number; stripe_key_ref: string | null };
}

async function charger(admin: SupabaseClient, appId: string, venteId: string): Promise<Contexte> {
  const { data: v, error: errVente } = await admin.schema("admin").from("ventes_enrichies")
    .select("id, app_id, stripe_payment_intent_id, paid_at, montant_ttc, montant_rembourse, offre, exclue")
    .eq("id", venteId).eq("app_id", appId).maybeSingle();
  if (errVente) throw new Error(`lecture de la vente: ${errVente.message}`);
  if (!v) throw new RefusFacture("Vente introuvable pour ce site", 404);

  const { data: s, error: errSite } = await admin.schema("config").from("apps")
    .select("id, compte_produit, tva_taux, stripe_key_ref").eq("id", appId).maybeSingle();
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

/** Ouverture de la fenetre : la vente, ses montants, le payeur lu dans Stripe. */
export async function preparerFacture(admin: SupabaseClient, appId: string, venteId: string) {
  const ctx = await charger(admin, appId, venteId);
  const facturable = venteFacturable(ctx.vente, ctx.site);
  const existante = await ligneDe(admin, ctx.vente.stripe_payment_intent_id);
  let payeur: Record<string, string> | null = null;
  let payeurErreur: string | null = null;
  if (facturable.ok) {
    try {
      payeur = await lirePayeur(ctx);
    } catch (e) {
      // La fenetre reste utilisable : tout se saisit a la main.
      payeurErreur = (e as Error).message;
    }
  }
  return {
    facturable: facturable.ok,
    raison: facturable.ok ? null : facturable.raison,
    montants: montantsFacture(ctx.vente.montant_ttc, ctx.site.tva_taux),
    designation: ctx.vente.offre,
    paye_le: ctx.vente.paid_at,
    compte_produit: ctx.site.compte_produit,
    payeur,
    payeur_erreur: payeurErreur,
    facture: resume(existante),
  };
}

// --- Emission --------------------------------------------------------------------

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

/** Tente l'envoi quelques fois : le PDF d'une facture tout juste finalisee
 *  n'est pas toujours pret. false = a rejouer plus tard, ce n'est pas un echec. */
async function tenterEnvoi(idPennylane: number, essais: number): Promise<boolean> {
  for (let i = 0; i < essais; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 5000));
    if (await envoyerParEmail(idPennylane)) return true;
  }
  return false;
}

export interface DemandeEmission {
  appId: string;
  venteId: string;
  client: unknown;
  designation?: string;
  /** Essai : tout jusqu'au brouillon, controle des totaux, puis suppression.
   *  Aucune facture, aucun numero consomme, rien d'ecrit dans admin.factures. */
  essai?: boolean;
  userId: string | null;
}

export async function emettreFacture(admin: SupabaseClient, d: DemandeEmission) {
  const ctx = await charger(admin, d.appId, d.venteId);
  const facturable = venteFacturable(ctx.vente, ctx.site);
  if (!facturable.ok) throw new RefusFacture(facturable.raison);
  const saisie = validerClient(d.client);
  if (!saisie.ok) throw new RefusFacture(saisie.erreurs.join(" "), 400);

  const attendus = montantsFacture(ctx.vente.montant_ttc, ctx.site.tva_taux);
  const designation = (d.designation ?? "").trim() || ctx.vente.offre;
  const jour = new Date().toISOString().slice(0, 10);
  const pi = ctx.vente.stripe_payment_intent_id;

  if (d.essai) {
    const client = await clientPennylane(saisie.client);
    const brouillon = await creerBrouillon(corpsFacture({
      customerId: client.id,
      date: jour,
      vente: ctx.vente,
      designation,
      ledgerAccountId: await compteDuSite(ctx),
      taux: ctx.site.tva_taux,
      reference: `essai-${Date.now().toString(36)}`,
    }));
    const controle = controlerTotaux(brouillon.brut, attendus);
    await supprimerBrouillon(brouillon.id);

    // Une ligne ne retombe pas juste : on essaie la meme facture en deux
    // lignes, sur un second brouillon, supprime lui aussi. L'emission reelle
    // reste en une ligne tant qu'Eric n'a pas valide cette forme.
    let deuxLignes: Record<string, unknown> | null = null;
    const decoupage = controle.ok ? null : decoupageDeuxLignes(ctx.vente.montant_ttc, ctx.site.tva_taux);
    if (decoupage) {
      const second = await creerBrouillon(corpsFacture({
        customerId: client.id,
        date: jour,
        vente: ctx.vente,
        designation,
        ledgerAccountId: await compteDuSite(ctx),
        taux: ctx.site.tva_taux,
        reference: `essai-${Date.now().toString(36)}-2`,
        decoupage: { ...decoupage, libelleComplement: "Complément" },
      }));
      const c2 = controlerTotaux(second.brut, attendus);
      await supprimerBrouillon(second.id);
      deuxLignes = {
        lignes_ht: [decoupage.principale, decoupage.complement],
        rendus: c2.rendus,
        conforme: c2.ok,
        raison: c2.ok ? null : c2.raison,
      };
    }
    return {
      essai: true,
      attendus,
      rendus: controle.rendus,
      conforme: controle.ok,
      raison: controle.ok ? null : controle.raison,
      deux_lignes: deuxLignes,
      client_existant: client.existant,
    };
  }

  // --- Prise de la vente : une seule emission a la fois, une seule facture.
  const existante = await ligneDe(admin, pi);
  const decision = decisionReprise(existante, new Date());
  if (decision === "deja_emise") return { deja_emise: true, facture: resume(existante) };
  if (decision === "occupee") {
    throw new RefusFacture("Une émission est déjà en cours pour cette vente. Réessayez dans deux minutes.");
  }

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
      if (error.code === "23505") {
        throw new RefusFacture("Une émission est déjà en cours pour cette vente.");
      }
      throw new Error(`prise de la vente: ${error.message}`);
    }
    ligne = data;
  } else {
    // Reprise : la ligne n'est prise que si personne ne l'a touchee depuis sa lecture.
    const { data, error } = await admin.schema("admin").from("factures")
      .update({ statut: "en_cours", erreur: null, maj_le: new Date().toISOString() })
      .eq("id", existante.id).eq("maj_le", existante.maj_le).neq("statut", "emise")
      .select("*");
    if (error) throw new Error(`reprise de la vente: ${error.message}`);
    if (!data || data.length === 0) {
      throw new RefusFacture("Une émission est déjà en cours pour cette vente.");
    }
    ligne = data[0];
  }

  let emise = false;
  try {
    // Une facture deja creee (identifiant enregistre, ou retrouvee par sa
    // reference si l'enregistrement n'avait pas eu le temps de se faire).
    let facture: FactureLue | null = ligne.pennylane_invoice_id
      ? await lireFacture(Number(ligne.pennylane_invoice_id))
      : await factureParReference(pi);
    let clientExistant: boolean | null = null;

    if (!facture) {
      const client = await clientPennylane(saisie.client);
      clientExistant = client.existant;
      await noter(admin, ligne.id, { etape: "client" });
      facture = await creerBrouillon(corpsFacture({
        customerId: client.id,
        date: jour,
        vente: ctx.vente,
        designation,
        ledgerAccountId: await compteDuSite(ctx),
        taux: ctx.site.tva_taux,
        reference: pi,
      }));
    }
    await noter(admin, ligne.id, { pennylane_invoice_id: facture.id, etape: "brouillon" });

    if (facture.brouillon) {
      const controle = controlerTotaux(facture.brut, attendus);
      if (!controle.ok) {
        throw new RefusFacture(
          `${controle.raison} La facture n'est pas émise : le brouillon reste dans Pennylane, à supprimer.`,
          409,
        );
      }
      facture = await finaliser(facture.id);
    }
    if (!facture.numero) throw new Error("La facture est finalisée mais Pennylane n'a pas rendu son numéro");

    await noter(admin, ligne.id, {
      statut: "emise",
      etape: "finalisee",
      numero: facture.numero,
      date_facture: facture.date ?? jour,
      erreur: null,
    });
    emise = true;

    // L'envoi a part : la facture existe, un envoi manque se rejoue seul.
    let envoyee = false;
    let envoiErreur: string | null = null;
    try {
      envoyee = await tenterEnvoi(facture.id, 3);
      if (envoyee) await noter(admin, ligne.id, { envoyee_le: new Date().toISOString() });
    } catch (e) {
      envoiErreur = (e as Error).message;
      await noter(admin, ligne.id, { erreur: `envoi: ${envoiErreur}`.slice(0, 500) });
    }

    return {
      deja_emise: false,
      client_existant: clientExistant,
      envoi_erreur: envoiErreur,
      facture: resume(await ligneDe(admin, pi)),
    };
  } catch (e) {
    if (!emise) {
      await noter(admin, ligne.id, { statut: "erreur", erreur: String((e as Error).message).slice(0, 500) });
    }
    throw e;
  }
}

/** Rejoue le seul envoi d'une facture deja emise. */
export async function renvoyerFacture(admin: SupabaseClient, appId: string, venteId: string) {
  const ctx = await charger(admin, appId, venteId);
  const ligne = await ligneDe(admin, ctx.vente.stripe_payment_intent_id);
  if (!ligne || ligne.statut !== "emise" || !ligne.pennylane_invoice_id) {
    throw new RefusFacture("Cette vente n'a pas de facture émise.");
  }
  const envoyee = await tenterEnvoi(Number(ligne.pennylane_invoice_id), 2);
  if (envoyee) await noter(admin, ligne.id, { envoyee_le: new Date().toISOString(), erreur: null });
  return { envoyee, facture: resume(await ligneDe(admin, ctx.vente.stripe_payment_intent_id)) };
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
