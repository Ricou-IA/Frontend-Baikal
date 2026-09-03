import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canalVente } from "./canal.ts";

// --- Cascade de base (paid / organic / referral / campaign) ------------

Deno.test("gclid vrai -> paid", () => {
  assertEquals(canalVente({ a_gclid: true }), "paid");
});
Deno.test("utm_medium cpc (casse ignoree) -> paid", () => {
  assertEquals(canalVente({ utm_medium: "CPC" }), "paid");
});
Deno.test("referrer moteur -> organic", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com" }), "organic");
});
Deno.test("referrer autre site -> referral", () => {
  assertEquals(canalVente({ referrer_domaine: "leboncoin.fr" }), "referral");
});
Deno.test("utm_source simple seul -> campaign", () => {
  assertEquals(canalVente({ utm_source: "newsletter" }), "campaign");
});
Deno.test("le referrer moteur gagne sur utm_source", () => {
  assertEquals(canalVente({ referrer_domaine: "bing.com", utm_source: "newsletter" }), "organic");
});
Deno.test("aucun signal -> unattributed", () => {
  assertEquals(canalVente({}), "unattributed");
});
Deno.test("attribution null -> unattributed", () => {
  assertEquals(canalVente(null), "unattributed");
});

// --- utm_source en repli de domaine (domaineVente) ----------------------
// domaineVente replie sur utm_source quand il contient un point : le domaine
// obtenu traverse ensuite la MEME cascade que referrer_domaine, donc peut
// atterrir dans n'importe quelle categorie de domaine (pas seulement referral).

Deno.test("utm_source en forme de domaine ordinaire, sans referrer -> referral", () => {
  assertEquals(canalVente({ utm_source: "leboncoin.fr" }), "referral");
});
Deno.test("utm_source en forme de domaine conversationnel, sans referrer -> geo", () => {
  assertEquals(canalVente({ utm_source: "chatgpt.com" }), "geo");
});

// --- Les trois visages d'un meme fournisseur (google.*) -----------------
// Le point technique central du chantier : lire le nom d'hote complet avec
// des regles ordonnees et specifiques, pas une sous-chaine.

Deno.test("google.com -> organic", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com" }), "organic");
});
Deno.test("www.google.fr -> organic (extension nationale, sous-domaine www)", () => {
  assertEquals(canalVente({ referrer_domaine: "www.google.fr" }), "organic");
});
Deno.test("google.co.uk -> organic (extension nationale composee)", () => {
  assertEquals(canalVente({ referrer_domaine: "google.co.uk" }), "organic");
});
Deno.test("gemini.google.com -> geo, jamais organic", () => {
  assertEquals(canalVente({ referrer_domaine: "gemini.google.com" }), "geo");
});
Deno.test("mail.google.com -> campaign, jamais organic", () => {
  assertEquals(canalVente({ referrer_domaine: "mail.google.com" }), "campaign");
});
Deno.test("fr.search.yahoo.com -> organic (prefixe regional de search.yahoo.com)", () => {
  assertEquals(canalVente({ referrer_domaine: "fr.search.yahoo.com" }), "organic");
});
Deno.test("un domaine qui contient la sous-chaine google. sans etre google -> referral", () => {
  // Reproduit exactement l'ancien bug par sous-chaine (l'ancienne regex
  // matchait "google." n'importe ou) : "xgoogle.com" n'a qu'un seul label,
  // "xgoogle", different de "google".
  assertEquals(canalVente({ referrer_domaine: "xgoogle.com" }), "referral");
});

// --- Contournement de l'ancienne heuristique estGoogle (revue) -----------
// estGoogle verifiait qu'un LABEL du nom d'hote valait "google" sans etre le
// dernier -- contournable : un attaquant qui controle un domaine peut nommer
// n'importe lequel de ses sous-domaines pour y faire apparaitre "google" en
// position non finale. DOMAINES_GOOGLE + hoteDansListe ferme cette porte par
// construction (correspondance ancree en FIN de nom d'hote). Ces trois cas
// doivent tomber en referral, jamais organic : le vrai domaine (celui qui
// suit le dernier label pertinent) n'est pas google.

