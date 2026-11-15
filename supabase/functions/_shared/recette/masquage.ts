// Masquage des exemples d'un rapport de recette. Un rapport sort de la base
// du prospect et s'affiche sur une page publique : aucune adresse n'y figure
// en clair (j***@gmail.com). Pur, sans dépendance.

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function masquerEmail(texte: string): string {
  return texte.replace(EMAIL, "$1***@$2");
}

// Descend dans les tableaux et les objets (jsonb) : une adresse peut se loger
// dans un `detail` ou une `attribution`.
export function masquerValeur(valeur: unknown): unknown {
  if (typeof valeur === "string") return masquerEmail(valeur);
  if (Array.isArray(valeur)) return valeur.map(masquerValeur);
  if (valeur && typeof valeur === "object" && !(valeur instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valeur as Record<string, unknown>).map(([k, v]) => [k, masquerValeur(v)]),
    );
  }
  return valeur;
}
