import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { colonneNom, normaliserCriteres } from "./segment.ts";
import { envelopper, remplacerVariables, signerJeton, verifierJeton, versTexte } from "./rendu.ts";
import {
  debutJourLocal, evaluerDisjoncteur, lireTag, signerSvix, tailleLot, typeEvenement, verifierSvix,
} from "./envoi.ts";

Deno.test("criteres : refus et desinscrit ne sont jamais demandables", () => {
  const c = normaliserCriteres({ statuts: ["nouveau", "refus", "desinscrit"] });
  assertEquals(c.statuts, ["nouveau"]);
});

Deno.test("criteres : defauts prudents", () => {
  const c = normaliserCriteres({});
  assertEquals(c.exclureClients, true);
  assertEquals(c.actifs, true);
  assertEquals(c.paye, "tous");
  assertEquals(c.exclureDejaEcrits, false);
});

Deno.test("criteres : departement valide ou vide", () => {
  assertEquals(normaliserCriteres({ departement: "31" }).departement, "31");
  assertEquals(normaliserCriteres({ departement: "2a" }).departement, "2A");
  assertEquals(normaliserCriteres({ departement: "3" }).departement, "");
  assertEquals(normaliserCriteres({ departement: "31; drop" }).departement, "");
});

Deno.test("nom : selon les colonnes presentes", () => {
  assertEquals(colonneNom("prospects", new Set(["nom_affiche"])), "v.nom_affiche");
  assertEquals(colonneNom("comptes", new Set(["raison_sociale", "contact_nom"])),
    "coalesce(v.contact_nom, v.raison_sociale)");
  assertEquals(colonneNom("clients", new Set(["email"])), null);
});

Deno.test("variables : valeur, repli, echappement, inconnue intacte", () => {
  const v = { nom: "Dupont <b>", commune: "" };
  assertEquals(remplacerVariables("Bonjour {{nom}}", v), "Bonjour Dupont &lt;b&gt;");
  assertEquals(remplacerVariables("A {{ commune | votre ville }}", v), "A votre ville");
  assertEquals(remplacerVariables("{{inconnue}}", v), "{{inconnue}}");
  assertEquals(remplacerVariables("Objet {{nom}}", v, false), "Objet Dupont <b>");
});

Deno.test("enveloppe : pied et desinscription, document complet respecte", () => {
  const e = { nomSite: "MonsieurDPE", domaine: "monsieurdpe.fr", lienDesinscription: "https://x/d?t=1" };
  const frag = envelopper({ ...e, corpsHtml: "<p>Salut</p>" });
  assertStringIncludes(frag, "<p>Salut</p>");
  assertStringIncludes(frag, "Se désinscrire");
  const doc = envelopper({ ...e, corpsHtml: "<html><body><p>A</p></body></html>" });
  assert(doc.indexOf("Se désinscrire") < doc.indexOf("</body>"));
});

Deno.test("texte : liens explicites, balises retirees", () => {
  assertEquals(versTexte('<p>Voir <a href="https://a.fr">le site</a></p><p>Fin</p>'),
    "Voir le site (https://a.fr)\nFin");
});

Deno.test("jeton : aller-retour, falsification refusee", async () => {
  const j = await signerJeton("secret", "monsieurdpe", " Jean@Ex.fr ");
  assertEquals(await verifierJeton("secret", j), { appId: "monsieurdpe", email: "jean@ex.fr" });
  assertEquals(await verifierJeton("autre", j), null);
  const [, sig] = j.split(".");
  const faux = btoa(JSON.stringify({ s: "monsieurdpe", e: "x@y.fr" })).replace(/=+$/, "");
  assertEquals(await verifierJeton("secret", `${faux}.${sig}`), null);
});

Deno.test("lot : plafond du jour", () => {
  assertEquals(tailleLot(null, 0), 50);
  assertEquals(tailleLot(200, 180), 20);
  assertEquals(tailleLot(200, 250), 0);
  assertEquals(tailleLot(20, 0), 20);
});

Deno.test("coupe-circuit : echantillon minimal puis seuils", () => {
  assertEquals(evaluerDisjoncteur({ envoyes: 40, rebondsDurs: 10, plaintes: 2 }).coupe, false);
  assertEquals(evaluerDisjoncteur({ envoyes: 100, rebondsDurs: 5, plaintes: 0 }).coupe, false);
  assertEquals(evaluerDisjoncteur({ envoyes: 100, rebondsDurs: 6, plaintes: 0 }).coupe, true);
  assertEquals(evaluerDisjoncteur({ envoyes: 1000, rebondsDurs: 0, plaintes: 4 }).coupe, true);
});

