// baikal-test : le déroulé d'un diagnostic, d'un test et d'une relecture.
//
// Tout ce qui touche le monde (connexion Postgres, DNS, table
// admin.tests_site, horloge) est passé en paramètre : le déroulé se teste sans
// réseau, et index.ts ne fait que brancher les vraies dépendances.
//
// Ce qui est gardé d'un passage : le diagnostic, le dernier rapport, une
// empreinte de l'hôte. Ce qui ne l'est jamais : la connexion.
import { type Lecteur, recetter, SQL_ROLE } from "../_shared/recette/controles.ts";
import { CONTRATS, MANIFESTES } from "../_shared/recette/contrats.gen.ts";
import { fabriquerPrompt } from "../_shared/recette/prompt.ts";
import type { Rapport } from "../_shared/recette/resultat.ts";
import { type Diagnostic, diagnostiquer, LIMITE_CATALOGUE, lireCatalogue, sqlCatalogue } from "../_shared/recette/structure.ts";
import { type Connexion, empreinte, ipInterdite, jetonValide, lireConnexion, messageConnexion, nouveauJeton } from "./garde.ts";

export interface LigneTest {
  jeton: string;
  cree_le: string;
  teste_le: string | null;
  expire_le: string;
  hote_empreinte: string;
  diagnostic: Diagnostic | null;
  resultat: Rapport | null;
  niveau1_pret: boolean | null;
  tests: number;
}

export interface Deps {
  ouvrir(connexion: Connexion): Promise<{ lecteur: Lecteur; fermer(): Promise<void> }>;
  // Les adresses vers lesquelles le nom résout.
  resoudre(hote: string): Promise<string[]>;
  depot: {
    lire(jeton: string): Promise<LigneTest | null>;
    ecrire(ligne: LigneTest): Promise<void>;
  };
  trop(ip: string, maintenant: number): boolean;
  maintenant(): number;
  // Sel de l'empreinte de l'hôte : un secret du projet.
  sel: string;
  // Origine de la page publique, pour le lien privé.
  site: string;
  // Où en est le passage, en un mot sans secret : journalisé par index.ts, et
  // redit dans l'erreur quand le passage ne va pas au bout.
  trace?(etape: string): void;
}

export interface Reponse {
  statut: number;
  data: unknown;
  error: string | null;
}

const CONSERVATION_MS = 30 * 86_400_000;
// 10 s pour se connecter, 5 s par requête (posés par `ouvrir`), et ce budget
// pour la recette : le test entier tient en 60 s.
const BUDGET_RECETTE_MS = 45_000;

const refus = (statut: number, error: string): Reponse => ({ statut, data: null, error });
const iso = (ms: number) => new Date(ms).toISOString();

function sortie(ligne: LigneTest, site: string, tronque?: boolean) {
  return {
    jeton: ligne.jeton,
    diagnostic: ligne.diagnostic,
    rapport: ligne.resultat,
    prompt: ligne.diagnostic
      ? fabriquerPrompt({
        diagnostic: ligne.diagnostic,
        manifestes: MANIFESTES,
        contrats: CONTRATS,
        rapport: ligne.resultat,
        urlTest: `${site}/tester/r/${ligne.jeton}`,
      })
      : null,
    teste_le: ligne.teste_le,
    expire_le: ligne.expire_le,
    ...(tronque === undefined ? {} : { tronque }),
  };
}

// La réponse courte, pour un agent : il lance le test en boucle, et n'a que
// faire de 50 Ko de prompt à chaque passage. Le lien, le verdict, et ce qu'il
// reste à corriger avec la correction attendue.
function sortieCourte(ligne: LigneTest, site: string, tronque?: boolean) {
  const r = ligne.resultat;
  const d = ligne.diagnostic;
  return {
    jeton: ligne.jeton,
    lien: `${site}/tester/r/${ligne.jeton}`,
    niveau1_pret: ligne.niveau1_pret,
    niveau2_pret: r ? r.resume.niveau2_pret : null,
    resume: r ? r.resume : null,
    a_corriger: r
      ? r.controles.filter((c) => c.bloquant && c.statut !== "non_mesure").map((c) => ({
        id: c.id,
        niveau: c.niveau,
        vue: c.vue,
        titre: c.titre,
        statut: c.statut,
        ref: c.ref,
        lignes: c.lignes,
        si_echec: c.si_echec,
        correction: c.correction,
        detail: c.detail,
        exemples: c.exemples,
      }))
      : [],
    non_mesures: r
      ? r.controles.filter((c) => c.statut === "non_mesure").map((c) => ({ id: c.id, niveau: c.niveau, titre: c.titre, detail: c.detail }))
      : [],
    diagnostic: d
      ? {
        table_principale: d.table_principale,
        schema_contrat: d.schema_contrat,
        vues_baikal: d.vues_baikal.map((v) => `${v.schema}.${v.nom}`),
        manques: d.manques.map((m) => m.phrase),
      }
      : null,
    teste_le: ligne.teste_le,
    expire_le: ligne.expire_le,
    ...(tronque === undefined ? {} : { tronque }),
  };
}

