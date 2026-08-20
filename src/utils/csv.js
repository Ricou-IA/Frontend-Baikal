// Parseur CSV minimal : separateur ; ou , (detecte sur l'en-tete), guillemets
// doubles, CRLF. Suffisant pour un export tabulaire propre ; pas un parseur
// general.
export function parseCsv(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lignes.length < 2) return { entetes: [], lignes: [] };
  const sep = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ';' : ',';

  function decouper(ligne) {
    const champs = [];
    let courant = '';
    let entreGuillemets = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (entreGuillemets) {
        if (c === '"' && ligne[i + 1] === '"') { courant += '"'; i++; }
        else if (c === '"') entreGuillemets = false;
        else courant += c;
      } else if (c === '"') {
        entreGuillemets = true;
      } else if (c === sep) {
        champs.push(courant); courant = '';
      } else {
        courant += c;
      }
    }
    champs.push(courant);
    return champs.map((x) => x.trim());
  }

  const entetes = decouper(lignes[0]).map((e) => e.toLowerCase());
  return {
    entetes,
    lignes: lignes.slice(1).map((l) => {
      const champs = decouper(l);
      const objet = {};
      entetes.forEach((e, i) => { objet[e] = champs[i] ?? ''; });
      return objet;
    }),
  };
}

// Mappe des en-tetes libres vers les champs prospect connus.
const ALIAS = {
  email: ['email', 'e-mail', 'mail', 'courriel'],
  nom: ['nom', 'lastname', 'last_name'],
  prenom: ['prenom', 'prénom', 'firstname', 'first_name'],
  entreprise: ['entreprise', 'societe', 'société', 'company', 'agence', 'name', 'raison_sociale'],
  telephone: ['telephone', 'téléphone', 'tel', 'phone'],
  site_web: ['site_web', 'site', 'website', 'url'],
  code_postal: ['code_postal', 'cp', 'zip', 'postal_code'],
};

export function versProspects(lignesBrutes) {
  return lignesBrutes.map((brut) => {
    const p = { donnees: {} };
    for (const [champ, alias] of Object.entries(ALIAS)) {
      const cle = alias.find((a) => a in brut && brut[a] !== '');
      if (cle) p[champ] = brut[cle];
    }
    for (const [cle, valeur] of Object.entries(brut)) {
      if (!Object.values(ALIAS).flat().includes(cle) && valeur !== '') {
        p.donnees[cle] = valeur;
      }
    }
    return p;
  }).filter((p) => p.email);
}
