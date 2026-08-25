import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type LigneMapping, resoudreSite } from "./finance-mapping.ts";
import type { SessionStripe } from "./stripe.ts";

const mapping: LigneMapping[] = [
  { cle_type: "product", cle: "prod_U3Ld", app_id: "pack-vendeur", offre: "pre-etat-date" },
  { cle_type: "price", cle: "price_solo", app_id: "pack-vendeur", offre: "pack-unitaire" },
  { cle_type: "libelle", cle: "Autorisation de voirie", app_id: "voirie", offre: "permis" },
];

function session(partiel: Partial<SessionStripe>): SessionStripe {
  return { payment_intent: "pi_x", metadata: {}, produits: [], ...partiel };
}

Deno.test("metadata application prime sur le mapping", () => {
  const r = resoudreSite(
    session({ metadata: { application: "dpe", cle: "pack_pro" } }),
    mapping,
  );
  assertEquals(r, { app_id: "dpe", offre: "pack_pro" });
});

Deno.test("a defaut, le product identifie le site", () => {
  const r = resoudreSite(
    session({ produits: [{ product: "prod_U3Ld", price: "price_inconnu", libelle: "" }] }),
    mapping,
  );
  assertEquals(r, { app_id: "pack-vendeur", offre: "pre-etat-date" });
});

Deno.test("puis le price, quand le product est absent du mapping", () => {
  const r = resoudreSite(
    session({ produits: [{ product: "prod_zzz", price: "price_solo", libelle: "" }] }),
    mapping,
  );
  assertEquals(r, { app_id: "pack-vendeur", offre: "pack-unitaire" });
});

Deno.test("prix inline : le libelle identifie le site", () => {
  const r = resoudreSite(
    session({ produits: [{ product: null, price: null, libelle: "Autorisation de voirie" }] }),
    mapping,
  );
  assertEquals(r, { app_id: "voirie", offre: "permis" });
});

Deno.test("rien ne correspond : inconnu, jamais un site au hasard", () => {
  const r = resoudreSite(
    session({ produits: [{ product: "prod_zzz", price: null, libelle: "Autre chose" }] }),
    mapping,
  );
  assertEquals(r, { app_id: "inconnu", offre: "inconnu" });
});

Deno.test("aucune ligne de commande : inconnu, sans lever", () => {
  assertEquals(resoudreSite(session({}), mapping), { app_id: "inconnu", offre: "inconnu" });
});

Deno.test("metadata application sans cle : l'offre reste a determiner", () => {
  const r = resoudreSite(session({ metadata: { application: "voirie" } }), mapping);
  assertEquals(r, { app_id: "voirie", offre: "inconnu" });
});
