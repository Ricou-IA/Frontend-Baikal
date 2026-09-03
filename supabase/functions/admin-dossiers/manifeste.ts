// Normalisation du manifeste d'actions renvoye par l'EF d'administration d'un
// site. C'est une donnee venue d'un autre projet : elle est validee, jamais
// executee telle quelle. Une action mal formee est ecartee, la fiche reste
// affichable.
//
// Le flag super_admin construit l'interface ET conditionne le relais cote
// Baikal, mais l'autorisation qui fait foi reste celle de l'EF du site.
const ICONES = new Set([
  "send",
  "refresh",
  "coins",
  "trash",
  "mail",
  "download",
  "check",
  "alert",
]);
const TYPES_PARAMETRE = new Set(["choix", "nombre", "texte", "booleen"]);

export interface OptionChoix {
  valeur: string;
  libelle: string;
}

export interface ParametreAction {
  id: string;
  type: string;
  libelle: string;
  options: OptionChoix[];
  min: number;
  max: number;
  defaut: string | null;
}

export interface Confirmation {
  titre: string;
  message: string;
  bouton: string;
}

export interface ActionFiche {
  id: string;
  libelle: string;
  icone: string | null;
  variante: "neutre" | "danger";
  superAdmin: boolean;
  confirmation: Confirmation | null;
  parametres: ParametreAction[];
}

function texte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : "";
}

function normaliserOptions(brut: unknown): OptionChoix[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const option = o as Record<string, unknown>;
      const valeur = texte(option.valeur);
      const libelle = texte(option.libelle) || valeur;
      return valeur ? { valeur, libelle } : null;
    })
    .filter((o): o is OptionChoix => o !== null);
}

function normaliserParametre(brut: unknown): ParametreAction | null {
  if (!brut || typeof brut !== "object") return null;
  const p = brut as Record<string, unknown>;
  const id = texte(p.id);
  const type = texte(p.type);
  if (!id || !TYPES_PARAMETRE.has(type)) return null;
  const options = type === "choix" ? normaliserOptions(p.options) : [];
  if (type === "choix" && options.length === 0) return null;
  // Number(null) vaut 0 : sans la garde == null, un max absent serialise en
  // null bornerait le champ a zero et interdirait toute saisie.
  const min = p.min == null || !Number.isFinite(Number(p.min)) ? 0 : Number(p.min);
  const max = p.max == null || !Number.isFinite(Number(p.max)) ? 100 : Number(p.max);
  return {
    id,
    type,
    libelle: texte(p.libelle) || id,
    options,
    min,
    max,
    defaut: p.defaut === undefined || p.defaut === null ? null : String(p.defaut),
  };
}

function normaliserConfirmation(brut: unknown): Confirmation | null {
  if (!brut || typeof brut !== "object") return null;
  const c = brut as Record<string, unknown>;
  const titre = texte(c.titre);
  const message = texte(c.message);
  const bouton = texte(c.bouton);
  if (!titre || !message || !bouton) return null;
  return { titre, message, bouton };
}

export function normaliserManifeste(charge: unknown): ActionFiche[] {
  if (!charge || typeof charge !== "object") return [];
  const brut = (charge as Record<string, unknown>).actions;
  if (!Array.isArray(brut)) return [];
  return brut
    .map((a): ActionFiche | null => {
      if (!a || typeof a !== "object") return null;
      const action = a as Record<string, unknown>;
      const id = texte(action.id);
      const libelle = texte(action.libelle);
      if (!id || !libelle) return null;
      const icone = texte(action.icone);
      return {
        id,
        libelle,
        icone: ICONES.has(icone) ? icone : null,
        variante: action.variante === "danger" ? "danger" : "neutre",
        superAdmin: Boolean(action.super_admin),
        confirmation: normaliserConfirmation(action.confirmation),
        parametres: Array.isArray(action.parametres)
          ? action.parametres
            .map(normaliserParametre)
            .filter((p): p is ParametreAction => p !== null)
          : [],
      };
    })
    .filter((a): a is ActionFiche => a !== null);
}

export function trouverAction(actions: ActionFiche[], id: unknown): ActionFiche | null {
  if (typeof id !== "string") return null;
  return actions.find((a) => a.id === id) ?? null;
}
