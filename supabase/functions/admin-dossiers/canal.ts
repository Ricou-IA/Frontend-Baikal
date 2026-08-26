// Cascade d'attribution du module Clients : portage TS de admin.canal_vente
// et admin.domaine_vente (projet partage). La fonction SQL ne peut pas etre
// appelee ici : la requete liste tourne sur la base du SITE via baikal_reader.
// Toute evolution de la cascade SQL doit etre reportee ici (et inversement).
//
// SQL de reference (2026-08-26) :
//   admin.domaine_vente : coalesce(nullif(referrer_domaine,''),
//     CASE WHEN utm_source LIKE '%.%' THEN utm_source END, '')
//   admin.canal_vente : a_gclid -> paid ; utm_medium in (cpc,ppc,paid,
//     paidsearch,display) -> paid ; domaine ~ moteurs -> organic ;
//     domaine <> '' -> referral ; utm_source <> '' -> campaign ;
//     capture_site = 'backfill_partiel' -> indetermine ; sinon unattributed.

const MEDIUMS_PAYANTS = new Set(["cpc", "ppc", "paid", "paidsearch", "display"]);
const MOTEURS = /(google|bing|yahoo|duckduckgo|qwant|ecosia|lilo|brave)\./;

function texte(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function domaineVente(attribution: Record<string, unknown> | null): string {
  const a = attribution ?? {};
  const referrer = texte(a["referrer_domaine"]);
  if (referrer !== "") return referrer;
  const utm = texte(a["utm_source"]);
  if (utm.includes(".")) return utm;
  return "";
}

export function canalVente(attribution: Record<string, unknown> | null): string {
  const a = attribution ?? {};
  if (a["a_gclid"] === true || a["a_gclid"] === "true") return "paid";
  if (MEDIUMS_PAYANTS.has(texte(a["utm_medium"]).toLowerCase())) return "paid";
  const domaine = domaineVente(attribution);
  if (MOTEURS.test(domaine)) return "organic";
  if (domaine !== "") return "referral";
  if (texte(a["utm_source"]) !== "") return "campaign";
  if (a["capture_site"] === "backfill_partiel") return "indetermine";
  return "unattributed";
}
