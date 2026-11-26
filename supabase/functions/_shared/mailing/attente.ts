// Mailing : plus aucun evenement Resend perdu entre l'envoi et le marquage.
//
// Deux pieces, toutes deux testees (mailing.test.ts, « course webhook ») :
//  - envoyerEtMarquer : le worker marque CHAQUE envoi des que Resend a rendu
//    son id, pendant la pause entre deux appels (autrefois : a la fin du
//    sous-lot, jusqu'a ~2 min plus tard) ;
//  - la file d'attente : un evenement tague campagne dont le resend_id est
//    encore inconnu du journal est garde (admin.mail_evenements_attente) puis
//    rejoue apres les marquages, pendant FENETRE_ATTENTE_MS. Le webhook repond
//    toujours 200 a Resend (les transactionnels du meme compte ne doivent pas
//    etre rejoues a l'infini).
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const FENETRE_ATTENTE_MS = 15 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------ Envoi d'un sous-lot ------

export interface LigneMarquage {
  email: string;
  touche: number;
  resend_id?: string;
  erreur?: string;
}

export interface EnvoiUnitaire {
  ligne: LigneMarquage;
  /** Erreur qui arrete toute la campagne (cle refusee). */
  fatale?: string;
}

/** Envoie les destinataires un a un et marque chaque envoi aussitot, pendant
 *  la pause qui le suit. Un marquage qui echoue arrete le sous-lot (l'erreur
 *  remonte) : on n'envoie pas sans pouvoir ecrire. */
export async function envoyerEtMarquer<D>(
  destinataires: D[],
  o: {
    envoyer: (d: D) => Promise<EnvoiUnitaire>;
    marquer: (lignes: LigneMarquage[]) => Promise<unknown>;
    pause: () => Promise<unknown>;
    budgetDepasse: () => boolean;
  },
): Promise<{ lignes: LigneMarquage[]; fatale: string | null }> {
  const lignes: LigneMarquage[] = [];
  for (const d of destinataires) {
    if (o.budgetDepasse()) break;
    const r = await o.envoyer(d);
    lignes.push(r.ligne);
    if (r.fatale) {
      await o.marquer([r.ligne]);
      return { lignes, fatale: r.fatale };
    }
    await Promise.all([o.marquer([r.ligne]), o.pause()]);
  }
  return { lignes, fatale: null };
}

// ------ File d'attente des evenements inconnus ------

export interface EvenementRecu {
  app_id: string;
  campagne_id: string;
  resend_id: string;
  type: string;
  le: string;
  detail: Record<string, unknown>;
}

export interface EvenementAttente extends EvenementRecu {
  id: string;
  recu_le: string;
  tentatives: number;
}

/** L'evenement doit-il etre garde ? Seulement s'il est inconnu du journal ET
 *  tague campagne Baikal (un uuid) : un transactionnel du site n'entre jamais. */
export function aGarder(reponse: unknown, campagneTag: string | null): boolean {
  const connu = (reponse as { connu?: unknown } | null)?.connu;
  return connu === false && typeof campagneTag === "string" && UUID.test(campagneTag);
}

/** Les evenements a rejouer et ceux dont la fenetre est passee. */
export function trierAttente(
  file: Array<{ id: string; recu_le: string }>,
  maintenant: Date,
  fenetreMs = FENETRE_ATTENTE_MS,
): { aRejouer: string[]; aExpirer: string[] } {
  const aRejouer: string[] = [];
  const aExpirer: string[] = [];
  for (const e of file) {
    (maintenant.getTime() - new Date(e.recu_le).getTime() > fenetreMs ? aExpirer : aRejouer).push(e.id);
  }
  return { aRejouer, aExpirer };
}

export interface FileAttente {
  garder(e: EvenementRecu): Promise<void>;
  /** Les evenements en attente du site, du plus ancien au plus recent. */
  enAttente(appId: string): Promise<EvenementAttente[]>;
  clore(id: string, statut: "rejoue" | "expire", tentatives: number): Promise<void>;
  tenter(id: string, tentatives: number): Promise<void>;
}

/** Rejoue la file d'un site : chaque evenement encore dans sa fenetre est
 *  presente au journal ; connu -> `rejoue`, sinon il attend le passage
 *  suivant ; hors fenetre -> `expire`. L'ordre d'arrivee est conserve. */
export async function rejouerAttente(
  file: FileAttente,
  appId: string,
  appliquer: (e: EvenementRecu) => Promise<unknown>,
  maintenant = new Date(),
): Promise<{ rejoues: number; en_attente: number; expires: number }> {
  const lignes = await file.enAttente(appId);
  const { aRejouer, aExpirer } = trierAttente(lignes, maintenant);
  const parId = new Map(lignes.map((l) => [l.id, l]));
  let rejoues = 0;
  let enAttente = 0;
  for (const id of aRejouer) {
    const e = parId.get(id)!;
    const r = await appliquer(e);
    if ((r as { connu?: unknown } | null)?.connu === false) {
      await file.tenter(id, e.tentatives + 1);
      enAttente++;
    } else {
      await file.clore(id, "rejoue", e.tentatives + 1);
      rejoues++;
    }
  }
  for (const id of aExpirer) await file.clore(id, "expire", parId.get(id)!.tentatives);
  return { rejoues, en_attente: enAttente, expires: aExpirer.length };
}

/** La file dans admin.mail_evenements_attente (base de Baikal). */
export function fileSupabase(admin: SupabaseClient): FileAttente {
  const t = () => admin.schema("admin").from("mail_evenements_attente");
  return {
    async garder(e) {
      const { error } = await t().upsert(e, { onConflict: "resend_id,type,le", ignoreDuplicates: true });
      if (error) throw new Error(`file d'attente: ${error.message}`);
    },
    async enAttente(appId) {
      const { data, error } = await t()
        .select("id, app_id, campagne_id, resend_id, type, le, detail, recu_le, tentatives")
        .eq("app_id", appId).eq("statut", "attente").order("recu_le").order("le").limit(500);
      if (error) throw new Error(`file d'attente: ${error.message}`);
      return (data ?? []) as EvenementAttente[];
    },
    async clore(id, statut, tentatives) {
      const { error } = await t().update({ statut, tentatives, traite_le: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(`file d'attente: ${error.message}`);
    },
    async tenter(id, tentatives) {
      const { error } = await t().update({ tentatives }).eq("id", id);
      if (error) throw new Error(`file d'attente: ${error.message}`);
    },
  };
}