async function ligneValide(jeton: unknown, deps: Deps): Promise<LigneTest | null> {
  if (!jetonValide(jeton)) return null;
  const ligne = await deps.depot.lire(jeton);
  return ligne && Date.parse(ligne.expire_le) > deps.maintenant() ? ligne : null;
}

export async function traiter(corps: Record<string, unknown>, ip: string, deps: Deps): Promise<Reponse> {
  const action = String(corps.action ?? "");
  const trace = (etape: string) => deps.trace?.(etape);
  const rendre = corps.reponse === "courte" ? sortieCourte : sortie;

  if (action === "resultat") {
    if (!jetonValide(corps.jeton)) return refus(400, "Lien invalide.");
    const ligne = await ligneValide(corps.jeton, deps);
    if (!ligne) return refus(404, "Ce lien a expiré ou n'existe pas. Relancez un test.");
    return { statut: 200, data: rendre(ligne, deps.site), error: null };
  }

  if (action !== "diagnostiquer" && action !== "tester") return refus(400, `Action inconnue : ${action}`);

  // Piège à robots : un humain ne voit pas ce champ.
  if (typeof corps.site_web === "string" && corps.site_web.trim()) {
    return { statut: 200, data: { ok: true }, error: null };
  }
  if (deps.trop(ip, deps.maintenant())) return refus(429, "Trop de tests depuis cette adresse : réessayez dans une heure.");

  const lue = lireConnexion(corps.connexion);
  if (!lue.ok) return refus(400, lue.erreur);
  const connexion = lue.connexion;

  // Un nom public peut résoudre vers une adresse privée : chaque adresse
  // résolue est jugée comme si elle avait été saisie.
  let adresses: string[];
  trace("résolution du nom");
  try {
    adresses = await deps.resoudre(connexion.hote);
  } catch {
    return refus(400, "Hôte introuvable : vérifiez l'adresse.");
  }
  if (!adresses.length || adresses.some(ipInterdite)) {
    return refus(400, "Cette adresse n'est pas joignable depuis Baikal : il faut l'adresse publique de votre base.");
  }

  let diagnostic: Diagnostic;
  let tronque: boolean;
  let rapport: Rapport | null = null;
  trace("connexion à la base");
  const session = await deps.ouvrir(connexion);
  try {
    let catalogue, role;
    try {
      trace("lecture de la structure");
      catalogue = await session.lecteur(sqlCatalogue());
      [role] = await session.lecteur(SQL_ROLE);
    } catch (e) {
      return refus(502, messageConnexion(e));
    }
    trace("diagnostic");
    tronque = catalogue.length >= LIMITE_CATALOGUE;
    diagnostic = diagnostiquer(lireCatalogue(catalogue), { role: role?.existe === true });
    if (action === "tester") {
      trace("contrôles");
      try {
        rapport = await recetter({
          lecteur: session.lecteur,
          manifestes: MANIFESTES,
          schema: diagnostic.schema_contrat ?? diagnostic.table_principale?.schema ?? "public",
          // Un prospect n'a pas encore de funnel déclaré : son statut reste libre.
          funnel: null,
          delaiTotalMs: BUDGET_RECETTE_MS,
          maintenant: deps.maintenant,
        });
      } catch (e) {
        // Le catalogue a répondu, la recette non : la base a lâché en route,
        // ou son schéma porte un nom que le moteur refuse.
        return refus(502, e instanceof Error && e.message.startsWith("Schéma invalide")
          ? "Le schéma de vos vues porte un nom que Baikal ne sait pas lire (minuscules, chiffres et _ seulement)."
          : messageConnexion(e));
      }
    }
  } finally {
    trace("fermeture de la connexion");
    await session.fermer().catch(() => {});
  }

  trace("enregistrement du résultat");
  const maintenant = deps.maintenant();
  const existante = jetonValide(corps.jeton) ? await deps.depot.lire(corps.jeton) : null;
  const precedente = existante && Date.parse(existante.expire_le) > maintenant ? existante : null;
  const ligne: LigneTest = {
    // Le jeton peut venir de la page : elle le tire au hasard (128 bits), le
    // met dans le prompt, et attend que le test de l'agent s'y range. Celui
    // qui le présente le connaît déjà ; il ne peut rien lire qu'il n'ait écrit.
    // Un jeton déjà pris et expiré ne se réutilise pas : un nouveau est tiré.
    jeton: precedente?.jeton ?? (jetonValide(corps.jeton) && !existante ? corps.jeton : nouveauJeton()),
    cree_le: precedente?.cree_le ?? iso(maintenant),
    teste_le: rapport ? iso(maintenant) : precedente?.teste_le ?? null,
    expire_le: iso(maintenant + CONSERVATION_MS),
    hote_empreinte: await empreinte(connexion, deps.sel),
    diagnostic,
    // Un simple diagnostic ne perd pas le dernier résultat.
    resultat: rapport ?? precedente?.resultat ?? null,
    niveau1_pret: rapport ? rapport.resume.niveau1_pret : precedente?.niveau1_pret ?? null,
    tests: (precedente?.tests ?? 0) + (rapport ? 1 : 0),
  };
  await deps.depot.ecrire(ligne);
  trace("réponse");
  return { statut: 200, data: rendre(ligne, deps.site, tronque), error: null };
}
