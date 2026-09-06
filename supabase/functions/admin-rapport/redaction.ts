// Redaction assistee des textes libres du rapport. Le modele ne voit que les
// commits (evolutions), l'ebauche d'Eric et les highlights (commentaire), ou
// les chiffres calcules de la lecture SEO ; il ne touche jamais a la trame
// calculee. Ses sorties sont des PROPOSITIONS : c'est le champ relu par Eric
// qui est archive.

import type { Commit } from "./github.ts";
import type { LectureSeo } from "./lecture-seo.ts";

const MODELE = "gpt-4o-mini";

async function completer(systeme: string, utilisateur: string, maxTokens = 900): Promise<string> {
  const cle = Deno.env.get("OPENAI_API_KEY");
  if (!cle) throw new Error("OPENAI_API_KEY absent");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELE,
      temperature: 0.3,
      max_tokens: maxTokens,
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

export async function redigerEvolutions(commits: Commit[], libellePeriode: string): Promise<string> {
  if (commits.length === 0) return "";
  const systeme = [
    "Tu rédiges, en français, la rubrique « Évolutions du logiciel » d'un rapport",
    "adressé au partenaire SEO du site pre-etat-date.ai. Le lecteur n'est pas technique.",
    "À partir de la liste des commits de la période, écris 5 à 8 puces, une phrase chacune,",
    "verbe à l'indicatif, sans jargon technique (jamais « refactor », « cron », « RLS »,",
    "« migration », « endpoint », « MCP »). Regroupe par thème dans cet ordre quand il",
    "s'applique : SEO et contenu, tunnel de vente et paiement, prospection et emailing,",
    "administration et fiabilité. Fusionne ou omets les commits purement techniques.",
    "N'invente rien : chaque puce doit correspondre à au moins un commit fourni.",
    "Format : une puce par ligne, commençant par « - ». Aucun titre, aucune conclusion.",
    "Orthographe française complète, avec tous les accents.",
  ].join(" ");
  const utilisateur = `Période : ${libellePeriode}\nCommits :\n${commits.map((c) => `${c.date} ${c.sujet}`).join("\n")}`;
  return await completer(systeme, utilisateur);
}

export async function redigerCommentaire(
  ebauche: string,
  highlights: string[],
  libellePeriode: string,
): Promise<string> {
  const systeme = [
    "Tu mets en forme, en français, le « Commentaire » d'un rapport adressé",
    "à IA MEDIA, partenaire SEO du site pre-etat-date.ai, au nom de l'éditeur du site.",
    "Tu pars de l'ébauche de l'auteur et tu la rédiges en 1 à 3 paragraphes courts,",
    "ton professionnel et direct, vouvoiement. Tu peux t'appuyer sur les faits fournis",
    "pour préciser, mais tu n'ajoutes AUCUN chiffre qui ne figure ni dans l'ébauche ni",
    "dans les faits, et tu n'inventes aucune intention ou décision absente de l'ébauche.",
    "Pas de titre, pas de formule de politesse finale, pas de puces.",
    "Orthographe française complète, avec tous les accents.",
  ].join(" ");
  const utilisateur = `Période : ${libellePeriode}\nFaits de la période :\n${highlights.map((h) => `- ${h}`).join("\n")}\n\nÉbauche de l'auteur :\n${ebauche}`;
  return await completer(systeme, utilisateur);
}

// Les pieges de la grille, donnes au modele comme garde-fous. Ils viennent de
// vrais faux positifs vecus sur ce site.
const PIEGES = [
  "Comparer en jours ouvrés ou en semaines pleines : une fenêtre avec un week-end ou un férié de plus fausse tout.",
  "Août est un trou de demande, pas un signal de site : deux moteurs qui baissent ensemble à position égale = saisonnalité.",
  "Les requêtes entre guillemets sont du bruit (déjà exclues des chiffres fournis).",
  "La position moyenne d'une page n'est pas sa position sur son cluster : lire en requête × page.",
  "L'export par requêtes cache environ la moitié des clics (requêtes anonymisées) : un « 0 clic » en requête × page ne vaut que pour les requêtes nommées.",
  "Deux comptes de ventes légitimes, par date de paiement et par date de création : toujours dire lequel on lit.",
  "Une position qui se dégrade à impressions croissantes est souvent une page qui sort sur de nouvelles requêtes lointaines, pas une page qui perd ses acquis.",
  "Jamais de position moyenne globale ni de total d'impressions brut : ces deux chiffres mentent sur ce site.",
];

function fmtCluster(l: { cluster: string; requetes: number; clics: number; impressions: number; position: number | null }) {
  return `${l.cluster} : ${l.requetes} requêtes, ${l.clics} clics, ${l.impressions} impressions, position pondérée ${l.position ?? "n/a"}`;
}

export async function redigerLectureSeo(
  lecture: LectureSeo,
  highlights: string[],
  libellePeriode: string,
): Promise<string> {
  const systeme = [
    "Tu rédiges, en français, la « Lecture SEO » d'un rapport adressé à IA MEDIA, partenaire SEO",
    "du site pre-etat-date.ai, au nom de l'éditeur du site. Tu ne disposes QUE des chiffres fournis :",
    "tu n'en inventes aucun, tu n'en arrondis aucun autrement qu'ils sont donnés, et tu ne cites",
    "jamais une position moyenne globale ni un total d'impressions brut.",
    "Structure imposée, quatre parties avec ces titres exacts sur leur propre ligne :",
    "« ## Bilan des chantiers » (un verdict par chantier : gagné / en progrès / raté / sans objet, avec le",
    "chiffre qui le prouve ; si un chantier a déjà un verdict posé, reprends-le sans le contredire ;",
    "s'il n'en a pas et que les chiffres ne permettent pas de conclure, écris « trop tôt pour conclure » ;",
    "regroupe les commits qui relèvent d'un même chantier, ignore ceux sans effet SEO mesurable),",
    "puis, dans les lectures, un mot sur l'autorité (domaines référents contre le concurrent le mieux placé)",
    "et sur la part mobile si elle bouge,",
    "« ## Lectures à ne pas rater » (deux ou trois effets de composition ou de saisonnalité visibles dans",
    "les chiffres), « ## Ce qui est réglé » (une à trois puces, ou « rien de nouveau »),",
    "« ## La seule chose à faire ensuite » (UNE action, et la date de la prochaine mesure).",
    "Puces courtes commençant par « - », phrases à l'indicatif, ton direct, vouvoiement, orthographe",
    "française complète avec accents. Pas d'introduction, pas de conclusion.",
    "Garde-fous de lecture : " + PIEGES.map((p, i) => `(${i + 1}) ${p}`).join(" "),
  ].join(" ");

  const trafic = (l: { semaine: string; jours_ouvres: number; clics: number; clics_par_jour: number; impressions: number; reference: boolean }) =>
    `semaine du ${l.semaine}${l.reference ? " (référence, meilleure semaine récente)" : ""} : ${l.clics} clics sur ${l.jours_ouvres} jours ouvrés (${l.clics_par_jour}/j), ${l.impressions} impressions ouvrées`;
  const vc = lecture.ventes.par_creation;
  const lignes: string[] = [
    `Période : ${libellePeriode}`,
    "",
    "Trafic Google (jours ouvrés) :",
    ...lecture.trafic.google.map((l) => `- ${trafic(l)}`),
    "Trafic Bing (jours ouvrés) :",
    ...lecture.trafic.bing.map((l) => `- ${trafic(l)}`),
    "",
    `Ventes par date de paiement (Stripe) : ${lecture.ventes.par_paiement.ventes} ventes, ${lecture.ventes.par_paiement.nettes} nettes de remboursements.`,
    vc.disponible
      ? `Ventes par date de création (dossiers créés sur la période, doublons exclus) : ${vc.dossiers} dossiers, ${vc.emails} emails, ${vc.payes} ventes dont ${vc.payes_organique} organiques.`
      : "Compte par date de création indisponible.",
    ...vc.par_canal.map((c) => `- canal ${c.canal} : ${c.dossiers} dossiers → ${c.emails} emails → ${c.payes} ventes`),
    ...(vc.par_page.length ? ["Portes d'entrée organiques (dossiers → emails → ventes) :"] : []),
    ...vc.par_page.map((p) => `- ${p.page} : ${p.dossiers} → ${p.emails} → ${p.payes}`),
    "",
    "Clusters de requêtes, période :",
    ...lecture.clusters.periode.map((c) => `- ${fmtCluster(c)}`),
    "Clusters de requêtes, période précédente :",
    ...lecture.clusters.precedent.map((c) => `- ${fmtCluster(c)}`),
    "",
    "Requêtes suivies (requête × page, position pondérée, période vs précédente) :",
    ...lecture.suivi.requetes.map((r) => `- « ${r.requete} » : page ${r.page ?? "aucune"}, ${r.clics} clics, ${r.impressions} impressions, position ${r.position ?? "n/a"} (précédente ${r.position_precedente ?? "n/a"})`),
    "Pages clés (requête × page) :",
    ...lecture.suivi.pages.map((p) => `- ${p.page} : ${p.requetes} requêtes, ${p.clics} clics, ${p.impressions} impressions, position ${p.position ?? "n/a"} (précédente ${p.position_precedente ?? "n/a"}) ; top : ${p.top_requetes.join(", ") || "aucune"}`),
    "",
    "Répartition des clics Google par appareil (période, et précédente) :",
    ...lecture.appareils.map((a) => `- ${a.appareil} : ${a.clics} clics (${Math.round(a.part_clics * 100)} %)${a.clics_precedent !== null ? ` contre ${a.clics_precedent} (${Math.round((a.part_clics_precedent ?? 0) * 100)} %)` : ""}`),
    "",
    "Autorité de domaine (Moz, dernier relevé ; DA et domaines référents ; précédent entre parenthèses) :",
    ...lecture.autorite.map((a) => `- ${a.domaine}${a.notre ? " (nous)" : ""} : DA ${a.da ?? "n/a"}${a.da_precedent !== null ? ` (${a.da_precedent})` : ""}, ${a.ref_domains ?? "n/a"} domaines référents${a.ref_domains_precedent !== null ? ` (${a.ref_domains_precedent})` : ""}, spam ${a.spam ?? "n/a"}`),
    "",
    "Chantiers SEO (déclarés avec verdict, ou déduits des commits du dépôt) :",
    ...lecture.chantiers.map((c) => `- ${c.date} « ${c.libelle} »${c.cible ? ` cible ${c.cible}` : ""}${c.hypothese ? `, hypothèse : ${c.hypothese}` : ""}${c.verdict ? `, verdict posé : ${c.verdict}` : ", verdict : aucun"}${c.mesure_prevue_le ? `, mesure prévue le ${c.mesure_prevue_le}` : ""}${c.source === "commit" ? " (commit)" : ""}`),
    "",
    "Highlights calculés :",
    ...highlights.map((h) => `- ${h}`),
  ];
  return await completer(systeme, lignes.join("\n"), 1400);
}
