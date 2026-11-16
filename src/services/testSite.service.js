// « Tester mon site » : la page publique /tester parle à l'EF baikal-test.
// Aucune session : la clé anon seule (verify_jwt off côté EF), comme la
// landing avec baikal-demande.
//
// La connexion du prospect ne vit que dans la mémoire de la page et dans le
// corps de la requête : elle n'est écrite ni dans l'URL, ni dans le stockage du
// navigateur, ni côté Baikal (l'EF n'en garde qu'une empreinte). Ce qui part
// est l'adresse du rôle baikal_reader, préparée par la page (adresse.ts) :
// jamais les identifiants d'administration que le prospect aurait collés.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Surcharge de développement : faire parler la page à un service local joué
// sur un Postgres jetable. Jamais définie en production.
// Exportée : elle entre dans le prompt, c'est l'agent du prospect qui l'appelle.
export const ADRESSE_TEST = import.meta.env.VITE_BAIKAL_TEST_URL || `${supabaseUrl}/functions/v1/baikal-test`;

async function appeler(corps) {
  try {
    const reponse = await fetch(ADRESSE_TEST, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const json = await reponse.json().catch(() => ({}));
    if (!reponse.ok || json.error) {
      return {
        data: null,
        statut: reponse.status,
        error: new Error(json.error || `Le test n'a pas répondu (HTTP ${reponse.status}).`),
      };
    }
    return { data: json.data, statut: reponse.status, error: null };
  } catch {
    // Pas de réponse lisible : coupure de réseau, ou fonction interrompue
    // avant d'avoir répondu. On ne sait pas lequel, et on le dit.
    return {
      data: null,
      statut: 0,
      error: new Error("Le test n'a pas répondu. Réessayez dans un instant ; si cela se répète, le problème est de notre côté."),
    };
  }
}

export const testSiteService = {
  // Lit la structure de la base (aucune donnée) et dit ce que Baikal y voit.
  diagnostiquer({ connexion, jeton, site_web }) {
    return appeler({ action: 'diagnostiquer', connexion, jeton, site_web });
  },
  // Le diagnostic, puis la recette contrôle par contrôle.
  tester({ connexion, jeton, site_web }) {
    return appeler({ action: 'tester', connexion, jeton, site_web });
  },
  // Ouvre le site dans la console : avec la session en cours si l'on est
  // connecté (`session`), sinon en créant un compte (`email`, `mot_de_passe`).
  ouvrir({ jeton, session, email, mot_de_passe, site_web }) {
    return appeler({ action: 'ouvrir', jeton, session, email, mot_de_passe, site_web });
  },
  // Relit le dernier résultat par son lien privé. `statut` 404 : rien n'a
  // encore été rangé sous ce jeton (l'agent n'a pas lancé le test).
  resultat(jeton) {
    return appeler({ action: 'resultat', jeton });
  },
};
