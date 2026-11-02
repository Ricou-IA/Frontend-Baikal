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

// ------ Le gestionnaire HTTP ------

export type DependancesRelais = {
  /** Écrit le lot : l'appel RPC evenement_enregistrer du site. */
  enregistrer: (lignes: Ligne[]) => Promise<{ error: string | null }>;
  /** Où vont les erreurs : console.error chez la plupart des sites. */
  journal?: (message: string) => void;
  /** L'origine autorisée (https://www.monsite.fr) ; '*' à défaut. */
  origine?: string;
};

function entetesCors(origine: string | undefined): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origine ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

/**
 * Traite une balise. Répond 204 à tout POST, quoi qu'il arrive : le visiteur
 * ne doit jamais rien voir, et une erreur se lit dans le journal du relais.
 * Ne lève jamais.
 */
export async function traiterBalise(req: Request, deps: DependancesRelais): Promise<Response> {
  const cors = entetesCors(deps.origine);
  const journal = deps.journal ?? (() => {});
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: cors });

  const muet = () => new Response(null, { status: 204, headers: cors });
  let corps: unknown;
  try {
    // En texte puis parsé : sendBeacon envoie text/plain, req.json() refuserait.
    corps = JSON.parse(await req.text());
  } catch {
    journal("[evenements] corps illisible");
    return muet();
  }

  const lot = lireLot(corps, req.headers.get("user-agent"));
  if (!lot.ok) {
    if (lot.motif !== "robot") journal(`[evenements] lot refusé : ${lot.motif}`);
    return muet();
  }
  if (lot.lignes.length === 0) {
    journal(`[evenements] lot sans ligne valide, ${lot.rejetees} rejetée(s)`);
    return muet();
  }
  try {
    const { error } = await deps.enregistrer(lot.lignes);
    if (error !== null) journal(`[evenements] écriture refusée : ${error}`);
  } catch (e) {
    journal(`[evenements] écriture en échec : ${e instanceof Error ? e.message : String(e)}`);
  }
  return muet();
}

// ------ Les deux enrobages, à copier chez le site ------
//
// Dans les deux cas, le client Supabase est celui de service_role, et la RPC
// s'appelle dans le schéma du site : createClient(url, cle, { db: { schema: "<schema>" } }).
//
// 1. Route Next, sur le domaine du site (app/api/evenements/route.ts) :
//
//   import { createClient } from "@supabase/supabase-js";
//   import { traiterBalise } from "@/lib/evenements-relais-v1";
//   const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_CLE_SERVICE!,
//     { db: { schema: "<schema>" } });
//   const deps = {
//     enregistrer: (lignes) => supabase.rpc("evenement_enregistrer", { p_lignes: lignes })
//       .then(({ error }) => ({ error: error?.message ?? null })),
//     journal: console.error,
//   };
//   export const POST = (req: Request) => traiterBalise(req, deps);
//   export const OPTIONS = POST;
//
// 2. Edge Function Deno (supabase/functions/<schema>-evenements/index.ts) :
//    verify_jwt = false OBLIGATOIRE, sendBeacon ne pose aucun en-tête ; sans le
//    drapeau, la fonction meurt en 401 sans un bruit et rien n'est jamais écrit.
//
//   import { createClient } from "jsr:@supabase/supabase-js@2";
//   import { traiterBalise } from "../_shared/evenements-relais-v1.ts";
//   const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
//     { db: { schema: "<schema>" } });
//   Deno.serve((req) => traiterBalise(req, {
//     enregistrer: (lignes) => supabase.rpc("evenement_enregistrer", { p_lignes: lignes })
//       .then(({ error }) => ({ error: error?.message ?? null })),
//     journal: console.error,
//     origine: "https://www.monsite.fr",
//   }));
