// L'adresse de connexion du prospect, préparée DANS SON NAVIGATEUR avant de
// partir vers baikal-test. PUR, sans dépendance : la page /tester l'importe
// tel quel (comme scriptRole), et il se teste sous Deno.
//
// Le prospect colle l'adresse telle que son hébergeur la donne — celle de son
// compte administrateur, souvent avec un repère à la place du mot de passe.
// La page en fait l'adresse du rôle baikal_reader :
//   - l'utilisateur devient baikal_reader (baikal_reader.<référence> sur le
//     pooler de Supabase, qui range les rôles par projet) ;
//   - le mot de passe devient celui que la page a tiré pour le script du rôle.
// Il n'assemble rien, ne recopie aucun mot de passe, et un mot de passe
// administrateur collé par mégarde ne quitte jamais son navigateur.
//
// Une adresse qui porte déjà baikal_reader et un vrai mot de passe est laissée
// telle quelle : celui qui l'a écrite sait ce qu'il fait.

export type AdressePreparee =
  | {
    ok: true;
    // Ce qui part vers baikal-test.
    connexion: string;
    // La même, mot de passe masqué : ce que la page montre.
    apercu: string;
    remplace: { utilisateur: boolean; motDePasse: boolean };
    conseil: string | null;
  }
  | { ok: false; erreur: string };

const ROLE = "baikal_reader";
const MASQUE = "••••••";
const FORME = "Collez l'adresse de connexion de votre base : elle commence par postgresql://";

// Ce que les hébergeurs écrivent à la place du mot de passe.
function estUnRepere(motDePasse: string | null): boolean {
  if (motDePasse === null || motDePasse === "") return true;
  let clair = motDePasse;
  try {
    clair = decodeURIComponent(motDePasse);
  } catch {
    // Mal encodé : on le juge tel qu'il est écrit.
  }
  return /^\[.*\]$|^<.*>$|^\{.*\}$/.test(clair) ||
    /^(your[-_ ]?password|password|mot[-_ ]?de[-_ ]?passe)$/i.test(clair);
}

interface Morceaux {
  schema: string;
  utilisateur: string;
  motDePasse: string | null;
  // Tout ce qui suit le @ : hôte, port, base, options.
  suite: string;
  hote: string;
}

function decouper(adresse: string): Morceaux {
  const [, schema, reste] = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(adresse)!;
  // L'hôte se lit après le DERNIER @ : un mot de passe peut en contenir.
  const arobase = reste.lastIndexOf("@");
  const identifiants = arobase < 0 ? "" : reste.slice(0, arobase);
  const suite = arobase < 0 ? reste : reste.slice(arobase + 1);
  const deuxPoints = identifiants.indexOf(":");
  return {
    schema,
    utilisateur: deuxPoints < 0 ? identifiants : identifiants.slice(0, deuxPoints),
    motDePasse: deuxPoints < 0 ? null : identifiants.slice(deuxPoints + 1),
    suite,
    hote: suite.split(/[/?#]/)[0].replace(/:\d+$/, "").toLowerCase(),
  };
}

const assembler = (m: Morceaux, utilisateur: string, motDePasse: string | null) =>
  `${m.schema}://${utilisateur}${motDePasse === null ? "" : `:${motDePasse}`}${utilisateur || motDePasse !== null ? "@" : ""}${m.suite}`;

export function preparerAdresse(saisie: string, motDePasse: string | null): AdressePreparee {
  // L'adresse se retrouve dans ce qui l'entoure : guillemets, `psql '…'`,
  // `DATABASE_URL=…`. Postgres d'abord, sinon la première adresse venue.
  const trouvee = /postgres(?:ql)?:\/\/[^\s"'`]+/i.exec(saisie) ?? /[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/i.exec(saisie);
  if (!trouvee) return { ok: false, erreur: FORME };
  const m = decouper(trouvee[0]);
  const masquee = (utilisateur: string, mdp: string | null) => assembler(m, utilisateur, mdp === null ? null : MASQUE);

  // Une autre base part telle quelle : c'est Baikal qui dit, en clair, qu'il
  // ne lit que Postgres.
  if (!/^postgres(ql)?$/i.test(m.schema)) {
    return {
      ok: true,
      connexion: trouvee[0],
      apercu: masquee(m.utilisateur, m.motDePasse),
      remplace: { utilisateur: false, motDePasse: false },
      conseil: null,
    };
  }

  const dejaBaikal = /^baikal_reader(\.|$)/i.test(m.utilisateur);
  const repere = estUnRepere(m.motDePasse);
  if (dejaBaikal && !repere) {
    return {
      ok: true,
      connexion: trouvee[0],
      apercu: masquee(m.utilisateur, m.motDePasse),
      remplace: { utilisateur: false, motDePasse: false },
      conseil: null,
    };
  }
  if (!motDePasse) {
    return {
      ok: false,
      erreur: "Il manque le mot de passe du rôle : exécutez d'abord le script de l'étape 1, puis recollez l'adresse.",
    };
  }

  // Le pooler de Supabase range les rôles par projet : postgres.<référence>
  // devient baikal_reader.<référence>. Partout ailleurs, baikal_reader seul.
  const reference = /\.pooler\.supabase\.com$/.test(m.hote) ? /^[^.]+\.([a-z0-9]+)$/i.exec(m.utilisateur)?.[1] : undefined;
  const utilisateur = dejaBaikal ? m.utilisateur : reference ? `${ROLE}.${reference}` : ROLE;
  return {
    ok: true,
    connexion: assembler(m, utilisateur, motDePasse),
    apercu: masquee(utilisateur, motDePasse),
    remplace: { utilisateur: !dejaBaikal, motDePasse: true },
    conseil: /^db\.[a-z0-9]+\.supabase\.co$/.test(m.hote)
      ? "C'est l'adresse directe de Supabase, parfois injoignable de l'extérieur : si la connexion échoue, prenez celle de « Session pooler »."
      : null,
  };
}
