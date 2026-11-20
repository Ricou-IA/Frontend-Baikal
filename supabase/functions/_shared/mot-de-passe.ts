// Mot de passe posé par un administrateur depuis la console : généré lisible,
// ou saisi et validé. Partagé par admin-comptes (comptes de Baikal) et
// admin-membres (membres d'un site, relayés au site).

// 14 caractères, sans les glyphes ambigus (0/O, 1/l/I), avec au moins une
// minuscule, une majuscule et un chiffre : lisible à l'oral et au téléphone.
export function genererMotDePasse(): string {
  const minuscules = "abcdefghjkmnpqrstuvwxyz";
  const majuscules = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const chiffres = "23456789";
  const tout = minuscules + majuscules + chiffres;
  const tirer = (alphabet: string) => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return alphabet[b[0] % alphabet.length];
  };
  const chars = [tirer(minuscules), tirer(majuscules), tirer(chiffres)];
  while (chars.length < 14) chars.push(tirer(tout));
  for (let i = chars.length - 1; i > 0; i--) {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    const j = b[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function validerMotDePasse(mdp: unknown): string | null {
  if (typeof mdp !== "string") return null;
  if (mdp.length < 8 || mdp.length > 72) return null;
  return mdp;
}
