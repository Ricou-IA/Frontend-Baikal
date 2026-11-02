import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { creerMouchard, hoteReferent, installer, lireStaff, nettoyerPage } from "./evenements-v1.js";

Deno.test("nettoyerPage retire requête et fragment", () => {
  assertEquals(nettoyerPage("https://x.fr/rapport?adresse=12%20rue#haut"), "/rapport");
  assertEquals(nettoyerPage("https://x.fr"), "/");
  assertEquals(nettoyerPage("pas une url"), "/");
});

Deno.test("hoteReferent : nul si vide ou même hôte", () => {
  assertEquals(hoteReferent("https://www.google.fr/search?q=dpe", "x.fr"), "www.google.fr");
  assertEquals(hoteReferent("https://x.fr/accueil", "x.fr"), null);
  assertEquals(hoteReferent("", "x.fr"), null);
  assertEquals(hoteReferent("pas une url", "x.fr"), null);
});

function stockageFaux() {
  const s = new Map();
  return { getItem: (k) => s.get(k) ?? null, setItem: (k, v) => s.set(k, String(v)), removeItem: (k) => s.delete(k) };
}

Deno.test("lireStaff : ?staff=1 pose, persiste, ?staff=0 retire", () => {
  const stockage = stockageFaux();
  assertEquals(lireStaff("?staff=1", stockage), true);
  assertEquals(lireStaff("", stockage), true);
  assertEquals(lireStaff("?staff=0", stockage), false);
  assertEquals(lireStaff("", stockage), false);
  assertEquals(stockage.getItem("mouchard_staff"), null);
});

function faux(sup = {}) {
  const envois = [];
  const fenetre = {
    location: { href: "https://x.fr/pro/sourcing?q=1#h", hostname: "x.fr", search: "" },
    document: { title: "Sourcing", referrer: "https://www.google.fr/", cookie: "" },
    ...sup,
  };
  const options = {
    relais: "/api/evenements",
    nomCookie: "dpe_visiteur",
    fenetre,
    stockage: stockageFaux(),
    envoyer: (url, corps) => envois.push({ url, corps }),
    maintenant: () => 1000,
  };
  return { envois, fenetre, options, mouchard: creerMouchard(options) };
}

Deno.test("visiteur() crée un uuid, le garde en stockage et en cookie, le relit", () => {
  const f = faux();
  const id = f.mouchard.visiteur();
  assertMatch(id, /^[0-9a-f-]{36}$/);
  assertEquals(f.mouchard.visiteur(), id);
  assertEquals(f.options.stockage.getItem("mouchard_visiteur"), id);
  assertEquals(f.fenetre.document.cookie.startsWith(`dpe_visiteur=${id};`), true);
});

Deno.test("visiteur() relit un identifiant déjà posé dans le stockage", () => {
  const f = faux();
  f.options.stockage.setItem("mouchard_visiteur", "2d49df67-6cf3-49cb-a413-8535c655836d");
  assertEquals(creerMouchard(f.options).visiteur(), "2d49df67-6cf3-49cb-a413-8535c655836d");
});

Deno.test("visiteur() relit le cookie quand le stockage est vide", () => {
  const f = faux({ document: { title: "", referrer: "", cookie: "autre=1; dpe_visiteur=2d49df67-6cf3-49cb-a413-8535c655836d" } });
  assertEquals(f.mouchard.visiteur(), "2d49df67-6cf3-49cb-a413-8535c655836d");
});

Deno.test("geste() met en file une ligne complète, page nettoyée, sans email possible", () => {
  const f = faux();
  f.mouchard.geste("clic", "Payer", { cible: "/tarifs", email: "a@b.fr", objet: { a: 1 }, n: 2 }, null);
  assertEquals(f.mouchard.file.length, 1);
  const l = f.mouchard.file[0];
  assertEquals(l.visiteur_id, f.mouchard.visiteur());
  assertEquals([l.geste, l.libelle, l.page, l.detail, l.dossier_id, l.referent, l.est_test],
    ["clic", "Payer", "/pro/sourcing", { cible: "/tarifs", n: 2 }, null, null, false]);
});

Deno.test("geste() garde 20 clés de detail au plus et porte le dossier", () => {
  const f = faux();
  const trente = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
  f.mouchard.geste("resultat_ouvert", "Fiche", trente, "D1");
  assertEquals(Object.keys(f.mouchard.file[0].detail).length, 20);
  assertEquals(f.mouchard.file[0].dossier_id, "D1");
});

Deno.test("pageVue() porte le titre et le referent, seulement lui", () => {
  const f = faux();
  f.mouchard.pageVue();
  f.mouchard.geste("clic", "x", {}, null);
  assertEquals([f.mouchard.file[0].geste, f.mouchard.file[0].libelle, f.mouchard.file[0].referent], ["page_vue", "Sourcing", "www.google.fr"]);
  assertEquals(f.mouchard.file[1].referent, null);
});

