// Fabrique le message d'UN destinataire : le meme chemin pour l'envoi de test,
// l'apercu et le worker, sans quoi le test ne prouve rien.
import type { Site } from "../sites.ts";
import { envelopper, nettoyerCorps, remplacerVariables, signerJeton, versTexte } from "./rendu.ts";
import type { MessageResend } from "./envoi.ts";

export interface Contenu {
  objet: string;
  corps_html: string;
}

export interface Destinataire {
  email: string;
  nom?: string | null;
  commune?: string | null;
}

export class ErreurMessage extends Error {}

// Deux liens pour le meme jeton : la page publique de la console (pied du
// mail, un humain clique) et l'Edge Function (List-Unsubscribe-Post, le client
// mail poste seul). Supabase sert le HTML des fonctions en text/plain : la
// page humaine ne peut pas vivre sur la fonction.
export async function liensDesinscription(
  appId: string,
  email: string,
  campagneId: string | null,
  test = false,
): Promise<{ page: string; unClic: string }> {
  const secret = Deno.env.get("ADMIN_UNSUBSCRIBE_SECRET");
  // Fail closed : sans lien de desinscription, rien ne part.
  if (!secret) throw new ErreurMessage("Secret ADMIN_UNSUBSCRIBE_SECRET absent : aucun envoi possible");
  const jeton = await signerJeton(secret, appId, email);
  const params = `t=${encodeURIComponent(jeton)}${campagneId ? `&c=${campagneId}` : ""}${test ? "&test=1" : ""}`;
  const consoleUrl = (Deno.env.get("BAIKAL_CONSOLE_URL") ?? "https://withbaikal.io").replace(/\/+$/, "");
  return {
    page: `${consoleUrl}/desinscription?${params}`,
    unClic: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mailing-desinscription?${params}`,
  };
}

export async function fabriquerMessage(o: {
  site: Site;
  from: string;
  replyTo: string | null;
  contenu: Contenu;
  destinataire: Destinataire;
  campagneId: string | null;
  test?: boolean;
  // Sequence : numero du mail (1 = premier). Chaque mail a sa propre cle
  // d'idempotence, sans quoi Resend prendrait la relance pour un doublon.
  touche?: number;
}): Promise<MessageResend & { lien: string }> {
  const valeurs = {
    nom: o.destinataire.nom ?? null,
    email: o.destinataire.email,
    commune: o.destinataire.commune ?? null,
    site: o.site.name,
  };
  const liens = await liensDesinscription(o.site.id, o.destinataire.email, o.campagneId, o.test);
  const html = envelopper({
    corpsHtml: remplacerVariables(nettoyerCorps(o.contenu.corps_html), valeurs, true),
    nomSite: o.site.name,
    domaine: o.site.domaine,
    lienDesinscription: liens.page,
  });
  const objet = remplacerVariables(o.contenu.objet, valeurs, false).replace(/[\r\n]+/g, " ").trim();
  return {
    from: o.from,
    to: o.destinataire.email,
    subject: o.test ? `[TEST] ${objet}` : objet,
    html,
    text: versTexte(html),
    replyTo: o.replyTo,
    // RFC 8058 : desinscription en un clic depuis le client mail (Gmail,
    // Yahoo l'exigent pour les envois en volume).
    headers: {
      "List-Unsubscribe": `<${liens.unClic}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    // Lus par admin-mailing-webhook pour router l'evenement vers le site.
    tags: [
      { name: "app_id", value: o.site.id.replace(/[^A-Za-z0-9_-]/g, "_") },
      ...(o.campagneId ? [{ name: "campagne", value: o.campagneId }] : []),
    ],
    idempotencyKey: o.campagneId && !o.test
      ? `${o.campagneId}:${o.destinataire.email}${o.touche && o.touche > 1 ? `:${o.touche}` : ""}`
      : undefined,
    lien: liens.page,
  };
}
