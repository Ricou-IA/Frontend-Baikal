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

/**
 * Le mouchard, sans rien brancher sur la page : `installer` s'en charge.
 * Tout est injectable pour le test ; en production seuls `relais` et
 * `nomCookie` se donnent.
 */
export function creerMouchard(options) {
  const fenetre = options.fenetre ?? globalThis.window;
  const stockage = options.stockage ?? fenetre.localStorage;
  const envoyer = options.envoyer ?? envoyerParDefaut(fenetre);
  const file = [];

  function visiteur() {
    let id = null;
    try { id = stockage.getItem(CLE_VISITEUR); } catch { /* stockage bloqué */ }
    if (!UUID.test(id ?? "")) id = lireCookie(fenetre.document.cookie, options.nomCookie);
    if (!UUID.test(id ?? "")) id = globalThis.crypto.randomUUID();
    try { stockage.setItem(CLE_VISITEUR, id); } catch { /* stockage bloqué */ }
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
      est_test: lireStaff(fenetre.location.search, stockage),
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
      pousser(ligneDe("page_vue", fenetre.document.title, {}, null, referent));
    } catch { /* jamais bloquant */ }
  }

  return { visiteur, geste, pageVue, vider, file };
}

/** Crée le mouchard et le branche sur la page. */
export function installer(options) {
  const fenetre = options.fenetre ?? globalThis.window;
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