Deno.test("google.com.evil.net -> referral, pas organic (contournement de l'ancienne heuristique)", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com.evil.net" }), "referral");
});
Deno.test("mail.google.com.attacker.io -> referral, pas organic (contournement)", () => {
  assertEquals(canalVente({ referrer_domaine: "mail.google.com.attacker.io" }), "referral");
});
Deno.test("google.evil.com -> referral, pas organic (google en sous-domaine d'un domaine tiers)", () => {
  assertEquals(canalVente({ referrer_domaine: "google.evil.com" }), "referral");
});
Deno.test("checkout.stripe.com.attacker.io n'est PAS exclu -> referral (contre-preuve : hoteDansListe ancre deja correctement)", () => {
  // Contre-preuve demandee en revue : ce domaine ne doit PAS etre traite
  // comme le tunnel de paiement du site -- c'est un referrer ordinaire d'un
  // tiers, donc referral. Si ce test se met a echouer, c'est que
  // hoteDansListe a perdu sa propriete d'ancrage en fin de nom d'hote.
  assertEquals(canalVente({ referrer_domaine: "checkout.stripe.com.attacker.io" }), "referral");
});

// --- Point final (FQDN) : normalise une seule fois, a l'entree -----------
// Un nom d'hote pleinement qualifie peut porter un point final. Sans
// normalisation, il casse toute correspondance exacte ou par suffixe -- le
// domaine se retrouve traite comme un referent ordinaire au lieu de sa
// vraie categorie.

Deno.test("point final sur un moteur conversationnel -> geo quand meme", () => {
  assertEquals(canalVente({ referrer_domaine: "gemini.google.com." }), "geo");
});
Deno.test("point final sur un webmail -> campaign quand meme", () => {
  assertEquals(canalVente({ referrer_domaine: "mail.google.com." }), "campaign");
});
Deno.test("point final sur un moteur general (domaine Google) -> organic quand meme", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com." }), "organic");
});
Deno.test("point final combine a des majuscules -> geo quand meme", () => {
  assertEquals(canalVente({ referrer_domaine: "GEMINI.GOOGLE.COM." }), "geo");
});

// --- Domaine de paiement du site : exclu comme une absence de referrer --

Deno.test("checkout.stripe.com seul -> unattributed (identique a une absence de referrer)", () => {
  assertEquals(canalVente({ referrer_domaine: "checkout.stripe.com" }), "unattributed");
});
Deno.test("checkout.stripe.com ignore : le dossier retombe sur le signal restant", () => {
  const avecStripe = canalVente({ referrer_domaine: "checkout.stripe.com", channel: "direct" });
  const sansReferrer = canalVente({ channel: "direct" });
  assertEquals(avecStripe, sansReferrer);
  assertEquals(avecStripe, "direct");
});

// --- Donnees reelles mesurees sur le site de reference (735 dossiers) ---

Deno.test("copilot.microsoft.com -> geo (donnee reelle, ex-referral)", () => {
  assertEquals(canalVente({ referrer_domaine: "copilot.microsoft.com" }), "geo");
});
Deno.test("utm_medium llm sans domaine -> geo (donnee reelle)", () => {
  assertEquals(canalVente({ utm_medium: "llm" }), "geo");
});
Deno.test("messageriepro.orange.fr -> campaign (donnee reelle, ex-referral)", () => {
  assertEquals(canalVente({ referrer_domaine: "messageriepro.orange.fr" }), "campaign");
});
Deno.test("apporteur MON PRE DATE (donnee reelle, b2b) -> portail_pro", () => {
  assertEquals(canalVente({}, "MON PRE DATE"), "portail_pro");
});
Deno.test("apporteur Antique Immo (donnee reelle, b2b) -> portail_pro", () => {
  assertEquals(canalVente({}, "Antique Immo"), "portail_pro");
});

// --- Ordre de priorite entre categories quand plusieurs signaux coexistent

