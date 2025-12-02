/**
 * Messages et textes - Core RAG Engine
 * ============================================================================
 * Messages d'erreur, de succès et textes UI centralisés.
 * Facilite la traduction future et la cohérence des messages.
 * ============================================================================
 */

// ============================================
// MESSAGES D'ERREUR
// ============================================

/**
 * Messages d'erreur génériques
 * @type {Object}
 */
export const ERROR_MESSAGES = Object.freeze({
    // Erreurs génériques
    GENERIC: 'Une erreur est survenue. Veuillez réessayer.',
    NETWORK: 'Erreur de connexion. Vérifiez votre connexion internet.',
    TIMEOUT: 'La requête a expiré. Veuillez réessayer.',
    NOT_FOUND: 'Ressource non trouvée.',
    UNAUTHORIZED: 'Vous n\'êtes pas autorisé à effectuer cette action.',
    FORBIDDEN: 'Accès refusé.',
    
    // Erreurs d'authentification
    AUTH: {
      INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
      EMAIL_NOT_CONFIRMED: 'Veuillez confirmer votre email avant de vous connecter.',
      USER_NOT_FOUND: 'Aucun compte associé à cet email.',
      EMAIL_ALREADY_EXISTS: 'Un compte existe déjà avec cet email.',
      WEAK_PASSWORD: 'Le mot de passe doit contenir au moins 8 caractères.',
      SESSION_EXPIRED: 'Votre session a expiré. Veuillez vous reconnecter.',
      NOT_AUTHENTICATED: 'Veuillez vous connecter pour continuer.',
      OAUTH_FAILED: 'Erreur lors de la connexion avec Google.',
    },
    
    // Erreurs de profil
    PROFILE: {
      NOT_FOUND: 'Profil utilisateur non trouvé.',
      UPDATE_FAILED: 'Erreur lors de la mise à jour du profil.',
      ONBOARDING_FAILED: 'Erreur lors de la finalisation de l\'inscription.',
    },
    
    // Erreurs d'organisation
    ORGANIZATION: {
      NOT_FOUND: 'Organisation non trouvée.',
      ALREADY_MEMBER: 'Cet utilisateur est déjà membre de l\'organisation.',
      INVITE_FAILED: 'Erreur lors de l\'envoi de l\'invitation.',
      REMOVE_FAILED: 'Erreur lors de la suppression du membre.',
      LAST_ADMIN: 'Impossible de supprimer le dernier administrateur.',
      NAME_REQUIRED: 'Le nom de l\'organisation est requis.',
    },
    
    // Erreurs d'upload
    UPLOAD: {
      FILE_TOO_LARGE: 'Fichier trop volumineux. Maximum: {maxSize} MB.',
      INVALID_TYPE: 'Type de fichier non supporté.',
      FAILED: 'Erreur lors de l\'upload du fichier.',
      BUCKET_NOT_FOUND: 'Bucket de stockage non configuré. Contactez l\'administrateur.',
      DUPLICATE: 'Ce fichier existe déjà. Veuillez le renommer.',
      SUPABASE_NOT_CONFIGURED: 'Client Supabase non configuré.',
    },
    
    // Erreurs du chat RAG
    CHAT: {
      SEND_FAILED: 'Erreur lors de l\'envoi du message.',
      API_UNAVAILABLE: 'Service temporairement indisponible.',
      EMPTY_MESSAGE: 'Le message ne peut pas être vide.',
      MESSAGE_TOO_LONG: 'Le message est trop long. Maximum: {maxLength} caractères.',
    },
    
    // Erreurs audio
    AUDIO: {
      MICROPHONE_DENIED: 'Accès au microphone refusé. Veuillez autoriser l\'accès.',
      RECORDING_FAILED: 'Erreur lors de l\'enregistrement.',
      PROCESSING_FAILED: 'Erreur lors du traitement de l\'audio.',
      FORMAT_NOT_SUPPORTED: 'Format audio non supporté par votre navigateur.',
    },
    
    // Erreurs de validation
    VALIDATION: {
      REQUIRED_FIELD: 'Ce champ est requis.',
      INVALID_EMAIL: 'Adresse email invalide.',
      PASSWORDS_DONT_MATCH: 'Les mots de passe ne correspondent pas.',
      MIN_LENGTH: 'Minimum {min} caractères requis.',
      MAX_LENGTH: 'Maximum {max} caractères autorisés.',
    },
  });
  
  // ============================================
  // MESSAGES DE SUCCÈS
  // ============================================
  
  /**
   * Messages de succès
   * @type {Object}
   */
  export const SUCCESS_MESSAGES = Object.freeze({
    // Authentification
    AUTH: {
      LOGIN: 'Connexion réussie !',
      LOGOUT: 'Déconnexion réussie.',
      SIGNUP: 'Compte créé ! Vérifiez votre email.',
      PASSWORD_RESET_SENT: 'Email de réinitialisation envoyé.',
      PASSWORD_UPDATED: 'Mot de passe mis à jour avec succès.',
    },
    
    // Profil
    PROFILE: {
      UPDATED: 'Profil mis à jour avec succès.',
      ONBOARDING_COMPLETE: 'Bienvenue ! Votre compte est prêt.',
    },
    
    // Organisation
    ORGANIZATION: {
      CREATED: 'Organisation créée avec succès.',
      UPDATED: 'Organisation mise à jour.',
      MEMBER_INVITED: 'Invitation envoyée à {email}.',
      MEMBER_REMOVED: 'Membre supprimé de l\'organisation.',
      ROLE_UPDATED: 'Rôle mis à jour.',
    },
    
    // Upload
    UPLOAD: {
      DOCUMENT: 'Document uploadé avec succès !',
      INVOICE: 'Facture uploadée avec succès !',
      AUDIO: 'Audio traité avec succès !',
      INDEXING: 'Indexation en cours...',
    },
    
    // Chat
    CHAT: {
      MESSAGE_SENT: 'Message envoyé.',
    },
  });
  
  // ============================================
  // TEXTES UI
  // ============================================
  
  /**
   * Textes d'interface utilisateur
   * @type {Object}
   */
  export const UI_TEXT = Object.freeze({
    // Boutons communs
    BUTTONS: {
      SUBMIT: 'Valider',
      CANCEL: 'Annuler',
      SAVE: 'Enregistrer',
      DELETE: 'Supprimer',
      EDIT: 'Modifier',
      CLOSE: 'Fermer',
      RETRY: 'Réessayer',
      BACK: 'Retour',
      NEXT: 'Suivant',
      PREVIOUS: 'Précédent',
      CONFIRM: 'Confirmer',
      LOADING: 'Chargement...',
      SEND: 'Envoyer',
      UPLOAD: 'Uploader',
      DOWNLOAD: 'Télécharger',
    },
    
    // Titres de pages
    PAGES: {
      LOGIN: 'Connexion',
      SIGNUP: 'Inscription',
      DASHBOARD: 'Tableau de bord',
      SETTINGS: 'Paramètres',
      ADMIN: 'Administration',
      ONBOARDING: 'Bienvenue',
    },
    
    // Labels de formulaires
    FORMS: {
      EMAIL: 'Email',
      PASSWORD: 'Mot de passe',
      CONFIRM_PASSWORD: 'Confirmer le mot de passe',
      FULL_NAME: 'Nom complet',
      ORGANIZATION_NAME: 'Nom de l\'organisation',
      ROLE: 'Rôle',
    },
    
    // Placeholders
    PLACEHOLDERS: {
      EMAIL: 'votre@email.com',
      PASSWORD: '••••••••',
      SEARCH: 'Rechercher...',
      MESSAGE: 'Écrivez votre message...',
      ORGANIZATION_NAME: 'Nom de votre organisation',
    },
    
    // États vides
    EMPTY_STATES: {
      NO_DOCUMENTS: 'Aucun document pour le moment.',
      NO_MESSAGES: 'Commencez une conversation.',
      NO_MEMBERS: 'Aucun membre dans l\'organisation.',
      NO_RESULTS: 'Aucun résultat trouvé.',
    },
    
    // Confirmations
    CONFIRMATIONS: {
      DELETE_MEMBER: 'Êtes-vous sûr de vouloir supprimer ce membre ?',
      DELETE_DOCUMENT: 'Êtes-vous sûr de vouloir supprimer ce document ?',
      LOGOUT: 'Êtes-vous sûr de vouloir vous déconnecter ?',
    },
  });
  
  // ============================================
  // MESSAGES DU CHAT
  // ============================================
  
  /**
   * Messages système du chat RAG
   * @type {Object}
   */
  export const CHAT_MESSAGES = Object.freeze({
    WELCOME: 'Bonjour ! Je suis votre assistant IA. Posez-moi vos questions sur vos documents.',
    THINKING: 'Réflexion en cours...',
    NO_CONTEXT: 'Je n\'ai pas trouvé d\'informations pertinentes dans vos documents pour répondre à cette question.',
    DEMO_RESPONSE: 'Ceci est une réponse de démonstration. Connectez l\'API pour des réponses réelles.',
    ERROR: 'Désolé, une erreur est survenue. Veuillez réessayer.',
  });
  
  // ============================================
  // HELPERS
  // ============================================
  
  /**
   * Remplace les variables dans un message
   * @param {string} message - Message avec variables {var}
   * @param {Object} variables - Objet clé/valeur des variables
   * @returns {string}
   * 
   * @example
   * formatMessage('Maximum: {maxSize} MB', { maxSize: 20 })
   * // "Maximum: 20 MB"
   */
  export const formatMessage = (message, variables = {}) => {
    return Object.entries(variables).reduce((msg, [key, value]) => {
      return msg.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }, message);
  };
  
  /**
   * Récupère un message d'erreur Supabase traduit
   * @param {Object} error - Erreur Supabase
   * @returns {string}
   */
  export const getSupabaseErrorMessage = (error) => {
    const errorMap = {
      'Invalid login credentials': ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS,
      'Email not confirmed': ERROR_MESSAGES.AUTH.EMAIL_NOT_CONFIRMED,
      'User not found': ERROR_MESSAGES.AUTH.USER_NOT_FOUND,
      'User already registered': ERROR_MESSAGES.AUTH.EMAIL_ALREADY_EXISTS,
      'Password should be at least 6 characters': ERROR_MESSAGES.AUTH.WEAK_PASSWORD,
      'JWT expired': ERROR_MESSAGES.AUTH.SESSION_EXPIRED,
    };
    
    const message = error?.message || error?.error_description || '';
    return errorMap[message] || message || ERROR_MESSAGES.GENERIC;
  };
  