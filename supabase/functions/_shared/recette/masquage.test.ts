import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { masquerEmail, masquerValeur } from "./masquage.ts";

Deno.test("un email garde sa première lettre et son domaine", () => {
  assertEquals(masquerEmail("jean.dupont@gmail.com"), "j***@gmail.com");
  assertEquals(masquerEmail("a@b.fr"), "a***@b.fr");
});

Deno.test("ce qui n'est pas un email passe tel quel", () => {
  assertEquals(masquerValeur("Rapport gratuit"), "Rapport gratuit");
  assertEquals(masquerValeur(42), 42);
  assertEquals(masquerValeur(null), null);
});

Deno.test("les emails sont masqués jusque dans un texte et un objet imbriqué", () => {
  assertEquals(masquerValeur("contact : marie@exemple.fr, merci"), "contact : m***@exemple.fr, merci");
  assertEquals(
    masquerValeur({ email: "paul@site.io", detail: { cc: ["x@y.com"] }, n: 3 }),
    { email: "p***@site.io", detail: { cc: ["x***@y.com"] }, n: 3 },
  );
});
