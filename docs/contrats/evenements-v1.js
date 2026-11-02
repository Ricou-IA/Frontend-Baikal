// ---------------------------------------------------------------------------
// Module Événements v1 — la bibliothèque navigateur. Identique chez tous les
// sites. Module ES sans dépendance : Next, Vite ou page statique.
//
// Installer chez un site : copier ce fichier, puis dans la coque de
// l'application (un composant client monté une fois, ou un <script type=module>) :
//
//   import { installer } from "./evenements-v1.js";
//   const mouchard = installer({ relais: "/api/evenements", nomCookie: "<schema>_visiteur" });
//   // puis, aux endroits qui comptent :
//   mouchard.geste("resultat_ouvert", "10 Rue de Lan Goc", { rang: 1 }, null);
//
// Ce qu'elle fait : un identifiant de visiteur sans date de fin (stockage
// local + cookie de première partie, pour que le serveur du site le lise dans
// ses routes), une page_vue à chaque chargement et à chaque navigation
// interne, une file de gestes envoyée par lots (5 s, 20 gestes, ou quand la
// page se cache, par sendBeacon qui survit à la fermeture). Mode staff :
// ?staff=1 pose un drapeau persistant, ?staff=0 le retire ; les gestes partent
// alors en est_test.
//
// Ce qu'elle ne fait jamais : envoyer une adresse courriel (la clé `email`
// d'un detail est retirée ; l'identité ne vient que du serveur du site), ni
// une page avec ses paramètres (la chaîne de requête et le fragment sont
// retirés avant l'envoi). Elle ne lève jamais et ne bloque jamais la page.
// ---------------------------------------------------------------------------

const CLE_VISITEUR = "mouchard_visiteur";
const CLE_STAFF = "mouchard_staff";
const TAILLE_LOT = 20;
const DELAI_MS = 5000;
const CLES_DETAIL_MAX = 20;
const TEXTE_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le chemin d'une URL, sans requête ni fragment ; '/' si illisible. */
export function nettoyerPage(href) {
  try {
    const chemin = new URL(href).pathname;
    return chemin === "" ? "/" : chemin.slice(0, 300);
  } catch {
    return "/";
  }
}

/** Le nom d'hôte du référent, ou null s'il est vide ou interne. */
export function hoteReferent(referrer, hoteCourant) {
  if (typeof referrer !== "string" || referrer === "") return null;
  try {
    const hote = new URL(referrer).hostname;
    return hote === "" || hote === hoteCourant ? null : hote.slice(0, TEXTE_MAX);
  } catch {
    return null;
  }
}

/** Le mode staff : ?staff=1 le pose pour de bon, ?staff=0 le retire. */
export function lireStaff(search, stockage) {
  try {
    const valeur = new URLSearchParams(search).get("staff");
    if (valeur === "1") stockage.setItem(CLE_STAFF, "1");
    else if (valeur === "0") stockage.removeItem(CLE_STAFF);
    return stockage.getItem(CLE_STAFF) === "1";
  } catch {
    return false;
  }
}

function lireCookie(cookie, nom) {
  if (typeof cookie !== "string") return null;
  for (const morceau of cookie.split(";")) {
    const [cle, ...reste] = morceau.trim().split("=");
    if (cle === nom) return reste.join("=");
  }
  return null;
}

function nettoyerDetail(detail) {
  const propre = {};
  if (typeof detail !== "object" || detail === null) return propre;
  let n = 0;
  for (const [cle, valeur] of Object.entries(detail)) {
    if (cle === "email") continue;
    if (valeur === null) propre[cle] = null;
    else if (typeof valeur === "string") propre[cle] = valeur.slice(0, TEXTE_MAX);
    else if (typeof valeur === "number" || typeof valeur === "boolean") propre[cle] = valeur;
    else continue;
    n += 1;
    if (n >= CLES_DETAIL_MAX) break;
  }
  return propre;
}

function texte(valeur) {
  if (typeof valeur !== "string") return null;
  const propre = valeur.trim();
  return propre === "" ? null : propre.slice(0, TEXTE_MAX);
}

function envoyerParDefaut(fenetre) {
  return (url, corps) => {
    const nav = fenetre.navigator;
    if (nav && typeof nav.sendBeacon === "function" && nav.sendBeacon(url, corps)) return;
    if (typeof fenetre.fetch === "function") {
      fenetre.fetch(url, { method: "POST", body: corps, keepalive: true }).catch(() => {});
    }
  };
}