Deno.test("minuit local Europe/Paris, ete et hiver", () => {
  assertEquals(debutJourLocal("Europe/Paris", new Date("2026-10-13T10:00:00Z")).toISOString(),
    "2026-10-12T22:00:00.000Z");
  assertEquals(debutJourLocal("Europe/Paris", new Date("2026-12-01T23:30:00Z")).toISOString(),
    "2026-12-01T23:00:00.000Z");
});

Deno.test("svix : signature valide, alteree, perimee", async () => {
  const secret = "whsec_" + btoa("cle-de-test-0123456789");
  const t = String(Math.floor(Date.now() / 1000));
  const corps = '{"type":"email.delivered"}';
  const sig = await signerSvix(secret, "msg_1", t, corps);
  const e = { id: "msg_1", horodatage: t, signature: `v1,${sig}` };
  assert(await verifierSvix(secret, e, corps));
  assert(!(await verifierSvix(secret, e, corps + " ")));
  assert(!(await verifierSvix(secret, e, corps, Date.now() + 600_000)));
});

Deno.test("evenements et tags", () => {
  assertEquals(typeEvenement("email.bounced"), "bounced");
  assertEquals(typeEvenement("email.sent"), null);
  assertEquals(lireTag({ app_id: "monsieurdpe" }, "app_id"), "monsieurdpe");
  assertEquals(lireTag([{ name: "app_id", value: "voirie" }], "app_id"), "voirie");
  assertEquals(lireTag(null, "app_id"), null);
});

import { nettoyerCorps, styliserBoutons } from "./rendu.ts";

Deno.test("nettoyage : liste blanche, attributs retires, liens surs seulement", () => {
  assertEquals(nettoyerCorps('<p style="x" onclick="y">A</p><script>alert(1)</script>'), "<p>A</p>");
  assertEquals(nettoyerCorps('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
  assertEquals(nettoyerCorps('<a href="https://a.fr" data-bouton class="z">Go</a>'), '<a href="https://a.fr" data-bouton>Go</a>');
  assertEquals(nettoyerCorps('<div><img src="x"><b>ok</b></div>'), "<b>ok</b>");
});

Deno.test("bouton : un lien data-bouton devient un bouton style", () => {
  assertStringIncludes(styliserBoutons('<a href="https://a.fr" data-bouton>Go</a>'), "display:inline-block");
});

Deno.test("bouton seul dans son paragraphe : cellule de tableau, pas de <p> autour", () => {
  const h = styliserBoutons('<p>Avant</p><p><a href="https://a.fr/presse" data-bouton>Voir</a></p><p>Apres</p>');
  assertStringIncludes(h, '<td bgcolor="#111827"');
  assertStringIncludes(h, 'padding:12px 22px"><a href="https://a.fr/presse"');
  assertEquals(h.includes("<p><table"), false);
  assertEquals(h.includes("data-bouton"), false);
  assertEquals(h.startsWith("<p>Avant</p><table"), true);
  assertEquals(h.endsWith("</table><p>Apres</p>"), true);
});

import { normaliserRelances, ordreDeService } from "./segment.ts";

Deno.test("relances : delais bornes, cinq au plus", () => {
  const r = normaliserRelances([{ delai_jours: -2 }, { delai_jours: 400 }, { delai_jours: "4" }, {}, {}, {}, {}]);
  assertEquals(r.length, 5);
  assertEquals(r.map((x) => x.delai_jours), [0, 90, 4, 3, 3]);
});

Deno.test("ordre de service : relances d'abord, de la derniere au mail 1", () => {
  const o = ordreDeService({ objet: "A", corps_html: "a", relances: [{ delai_jours: 3, objet: "B" }, { delai_jours: 5, objet: "C" }] });
  assertEquals(o.map((m) => [m.rang, m.delaiJours, m.objet]), [[3, 5, "C"], [2, 3, "B"], [1, 0, "A"]]);
  assertEquals(ordreDeService({ objet: "A", corps_html: "a" }).length, 1);
});

import { estJourOuvre } from "./envoi.ts";

Deno.test("jours ouvres dans le fuseau du site", () => {
  assertEquals(estJourOuvre("Europe/Paris", new Date("2026-10-17T10:00:00Z")), false); // samedi
  assertEquals(estJourOuvre("Europe/Paris", new Date("2026-10-18T23:30:00Z")), true);  // lundi 01h30 a Paris
  assertEquals(estJourOuvre("Europe/Paris", new Date("2026-10-16T22:30:00Z")), false); // samedi 00h30 a Paris
});
