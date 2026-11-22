// Piece de ventes d'un site (plan facturation, lots 3 et 4 en version courte) :
// les entrees-sorties. Les regles sont dans _shared/piece-ventes.ts.
//
// Baikal prepare un BROUILLON dans Pennylane, au client « Clients particuliers »
// du site, et s'arrete la : c'est le comptable qui le relit et le finalise.
// Rien de nominatif ne passe par ici : la piece ne porte que des totaux.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { choisirCompte, codeTva, referenceFacture } from "../_shared/facturation.ts";
import {
  calculerPiece,
  corpsPiece,
  ecartAdmis,
  type FactureIndividuelle,
  periode,
  type Piece,
  seRecouvrent,
  type VenteMois,
} from "../_shared/piece-ventes.ts";
import {
  comptesDuNumero,
  creerBrouillon,
  creerClient,
  lireFacture,
  supprimerBrouillon,
} from "../_shared/pennylane.ts";
import { RefusFacture } from "./factures.ts";

const TVA_DEFAUT = 0.20;

interface SitePiece {
  id: string;
  name: string;
  nom_public: string | null;
  compte_produit: string | null;
  tva_taux: number;
  facture_libelle: string | null;
  fuseau: string;
  pennylane_client_particuliers: number | null;
}

async function lireSite(admin: SupabaseClient, appId: string): Promise<SitePiece> {
  const { data, error } = await admin.schema("config").from("apps")
    .select("id, name, nom_public, compte_produit, tva_taux, facture_libelle, fuseau, pennylane_client_particuliers")
    .eq("id", appId).maybeSingle();
  if (error) throw new Error(`lecture du site: ${error.message}`);
  if (!data) throw new RefusFacture("Site introuvable", 404);
  return {
    ...data,
    tva_taux: Number(data.tva_taux ?? TVA_DEFAUT),
    fuseau: data.fuseau || "Europe/Paris",
    pennylane_client_particuliers: data.pennylane_client_particuliers === null
      ? null
      : Number(data.pennylane_client_particuliers),
  };
}

function jourLocal(instant: string | null, fuseau: string): string | null {
  if (!instant) return null;
  return new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau }).format(new Date(instant));
}

async function lireVentes(admin: SupabaseClient, site: SitePiece): Promise<VenteMois[]> {
  const ventes: VenteMois[] = [];
  for (let debut = 0;; debut += 1000) {
    const { data, error } = await admin.schema("admin").from("ventes_enrichies")
      .select("stripe_payment_intent_id, paid_at, rembourse_le, montant_ttc, montant_rembourse, offre, perimetre, exclue")
      .eq("app_id", site.id).order("paid_at", { ascending: true }).order("id", { ascending: true })
      .range(debut, debut + 999);
    if (error) throw new Error(`lecture des ventes: ${error.message}`);
    for (const v of data ?? []) {
      ventes.push({
        stripe_payment_intent_id: String(v.stripe_payment_intent_id),
        jour_paiement: jourLocal(v.paid_at, site.fuseau),
        jour_remboursement: jourLocal(v.rembourse_le, site.fuseau),
        montant_ttc: Number(v.montant_ttc ?? 0),
        montant_rembourse: Number(v.montant_rembourse ?? 0),
        offre: String(v.offre ?? ""),
        perimetre: v.perimetre ?? null,
        exclue: Boolean(v.exclue),
      });
    }
    if (!data || data.length < 1000) break;
  }
  return ventes;
}

async function lireFactures(admin: SupabaseClient, appId: string): Promise<FactureIndividuelle[]> {
  const { data, error } = await admin.schema("admin").from("factures")
    .select("stripe_payment_intent_id, date_facture, numero")
    .eq("app_id", appId).eq("statut", "emise").order("date_facture").limit(1000);
  if (error) throw new Error(`lecture des factures: ${error.message}`);
  return (data ?? []).map((f: any) => ({
    stripe_payment_intent_id: String(f.stripe_payment_intent_id),
    date_facture: String(f.date_facture),
    numero: String(f.numero),
  }));
}

async function lirePieces(admin: SupabaseClient, appId: string): Promise<any[]> {
  const { data, error } = await admin.schema("admin").from("pieces_ventes")
    .select("id, du, au, montant_ttc, nb_ventes, cree_le").eq("app_id", appId).order("au", { ascending: false });
  if (error) throw new Error(`lecture des pièces: ${error.message}`);
  return data ?? [];
}

async function preparer(admin: SupabaseClient, appId: string, du: string, au: string) {
  let p;
  try {
    p = periode(du, au);
  } catch (e) {
    throw new RefusFacture((e as Error).message, 400);
  }
  const site = await lireSite(admin, appId);
  const [ventes, factures, pieces] = await Promise.all([
    lireVentes(admin, site),
    lireFactures(admin, appId),
    lirePieces(admin, appId),
  ]);
  const piece = calculerPiece(ventes, factures, p, site.facture_libelle);
  const recouvre = pieces.find((x) =>
    seRecouvrent({ du: String(x.du), au: String(x.au) }, { du: p.premierJour, au: p.dernierJour })
  ) ?? null;
  return { site, piece, pieces, recouvre };
}

