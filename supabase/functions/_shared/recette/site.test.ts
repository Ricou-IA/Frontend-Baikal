// L'adresse du site tapée par le prospect : ce qui entre dans le prompt.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lireSite } from "./site.ts";

Deno.test("le site se tape comme on le dit : avec ou sans https, avec ou sans www, avec ou sans chemin", () => {
  for (const saisie of ["monsaas.fr", " MonSaaS.fr ", "https://monsaas.fr", "http://monsaas.fr/", "https://monsaas.fr/tarifs?x=1#haut"]) {
    assertEquals(lireSite(saisie), { ok: true, url: "https://monsaas.fr", domaine: "monsaas.fr" }, saisie);
  }
  assertEquals(lireSite("www.monsaas.fr"), { ok: true, url: "https://www.monsaas.fr", domaine: "monsaas.fr" });
  assertEquals(lireSite("app.pre-etat-date.ai"), { ok: true, url: "https://app.pre-etat-date.ai", domaine: "app.pre-etat-date.ai" });
});

Deno.test("ce qui n'est pas un site public est refusé, en clair", () => {
  for (const saisie of ["", "   ", "monsaas", "localhost", "localhost:5173", "127.0.0.1", "http://192.168.1.10", "mon site.fr", "ftp://monsaas.fr", "app.local", "intranet.internal", "postgresql://u:p@db.exemple.com/app"]) {
    const r = lireSite(saisie);
    assertEquals(r.ok, false, saisie);
    if (!r.ok) assert(r.erreur.includes("monsaas.fr"), saisie);
  }
});
