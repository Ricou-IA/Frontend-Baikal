// Regles pures d'admin-modules (testees dans regles.test.ts).
// Contrat du canal cote site : docs/superpowers/specs/2026-09-26-baikal-admin-modules-majordhome-design.md
// du depot Majord'home, § 4 (edge baikal-admin).
import type { Niveau } from "../_shared/droits.ts";

// Actions relayees et niveau exige sur le module console « modules ».
// Consulter = lecture ; ouvrir ou fermer un module chez un client = ecriture.
const NIVEAUX: Record<string, Niveau> = {
  catalogue: "lecture",
  organisations: "lecture",
  modules: "ecriture",
};

export function niveauExige(action: unknown): Niveau | null {
  return typeof action === "string" && Object.hasOwn(NIVEAUX, action)
    ? NIVEAUX[action]
    : null;
}

// Corps envoye au site. org_id et modules sont relayes tels quels : c'est le
// site qui les valide (400 invalid_body / unknown_module), lui seul connait
// son catalogue. L'auteur, lui, ne vient JAMAIS du navigateur : c'est l'email
// du compte Baikal lu dans le jeton.
export function corpsSite(
  action: string,
  body: Record<string, unknown>,
  auteur: string | null,
): Record<string, unknown> {
  if (action !== "modules") return { action };
  return { action, org_id: body.org_id, modules: body.modules, auteur };
}

export interface ErreurCanal {
  statut_site: number | null;
  code: string | null;
  detail: unknown;
}

// La reponse du site en erreur, remontee telle quelle : son statut HTTP, son
// code (`error`) et son `detail`. Jamais reinterpretee, jamais convertie en
// succes.
export function erreurCanal(detail: unknown): ErreurCanal {
  const d = (detail && typeof detail === "object") ? detail as Record<string, unknown> : {};
  const statut = typeof d.statut_site === "number" ? d.statut_site : null;
  const corps = (d.corps && typeof d.corps === "object")
    ? d.corps as Record<string, unknown>
    : {};
  const code = typeof corps.error === "string"
    ? corps.error
    : typeof corps.brut === "string"
    ? corps.brut.slice(0, 200)
    : null;
  return { statut_site: statut, code, detail: corps.detail ?? null };
}