/** Un identifiant v4 ; `crypto.randomUUID` n'existe pas hors contexte sécurisé. */
function nouvelIdentifiant(cryptoObj) {
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  const octets = cryptoObj.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Le mouchard qui ne fait rien : hors navigateur, ou quand tout a échoué. */
function inerte() {
  return { visiteur: () => null, geste() {}, pageVue() {}, vider() {}, file: [] };
}

/** `localStorage` peut lever à l'accès (cookies bloqués) : alors null. */
function stockageDe(options, fenetre) {
  try {
    return options.stockage ?? fenetre.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Le mouchard, sans rien brancher sur la page : `installer` s'en charge.
 * Tout est injectable pour le test ; en production seuls `relais` et
 * `nomCookie` se donnent, plus `titre: false` pour une page vue sans titre
 * (quand un titre de page peut porter une donnée que le site ne garde pas).
 * Ne lève jamais : sans fenêtre, il rend un mouchard inerte.
 */
export function creerMouchard(options) {
  try {
    const fenetre = options.fenetre ?? globalThis.window;
    if (!fenetre || !fenetre.document || !fenetre.location) return inerte();
    return creerMouchardDans(options, fenetre);
  } catch {
    return inerte();
  }
}

function creerMouchardDans(options, fenetre) {
  const stockage = stockageDe(options, fenetre);
  const envoyer = options.envoyer ?? envoyerParDefaut(fenetre);
  const avecTitre = options.titre !== false;
  const file = [];
  let dernier = null;

  function visiteur() {
    let id = null;
    try { id = stockage?.getItem(CLE_VISITEUR) ?? null; } catch { /* stockage bloqué */ }
    if (!UUID.test(id ?? "")) id = lireCookie(fenetre.document.cookie, options.nomCookie);
    if (!UUID.test(id ?? "")) id = dernier ?? nouvelIdentifiant(fenetre.crypto ?? globalThis.crypto);
    dernier = id;
    try { stockage?.setItem(CLE_VISITEUR, id); } catch { /* stockage bloqué */ }
    try {
      fenetre.document.cookie = `${options.nomCookie}=${id}; Max-Age=31536000; Path=/; SameSite=Lax`;
    } catch { /* cookies bloqués */ }
    return id;
  }

  function vider() {
    if (file.length === 0) return;
    const lignes = file.splice(0, file.length);
    try {
      envoyer(options.relais, JSON.stringify({ lignes }));
    } catch { /* jamais bloquant */ }
  }

  function pousser(ligne) {
    file.push(ligne);
    if (file.length >= TAILLE_LOT) vider();
  }

  function ligneDe(geste, libelle, detail, dossierId, referent) {
    return {
      visiteur_id: visiteur(),
      geste,
      libelle: texte(libelle),
      page: nettoyerPage(fenetre.location.href),
      detail: nettoyerDetail(detail),
      dossier_id: texte(dossierId),
      referent,
      est_test: stockage === null ? false : lireStaff(fenetre.location.search, stockage),
    };
  }

  function geste(nom, libelle, detail, dossierId) {
    try {
      pousser(ligneDe(nom, libelle, detail, dossierId, null));
    } catch { /* jamais bloquant */ }
  }

  function pageVue() {
    try {
      const referent = hoteReferent(fenetre.document.referrer, fenetre.location.hostname);
      pousser(ligneDe("page_vue", avecTitre ? fenetre.document.title : null, {}, null, referent));
    } catch { /* jamais bloquant */ }
  }

  return { visiteur, geste, pageVue, vider, file };
}

const CLE_INSTALLE = "__mouchardEvenements";

/**
 * Crée le mouchard et le branche sur la page. Une seule fois par fenêtre :
 * un second appel (remontage, StrictMode) rend le même mouchard sans
 * nouvelle page vue ni second intervalle. Hors navigateur (rendu serveur),
 * rend un mouchard inerte. Ne lève jamais.
 */
export function installer(options) {
  try {
    const fenetre = options.fenetre ?? globalThis.window;
    if (!fenetre || !fenetre.document || !fenetre.location) return inerte();
    if (fenetre[CLE_INSTALLE]) return fenetre[CLE_INSTALLE];
    const mouchard = installerDans(options, fenetre);
    fenetre[CLE_INSTALLE] = mouchard;
    return mouchard;
  } catch {
    return inerte();
  }
}

function installerDans(options, fenetre) {
  const mouchard = creerMouchard({ ...options, fenetre });
  let pageCourante = nettoyerPage(fenetre.location.href);
  mouchard.pageVue();

  const surNavigation = () => {
    const page = nettoyerPage(fenetre.location.href);
    if (page === pageCourante) return;
    pageCourante = page;
    mouchard.pageVue();
  };
  try {
    const histoire = fenetre.history;
    for (const methode of ["pushState", "replaceState"]) {
      const originale = histoire[methode];
      histoire[methode] = function (...args) {
        const resultat = originale.apply(this, args);
        surNavigation();
        return resultat;
      };
    }
    fenetre.addEventListener("popstate", surNavigation);
    fenetre.document.addEventListener("visibilitychange", () => {
      if (fenetre.document.visibilityState === "hidden") mouchard.vider();
    });
    fenetre.setInterval(mouchard.vider, DELAI_MS);
  } catch { /* une page sans historique reste traquée au chargement */ }
  return mouchard;
}
