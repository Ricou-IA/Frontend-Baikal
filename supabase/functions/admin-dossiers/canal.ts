// Cascade d'attribution du module Clients.
//
// Jusqu'au 2026-09-03 ce fichier etait un portage strict de la fonction SQL
// admin.canal_vente (projet partage), et son en-tete demandait de reporter
// toute evolution dans les deux sens. CETTE PARITE EST ROMPUE DELIBEREMENT
// depuis cette date, sur decision du proprietaire du projet. Si tu lis ceci
// en te demandant pourquoi la cascade diverge du SQL : ce n'est pas un oubli,
// ne "corrige" pas en realignant -- lis les deux raisons ci-dessous.
//
//  1. L'archive financiere (admin.ventes, alimentee par
//     admin-finance/enrichissement.ts) ne porte pas de champ "channel" au
//     sens ou ce fichier l'entend : sa vue source ne l'expose pas comme un
//     signal de repli exploitable de la meme facon que referrer_domaine ou
//     les utm_*. Les categories "direct" et le repli "organic_search" sont
//     donc IMPOSSIBLES a calculer depuis l'archive -- pas un choix, une
//     limite de la donnee source.
//  2. Le proprietaire a arbitre que la CONSOLE (ce fichier) est desormais la
//     reference pour l'attribution. Le module Finances sert a la
//     reconciliation des MONTANTS, pas des canaux : les deux ecrans peuvent
//     donc legitimement afficher des categories differentes pour un meme
//     dossier.
//
// Consequence deja mesuree de cette divergence, et cause du dysfonctionnement
// historique de la branche "indetermine" : les DEUX FORMES d'attribution
// different reellement. Le site publie la cle "capture" dans l'attribution de
// baikal_dossiers (lue ici) ; admin-finance/enrichissement.ts la RENOMME en
// "capture_site" en construisant l'archive (voir attributionDepuisLigne, qui
// fait litteralement attribution.capture_site = ligne.capture). Ce fichier ne
// testait auparavant que "capture_site", qui n'existe jamais cote site : la
// branche etait donc morte en pratique cote console. Les deux noms sont
// acceptes ci-dessous, sans hierarchie entre eux (ce sont deux ecritures du
// meme signal, jamais deux categories concurrentes).
//
// SQL de reference (2026-08-26, avant la rupture de parite decrite ci-dessus) :
//   admin.domaine_vente : coalesce(nullif(referrer_domaine,''),
//     CASE WHEN utm_source LIKE '%.%' THEN utm_source END, '')
//   admin.canal_vente : a_gclid -> paid ; utm_medium in (cpc,ppc,paid,
//     paidsearch,display) -> paid ; domaine ~ moteurs -> organic ;
//     domaine <> '' -> referral ; utm_source <> '' -> campaign ;
//     capture_site = 'backfill_partiel' -> indetermine ; sinon unattributed.

const MEDIUMS_PAYANTS = new Set(["cpc", "ppc", "paid", "paidsearch", "display"]);

// Domaines a ignorer comme s'il n'y avait pas de referrer : ce sont des
// retours de tunnel de paiement du site lui-meme, jamais une origine de
// visite -- sans cette exclusion ils ecrasent le vrai referent du dossier.
// Liste extensible : un site pourrait avoir son propre domaine de paiement.
const DOMAINES_PAIEMENT_EXCLUS: readonly string[] = [
  "checkout.stripe.com",
];

// Moteurs conversationnels (chat IA). Ce sont des sous-domaines PRECIS d'un
// fournisseur qui a par ailleurs un moteur de recherche classique : ils
// doivent etre testes AVANT la regle generale des moteurs, sans quoi
// gemini.google.com se ferait happer par la regle google.* generale.
const DOMAINES_GEO: readonly string[] = [
  "gemini.google.com",
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "copilot.microsoft.com",
  "claude.ai",
  "mistral.ai",
  "you.com",
];

// Webmails. Meme raison que ci-dessus (mail.google.com n'est pas google.com) :
// testes avant la regle generale des moteurs. Un clic depuis un email est une
// campagne, jamais un referent.
const DOMAINES_WEBMAIL: readonly string[] = [
  "messageriepro.orange.fr",
  "mail.orange.fr",
  "webmail.orange.fr",
  "mail.google.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.com",
  "mail.yahoo.com",
  "mail.laposte.net",
  "webmail.free.fr",
  "webmail.sfr.fr",
];

// Moteurs de recherche generalistes. Google est traite a part (voir
// estGoogle) : le lister ici imposerait d'enumerer chaque extension
// nationale (google.fr, google.co.uk, google.de...). search.yahoo.com
// couvre ses prefixes regionaux (fr.search.yahoo.com...) par la
// correspondance "sous-domaine de" appliquee ci-dessous, pas par une entree
// par pays.
const DOMAINES_MOTEURS: readonly string[] = [
  "bing.com",
  "qwant.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "ecosia.org",
  "lilo.org",
  "search.brave.com",
  "startpage.com",
];

