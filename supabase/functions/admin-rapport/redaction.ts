// Redaction assistee des textes libres du rapport. Le modele ne voit que les
// commits (evolutions), l'ebauche d'Eric et les highlights (commentaire), ou
// les chiffres calcules de la lecture SEO ; il ne touche jamais a la trame
// calculee. Ses sorties sont des PROPOSITIONS : c'est le champ relu par Eric
// qui est archive.

import type { Commit } from "./github.ts";
import type { LectureSeo } from "./lecture-seo.ts";

// Modele de redaction : secret ADMIN_RAPPORT_MODELE, sinon gemini-3.8-flash
// (le modele courant du groupe, Eric 06/09/2026). Un nom « gemini-* » passe par
// l'API Gemini (GEMINI_API_KEY), tout autre nom par OpenAI (OPENAI_API_KEY).
// Meme contrat des deux cotes : consigne systeme + texte utilisateur, sortie
// texte brut.
const MODELE_DEFAUT = "gemini-3.8-flash";

function modele(): string {
  return (Deno.env.get("ADMIN_RAPPORT_MODELE") ?? "").trim() || MODELE_DEFAUT;
}

async function completerGemini(nom: string, systeme: string, utilisateur: string, maxTokens: number): Promise<string> {
  const cle = Deno.env.get("GEMINI_API_KEY");
  if (!cle) throw new Error("GEMINI_API_KEY absent");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(nom)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": cle, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systeme }] },
        contents: [{ role: "user", parts: [{ text: utilisateur }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status} (${nom}): ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const texte = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!texte) throw new Error(`Gemini (${nom}) : réponse vide${json.candidates?.[0]?.finishReason ? `, ${json.candidates[0].finishReason}` : ""}`);
  return texte;
}

async function completerOpenAI(nom: string, systeme: string, utilisateur: string, maxTokens: number): Promise<string> {
  const cle = Deno.env.get("OPENAI_API_KEY");
  if (!cle) throw new Error("OPENAI_API_KEY absent");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: nom,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systeme },
        { role: "user", content: utilisateur },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status} (${nom}): ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

