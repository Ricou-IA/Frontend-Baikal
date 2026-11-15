// Le résultat d'une recette : un statut par contrôle, et un résumé par niveau.
// Pur. Quatre statuts, et une règle : un contrôle NON MESURÉ n'est jamais
// compté conforme — une requête trop lente ne prouve rien.
import { masquerValeur } from "./masquage.ts";

export type Statut = "conforme" | "echec" | "absent" | "non_mesure";
export type Famille = "forme" | "recette" | "acces" | "concordance";
export type Ligne = Record<string, unknown>;

export interface ResultatControle {
  id: string;
  famille: Famille;
  niveau: 1 | 2;
  vue: string | null;
  titre: string;
  statut: Statut;
  // Ce qui empêche de déclarer le niveau passé : un échec, un non mesuré, ou
  // l'absence d'une vue obligatoire. L'absence d'un bloc optionnel ne bloque pas.
  bloquant: boolean;
  ref?: string;
  lignes?: number;
  exemples?: Ligne[];
  si_echec?: string;
  correction?: string;
  detail?: string;
}

export interface Decompte {
  total: number;
  conformes: number;
  echecs: number;
  absents: number;
  non_mesures: number;
  bloquants: number;
}

export interface Resume {
  niveau1: Decompte;
  niveau2: Decompte;
  niveau1_pret: boolean;
  niveau2_pret: boolean;
}

export interface Rapport {
  schema: string;
  utilisateur: string | null;
  resume: Resume;
  controles: ResultatControle[];
}

const MAX_EXEMPLES = 3;
const MAX_TEXTE = 200;

function tronquer(texte: string): string {
  return texte.length > MAX_TEXTE ? texte.slice(0, MAX_TEXTE) + "…" : texte;
}

function lisible(valeur: unknown): unknown {
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === "bigint") return Number(valeur);
  if (typeof valeur === "string") return tronquer(valeur);
  if (valeur && typeof valeur === "object") return tronquer(JSON.stringify(valeur));
  return valeur;
}

// Trois exemples au plus, masqués, lisibles tels quels dans un rapport. Les
// colonnes techniques du moteur (préfixe __) n'en font pas partie.
export function exemples(lignes: Ligne[], max = MAX_EXEMPLES): Ligne[] {
  return lignes.slice(0, max).map((ligne) =>
    Object.fromEntries(
      Object.entries(ligne)
        .filter(([cle]) => !cle.startsWith("__"))
        .map(([cle, valeur]) => [cle, lisible(masquerValeur(valeur))]),
    )
  );
}

function decompter(controles: ResultatControle[]): Decompte {
  const compter = (statut: Statut) => controles.filter((c) => c.statut === statut).length;
  return {
    total: controles.length,
    conformes: compter("conforme"),
    echecs: compter("echec"),
    absents: compter("absent"),
    non_mesures: compter("non_mesure"),
    bloquants: controles.filter((c) => c.bloquant).length,
  };
}

export function resumer(controles: ResultatControle[]): Resume {
  const niveau1 = decompter(controles.filter((c) => c.niveau === 1));
  const niveau2 = decompter(controles.filter((c) => c.niveau === 2));
  return {
    niveau1,
    niveau2,
    niveau1_pret: niveau1.bloquants === 0,
    // Le niveau 2 ne se déclare pas sur un niveau 1 troué.
    niveau2_pret: niveau1.bloquants === 0 && niveau2.bloquants === 0,
  };
}
