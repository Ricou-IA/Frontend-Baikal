// Le moteur de recette sur un VRAI Postgres : le SQL des manifestes et des
// requêtes de catalogue est exécuté, sous le rôle baikal_reader, sur le site
// d'essai (essai/site-conforme.sql) puis sur le même site avec ses pannes
// (essai/pannes.sql). Ignoré sans base :
//
//   $env:RECETTE_PG_DSN = "postgres://postgres@127.0.0.1:54329/postgres"
//   deno test --allow-net --allow-env --allow-read supabase/functions/_shared/recette/recette.pg.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jouer, SCHEMA } from "./essai/jouer.ts";
import type { Rapport, ResultatControle } from "./resultat.ts";

const dsn = Deno.env.get("RECETTE_PG_DSN");
const rapports = dsn ? await jouer(dsn) : null;

function essai(nom: string, corps: (r: { conforme: Rapport; pannes: Rapport }) => void) {
  Deno.test({ name: `pg : ${nom}`, ignore: !rapports, fn: () => corps(rapports!) });
}

function un(rapport: Rapport, id: string): ResultatControle {
  const trouve = rapport.controles.find((c) => c.id === id);
  assert(trouve, `contrôle ${id} absent du rapport`);
  return trouve;
}

const bloquants = (r: Rapport) =>
  r.controles.filter((c) => c.bloquant).map((c) => `${c.id} (${c.statut}) ${c.detail ?? ""}`);

essai("le site conforme passe les deux niveaux, sans un contrôle non mesuré", ({ conforme }) => {
  assertEquals(bloquants(conforme), []);
  assertEquals(conforme.resume.niveau1_pret, true);
  assertEquals(conforme.resume.niveau2_pret, true);
  assertEquals(conforme.utilisateur, "baikal_reader");
  assertEquals(conforme.controles.filter((c) => c.statut === "non_mesure").length, 0);
});

essai("le site conforme : chaque vue publiée est lue, avec ses lignes", ({ conforme }) => {
  assertEquals(un(conforme, "lecture.baikal_dossiers").detail, "14 ligne(s) lue(s) sous baikal_reader.");
  assertEquals(un(conforme, "forme.baikal_dossier_events").statut, "conforme");
  assertEquals(un(conforme, "jointure.baikal_dossier_emails").statut, "conforme");
  assertEquals(un(conforme, "forme.baikal_dossier_documents").statut, "absent");
});

essai("panne 1 : la table sans policy est nommée, pour chaque vue qui la lit", ({ pannes }) => {
  for (const vue of ["baikal_dossiers", "baikal_dossier_emails"]) {
    const acces = un(pannes, `acces.${vue}`);
    assertEquals(acces.statut, "echec");
    assertEquals(acces.exemples, [{ source: `${SCHEMA}.email_logs`, grant_ok: true, policy_ok: false }]);
  }
  // La vue qui ne lit pas email_logs reste conforme.
  assertEquals(un(pannes, "acces.baikal_dossier_events").statut, "conforme");
  // Le symptôme muet : la vue répond, avec zéro ligne.
  assertEquals(un(pannes, "lecture.baikal_dossier_emails").detail, "0 ligne(s) lue(s) sous baikal_reader.");
});

essai("panne 1 bis : les mesures héritent de la table sans policy par baikal_dossiers", ({ pannes }) => {
  const acces = un(pannes, "acces.baikal_mesures");
  assertEquals(acces.statut, "echec");
  assertEquals(acces.exemples, [{ source: `${SCHEMA}.email_logs`, grant_ok: true, policy_ok: false }]);
});

essai("panne 2 : le stock sans ses zéros", ({ pannes }) => {
  const stock = un(pannes, "mesures.stock_continu");
  assertEquals([stock.statut, stock.lignes], ["echec", 1]);
  assertEquals(stock.exemples?.[0].cle, "dossiers_payes_distincts");
});

essai("panne 3 : attribution {}", ({ pannes }) => {
  const attribution = un(pannes, "dossiers.attribution_jamais_vide");
  assertEquals([attribution.statut, attribution.lignes], ["echec", 2]);
});

essai("panne 4 : la catégorie change, l'email sort masqué", ({ pannes }) => {
  const categorie = un(pannes, "dossiers.categorie_stable");
  assertEquals([categorie.statut, categorie.lignes], ["echec", 1]);
  assertEquals(categorie.exemples, [{ email: "c***@exemple.fr", categories: 2 }]);
});

essai("panne 5 : le statut hors funnel", ({ pannes }) => {
  const funnel = un(pannes, "dossiers.statut_funnel");
  assertEquals([funnel.statut, funnel.lignes], ["echec", 1]);
  assertEquals(funnel.exemples, [{ statut: "archive", lignes: 1 }]);
});

essai("panne 6 : le montant sans paye_le", ({ pannes }) => {
  const montant = un(pannes, "dossiers.montant_sans_paiement");
  assertEquals([montant.statut, montant.lignes], ["echec", 1]);
});

essai("les pannes ne font tomber aucun autre contrôle", ({ pannes }) => {
  assertEquals(
    pannes.controles.filter((c) => c.bloquant).map((c) => c.id).sort(),
    [
      "acces.baikal_dossier_emails",
      "acces.baikal_dossiers",
      "acces.baikal_mesures",
      "dossiers.attribution_jamais_vide",
      "dossiers.categorie_stable",
      "dossiers.montant_sans_paiement",
      "dossiers.statut_funnel",
      "mesures.stock_continu",
    ],
  );
});
