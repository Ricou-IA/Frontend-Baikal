// Règles pures du canal Membres d'admin-comptes (testées dans membres-regles.test.ts).
// Contrat côté site : docs/contrats/membres-relais-v1.ts.
import type { Niveau } from "../_shared/droits.ts";

// Action de la console -> niveau exigé et action du contrat chez le site.
const ACTIONS: Record<string, { niveau: Niveau; site: string }> = {
  etat: { niveau: "lecture", site: "manifeste" },
  membres: { niveau: "lecture", site: "membres" },
  creer: { niveau: "ecriture", site: "membre-creer" },
  role: { niveau: "ecriture", site: "membre-role" },
  "mot-de-passe": { niveau: "ecriture", site: "membre-mot-de-passe" },
  lien: { niveau: "ecriture", site: "membre-lien" },
  renommer: { niveau: "ecriture", site: "membre-renommer" },
  email: { niveau: "ecriture", site: "membre-email" },
  bloquer: { niveau: "ecriture", site: "membre-bloquer" },
  retirer: { niveau: "ecriture", site: "membre-retirer" },
};

export function niveauExige(action: unknown): Niveau | null {
  return typeof action === "string" && Object.hasOwn(ACTIONS, action) ? ACTIONS[action].niveau : null;
}

/** Les actions qui portent un mot de passe : généré ici s'il n'est pas saisi. */
export function porteMotDePasse(action: string): boolean {
  return action === "creer" || action === "mot-de-passe";
}

// Qui a le droit : super admin, ou droit délégué `users` du site dans
// admin.droits_sites. L'appartenance à une organisation du site ne suffit PAS :
// l'org_admin d'un client gère son équipe chez le site, pas toutes les
// organisations du site depuis Baikal.
export function niveauConsole(
  appRole: string | null | undefined,
  modulesDelegues: Record<string, unknown> | null | undefined,
): Niveau | null {
  if (appRole === "super_admin") return "ecriture";
  const n = modulesDelegues?.users;
  return n === "lecture" || n === "ecriture" ? n : null;
}

export function autorise(possede: Niveau | null, exige: Niveau): boolean {
  return possede === "ecriture" || (possede === "lecture" && exige === "lecture");
}

// Corps envoyé au site. Le site valide tout (il connaît ses rôles et ses
// organisations) ; on ne fait que nommer les champs du contrat. L'auteur ne
// vient JAMAIS du navigateur : c'est l'email du jeton Baikal.
export function corpsSite(
  action: string,
  body: Record<string, unknown>,
  auteur: string | null,
  motDePasse: string | null,
): Record<string, unknown> {
  const site = ACTIONS[action].site;
  switch (action) {
    case "etat":
      return { action: site };
    case "membres":
      return { action: site, org_id: body.orgId ?? null };
    case "creer":
      return {
        action: site,
        email: body.email,
        mot_de_passe: motDePasse,
        nom: body.nom ?? null,
        org_id: body.orgId,
        role: body.role,
        auteur,
      };
    case "role":
      return { action: site, id: body.id, role: body.role, auteur };
    case "mot-de-passe":
      return { action: site, id: body.id, mot_de_passe: motDePasse, auteur };
    case "renommer":
      return { action: site, id: body.id, nom: body.nom, auteur };
    case "email":
      return { action: site, id: body.id, email: body.email, auteur };
    case "bloquer":
      return { action: site, id: body.id, bloque: body.bloque, auteur };
    default: // lien, retirer
      return { action: site, id: body.id, auteur };
  }
}

export type Etat =
  | { disponible: true; actions: string[]; roles: Array<{ slug: string; libelle: string }> }
  | { disponible: false; motif: "canal" | "contrat" };

// Le bloc `membres` du manifeste du site. Absent ou mal formé = contrat non
// publié : la page se ferme avec le motif, jamais une liste vide trompeuse.
export function lireEtat(manifeste: unknown): Etat {
  const m = (manifeste && typeof manifeste === "object")
    ? (manifeste as Record<string, unknown>).membres
    : null;
  if (!m || typeof m !== "object") return { disponible: false, motif: "contrat" };
  const bloc = m as Record<string, unknown>;
  const actions = Array.isArray(bloc.actions)
    ? bloc.actions.filter((a): a is string => typeof a === "string")
    : [];
  if (!actions.includes("membres")) return { disponible: false, motif: "contrat" };
  const roles = (Array.isArray(bloc.roles) ? bloc.roles : []).flatMap((r) => {
    const x = (r && typeof r === "object") ? r as Record<string, unknown> : {};
    return typeof x.slug === "string" && x.slug
      ? [{ slug: x.slug, libelle: typeof x.libelle === "string" && x.libelle ? x.libelle : x.slug }]
      : [];
  });
  return { disponible: true, actions, roles };
}

export interface ErreurCanal {
  statut_site: number | null;
  code: string | null;
  detail: unknown;
}

export function erreurCanal(detail: unknown): ErreurCanal {
  const d = (detail && typeof detail === "object") ? detail as Record<string, unknown> : {};
  const corps = (d.corps && typeof d.corps === "object") ? d.corps as Record<string, unknown> : {};
  return {
    statut_site: typeof d.statut_site === "number" ? d.statut_site : null,
    code: typeof corps.error === "string"
      ? corps.error
      : typeof corps.brut === "string"
      ? corps.brut.slice(0, 200)
      : null,
    detail: corps.detail ?? null,
  };
}

// Ce que la console affiche pour chaque code du contrat.
const MESSAGES: Record<string, string> = {
  deja_membre: "Cette adresse a déjà un compte chez ce site. Rien n'a été modifié.",
  membre_inconnu: "Ce membre n'existe pas ou plus chez ce site.",
  org_inconnue: "Cette organisation n'existe pas chez ce site.",
  role_inconnu: "Ce rôle n'existe pas chez ce site.",
  mot_de_passe_trop_court: "Mot de passe trop court : 8 caractères minimum.",
  invalid_body: "Le site a refusé la demande : saisie invalide.",
  action_inconnue: "Ce site ne propose pas cette action.",
  erreur_interne: "Le site a rencontré une erreur. Rien n'est confirmé : vérifier la liste avant de recommencer.",
  unauthorized: "Le site refuse la clé du canal d'administration.",
};

export function messageCanal(canal: ErreurCanal): string {
  const connu = canal.code ? MESSAGES[canal.code] : null;
  if (connu) {
    return canal.code === "invalid_body" && typeof canal.detail === "string"
      ? `${connu} (${canal.detail})`
      : connu;
  }
  return `Le site a refusé — HTTP ${canal.statut_site ?? "?"} ${canal.code ?? ""}`.trim();
}
