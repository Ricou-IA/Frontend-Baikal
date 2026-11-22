// Ecriture au journal passee dans Pennylane a la demande du comptable
// (regularisation, contribution Climate). Ce qui decide est ici, pur et teste.
//
// Une ecriture au journal ne passe pas par un brouillon et ne se supprime pas
// par l'API : elle n'est jamais passee sans que le comptable l'ait vue ligne a
// ligne, et tout se verifie AVANT l'appel (equilibre, comptes, journal).

export interface LigneDemandee {
  /** Numero de compte, tel qu'au plan comptable. */
  compte: string;
  /** Declinaison de TVA du compte a retenir (« exempt », « FR_200 »...). Absent
   *  = le compte generique. */
  tva?: string;
  debit?: number;
  credit?: number;
  libelle?: string;
  /** Accepter un compte desactive au plan comptable. Jamais par defaut : c'est
   *  le comptable qui le demande, compte par compte. */
  desactive?: boolean;
}

export type Validation =
  | { ok: true; total: number }
  | { ok: false; erreur: string };

function centimes(n: number): number {
  return Math.round((n + Number.EPSILON) * 100);
}

/** Au moins deux lignes, chacune au debit OU au credit, montants positifs au
 *  centime, total des debits egal au total des credits. */
export function validerEcriture(lignes: LigneDemandee[]): Validation {
  if (!Array.isArray(lignes) || lignes.length < 2) return { ok: false, erreur: "Une écriture a au moins deux lignes." };
  if (lignes.length > 20) return { ok: false, erreur: "Vingt lignes au plus par écriture." };
  let debits = 0;
  let credits = 0;
  for (const [i, l] of lignes.entries()) {
    if (!/^\d{3,12}$/.test(String(l.compte ?? ""))) return { ok: false, erreur: `Ligne ${i + 1} : numéro de compte invalide.` };
    const d = Number(l.debit ?? 0);
    const c = Number(l.credit ?? 0);
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) {
      return { ok: false, erreur: `Ligne ${i + 1} : montant invalide.` };
    }
    if ((d > 0) === (c > 0)) return { ok: false, erreur: `Ligne ${i + 1} : un montant, au débit ou au crédit.` };
    if (Math.abs(d * 100 - centimes(d)) > 1e-6 || Math.abs(c * 100 - centimes(c)) > 1e-6) {
      return { ok: false, erreur: `Ligne ${i + 1} : montant au centime.` };
    }
    debits += centimes(d);
    credits += centimes(c);
  }
  if (debits !== credits) {
    return { ok: false, erreur: `Écriture déséquilibrée : débits ${(debits / 100).toFixed(2)}, crédits ${(credits / 100).toFixed(2)}.` };
  }
  return { ok: true, total: debits / 100 };
}

export interface CompteDeclinaison {
  id: number;
  number: string;
  vat_rate?: string | null;
  enabled?: boolean | null;
}

/** L'identifiant du compte pour la declinaison de TVA demandee. Aucun repli :
 *  une declinaison absente est une erreur, pas un compte voisin. */
export function declinaison(
  comptes: CompteDeclinaison[],
  numero: string,
  tva?: string,
  accepterDesactive = false,
): number | null {
  const voulue = tva ?? "any";
  const trouve = comptes.find((c) =>
    String(c.number) === numero && (accepterDesactive || c.enabled !== false) && (c.vat_rate ?? "any") === voulue
  );
  return trouve ? trouve.id : null;
}

/** Le corps envoye a Pennylane : montants en chaines a deux decimales. */
export function corpsEcriture(d: {
  date: string;
  libelle: string;
  journalId: number;
  lignes: Array<LigneDemandee & { ledgerAccountId: number }>;
}): Record<string, unknown> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error("Date d'écriture mal formée.");
  const libelle = d.libelle.trim();
  if (!libelle) throw new Error("Libellé de l'écriture manquant.");
  return {
    date: d.date,
    label: libelle,
    journal_id: d.journalId,
    ledger_entry_lines: d.lignes.map((l) => ({
      debit: Number(l.debit ?? 0).toFixed(2),
      credit: Number(l.credit ?? 0).toFixed(2),
      ledger_account_id: l.ledgerAccountId,
      label: (l.libelle ?? libelle).trim(),
    })),
  };
}