function texte(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Un hote "correspond" a un domaine s'il lui est EGAL ou s'il en est un
// sous-domaine -- jamais s'il le contient comme sous-chaine. C'est ce qui
// distingue "fr.search.yahoo.com" (correspond a search.yahoo.com, voulu) de
// "monsite-google.fr" (ne correspond pas a google.fr, l'ancien bug).
function hoteCorrespond(hote: string, domaine: string): boolean {
  return hote === domaine || hote.endsWith("." + domaine);
}

function hoteDansListe(hote: string, liste: readonly string[]): boolean {
  return hote !== "" && liste.some((d) => hoteCorrespond(hote, d));
}

// Google publie un sous-domaine par extension nationale (google.com,
// google.fr, google.co.uk...) : plutot que d'enumerer, on verifie qu'un
// LABEL du nom d'hote vaut exactement "google" et n'est pas le dernier
// (qui serait alors l'extension elle-meme, pas google). "notgoogle.com" a
// pour seul label "notgoogle" (different de "google") et ne correspond donc
// jamais -- contrairement a l'ancienne regex qui matchait toute sous-chaine
// "google." ("monsite-a-cote-de-google.fr" y passait pour organic).
function estGoogle(hote: string): boolean {
  if (hote === "") return false;
  const labels = hote.split(".");
  const i = labels.indexOf("google");
  return i !== -1 && i < labels.length - 1;
}

function estDomaineExclu(hote: string): boolean {
  return hoteDansListe(hote.toLowerCase(), DOMAINES_PAIEMENT_EXCLUS);
}

// Domaine "brut" de la visite : referrer_domaine en priorite, sinon
// utm_source s'il ressemble a un domaine (contient un point) -- inchange par
// rapport a l'ancien admin.domaine_vente. Le domaine de paiement du site est
// ensuite retire comme s'il n'avait jamais ete pose : un dossier dont le
// SEUL signal est ce retour de tunnel doit retomber exactement sur ce qu'il
// aurait ete sans lui.
export function domaineVente(attribution: Record<string, unknown> | null): string {
  const a = attribution ?? {};
  const referrer = texte(a["referrer_domaine"]);
  const utm = texte(a["utm_source"]);
  const domaine = referrer !== "" ? referrer : (utm.includes(".") ? utm : "");
  return estDomaineExclu(domaine) ? "" : domaine;
}

// Cascade d'attribution -- l'ORDRE des branches fait partie du contrat, au
// meme titre que leur contenu : le premier signal qui correspond gagne.
//
//  1. portail_pro  2. paid  3. geo  4. campaign  5. organic  6. referral
//  7. direct       8. indetermine   9. unattributed
//
// apporteur est une colonne du DOSSIER (baikal_dossiers.apporteur), jamais
// un champ de l'attribution -- d'ou la signature a deux parametres. C'est
// une colonne OPTIONNELLE du contrat : un site qui ne la publie pas fait
// simplement remonter "undefined" ici, jamais une erreur.
export function canalVente(
  attribution: Record<string, unknown> | null,
  apporteur?: unknown,
): string {
  // 1. Portail pro : un apporteur non vide gagne sur tout le reste, y
  // compris un referrer ou un medium payant -- c'est un canal de vente a
  // part entiere, pas une origine de trafic web.
  if (texte(apporteur) !== "") return "portail_pro";

  const a = attribution ?? {};

  // 2. Payant : mesure reelle sur le site de reference -- aucun dossier n'a
  // a_gclid a vrai, la detection repose donc entierement sur utm_medium.
  if (a["a_gclid"] === true || a["a_gclid"] === "true") return "paid";
  if (MEDIUMS_PAYANTS.has(texte(a["utm_medium"]).toLowerCase())) return "paid";

  const domaine = domaineVente(attribution).toLowerCase();

  // 3. GEO : moteur conversationnel, ou medium "llm" explicite (pose par le
  // site meme sans domaine identifiable).
  if (hoteDansListe(domaine, DOMAINES_GEO)) return "geo";
  if (texte(a["utm_medium"]).toLowerCase() === "llm") return "geo";

  // 4. Campagne : clic depuis un webmail, ou lien de campagne sans referrer
  // HTTP (pas de domaine, mais un utm_source -- cas newsletter).
  if (hoteDansListe(domaine, DOMAINES_WEBMAIL)) return "campaign";
  if (domaine === "" && texte(a["utm_source"]) !== "") return "campaign";

  // 5. Organique : moteur de recherche general ; a defaut de domaine,
  // repli sur le channel calcule cote site. Un domaine PRESENT qui n'est pas
  // un moteur ne passe jamais par ce repli : il est plus precis que le
  // channel du site et tranche a l'etape suivante (referral). C'est ce qui
  // evite qu'un simple referent (leboncoin.fr...) ne se fasse recycler en
  // organic parce que le site l'a lui-meme range dans "organic_search".
  if (domaine !== "") {
    if (estGoogle(domaine) || hoteDansListe(domaine, DOMAINES_MOTEURS)) return "organic";
  } else if (texte(a["channel"]) === "organic_search") {
    return "organic";
  }

  // 6. Referent : un domaine qui n'entre dans aucune categorie ci-dessus.
  // Volontairement conserve et affiche (avec le domaine) : c'est ce qui
  // permet de mesurer les backlinks, raison d'etre de cette categorie.
  if (domaine !== "") return "referral";

  // 7. Direct : signal explicite du site (aucun domaine, aucun utm_source --
  // sinon les branches 4 et 6 auraient deja tranche).
  if (texte(a["channel"]) === "direct") return "direct";

  // 8. Indetermine : attribution incomplete a la capture cote site. Deux
  // noms possibles pour le meme signal selon la forme -- voir l'en-tete.
  if (a["capture"] === "backfill_partiel" || a["capture_site"] === "backfill_partiel") {
    return "indetermine";
  }

  // 9. Aucun signal exploitable.
  return "unattributed";
}