Deno.test("priorite : apporteur gagne sur un referrer moteur (portail_pro avant organic)", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com" }, "MON PRE DATE"), "portail_pro");
});
Deno.test("priorite : apporteur gagne sur un medium payant (portail_pro avant paid)", () => {
  assertEquals(canalVente({ utm_medium: "cpc", a_gclid: true }, "Antique Immo"), "portail_pro");
});
Deno.test("priorite : utm_medium cpc gagne sur un referrer conversationnel (paid avant geo)", () => {
  assertEquals(canalVente({ utm_medium: "cpc", referrer_domaine: "chatgpt.com" }), "paid");
});
Deno.test("priorite : utm_medium llm gagne sur un referrer moteur (geo avant organic)", () => {
  // Ni a_gclid ni utm_medium payant ici, donc geo (regle 3) est atteinte et
  // tranche avant organic (regle 5) -- meme si le domaine est un moteur
  // classique, le medium llm explicite l'emporte.
  assertEquals(canalVente({ utm_medium: "llm", referrer_domaine: "google.com" }), "geo");
});
Deno.test("priorite : channel direct gagne sur capture backfill_partiel (direct avant indetermine)", () => {
  assertEquals(canalVente({ channel: "direct", capture: "backfill_partiel" }), "direct");
});

// --- Repli sur le channel du site : jamais prioritaire sur un signal precis

Deno.test("channel organic_search sans referrer -> organic (repli)", () => {
  assertEquals(canalVente({ channel: "organic_search" }), "organic");
});
Deno.test("channel direct sans autre signal -> direct", () => {
  assertEquals(canalVente({ channel: "direct" }), "direct");
});
Deno.test("un referrer non-moteur gagne sur channel organic_search (repli jamais prioritaire)", () => {
  assertEquals(canalVente({ referrer_domaine: "leboncoin.fr", channel: "organic_search" }), "referral");
});
Deno.test("un referrer webmail gagne sur channel organic_search (repli jamais prioritaire)", () => {
  assertEquals(canalVente({ referrer_domaine: "mail.google.com", channel: "organic_search" }), "campaign");
});
Deno.test("un utm_source de campagne gagne sur channel direct (repli jamais prioritaire)", () => {
  assertEquals(canalVente({ utm_source: "newsletter", channel: "direct" }), "campaign");
});

// --- Les deux noms du champ d'attribution incomplete --------------------

Deno.test("capture backfill_partiel (forme publiee par le site) -> indetermine", () => {
  assertEquals(canalVente({ capture: "backfill_partiel" }), "indetermine");
});
Deno.test("capture_site backfill_partiel (forme de l'archive financiere) -> indetermine", () => {
  assertEquals(canalVente({ capture_site: "backfill_partiel" }), "indetermine");
});

// --- apporteur : colonne optionnelle du dossier (pas de l'attribution) --

Deno.test("apporteur omis (site sans la colonne) -> pas de portail_pro par erreur", () => {
  assertEquals(canalVente({ referrer_domaine: "google.com" }), "organic");
});
Deno.test("apporteur undefined explicite -> pas de portail_pro", () => {
  assertEquals(canalVente({}, undefined), "unattributed");
});
Deno.test("apporteur null -> pas de portail_pro", () => {
  assertEquals(canalVente({}, null), "unattributed");
});
Deno.test("apporteur chaine vide -> pas de portail_pro", () => {
  assertEquals(canalVente({}, ""), "unattributed");
});

// --- Robustesse : attribution nulle, vide ou de type inattendu ----------

Deno.test("attribution vide ({}) -> unattributed", () => {
  assertEquals(canalVente({}), "unattributed");
});
Deno.test("attribution de type chaine (JSON malforme) -> pas de crash, unattributed", () => {
  assertEquals(canalVente("inattendu" as unknown as Record<string, unknown>), "unattributed");
});
Deno.test("attribution de type nombre -> pas de crash, unattributed", () => {
  assertEquals(canalVente(42 as unknown as Record<string, unknown>), "unattributed");
});
Deno.test("attribution de type tableau -> pas de crash, unattributed", () => {
  assertEquals(canalVente([] as unknown as Record<string, unknown>), "unattributed");
});