async function completer(systeme: string, utilisateur: string, maxTokens = 900): Promise<string> {
  const nom = modele();
  // Gemini compte les tokens de reflexion dans la sortie : marge large.
  return nom.startsWith("gemini")
    ? await completerGemini(nom, systeme, utilisateur, Math.max(maxTokens * 4, 4000))
    : await completerOpenAI(nom, systeme, utilisateur, maxTokens);
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

// Consigne d'Eric du 06/09/2026, reprise mot pour mot. Le message
// utilisateur suit la numerotation de ses « DONNEES RECUES » : le modele ne
// recoit rien d'autre (ni highlights, ni compte par date de creation).
const CONSIGNE_LECTURE_SEO = `Tu rédiges, en français, la « Lecture SEO » du rapport que l'éditeur du site pre-etat-date.ai (« nous ») adresse à IA MEDIA, son partenaire SEO (« vous »). Ce texte sera lu tel quel par le partenaire.

DONNÉES REÇUES (tu ne disposes que de celles-ci)
0. Période du rapport : date de début, date de fin, et période précédente de même durée à laquelle elle est comparée. Toute date que tu écris se déduit de ces bornes ; tu n'en supposes aucune autre.
1. Trafic : clics et impressions Google par jour, période du rapport contre période précédente, et la même chose pour Bing. Sert à dire si la demande monte ou baisse, et si les deux moteurs bougent ensemble.
2. Impressions hors bruit par mois. Sert à distinguer une hausse de clics par le taux de clic d'une hausse par la visibilité.
3. Clusters de requêtes par mois : requêtes, clics, impressions, position pondérée par les impressions. Sert à lire une tendance par sujet, jamais la position d'une page.
4. Requête × page sur les pages clés, période du rapport contre période précédente, normalisées par jour : requêtes, clics, impressions, position pondérée. C'est la seule source valable pour la position d'une page sur ses requêtes.
5. Panier de dix requêtes de suivi : position requête × page, page classée, écart avec la mesure précédente.
6. Ventes par date de paiement, nettes de remboursements, avec la part venue du référencement naturel et la conversion par page d'entrée. C'est le compte du contrat ; ne cite aucun autre compte de ventes.
7. Chantiers encore ouverts, quelle que soit leur date de lancement : libellé, date, cible (cluster ou page), hypothèse, verdict déjà posé s'il existe.
8. Facultatif : nombre de domaines référents du site et du concurrent le mieux placé.

RÈGLES SUR LES CHIFFRES
- Tu n'inventes aucun chiffre et tu n'en arrondis aucun autrement qu'il est donné. Chaque chiffre cité est suivi de sa fenêtre (dates ou mois).
- Tu ne cites jamais une position moyenne globale ni un total d'impressions brut : ces deux chiffres mentent sur ce site.
- Un chiffre absent des données n'existe pas : tu ne commentes l'autorité que si le point 8 est fourni, et tu ne cites jamais un nom de client, une adresse, un coût interne ou un outil.
- Format français : espace avant les milliers, virgule décimale, « % » précédé d'une espace.

VERDICTS (partie 1)
- Un chantier ne se juge que sur une fenêtre qui commence après sa date, d'au moins trois semaines pleines, et qui ne tombe pas dans le creux estival (du 20 juillet au 25 août, chaque année). Un chantier de liens ne se juge pas avant trois mois. Sinon : « trop tôt pour conclure ».
- Gagné : la cible gagne au moins trois places en requête × page à impressions comparables, ou ses clics sont multipliés par 1,5 sur fenêtre comparable.
- En progrès : la position s'améliore sans que les clics suivent.
- Raté : la cible perd plus de dix places sur ses propres requêtes à impressions comparables.
- Sans objet : la demande visée est tombée sous vingt impressions par mois hors bruit.
- Un verdict déjà posé est repris tel quel, sans être contredit.

STRUCTURE IMPOSÉE, quatre parties avec ces titres exacts sur leur propre ligne :
« ## Bilan des chantiers » : un verdict par chantier avec le chiffre qui le prouve, ou « aucun chantier ouvert ».
« ## Lectures à ne pas rater » : deux ou trois effets de composition ou de saisonnalité visibles dans les chiffres ; un mot sur l'autorité seulement si le point 8 est fourni, un mot sur la part mobile seulement si elle bouge d'au moins cinq points.
« ## Ce qui est réglé » : une à trois puces, ou « rien de nouveau ».
« ## La seule chose à faire ensuite » : UNE action, qui la fait (vous ou nous), et la date de la prochaine mesure, calculée à partir de la fin de période fournie : un mois plus tard pour une action sur le site, trois mois plus tard pour une action de liens.

FORME
Puces courtes commençant par « - », phrases à l'indicatif, ton direct, vouvoiement, orthographe française complète avec accents. Pas d'introduction, pas de conclusion. 250 mots au plus.

GARDE-FOUS DE LECTURE
(1) Comparer des fenêtres de même durée, en jours calendaires ou en semaines pleines de sept jours : une fenêtre plus longue fausse tout.
(2) L'été est un trou de demande, pas un signal de site : entre le 20 juillet et le 25 août, deux moteurs qui baissent ensemble à position égale, c'est de la saisonnalité, et aucune correction ne se décide sur cette fenêtre.
(3) Les requêtes entre guillemets sont du bruit, déjà exclues des chiffres fournis.
(4) La position moyenne d'une page n'est pas sa position sur son cluster : la position d'une page se lit au point 4 seulement.
(5) L'export par requêtes cache environ la moitié des clics : un « 0 clic » en requête × page ne vaut que pour les requêtes nommées.
(6) Une position qui se dégrade à impressions croissantes est souvent une page qui sort sur de nouvelles requêtes lointaines, pas une page qui perd ses acquis.
(7) Une hausse de clics à impressions hors bruit stables est une hausse du taux de clic ; une hausse des deux est une hausse de visibilité.
(8) Un lien produit son effet en trois à six mois : ne jamais lire un chantier de liens plus tôt.`;

export interface ContexteLecture {
  libelle_periode: string;
  libelle_precedent: string;
  periode: { debut: string; fin: string };
  precedent: { debut: string; fin: string };
  // Point 2 : impressions Google hors bruit, periode et precedente.
  impressions_hors_bruit: { periode: number | null; precedent: number | null };
}

const nbFr = (n: number | null | undefined) =>
  n === null || n === undefined ? "n/a" : new Intl.NumberFormat("fr-FR").format(n).replace(/\u202f/g, " ");
const posFr = (n: number | null | undefined) =>
  n === null || n === undefined ? "n/a" : n.toFixed(1).replace(".", ",");
const pctFr = (n: number) => `${Math.round(n * 100)} %`;

function fmtCluster(l: { cluster: string; requetes: number; clics: number; impressions: number; position: number | null }) {
  return `${l.cluster} : ${nbFr(l.requetes)} requêtes, ${nbFr(l.clics)} clics, ${nbFr(l.impressions)} impressions, position pondérée ${posFr(l.position)}`;
}

export async function redigerLectureSeo(lecture: LectureSeo, contexte: ContexteLecture): Promise<string> {
  const trafic = (l: { semaine: string; semaine_iso: string; jours: number; clics: number; clics_par_jour: number; impressions: number; ctr: number; reference: boolean }) =>
    `${l.semaine_iso} (du ${l.semaine})${l.reference ? " (référence, meilleure semaine récente)" : ""} : ${nbFr(l.clics)} clics sur ${l.jours} jours (${posFr(l.clics_par_jour)}/j), ${nbFr(l.impressions)} impressions, CTR ${posFr(l.ctr * 100)} %`;
  const vp = lecture.ventes.par_paiement;
  const vc = lecture.ventes.par_creation;
  const notre = lecture.autorite.find((a) => a.notre);
  const meilleur = lecture.autorite.filter((a) => !a.notre && a.ref_domains !== null)
    .sort((a, b) => (b.ref_domains ?? 0) - (a.ref_domains ?? 0))[0];
  const mobile = lecture.appareils.find((a) => a.appareil === "mobile");

  const fen = (p: { debut: string; fin: string }) => `du ${p.debut} au ${p.fin}`;
  const traficP = (t: { jours: number; clics: number; impressions: number; clics_par_jour: number; impressions_par_jour: number; ctr: number } | null, p: { debut: string; fin: string }) =>
    t ? `${fen(p)} : ${nbFr(t.jours)} jours mesurés, ${nbFr(t.clics)} clics (${posFr(t.clics_par_jour)}/jour), ${nbFr(t.impressions)} impressions (${posFr(t.impressions_par_jour)}/jour), CTR ${posFr(t.ctr * 100)} %` : `${fen(p)} : aucune mesure`;
  const joursP = Math.round((new Date(`${contexte.periode.fin}T00:00:00Z`).getTime() - new Date(`${contexte.periode.debut}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const joursQ = Math.round((new Date(`${contexte.precedent.fin}T00:00:00Z`).getTime() - new Date(`${contexte.precedent.debut}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const parJour = (n: number, jours: number) => posFr(jours > 0 ? n / jours : 0);
  const tp = lecture.trafic_periode;

  const lignes: string[] = [
    `0. PÉRIODE DU RAPPORT : ${fen(contexte.periode)} (${contexte.libelle_periode}), comparée à la période précédente ${fen(contexte.precedent)} (${contexte.libelle_precedent}).`,
    "",
    "1. TRAFIC PAR JOUR (tous les jours, le site vend sept jours sur sept) :",
    `- Google, période du rapport, ${traficP(tp?.google.periode ?? null, contexte.periode)}`,
    `- Google, période précédente, ${traficP(tp?.google.precedent ?? null, contexte.precedent)}`,
    `- Bing, période du rapport, ${traficP(tp?.bing.periode ?? null, contexte.periode)}`,
    `- Bing, période précédente, ${traficP(tp?.bing.precedent ?? null, contexte.precedent)}`,
    "   Détail Google par semaine pleine (de la plus récente à la plus ancienne) :",
    ...lecture.trafic.google.map((l) => `- ${trafic(l)}`),
    "",
    "2. IMPRESSIONS GOOGLE HORS BRUIT PAR MOIS :",
    `- ${contexte.libelle_periode} : ${nbFr(contexte.impressions_hors_bruit.periode)}`,
    `- ${contexte.libelle_precedent} : ${nbFr(contexte.impressions_hors_bruit.precedent)}`,
    "",
    `3. CLUSTERS DE REQUÊTES — ${contexte.libelle_periode} :`,
    ...lecture.clusters.periode.map((c) => `- ${fmtCluster(c)}`),
    `   ${contexte.libelle_precedent} :`,
    ...lecture.clusters.precedent.map((c) => `- ${fmtCluster(c)}`),
    "",
    `4. REQUÊTE × PAGE SUR LES PAGES CLÉS, normalisé par jour — période ${fen(contexte.periode)} (${joursP} jours) contre précédente ${fen(contexte.precedent)} (${joursQ} jours) :`,
    ...lecture.suivi.pages.map((p) => `- ${p.page} : ${nbFr(p.requetes)} requêtes ; clics ${parJour(p.clics, joursP)}/jour contre ${parJour(p.clics_precedent ?? 0, joursQ)}/jour ; impressions ${parJour(p.impressions, joursP)}/jour contre ${parJour(p.impressions_precedent ?? 0, joursQ)}/jour ; position pondérée ${posFr(p.position)} contre ${posFr(p.position_precedente)} ; premières requêtes : ${p.top_requetes.join(", ") || "aucune"}`),
    ...(lecture.suivi.pages.length === 0 ? ["- aucun relevé requête × page"] : []),
    "",
    `5. PANIER DE REQUÊTES SUIVIES — ${contexte.libelle_periode} (mesure précédente : ${contexte.libelle_precedent}) :`,
    ...lecture.suivi.requetes.map((r) => `- « ${r.requete} » : page classée ${r.page ?? "aucune"}, position ${posFr(r.position)}, précédente ${posFr(r.position_precedente)}${r.position !== null && r.position_precedente !== null ? ` (écart ${posFr(r.position - r.position_precedente)})` : ""}`),
    ...(lecture.suivi.requetes.length === 0 ? ["- aucune requête suivie"] : []),
    "",
    `6. VENTES PAR DATE DE PAIEMENT, NETTES DE REMBOURSEMENTS — ${fen(contexte.periode)} :`,
    `- ${nbFr(vp.nettes)} ventes nettes (${nbFr(vp.ventes)} encaissées)${vp.organiques !== undefined ? `, dont ${nbFr(vp.organiques)} venues du référencement naturel` : ""}`,
    ...(vc.disponible && vc.par_page.length
      ? ["   Conversion par page d'entrée organique (dossiers créés sur la période → taux de vente) :",
        ...vc.par_page.map((p) => `- ${p.page} : ${nbFr(p.dossiers)} dossiers, taux de vente ${p.dossiers > 0 ? pctFr(p.payes / p.dossiers) : "n/a"}`)]
      : []),
    "",
    "7. CHANTIERS OUVERTS :",
    ...lecture.chantiers.map((c) => `- ${c.date} « ${c.libelle} »${c.cible ? `, cible ${c.cible}` : ""}${c.hypothese ? `, hypothèse : ${c.hypothese}` : ""}${c.verdict ? `, verdict déjà posé : ${c.verdict}` : ""}`),
    ...(lecture.chantiers.length === 0 ? ["- aucun chantier ouvert"] : []),
    "",
    ...(notre && meilleur && notre.ref_domains !== null
      ? [`8. AUTORITÉ (relevé du ${notre.mesure_le}) : ${nbFr(notre.ref_domains)} domaines référents pour le site${notre.ref_domains_precedent !== null ? ` (${nbFr(notre.ref_domains_precedent)} au relevé du ${notre.mesure_precedente_le})` : ""}, contre ${nbFr(meilleur.ref_domains)} pour le concurrent le mieux placé.`]
      : ["8. AUTORITÉ : non fournie."]),
    ...(mobile && mobile.part_clics_precedent !== null
      ? ["", `Part mobile des clics Google : ${pctFr(mobile.part_clics)} (${contexte.libelle_periode}) contre ${pctFr(mobile.part_clics_precedent)} (${contexte.libelle_precedent}).`]
      : []),
  ];
  return await completer(CONSIGNE_LECTURE_SEO, lignes.join("\n"), 1400);
}