Deno.test("vider() envoie un seul lot JSON {lignes} au relais et vide la file", () => {
  const f = faux();
  f.mouchard.pageVue();
  f.mouchard.geste("clic", "x", {}, null);
  f.mouchard.vider();
  assertEquals(f.envois.length, 1);
  assertEquals(f.envois[0].url, "/api/evenements");
  assertEquals(JSON.parse(f.envois[0].corps).lignes.length, 2);
  assertEquals(f.mouchard.file.length, 0);
});

Deno.test("vider() sur file vide n'envoie rien", () => {
  const f = faux();
  f.mouchard.vider();
  assertEquals(f.envois.length, 0);
});

Deno.test("la 20e ligne déclenche l'envoi", () => {
  const f = faux();
  for (let i = 0; i < 19; i++) f.mouchard.geste("clic", `c${i}`, {}, null);
  assertEquals(f.envois.length, 0);
  f.mouchard.geste("clic", "c19", {}, null);
  assertEquals([f.envois.length, f.mouchard.file.length], [1, 0]);
  assertEquals(JSON.parse(f.envois[0].corps).lignes.length, 20);
});

Deno.test("en mode staff chaque ligne porte est_test true", () => {
  const f = faux({ location: { href: "https://x.fr/?staff=1", hostname: "x.fr", search: "?staff=1" }, document: { title: "", referrer: "", cookie: "" } });
  f.mouchard.geste("clic", "x", {}, null);
  assertEquals(f.mouchard.file[0].est_test, true);
});

Deno.test("installer() émet une page vue, puis une autre à chaque pushState vers un autre chemin", () => {
  const ecouteurs = {};
  const f = faux({
    history: { pushState() {}, replaceState() {} },
    document: { title: "Accueil", referrer: "", cookie: "", addEventListener: (n, fn) => { ecouteurs[n] = fn; }, visibilityState: "visible" },
    addEventListener: (n, fn) => { ecouteurs[n] = fn; },
    setInterval: () => 0,
  });
  const m = installer(f.options);
  assertEquals(m.file.length, 1);
  assertEquals(m.file[0].geste, "page_vue");
  f.fenetre.location.href = "https://x.fr/pro/sourcing/bien/1";
  f.fenetre.history.pushState({}, "", "/pro/sourcing/bien/1");
  assertEquals(m.file.length, 2);
  assertEquals(m.file[1].page, "/pro/sourcing/bien/1");
  f.fenetre.history.replaceState({}, "", "/pro/sourcing/bien/1");
  assertEquals(m.file.length, 2);
  f.fenetre.document.visibilityState = "hidden";
  ecouteurs["visibilitychange"]();
  assertEquals([f.envois.length, m.file.length], [1, 0]);
});

// ------ ne jamais casser la page ------

Deno.test("sans window, installer() et creerMouchard() rendent un mouchard inerte sans lever", () => {
  const m = installer({ relais: "/api/evenements", nomCookie: "x_visiteur" });
  m.geste("clic", "x", {}, null);
  m.pageVue();
  m.vider();
  assertEquals([m.visiteur(), m.file.length], [null, 0]);
  assertEquals(creerMouchard({ relais: "/api/evenements", nomCookie: "x_visiteur" }).visiteur(), null);
});

Deno.test("un stockage qui lève n'empêche ni visiteur() ni geste()", () => {
  const f = faux();
  f.options.stockage = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); }, removeItem() { throw new Error("SecurityError"); } };
  const m = creerMouchard(f.options);
  assertMatch(m.visiteur(), /^[0-9a-f-]{36}$/);
  m.geste("clic", "x", {}, null);
  assertEquals(m.file.length, 1);
});

Deno.test("une fenêtre dont localStorage lève à l'accès donne un mouchard qui marche", () => {
  const f = faux();
  delete f.options.stockage;
  Object.defineProperty(f.fenetre, "localStorage", { get() { throw new Error("SecurityError"); } });
  const m = creerMouchard(f.options);
  assertMatch(m.visiteur(), /^[0-9a-f-]{36}$/);
});

Deno.test("sans crypto.randomUUID, un identifiant valide est quand même produit", () => {
  const f = faux({ crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37) & 255; return a; } } });
  const id = creerMouchard(f.options).visiteur();
  // Les octets i*37 & 255, avec la version 4 et la variante posées.
  assertEquals(id, "00254a6f-94b9-4e03-a84d-7297bce1062b");
});

Deno.test("installer() deux fois sur la même fenêtre rend le même mouchard, une seule page vue", () => {
  const f = faux({ history: { pushState() {}, replaceState() {} }, addEventListener() {}, setInterval: () => 0,
    document: { title: "A", referrer: "", cookie: "", addEventListener() {}, visibilityState: "visible" } });
  const a = installer(f.options);
  const b = installer(f.options);
  assertEquals(a === b, true);
  assertEquals(a.file.length, 1);
});

Deno.test("option titre: false, la page vue part sans libellé", () => {
  const f = faux();
  creerMouchard({ ...f.options, titre: false }).pageVue();
  const m = creerMouchard({ ...f.options, titre: false });
  m.pageVue();
  assertEquals(m.file[0].libelle, null);
});
