import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blocsPresents, normaliserCriteres, triEffectif } from "./filtres.ts";

Deno.test("body vide -> valeurs par defaut", () => {
  assertEquals(normaliserCriteres({}), {
    recherche: "",
    exclureTests: true,
    inclureSupprimes: false,
    actifsSeuls: false,
    tri: "raison_sociale",
    ordre: "desc",
    page: 1,
    parPage: 25,
  });
});

Deno.test("tri hors vocabulaire -> raison sociale", () => {
  assertEquals(normaliserCriteres({ tri: "credits_stock" }).tri, "credits_stock");
  assertEquals(normaliserCriteres({ tri: "; drop table" }).tri, "raison_sociale");
});

Deno.test("parPage borne entre 5 et 100", () => {
  assertEquals(normaliserCriteres({ parPage: 1 }).parPage, 5);
  assertEquals(normaliserCriteres({ parPage: 500 }).parPage, 100);
  // Une chaine numerique passe, comme dans admin-dossiers : la valeur vient
  // d'un JSON, la coercition est voulue et bornee juste apres.
  assertEquals(normaliserCriteres({ parPage: "50" }).parPage, 50);
  assertEquals(normaliserCriteres({ parPage: "beaucoup" }).parPage, 25);
});

Deno.test("triEffectif : un tri sur une colonne absente retombe sur la raison sociale", () => {
  const sansCredits = new Set(["compte_id", "raison_sociale", "cree_le"]);
  assertEquals(triEffectif("credits_stock", sansCredits), "raison_sociale");
  assertEquals(triEffectif("cree_le", sansCredits), "cree_le");
});

Deno.test("blocs : declares par leur colonne pivot, pas par leur completude", () => {
  // Le cas MonsieurDPE : abonnement sans abo_montant_mensuel, qui n'existe
  // nulle part cote site puisque le catalogue de prix vit chez Stripe.
  const dpe = new Set([
    "compte_id", "raison_sociale", "email", "cree_le", "actif", "est_test", "supprime_le",
    "ca_ttc", "devise", "abo_statut", "abo_plan", "abo_prochaine_echeance", "abo_resilie_le",
    "categorie", "contact_nom", "telephone", "derniere_activite_le",
  ]);
  assertEquals(blocsPresents(dpe), {
    credits: false,
    argent: true,
    abonnement: true,
    categorie: true,
    activite: true,
    contact: true,
  });

  const noyauSeul = new Set(["compte_id", "raison_sociale", "actif", "est_test"]);
  assertEquals(blocsPresents(noyauSeul), {
    credits: false,
    argent: false,
    abonnement: false,
    categorie: false,
    activite: false,
    contact: false,
  });
});
