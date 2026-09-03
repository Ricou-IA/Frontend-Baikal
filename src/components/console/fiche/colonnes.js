/**
 * colonnes.js - Baikal Console
 * ============================================================================
 * Description des colonnes de chaque onglet de type liste. C'est la seule
 * connaissance "metier" du front, et elle ne parle que du contrat commun :
 * aucun nom de table ni de produit n'apparait ici.
 *
 * Une colonne dont la cle est absente de la ligne n'est pas rendue : c'est la
 * regle "pas de colonne, pas de section" appliquee cote affichage.
 * ============================================================================
 */
export const COLONNES = {
  documents: [
    { cle: 'libelle', libelle: 'Pièce' },
    { cle: 'type', libelle: 'Type', format: 'mono' },
    { cle: 'nature', libelle: 'Nature' },
    { cle: 'pages', libelle: 'Pages', format: 'nombre' },
    { cle: 'taille_octets', libelle: 'Taille', format: 'octets' },
    { cle: 'depose_le', libelle: 'Déposé le', format: 'datetime' },
    { cle: 'source', libelle: 'Source' },
    { cle: 'statut', libelle: 'Statut' },
  ],
  resultats: [
    { cle: 'libelle', libelle: 'Livrable' },
    { cle: 'nature', libelle: 'Nature' },
    { cle: 'version', libelle: 'Version', format: 'nombre' },
    { cle: 'produit_le', libelle: 'Produit le', format: 'datetime' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'consulte_le', libelle: 'Consulté le', format: 'datetime' },
    { cle: 'telechargements', libelle: 'Téléch.', format: 'nombre' },
    { cle: 'url_publique', libelle: 'Lien', format: 'lien' },
  ],
  emails: [
    { cle: 'envoye_le', libelle: 'Envoyé le', format: 'datetime' },
    { cle: 'sujet', libelle: 'Sujet' },
    { cle: 'destinataire', libelle: 'Destinataire' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'ouvert_le', libelle: 'Ouvert le', format: 'datetime' },
    { cle: 'erreur', libelle: 'Erreur' },
  ],
  ia: [
    { cle: 'survenu_le', libelle: 'Date', format: 'datetime' },
    { cle: 'modele', libelle: 'Modèle', format: 'mono' },
    { cle: 'operation', libelle: 'Opération' },
    { cle: 'tokens_total', libelle: 'Tokens', format: 'nombre' },
    { cle: 'cout_usd', libelle: 'Coût', format: 'dollar' },
    { cle: 'latence_ms', libelle: 'Latence', format: 'nombre' },
    { cle: 'statut', libelle: 'Statut' },
    { cle: 'erreur', libelle: 'Erreur' },
  ],
};

// Libelles et rendu de chaque onglet. L'ordre de ce tableau est l'ordre a
// l'ecran : produit, entree, sortie, ce qu'on a envoye, ce qu'il a dit, les
// coulisses, le brut, le parcours.
export const ONGLETS_FICHE = [
  { cle: 'vue', libelle: 'Vue', rendu: 'fiche' },
  { cle: 'documents', libelle: 'Documents', rendu: 'liste' },
  { cle: 'resultats', libelle: 'Résultat', rendu: 'liste' },
  { cle: 'emails', libelle: 'Emails', rendu: 'liste' },
  { cle: 'chat', libelle: 'Chat', rendu: 'conversation' },
  { cle: 'ia', libelle: 'Logs IA', rendu: 'liste' },
  { cle: 'donnees', libelle: 'Données', rendu: 'blocs' },
  { cle: 'events', libelle: 'Events', rendu: 'timeline' },
];
