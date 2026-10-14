// Redaction assistee d'un mail de campagne. Le modele propose, l'utilisateur
// relit : rien ne part sans passer par l'editeur. Meme mecanique que
// admin-rapport/redaction.ts : secret ADMIN_MAILING_MODELE, sinon
// gemini-3.8-flash ; un nom « gemini-* » passe par Gemini, tout autre par OpenAI.
import { nettoyerCorps } from "./rendu.ts";

const MODELE_DEFAUT = "gemini-3.8-flash";

// Une intention par etape de l'entonnoir commun (Eric, 14/10/2026).
export const INTENTIONS: Record<string, string> = {
  a_conquerir: "Prospecter : premier contact avec quelqu'un qui ne nous connaît pas. Montrer en une phrase le bénéfice concret, une seule action demandée.",
  lead: "Activer : la personne a laissé son email ou utilisé le service gratuit. L'amener à commencer pour de bon.",
  engage: "Convertir : la personne a commencé sans aller au bout. Lever le frein le plus probable et l'inviter à terminer.",
  client: "Fidéliser : remercier, être utile, proposer la suite logique sans pression.",
  recurrent: "Retenir : valoriser ce que la personne obtient, annoncer une nouveauté utile.",
  perdu: "Réactiver : reprendre contact avec quelqu'un qui est parti, sans culpabiliser, avec une raison de revenir.",
};

export const CONSIGNES: Record<string, string> = {
  rediger: "Rédige le mail complet.",
  court: "Raccourcis ce mail d'environ la moitié, sans perdre l'action demandée.",
  chaleureux: "Rends ce mail plus chaleureux et plus humain, sans le rallonger.",
  reformuler: "Reformule ce mail autrement, même message, mêmes informations.",
};

async function completer(systeme: string, utilisateur: string): Promise<string> {
  const nom = (Deno.env.get("ADMIN_MAILING_MODELE") ?? "").trim() || MODELE_DEFAUT;
  if (nom.startsWith("gemini")) {
    const cle = Deno.env.get("GEMINI_API_KEY");
    if (!cle) throw new Error("GEMINI_API_KEY absent");
    // Reflexion minimale : un mail de 150 mots n'en a pas besoin, et elle
    // coutait 16 s par redaction. Un modele qui refuse ce reglage (400) est
    // rappele sans (meme principe que baikal-retrieval/gemini-thinking.ts).
    const appel = (reflexion: boolean) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(nom)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": cle, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systeme }] },
          contents: [{ role: "user", parts: [{ text: utilisateur }] }],
          generationConfig: {
            temperature: 0.6, maxOutputTokens: 6000, responseMimeType: "application/json",
            ...(reflexion ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
          },
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    let res = await appel(true);
    if (res.status === 400) res = await appel(false);
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    return (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  }
  const cle = Deno.env.get("OPENAI_API_KEY");
  if (!cle) throw new Error("OPENAI_API_KEY absent");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: nom,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systeme }, { role: "user", content: utilisateur }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return String((await res.json()).choices?.[0]?.message?.content ?? "").trim();
}

// Regles d'un bon objet : c'est lui qui decide de l'ouverture.
const REGLES_OBJET = [
  "Un objet fait moins de 50 caractères, sans majuscules criardes, sans point d'exclamation multiple,",
  "sans mots déclencheurs de spam (gratuit, urgent, offre exclusive, 100 %), sans emoji.",
  "Il donne une raison concrète d'ouvrir, liée à l'intention et au brief.",
  "Les objets proposés suivent trois angles différents : le bénéfice concret, la curiosité",
  "(une information qu'on veut connaître), la question qui touche le problème du destinataire.",
].join(" ");

function lireJson(brut: string): Record<string, unknown> {
  try {
    return JSON.parse(brut.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Réponse de l'IA illisible, réessayez");
  }
}

function objetsPropres(x: unknown): string[] {
  return (Array.isArray(x) ? x : [])
    .map((o) => String(o ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 150))
    .filter(Boolean)
    .slice(0, 3);
}

export async function redigerMail(o: {
  site: string;
  domaine: string | null;
  etape: string | null;
  profils: string[];
  brief: string;
  consigne: string;
  objet: string;
  corps: string;
}): Promise<{ objet: string; objets: string[]; corps_html: string | null }> {
  const contexte = [
    o.etape && INTENTIONS[o.etape] ? `Intention : ${INTENTIONS[o.etape]}` : "",
    o.profils.length ? `Destinataires : ${o.profils.join(", ")}.` : "",
    o.brief.trim() ? `Brief de l'auteur : ${o.brief.trim()}` : "",
  ];

  // Objets seuls : trois accroches pour le mail tel qu'il est, corps intact.
  if (o.consigne === "objets") {
    const systeme = [
      `Tu écris des objets d'emails en français pour le site ${o.site}${o.domaine ? ` (${o.domaine})` : ""}.`,
      REGLES_OBJET,
      "Réponds UNIQUEMENT en JSON : {\"objets\": [\"…\", \"…\", \"…\"]}, le meilleur en premier.",
      "Orthographe française complète, avec tous les accents.",
    ].join(" ");
    const utilisateur = [
      "Propose trois objets pour ce mail.",
      ...contexte,
      o.corps.trim() ? `Mail :\n${o.corps}` : "",
      o.objet.trim() ? `Objet actuel, à dépasser : ${o.objet}` : "",
    ].filter(Boolean).join("\n\n");
    const objets = objetsPropres(lireJson(await completer(systeme, utilisateur)).objets);
    if (objets.length === 0) throw new Error("L'IA n'a proposé aucun objet, réessayez");
    return { objet: objets[0], objets, corps_html: null };
  }

  const systeme = [
    `Tu rédiges des emails marketing en français pour le site ${o.site}${o.domaine ? ` (${o.domaine})` : ""}.`,
    "Style : phrases courtes, vouvoiement, ton direct et humain, aucune formule creuse,",
    "aucune promesse chiffrée qui ne figure pas dans le brief. 80 à 160 mots.",
    "Tu peux utiliser la variable {{nom}} (nom du destinataire) avec un repli vide, par exemple « Bonjour {{nom|}}, ».",
    "Format du corps : HTML simple uniquement, balises p, strong, em, ul, li, br et a href.",
    "Pour l'action principale, un seul lien bouton : <a href=\"URL\" data-bouton>Texte du bouton</a>.",
    "Si le brief ne donne pas d'URL, utilise la page d'accueil du site.",
    "Pas de signature d'entreprise ni de lien de désinscription : ils sont ajoutés automatiquement.",
    "L'objet compte autant que le corps : c'est lui qui décide de l'ouverture.",
    REGLES_OBJET,
    "Réponds UNIQUEMENT en JSON : {\"objets\": [\"…\", \"…\", \"…\"], \"corps_html\": \"…\"}, le meilleur objet en premier.",
    "Orthographe française complète, avec tous les accents.",
  ].join(" ");
  const utilisateur = [
    `Consigne : ${CONSIGNES[o.consigne] ?? CONSIGNES.rediger}`,
    ...contexte,
    o.consigne !== "rediger" && o.corps.trim() ? `Mail actuel :\nObjet : ${o.objet}\n${o.corps}` : "",
  ].filter(Boolean).join("\n\n");
  const r = lireJson(await completer(systeme, utilisateur));
  const objets = objetsPropres(r.objets ?? (r.objet ? [r.objet] : []));
  return {
    objet: objets[0] ?? "",
    objets,
    corps_html: nettoyerCorps(String(r.corps_html ?? "")),
  };
}
