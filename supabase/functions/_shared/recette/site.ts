// L'adresse du site que le prospect tape en entrant dans « Tester mon site ».
// PUR, sans dépendance : importé tel quel par la page /tester.
//
// Elle ne sert qu'à une chose : nommer le site dans le prompt, pour que
// l'agent du prospect identifie le BON dépôt et la BONNE base parmi ceux
// qu'il a sous la main. Baikal ne la visite pas et ne la garde pas.

export type SiteLu =
  | { ok: true; url: string; domaine: string }
  | { ok: false; erreur: string };

const FORME = "Tapez l'adresse de votre site, par exemple monsaas.fr";

export function lireSite(saisie: string): SiteLu {
  const texte = saisie.trim();
  if (!texte) return { ok: false, erreur: FORME };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(texte) ? texte : `https://${texte}`);
  } catch {
    return { ok: false, erreur: FORME };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, erreur: FORME };
  const hote = url.hostname.toLowerCase().replace(/\.$/, "");
  // Un nom public : au moins un point, une extension en lettres. Ni adresse
  // IP ni machine locale : ce n'est pas un site que des clients visitent.
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(hote) || /\.(local|localhost|internal|test)$/.test(hote)) {
    return { ok: false, erreur: "Il faut l'adresse publique de votre site, celle que vos clients visitent (monsaas.fr)." };
  }
  return { ok: true, url: `https://${hote}`, domaine: hote.replace(/^www\./, "") };
}
