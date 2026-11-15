// Le rapport de recette en texte (Markdown) : ce qui s'écrit dans un chat, et
// ce que le prompt d'onboarding donne à l'agent du prospect pour corriger.
// Pur. Les exemples sont déjà masqués par resultat.ts.
import type { Decompte, Rapport, ResultatControle } from "./resultat.ts";

export interface OptionsTexte {
  // Pour le prompt : seulement ce qui reste à corriger ou à mesurer.
  echecsSeuls?: boolean;
}

function verdict(niveau: number, d: Decompte, pret: boolean): string {
  const juges = d.conformes + d.bloquants;
  if (!juges) return `Niveau ${niveau} : rien de publié`;
  const aCorriger = d.bloquants - d.non_mesures;
  const reste = [
    aCorriger > 0 ? `${aCorriger} à corriger` : "",
    d.non_mesures > 0 ? `${d.non_mesures} non mesuré(s)` : "",
  ].filter(Boolean);
  return `Niveau ${niveau} : ${d.conformes} conforme${d.conformes > 1 ? "s" : ""} sur ${juges}` +
    (reste.length ? `, ${reste.join(", ")}` : "") + ` — ${pret ? "passé" : "à reprendre"}`;
}

function bloc(c: ResultatControle): string {
  const entete = [
    `\`${c.id}\``,
    c.ref ?? "",
    c.lignes !== undefined ? `${c.lignes} ligne(s) en cause` : "",
  ].filter(Boolean).join(" · ");
  const lignes = [`### ${c.titre}`, "", entete];
  if (c.detail) lignes.push("", c.detail);
  if (c.si_echec) lignes.push("", `Ce que vous verriez de faux : ${c.si_echec}`);
  if (c.correction) lignes.push("", `Correction : ${c.correction}`);
  if (c.exemples?.length) {
    lignes.push("", "Exemples :", ...c.exemples.map((e) => `- ${JSON.stringify(e)}`));
  }
  return lignes.join("\n");
}

function section(titre: string, blocs: string[], separateur = "\n\n"): string[] {
  return blocs.length ? [`## ${titre}`, blocs.join(separateur)] : [];
}

export function rapportEnTexte(rapport: Rapport, options: OptionsTexte = {}): string {
  const { controles, resume } = rapport;
  const aCorriger = (niveau: number) =>
    controles.filter((c) => c.niveau === niveau && c.bloquant && c.statut !== "non_mesure").map(bloc);
  const nonMesures = controles.filter((c) => c.statut === "non_mesure").map(bloc);
  const parties = [
    `# Recette Baikal — schéma \`${rapport.schema}\`, lu sous \`${rapport.utilisateur ?? "rôle inconnu"}\``,
    [verdict(1, resume.niveau1, resume.niveau1_pret), verdict(2, resume.niveau2, resume.niveau2_pret)].join("\n"),
    ...section("À corriger — niveau 1", aCorriger(1)),
    ...section("À corriger — niveau 2", aCorriger(2)),
    ...section("Non mesurés", nonMesures),
  ];
  if (!options.echecsSeuls) {
    parties.push(
      ...section("Conformes", controles.filter((c) => c.statut === "conforme").map((c) => `- ${c.titre}`), "\n"),
      ...section(
        "Non publiés (optionnels)",
        controles
          .filter((c) => c.statut === "absent" && !c.bloquant)
          .map((c) => `- ${c.famille === "forme" && c.vue ? c.vue : c.titre}${c.detail ? ` — ${c.detail}` : ""}`),
        "\n",
      ),
    );
  }
  return parties.join("\n\n") + "\n";
}