/** Ce que serait la piece de la periode. Lecture seule, rien n'est ecrit. */
export async function calculerPieceVentes(admin: SupabaseClient, appId: string, du: string, au: string) {
  const { site, piece, pieces, recouvre } = await preparer(admin, appId, du, au);
  return {
    ouverte: Boolean(site.compte_produit),
    compte_produit: site.compte_produit,
    piece,
    pieces,
    deja_faite: recouvre ? { du: recouvre.du, au: recouvre.au } : null,
  };
}

/** Le client « Clients particuliers » du site : celui du registre, sinon il est
 *  cree et son identifiant range au registre. */
async function clientParticuliers(admin: SupabaseClient, site: SitePiece): Promise<number> {
  if (site.pennylane_client_particuliers) return site.pennylane_client_particuliers;
  const nom = `Clients particuliers ${(site.nom_public ?? "").trim() || site.name}`;
  // Client generique : Pennylane exige une adresse, il n'y en a pas de vraie.
  const id = await creerClient("/company_customers", {
    name: nom,
    emails: [],
    billing_address: { address: "Ventes en ligne", postal_code: "00000", city: "France", country_alpha2: "FR" },
  });
  const { error } = await admin.schema("config").from("apps")
    .update({ pennylane_client_particuliers: id }).eq("id", site.id).is("pennylane_client_particuliers", null);
  if (error) throw new Error(`enregistrement du client au registre: ${error.message}`);
  return id;
}

function montant(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;
}

function totalRendu(brut: any): number | null {
  return montant(brut?.currency_amount ?? brut?.amount);
}

export async function creerPieceVentes(
  admin: SupabaseClient,
  d: { appId: string; du: string; au: string; userId: string | null },
) {
  const { site, piece, recouvre } = await preparer(admin, d.appId, d.du, d.au);
  if (!site.compte_produit) throw new RefusFacture("Ce site n'a pas de compte de produits.");
  if (recouvre) {
    throw new RefusFacture(`Une pièce existe déjà pour une période qui recouvre celle-ci (jusqu'au ${recouvre.au}).`);
  }
  if (piece.lignes.length === 0) throw new RefusFacture("Aucune vente à porter sur cette période.");
  if (piece.ttc <= 0) {
    throw new RefusFacture("Le total de la période est négatif ou nul : c'est un avoir, à passer dans Pennylane.");
  }

  const numero = String(site.compte_produit);
  const compte = choisirCompte(await comptesDuNumero(numero), numero, codeTva(site.tva_taux));
  if (compte === null) throw new RefusFacture(`Le compte de produits ${numero} n'existe pas dans Pennylane.`);

  const brouillon = await creerBrouillon(corpsPiece({
    piece,
    customerId: await clientParticuliers(admin, site),
    ledgerAccountId: compte,
    taux: site.tva_taux,
    reference: referenceFacture(`ventes-${site.id}-${piece.periode.au}`, new Date()),
  }));

  // Tout echec apres la creation du brouillon le supprime : un brouillon que
  // Baikal ne connait pas serait finalise deux fois.
  try {
    const rendu = totalRendu(brouillon.brut);
    if (rendu === null || Math.abs(rendu - piece.ttc) > ecartAdmis(piece) + 1e-9) {
      throw new RefusFacture(
        `Pennylane calcule ${rendu === null ? "un total illisible" : rendu.toFixed(2) + " € TTC"} ` +
          `au lieu de ${piece.ttc.toFixed(2)} €. Le brouillon a été supprimé.`,
      );
    }
    const { error } = await admin.schema("admin").from("pieces_ventes").insert({
      app_id: site.id,
      du: piece.periode.premierJour,
      au: piece.periode.dernierJour,
      pennylane_invoice_id: brouillon.id,
      montant_ttc: rendu,
      nb_ventes: piece.nb_ventes,
      cree_par: d.userId,
    });
    if (error) {
      if (error.code === "23505") throw new RefusFacture("Cette pièce vient d'être créée par un autre clic.");
      throw new Error(`enregistrement de la pièce: ${error.message}`);
    }
    const rendus = {
      ttc: rendu,
      ht: montant(brouillon.brut?.currency_amount_before_tax),
      tva: montant(brouillon.brut?.currency_tax ?? brouillon.brut?.tax),
    };
    return { piece, rendus, pieces: await lirePieces(admin, site.id) };
  } catch (e) {
    await supprimerBrouillon(brouillon.id);
    throw e;
  }
}

/** Abandon d'une piece encore en brouillon. Une piece finalisee est en
 *  comptabilite : elle ne se retire pas d'ici. */
export async function supprimerPieceVentes(admin: SupabaseClient, appId: string, id: string) {
  const { data: ligne, error } = await admin.schema("admin").from("pieces_ventes")
    .select("id, pennylane_invoice_id").eq("id", id).eq("app_id", appId).maybeSingle();
  if (error) throw new Error(`lecture de la pièce: ${error.message}`);
  if (!ligne) throw new RefusFacture("Pièce introuvable pour ce site", 404);
  const facture = await lireFacture(Number(ligne.pennylane_invoice_id));
  if (facture && !facture.brouillon) {
    throw new RefusFacture("Cette pièce est finalisée dans Pennylane : elle se corrige par un avoir.");
  }
  if (facture) await supprimerBrouillon(facture.id);
  const { error: errSup } = await admin.schema("admin").from("pieces_ventes").delete().eq("id", ligne.id);
  if (errSup) throw new Error(`suppression de la pièce: ${errSup.message}`);
  return { supprime: true, pieces: await lirePieces(admin, appId) };
}

export type { Piece };
