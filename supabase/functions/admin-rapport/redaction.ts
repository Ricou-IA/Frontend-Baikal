// Redaction assistee des deux textes libres du rapport. Le modele ne voit
// que les commits (evolutions) ou l'ebauche d'Eric et les highlights
// (commentaire) ; il ne touche jamais a la trame calculee. Ses sorties sont
// des PROPOSITIONS : c'est le champ relu par Eric qui est archive.

import type { Commit } from "./github.ts";

const MODELE = "gpt-4o-mini";

async function completer(systeme: string, utilisateur: string): Promise<string> {
  const cle = Deno.env.get("OPENAI_API_KEY");
  if (!cle) throw new Error("OPENAI_API_KEY absent");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELE,
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: "system", content: systeme },
        { role: "user", content: utilisateur },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

export async function redigerEvolutions(commits: Commit[], libelleMois: string): Promise<string> {
  if (commits.length === 0) return "";
  const systeme = [
    "Tu rédiges, en français, la rubrique « Évolutions du logiciel » d'un rapport mensuel",
    "adressé au partenaire SEO du site pre-etat-date.ai. Le lecteur n'est pas technique.",
    "À partir de la liste des commits du mois, écris 5 à 8 puces, une phrase chacune,",
    "verbe à l'indicatif, sans jargon technique (jamais « refactor », « cron », « RLS »,",
    "« migration », « endpoint », « MCP »). Regroupe par thème dans cet ordre quand il",
    "s'applique : SEO et contenu, tunnel de vente et paiement, prospection et emailing,",
    "administration et fiabilité. Fusionne ou omets les commits purement techniques.",
    "N'invente rien : chaque puce doit correspondre à au moins un commit fourni.",
    "Format : une puce par ligne, commençant par « - ». Aucun titre, aucune conclusion.",
    "Orthographe française complète, avec tous les accents.",
  ].join(" ");
  const utilisateur = `Mois : ${libelleMois}\nCommits :\n${commits.map((c) => `${c.date} ${c.sujet}`).join("\n")}`;
  return await completer(systeme, utilisateur);
}

export async function redigerCommentaire(
  ebauche: string,
  highlights: string[],
  libelleMois: string,
): Promise<string> {
  const systeme = [
    "Tu mets en forme, en français, le « Commentaire du mois » d'un rapport mensuel adressé",
    "à IA MEDIA, partenaire SEO du site pre-etat-date.ai, au nom de l'éditeur du site.",
    "Tu pars de l'ébauche de l'auteur et tu la rédiges en 1 à 3 paragraphes courts,",
    "ton professionnel et direct, vouvoiement. Tu peux t'appuyer sur les faits fournis",
    "pour préciser, mais tu n'ajoutes AUCUN chiffre qui ne figure ni dans l'ébauche ni",
    "dans les faits, et tu n'inventes aucune intention ou décision absente de l'ébauche.",
    "Pas de titre, pas de formule de politesse finale, pas de puces.",
    "Orthographe française complète, avec tous les accents.",
  ].join(" ");
  const utilisateur = `Mois : ${libelleMois}\nFaits du mois :\n${highlights.map((h) => `- ${h}`).join("\n")}\n\nÉbauche de l'auteur :\n${ebauche}`;
  return await completer(systeme, utilisateur);
}
