// ---------------------------------------------------------------------------
// Module Événements v1 — le relais : reçoit les balises du navigateur, écrit
// en base. Identique chez tous les sites.
//
// Installer chez un site : copier ce fichier tel quel, puis poser l'un des
// deux enrobages de la fin du fichier (route Next sur le domaine du site, de
// préférence ; Edge Function Deno sinon, avec verify_jwt = false parce que
// navigator.sendBeacon ne pose aucun en-tête). Guide : evenements-v1.md.
//
// Contrat HTTP (appelé par evenements-v1.js, la bibliothèque navigateur) :
//   OPTIONS            -> 204, en-têtes CORS de l'origine configurée
//   POST { lignes: [ { visiteur_id, geste, libelle?, page, detail?,
//                       dossier_id?, referent?, est_test? }, … ] }   (50 max)
//                      -> 204 TOUJOURS, erreur comprise : le visiteur ne voit
//                         jamais rien, l'erreur va dans les logs du relais
//   autre méthode      -> 405
//
// Ce qu'il refuse, en plus de ce que la fonction SQL refuserait (ceinture et
// bretelles) : une ligne qui porte un email (l'identité ne vient que du
// serveur du site), le geste 'identification' (réservé à evenement_identifier),
// un robot d'après son user-agent (non stocké), un lot de plus de 50 lignes.
// Le corps est lu en texte puis parsé : sendBeacon l'envoie en text/plain.
// ---------------------------------------------------------------------------

export const GESTES: readonly string[] = [
  "page_vue",
  "clic",
  "recherche",
  "resultat_ouvert",
  "filtre",
  "formulaire_envoye",
  "fichier_telecharge",
  "media_lu",
  "partage",
  "paiement_initie",
  "erreur",
  "identification",
  "autre",
];

/** Copié de site/lib/trafic.ts (MonsieurDPE) : court et générique, à dessein. */
export const MOTIF_ROBOT =
  /bot|crawl|spider|slurp|headless|lighthouse|monitor|curl|wget|python|httpclient|go-http|java\/|externalhit|preview|scan|checkpoint|validator|feedfetcher/i;

const LIGNES_MAX = 50;
const CLES_DETAIL_MAX = 20;
const TEXTE_MAX = 200;
const PAGE_MAX = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Scalaire = string | number | boolean | null;

export type Ligne = {
  visiteur_id: string;
  geste: string;
  libelle: string | null;
  page: string;
  detail: Record<string, Scalaire>;
  dossier_id: string | null;
  referent: string | null;
  est_test: boolean;
};

export type LotLu =
  | { ok: true; lignes: Ligne[]; rejetees: number }
  | { ok: false; motif: "forme" | "trop" | "robot" };

export function estRobot(userAgent: string | null): boolean {
  if (userAgent === null || userAgent.trim() === "") return true;
  return MOTIF_ROBOT.test(userAgent);
}

function texte(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const propre = valeur.trim();
  return propre === "" ? null : propre.slice(0, TEXTE_MAX);
}

function lireDetail(valeur: unknown): Record<string, Scalaire> | null {
  if (valeur === undefined || valeur === null) return {};
  if (typeof valeur !== "object" || Array.isArray(valeur)) return null;
  const entrees = Object.entries(valeur as Record<string, unknown>);
  if (entrees.length > CLES_DETAIL_MAX) return null;
  const propre: Record<string, Scalaire> = {};
  for (const [cle, v] of entrees) {
    if (v === null) propre[cle] = null;
    else if (typeof v === "string") propre[cle] = v.slice(0, TEXTE_MAX);
    else if (typeof v === "number" || typeof v === "boolean") propre[cle] = v;
    else return null;
  }
  return propre;
}

/** Une ligne lue, ou null si elle est à rejeter. Pure. */
function lireLigne(brute: unknown): Ligne | null {
  if (typeof brute !== "object" || brute === null || Array.isArray(brute)) return null;
  const l = brute as Record<string, unknown>;
  if ("email" in l) return null;
  if (typeof l.visiteur_id !== "string" || !UUID.test(l.visiteur_id)) return null;
  if (typeof l.geste !== "string" || !GESTES.includes(l.geste) || l.geste === "identification") return null;
  if (typeof l.page !== "string" || !l.page.startsWith("/") || /[?#]/.test(l.page) || l.page.length > PAGE_MAX) return null;
  const detail = lireDetail(l.detail);
  if (detail === null) return null;
  return {
    visiteur_id: l.visiteur_id.toLowerCase(),
    geste: l.geste,
    libelle: texte(l.libelle),
    page: l.page,
    detail,
    dossier_id: texte(l.dossier_id),
    referent: texte(l.referent),
    est_test: l.est_test === true,
  };
}

/** Lit un lot reçu du navigateur. Aucune I/O. */
export function lireLot(corps: unknown, userAgent: string | null): LotLu {
  if (estRobot(userAgent)) return { ok: false, motif: "robot" };
  if (typeof corps !== "object" || corps === null) return { ok: false, motif: "forme" };
  const brutes = (corps as { lignes?: unknown }).lignes;
  if (!Array.isArray(brutes) || brutes.length === 0) return { ok: false, motif: "forme" };
  if (brutes.length > LIGNES_MAX) return { ok: false, motif: "trop" };
  const lignes: Ligne[] = [];
  let rejetees = 0;
  for (const brute of brutes) {
    const ligne = lireLigne(brute);
    if (ligne === null) rejetees += 1;
    else lignes.push(ligne);
  }
  return { ok: true, lignes, rejetees };
}
