// « Tester mon site » : la page publique /tester parle à l'EF baikal-test.
// Aucune session : la clé anon seule (verify_jwt off côté EF), comme la
// landing avec baikal-demande.
//
// La connexion du prospect ne vit que dans la mémoire de la page et dans le
// corps de la requête : elle n'est écrite ni dans l'URL, ni dans le stockage du
// navigateur, ni côté Baikal (l'EF n'en garde qu'une empreinte).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Surcharge de développement : faire parler la page à un service local joué
// sur un Postgres jetable. Jamais définie en production.
const ADRESSE = import.meta.env.VITE_BAIKAL_TEST_URL || `${supabaseUrl}/functions/v1/baikal-test`;

async function appeler(corps) {
  try {
    const reponse = await fetch(ADRESSE, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const json = await reponse.json().catch(() => ({}));
    if (!reponse.ok || json.error) {
      return { data: null, error: new Error(json.error || `Le test n'a pas répondu (HTTP ${reponse.status}).`) };
    }
    return { data: json.data, error: null };
  } catch {
    return { data: null, error: new Error("Le test n'a pas répondu : vérifiez votre connexion à Internet.") };
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
  // Rouvre le dernier résultat par son lien privé.
  resultat(jeton) {
    return appeler({ action: 'resultat', jeton });
  },
};
