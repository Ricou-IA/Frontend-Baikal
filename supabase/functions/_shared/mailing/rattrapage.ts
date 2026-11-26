// Mailing : rattrapage des evenements Resend perdus avant le correctif de
// marquage (constat du 26/11/2026). Pur et teste ; l'action `rattrapage`
// d'admin-mailing fait les entrees-sorties, en ESSAI par defaut.
//
// Resend ne rend, pour un mail, que son dernier evenement (`last_event`) et
// son heure d'envoi (`created_at`), pas l'heure de chaque evenement. D'ou :
//  - delivre : deduit de tout dernier evenement qui le suppose (delivered,
//    opened, clicked, complained), horodate a l'heure d'envoi (approche de
//    quelques secondes ; un horodatage deja pose n'est jamais ecrase) ;
//  - rebond, plainte : appliques a l'heure d'envoi, signales comme approches ;
//  - ouverture, clic : JAMAIS inventes (une heure fausse fausserait le signal
//    des ouvertures automatiques), seulement comptes.

export interface LigneJournal {
  resend_id: string;
  statut: string;
  delivre_le: string | null;
  ouvert_le: string | null;
  clique_le: string | null;
  rebond_le: string | null;
  plainte_le: string | null;
}

export interface EtatResend {
  last_event: string | null;
  created_at: string | null;
}

export interface Proposition {
  resend_id: string;
  type: "delivered" | "bounced" | "complained";
  le: string;
}

export interface Manques {
  appliquer: Proposition[];
  /** Ouvertures / clics connus de Resend, absents du journal, non horodates. */
  sans_heure: Array<"opened" | "clicked">;
}

const SUPPOSE_DELIVRE = new Set(["delivered", "opened", "clicked", "complained"]);

export function evenementsManquants(l: LigneJournal, r: EtatResend): Manques {
  const res: Manques = { appliquer: [], sans_heure: [] };
  const ev = r.last_event ?? "";
  if (!r.created_at) return res;
  if (SUPPOSE_DELIVRE.has(ev) && !l.delivre_le) {
    res.appliquer.push({ resend_id: l.resend_id, type: "delivered", le: r.created_at });
  }
  if (ev === "bounced" && !l.rebond_le) {
    res.appliquer.push({ resend_id: l.resend_id, type: "bounced", le: r.created_at });
  }
  if (ev === "complained" && !l.plainte_le) {
    res.appliquer.push({ resend_id: l.resend_id, type: "complained", le: r.created_at });
  }
  if ((ev === "opened" || ev === "clicked") && !l.ouvert_le) res.sans_heure.push("opened");
  if (ev === "clicked" && !l.clique_le) res.sans_heure.push("clicked");
  return res;
}

export interface Bilan {
  lus: number;
  derniers_evenements: Record<string, number>;
  a_appliquer: { delivered: number; bounced: number; complained: number };
  ouvertures_sans_heure: number;
  clics_sans_heure: number;
  illisibles: number;
}

export function bilanVide(): Bilan {
  return {
    lus: 0,
    derniers_evenements: {},
    a_appliquer: { delivered: 0, bounced: 0, complained: 0 },
    ouvertures_sans_heure: 0,
    clics_sans_heure: 0,
    illisibles: 0,
  };
}

export function ajouterAuBilan(b: Bilan, r: EtatResend | null, m: Manques | null): Bilan {
  if (!r || !m) {
    b.illisibles++;
    return b;
  }
  b.lus++;
  const ev = r.last_event ?? "inconnu";
  b.derniers_evenements[ev] = (b.derniers_evenements[ev] ?? 0) + 1;
  for (const p of m.appliquer) b.a_appliquer[p.type]++;
  for (const s of m.sans_heure) s === "opened" ? b.ouvertures_sans_heure++ : b.clics_sans_heure++;
  return b;
}
