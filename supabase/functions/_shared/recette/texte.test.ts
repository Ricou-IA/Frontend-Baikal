import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rapportEnTexte } from "./texte.ts";
import { type Rapport, type ResultatControle, resumer } from "./resultat.ts";

function r(p: Partial<ResultatControle>): ResultatControle {
  return {
    id: "x", famille: "recette", niveau: 1, vue: "baikal_dossiers", titre: "X",
    statut: "conforme", bloquant: false, ...p,
  };
}

function rapport(controles: ResultatControle[]): Rapport {
  return { schema: "public", utilisateur: "baikal_reader", resume: resumer(controles), controles };
}

const ECHEC = r({
  id: "dossiers.montant_sans_paiement", titre: "Un montant payé a toujours sa date de paiement",
  statut: "echec", bloquant: true, ref: "§4 (3)", lignes: 4,
  exemples: [{ dossier_id: "d7", montant_ttc: "49.00" }],
  si_echec: "Ces clients se lisent non convertis.", correction: "Renseigner paye_le.",
});

Deno.test("l'en-tête dit le schéma, le rôle et le verdict de chaque niveau", () => {
  const texte = rapportEnTexte(rapport([r({ id: "a" }), r({ id: "b", niveau: 2 })]));
  assert(texte.includes("schéma `public`, lu sous `baikal_reader`"));
  assert(texte.includes("Niveau 1 : 1 conforme sur 1 — passé"));
  assert(texte.includes("Niveau 2 : 1 conforme sur 1 — passé"));
});

Deno.test("un échec porte son compte, ce qu'on verrait de faux, la correction et ses exemples", () => {
  const texte = rapportEnTexte(rapport([ECHEC, r({ id: "a" })]));
  assert(texte.includes("Niveau 1 : 1 conforme sur 2, 1 à corriger — à reprendre"));
  assert(texte.includes("### Un montant payé a toujours sa date de paiement"));
  assert(texte.includes("`dossiers.montant_sans_paiement` · §4 (3) · 4 ligne(s) en cause"));
  assert(texte.includes("Ce que vous verriez de faux : Ces clients se lisent non convertis."));
  assert(texte.includes("Correction : Renseigner paye_le."));
  assert(texte.includes('- {"dossier_id":"d7","montant_ttc":"49.00"}'));
});

Deno.test("un non mesuré est rangé à part, jamais avec les conformes", () => {
  const texte = rapportEnTexte(rapport([
    r({ id: "lent", titre: "Lent", statut: "non_mesure", bloquant: true, detail: "Requête trop lente." }),
  ]));
  const [avant, apres] = texte.split("## Non mesurés");
  assert(apres.includes("Lent") && apres.includes("Requête trop lente."));
  assertEquals(avant.includes("### Lent"), false);
  assertEquals(texte.includes("## Conformes"), false);
});

Deno.test("les absents optionnels se lisent en une ligne chacun, les conformes aussi", () => {
  const texte = rapportEnTexte(rapport([
    r({ id: "a", titre: "Le noyau est complet" }),
    r({ id: "forme.baikal_dossier_events", famille: "forme", vue: "baikal_dossier_events", titre: "Events : la vue est publiée", statut: "absent", niveau: 2, detail: "Vue non publiée." }),
  ]));
  assert(texte.includes("## Conformes\n\n- Le noyau est complet"));
  assert(texte.includes("## Non publiés (optionnels)\n\n- baikal_dossier_events — Vue non publiée."));
});

Deno.test("en mode échecs seuls, ni conformes ni absents optionnels", () => {
  const texte = rapportEnTexte(rapport([ECHEC, r({ id: "a", titre: "Le noyau est complet" })]), { echecsSeuls: true });
  assert(texte.includes("### Un montant payé a toujours sa date de paiement"));
  assertEquals(texte.includes("## Conformes"), false);
});
