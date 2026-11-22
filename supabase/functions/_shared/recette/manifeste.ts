// Forme des manifestes de contrat (docs/contrats/manifestes/*.json) : ce que
// le moteur de recette lit pour savoir quoi contrôler. Le test de parité
// docs/contrats/manifestes/manifestes.test.ts les tient alignés sur les .sql.

export type TypeContrat = "text" | "int" | "numeric" | "boolean" | "timestamptz" | "date" | "jsonb";

export interface ColonneContrat {
  nom: string;
  type: TypeContrat;
  // Obligatoire = la colonne doit être PRÉSENTE (elle peut porter des NULL).
  obligatoire: boolean;
  bloc?: string;
}

export interface VueContrat {
  nom: string;
  obligatoire: boolean;
  niveau: 1 | 2;
  role: string;
  // Colonne qui rattache la vue à la vue obligatoire du contrat (fiche → liste).
  jointure?: string;
  colonnes: ColonneContrat[];
}

export interface ControleContrat {
  id: string;
  ref: string;
  niveau: 1 | 2;
  vue: string;
  titre: string;
  requiert: string[];
  // 'funnel' : la requête rend les valeurs de statut, le moteur les confronte
  // au funnel déclaré. Absent : la requête rend les lignes FAUTIVES, zéro = conforme.
  type?: "funnel";
  sql: string;
  si_echec: string;
  correction: string;
}

export interface ConcordanceContrat {
  id: string;
  ref: string;
  niveau: 1 | 2;
  gauche: { vue: string; colonne: string };
  droite: { vue: string; colonne: string };
  cle: string;
  titre: string;
  si_echec: string;
  correction: string;
}

export interface Manifeste {
  contrat: string;
  source: string;
  titre: string;
  // Contrat qu'un site publie s'il a de quoi le remplir (Comptes) : absent, il
  // ne produit aucun contrôle ; publié, ses contrôles (niveau 2) ne bloquent
  // jamais l'ouverture du site.
  optionnel?: boolean;
  // Pour un contrat optionnel : quand le publier, dit à l'agent.
  quand?: string;
  types: string;
  vues: VueContrat[];
  controles: ControleContrat[];
  concordances: ConcordanceContrat[];
  verifications_manuelles: { ref: string; texte: string }[];
}
