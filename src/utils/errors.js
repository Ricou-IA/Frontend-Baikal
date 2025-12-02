/**
 * Erreurs personnalisées - Core RAG Engine
 * ============================================================================
 * Classes d'erreurs typées pour une gestion uniforme des erreurs.
 * 
 * @example
 * import { AuthError, APIError, ValidationError } from '@/utils/errors';
 * 
 * throw new AuthError('Session expirée', 'SESSION_EXPIRED');
 * ============================================================================
 */

/**
 * Classe de base pour toutes les erreurs de l'application
 */
export class AppError extends Error {
    constructor(message, code = 'APP_ERROR', details = {}) {
      super(message);
      this.name = 'AppError';
      this.code = code;
      this.details = details;
      this.timestamp = new Date().toISOString();
      
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }
  
    toJSON() {
      return {
        name: this.name,
        message: this.message,
        code: this.code,
        details: this.details,
        timestamp: this.timestamp,
      };
    }
  }
  
  export class AuthError extends AppError {
    constructor(message, code = 'AUTH_ERROR', details = {}) {
      super(message, code, details);
      this.name = 'AuthError';
    }
  }
  
  export class APIError extends AppError {
    constructor(message, code = 'API_ERROR', statusCode = 500, details = {}) {
      super(message, code, details);
      this.name = 'APIError';
      this.statusCode = statusCode;
    }
  }
  
  export class ValidationError extends AppError {
    constructor(message, fieldErrors = {}) {
      super(message, 'VALIDATION_ERROR', { fieldErrors });
      this.name = 'ValidationError';
      this.fieldErrors = fieldErrors;
    }
  }
  
  export class NetworkError extends AppError {
    constructor(message = 'Erreur de connexion réseau', details = {}) {
      super(message, 'NETWORK_ERROR', details);
      this.name = 'NetworkError';
    }
  }
  
  export class StorageError extends AppError {
    constructor(message, code = 'STORAGE_ERROR', details = {}) {
      super(message, code, details);
      this.name = 'StorageError';
    }
  }
  
  // ============================================================================
  // MAPPING DES ERREURS SUPABASE
  // ============================================================================
  
  const SUPABASE_AUTH_ERRORS = {
    'invalid_credentials': 'Email ou mot de passe incorrect.',
    'email_not_confirmed': 'Veuillez confirmer votre email avant de vous connecter.',
    'user_not_found': 'Aucun compte trouvé avec cet email.',
    'invalid_grant': 'Session invalide ou expirée.',
    'email_exists': 'Un compte existe déjà avec cet email.',
    'weak_password': 'Le mot de passe est trop faible.',
    'invalid_email': 'Adresse email invalide.',
    'signup_disabled': 'Les inscriptions sont désactivées.',
    'user_banned': 'Ce compte a été suspendu.',
    'over_request_rate_limit': 'Trop de tentatives. Veuillez réessayer plus tard.',
    'over_email_send_rate_limit': 'Trop d\'emails envoyés. Veuillez patienter.',
  };
  
  const SUPABASE_DB_ERRORS = {
    'PGRST116': 'Aucune donnée trouvée.',
    '23505': 'Cette entrée existe déjà.',
    '23503': 'Référence invalide.',
    '42501': 'Permission refusée.',
    '42P01': 'Table non trouvée.',
  };
  
  export function getSupabaseErrorMessage(error) {
    if (!error) return 'Une erreur inconnue est survenue.';
  
    const message = error.message?.toLowerCase() || '';
    const code = error.code || error.error_code || '';
  
    if (SUPABASE_AUTH_ERRORS[code]) {
      return SUPABASE_AUTH_ERRORS[code];
    }
  
    if (SUPABASE_DB_ERRORS[code]) {
      return SUPABASE_DB_ERRORS[code];
    }
  
    if (message.includes('invalid login credentials')) {
      return 'Email ou mot de passe incorrect.';
    }
    if (message.includes('email not confirmed')) {
      return 'Veuillez confirmer votre email.';
    }
    if (message.includes('user already registered')) {
      return 'Un compte existe déjà avec cet email.';
    }
    if (message.includes('jwt expired') || message.includes('token expired')) {
      return 'Votre session a expiré. Veuillez vous reconnecter.';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return 'Erreur de connexion. Vérifiez votre connexion internet.';
    }
    if (message.includes('rate limit')) {
      return 'Trop de tentatives. Veuillez patienter quelques minutes.';
    }
    if (message.includes('permission') || message.includes('denied')) {
      return 'Vous n\'avez pas les droits pour effectuer cette action.';
    }
  
    return error.message || 'Une erreur est survenue.';
  }
  
  // ============================================================================
  // HANDLER GLOBAL
  // ============================================================================
  
  export function handleError(error) {
    if (error instanceof AppError) {
      return {
        message: error.message,
        code: error.code,
        isRetryable: isRetryableError(error),
      };
    }
  
    if (error?.code || error?.error_code) {
      return {
        message: getSupabaseErrorMessage(error),
        code: error.code || error.error_code || 'SUPABASE_ERROR',
        isRetryable: isRetryableError(error),
      };
    }
  
    if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
      return {
        message: 'Erreur de connexion. Vérifiez votre connexion internet.',
        code: 'NETWORK_ERROR',
        isRetryable: true,
      };
    }
  
    return {
      message: error?.message || 'Une erreur inattendue est survenue.',
      code: 'UNKNOWN_ERROR',
      isRetryable: false,
    };
  }
  
  export function isRetryableError(error) {
    const retryableCodes = [
      'NETWORK_ERROR',
      'over_request_rate_limit',
      'over_email_send_rate_limit',
      'PGRST116',
    ];
  
    const code = error?.code || error?.error_code || '';
    return retryableCodes.includes(code);
  }
  
  export function logError(error, context = {}) {
    console.error('[Error]', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      context,
      timestamp: new Date().toISOString(),
    });
  }
  
  export default {
    AppError,
    AuthError,
    APIError,
    ValidationError,
    NetworkError,
    StorageError,
    handleError,
    getSupabaseErrorMessage,
    isRetryableError,
    logError,
  };
  