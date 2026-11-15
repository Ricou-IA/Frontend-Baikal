// Les rendus en texte (Markdown) du moteur. Le rapport de recette : ce qui s'écrit dans un chat, et
// ce que le prompt d'onboarding donne à l'agent du prospect pour corriger.
// Pur. Les exemples sont déjà masqués par resultat.ts.
import type { Decompte, Rapport, ResultatControle } from "./resultat.ts";
import type { Diagnostic, Repere } from "./structure.ts";

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

// ---------------------------------------------------------------------------
// Le diagnostic de structure en texte : « Ce que Baikal voit dans votre base ».
// ---------------------------------------------------------------------------

const MAX_AILLEURS = 12;

function repere(r: Repere): string {
  return `- ${r.nature} : \`${r.schema}.${r.table}.${r.colonne}\` (${r.type})` +
    (r.valeurs ? ` — valeurs : ${r.valeurs.join(", ")}` : "");
}

export function diagnosticEnTexte(d: Diagnostic): string {
  const p = d.table_principale;
  const dePrincipale = d.reperes.filter((r) => p && r.schema === p.schema && r.table === p.nom);
  // Les autres tables : une ligne chacune, et seulement celles qui portent un
  // email, un paiement ou Stripe — sur une base de cent tables, lister chaque
  // created_at noierait la principale.
  const parTable = new Map<string, Set<string>>();
  for (const r of d.reperes.filter((r) => !dePrincipale.includes(r))) {
    const cle = `${r.schema}.${r.table}`;
    if (!parTable.has(cle)) parTable.set(cle, new Set());
    parTable.get(cle)!.add(r.nature);
  }
  const utiles = [...parTable].filter(([, natures]) => ["email", "paiement", "stripe"].some((n) => natures.has(n)));
  const autres = utiles.slice(0, MAX_AILLEURS);
  const voit = [
    `${d.compte.tables} table(s), ${d.compte.vues} vue(s), ${d.compte.colonnes} colonne(s) lues — la structure seule, aucune donnée.`,
    "",
    p
      ? `Table principale : \`${p.schema}.${p.nom}\` — celle qui porte l'acte commercial.`
      : "Aucune table ne porte un email ou une date de paiement : Baikal ne sait pas où vivent vos clients.",
    ...(dePrincipale.length ? ["", ...dePrincipale.map(repere)] : []),
    ...(autres.length
      ? [
        "",
        "Ailleurs :",
        ...autres.map(([table, natures]) => `- \`${table}\` : ${[...natures].join(", ")}`),
        ...(utiles.length > autres.length ? [`… et ${utiles.length - autres.length} autre(s) table(s).`] : []),
      ]
      : []),
    "",
    d.vues_baikal.length
      ? `Vues Baikal déjà publiées (schéma \`${d.schema_contrat}\`) : ${d.vues_baikal.map((v) => v.nom).join(", ")}.`
      : "Aucune vue Baikal publiée pour l'instant.",
  ];
  const manques = d.manques.length
    ? d.manques.map((m) => `- ${m.phrase}`)
    : ["Rien : les vues du niveau 1 sont publiées. Lancez le test."];
  const affichable = d.affichable.length
    ? d.affichable.map((a) => `- ${a.phrase}`)
    : ["Rien de sûr tant que Baikal ne sait pas où vivent vos clients."];
  return [
    "## Ce que Baikal voit dans votre base",
    voit.join("\n"),
    "## Ce qui manque pour le niveau 1",
    manques.join("\n"),
    "## Ce que la console pourrait afficher",
    affichable.join("\n"),
  ].join("\n\n") + "\n";
}
