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
// ATTENTION SI TU AJOUTES UNE ENTREE ICI : ajoute-la aussi a
// DOMAINES_PAIEMENT_MASQUES dans src/components/console/badges-clients.jsx
// (BadgeCanal) -- sans quoi le badge affichera de nouveau ce domaine comme
// si c'etait une origine, meme si la classification l'ignore correctement.
// Les deux listes sont dupliquees faute d'import possible entre ce fichier
// (Deno) et le front (Vite) ; c'est le sens serveur -> front qui manquait de
// reference croisee, d'ou cette note.
const DOMAINES_PAIEMENT_EXCLUS: readonly string[] = [
  "checkout.stripe.com",
];

// Moteurs conversationnels (chat IA). Ce sont des sous-domaines PRECIS d'un
// fournisseur qui a par ailleurs un moteur de recherche classique : ils
// doivent etre testes AVANT la regle generale des moteurs, sans quoi
// gemini.google.com se ferait happer par la regle des domaines Google.
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

// Domaines Google, par extension nationale. Liste FINIE et explicite,
// passee a hoteDansListe exactement comme DOMAINES_MOTEURS -- PAS un scan de
// labels. Une version anterieure verifiait seulement qu'un label du nom
// d'hote valait "google" et n'etait pas le dernier ; cette heuristique se
// contournait (google.evil.com, google.com.evil.net, mail.google.com.
// attacker.io passaient tous pour un domaine Google, alors que leur domaine
// reel -- celui qui suit le dernier label pertinent -- appartient a un
// tiers). hoteDansListe ferme cette porte par construction : elle ancre la
// correspondance en FIN de nom d'hote (egalite ou suffixe ".domaine"),
// jamais au milieu, exactement comme les autres listes de ce fichier.
// Non exhaustive de toutes les extensions existantes ; etendre au besoin
// (donnee, pas logique).
const DOMAINES_GOOGLE: readonly string[] = [
  "google.com",
  "google.fr",
  "google.be",
  "google.ch",
  "google.lu",
  "google.ca",
  "google.co.uk",
  "google.ie",
  "google.de",
  "google.at",
  "google.es",
  "google.it",
  "google.pt",
  "google.nl",
  "google.dk",
  "google.se",
  "google.no",
  "google.fi",
  "google.pl",
  "google.cz",
  "google.sk",
  "google.hu",
  "google.ro",
  "google.gr",
  "google.bg",
  "google.hr",
  "google.si",
  "google.ee",
  "google.lv",
  "google.lt",
  "google.com.au",
  "google.co.nz",
  "google.co.jp",
  "google.co.kr",
  "google.co.in",
  "google.co.za",
  "google.com.sg",
  "google.com.hk",
  "google.com.tw",
  "google.co.th",
  "google.com.vn",
  "google.com.my",
  "google.com.ph",
  "google.com.br",
  "google.com.mx",
  "google.com.ar",
  "google.cl",
  "google.com.co",
  "google.com.pe",
  "google.ru",
  "google.com.tr",
  "google.co.il",
  "google.ae",
  "google.co.ma",
  "google.dz",
  "google.tn",
];

// Moteurs de recherche generalistes (hors Google, voir DOMAINES_GOOGLE
// ci-dessus). search.yahoo.com couvre ses prefixes regionaux
// (fr.search.yahoo.com...) par la correspondance "sous-domaine de"
// appliquee ci-dessous, pas par une entree par pays.
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
// "monsite-google.fr" (ne correspond pas a google.fr) et de
// "google.com.evil.net" (ne correspond pas a google.com : le suffixe reel
// est ".evil.net", pas ".google.com").
function hoteCorrespond(hote: string, domaine: string): boolean {
  return hote === domaine || hote.endsWith("." + domaine);
}

function hoteDansListe(hote: string, liste: readonly string[]): boolean {
  return hote !== "" && liste.some((d) => hoteCorrespond(hote, d));
}

// Nom d'hote normalise UNE SEULE FOIS, a l'entree -- plutot que de traiter
// la casse ou la ponctuation dans chaque comparaison en aval :
//  - minuscules (toutes les listes ci-dessus sont en minuscules) ;
//  - point final retire (un nom de domaine pleinement qualifie peut se
//    terminer par un point -- "gemini.google.com." -- ce que le navigateur
//    laisse parfois passer dans un referrer ; sans ce retrait, egalite et
//    endsWith echouent tous les deux et le domaine se retrouve traite comme
//    un referent ordinaire au lieu de sa vraie categorie).
function normaliserHote(hote: string): string {
  const minuscule = hote.toLowerCase();
  return minuscule.endsWith(".") ? minuscule.slice(0, -1) : minuscule;
}

function estDomaineExclu(hote: string): boolean {
  return hoteDansListe(hote, DOMAINES_PAIEMENT_EXCLUS);
}

// Domaine "brut" de la visite : referrer_domaine en priorite, sinon
// utm_source s'il ressemble a un domaine (contient un point) -- inchange par
// rapport a l'ancien admin.domaine_vente. Normalise (voir normaliserHote)
// puis prive de son domaine de paiement eventuel : un dossier dont le SEUL
// signal est ce retour de tunnel doit retomber exactement sur ce qu'il
// aurait ete sans lui.
export function domaineVente(attribution: Record<string, unknown> | null): string {
  const a = attribution ?? {};
  const referrer = texte(a["referrer_domaine"]);
  const utm = texte(a["utm_source"]);
  const brut = referrer !== "" ? referrer : (utm.includes(".") ? utm : "");
  const domaine = normaliserHote(brut);
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

  // domaineVente normalise deja (minuscules, point final retire) : pas
  // besoin d'y retoucher ici.
  const domaine = domaineVente(attribution);

  // 3. GEO : moteur conversationnel, ou medium "llm" explicite (pose par le
  // site meme sans domaine identifiable).
  if (hoteDansListe(domaine, DOMAINES_GEO)) return "geo";
  if (texte(a["utm_medium"]).toLowerCase() === "llm") return "geo";

  // 4. Campagne : clic depuis un webmail, ou lien de campagne sans referrer
  // HTTP (pas de domaine, mais un utm_source -- cas newsletter).
  if (hoteDansListe(domaine, DOMAINES_WEBMAIL)) return "campaign";
  if (domaine === "" && texte(a["utm_source"]) !== "") return "campaign";

  // 5. Organique : moteur de recherche general (Google, toutes extensions,
  // ou un autre moteur generaliste) ; a defaut de domaine, repli sur le
  // channel calcule cote site. Un domaine PRESENT qui n'est pas un moteur ne
  // passe jamais par ce repli : il est plus precis que le channel du site et
  // tranche a l'etape suivante (referral). C'est ce qui evite qu'un simple
  // referent (leboncoin.fr...) ne se fasse recycler en organic parce que le
  // site l'a lui-meme range dans "organic_search".
  if (domaine !== "") {
    if (hoteDansListe(domaine, DOMAINES_GOOGLE) || hoteDansListe(domaine, DOMAINES_MOTEURS)) {
      return "organic";
    }
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
