/**
 * Tests pour errors.js - Classes d'erreurs personnalisées
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AppError,
  AuthError,
  APIError,
  ValidationError,
  NetworkError,
  StorageError,
  getSupabaseErrorMessage,
  handleError,
  isRetryableError,
  logError,
} from '../errors'

describe('Classes d\'erreurs', () => {
  describe('AppError', () => {
    it('devrait créer une erreur avec message, code et details', () => {
      const error = new AppError('Test error', 'TEST_CODE', { extra: 'data' })

      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_CODE')
      expect(error.details).toEqual({ extra: 'data' })
      expect(error.name).toBe('AppError')
      expect(error.timestamp).toBeDefined()
    })

    it('devrait utiliser les valeurs par défaut', () => {
      const error = new AppError('Test error')

      expect(error.code).toBe('APP_ERROR')
      expect(error.details).toEqual({})
    })

    it('devrait être une instance de Error', () => {
      const error = new AppError('Test')
      expect(error).toBeInstanceOf(Error)
    })

    it('devrait implémenter toJSON()', () => {
      const error = new AppError('Test error', 'TEST_CODE', { extra: 'data' })
      const json = error.toJSON()

      expect(json).toEqual({
        name: 'AppError',
        message: 'Test error',
        code: 'TEST_CODE',
        details: { extra: 'data' },
        timestamp: error.timestamp,
      })
    })
  })

  describe('AuthError', () => {
    it('devrait créer une erreur d\'authentification', () => {
      const error = new AuthError('Session expirée', 'SESSION_EXPIRED')

      expect(error.name).toBe('AuthError')
      expect(error.message).toBe('Session expirée')
      expect(error.code).toBe('SESSION_EXPIRED')
    })

    it('devrait utiliser le code par défaut AUTH_ERROR', () => {
      const error = new AuthError('Erreur auth')
      expect(error.code).toBe('AUTH_ERROR')
    })

    it('devrait être une instance de AppError', () => {
      const error = new AuthError('Test')
      expect(error).toBeInstanceOf(AppError)
    })
  })

  describe('APIError', () => {
    it('devrait créer une erreur API avec statusCode', () => {
      const error = new APIError('Not found', 'NOT_FOUND', 404, { endpoint: '/api/test' })

      expect(error.name).toBe('APIError')
      expect(error.message).toBe('Not found')
      expect(error.code).toBe('NOT_FOUND')
      expect(error.statusCode).toBe(404)
      expect(error.details).toEqual({ endpoint: '/api/test' })
    })

    it('devrait utiliser statusCode 500 par défaut', () => {
      const error = new APIError('Server error')
      expect(error.statusCode).toBe(500)
    })
  })

  describe('ValidationError', () => {
    it('devrait créer une erreur de validation avec fieldErrors', () => {
      const fieldErrors = {
        email: 'Email invalide',
        password: 'Mot de passe trop court',
      }
      const error = new ValidationError('Erreurs de validation', fieldErrors)

      expect(error.name).toBe('ValidationError')
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.fieldErrors).toEqual(fieldErrors)
      expect(error.details.fieldErrors).toEqual(fieldErrors)
    })

    it('devrait fonctionner sans fieldErrors', () => {
      const error = new ValidationError('Validation échouée')
      expect(error.fieldErrors).toEqual({})
    })
  })

  describe('NetworkError', () => {
    it('devrait créer une erreur réseau avec message par défaut', () => {
      const error = new NetworkError()

      expect(error.name).toBe('NetworkError')
      expect(error.message).toBe('Erreur de connexion réseau')
      expect(error.code).toBe('NETWORK_ERROR')
    })

    it('devrait accepter un message personnalisé', () => {
      const error = new NetworkError('Connexion perdue')
      expect(error.message).toBe('Connexion perdue')
    })
  })

  describe('StorageError', () => {
    it('devrait créer une erreur de stockage', () => {
      const error = new StorageError('Upload échoué', 'UPLOAD_FAILED', { file: 'test.pdf' })

      expect(error.name).toBe('StorageError')
      expect(error.message).toBe('Upload échoué')
      expect(error.code).toBe('UPLOAD_FAILED')
    })
  })
})

describe('getSupabaseErrorMessage()', () => {
  it('devrait retourner un message par défaut si error est null', () => {
    expect(getSupabaseErrorMessage(null)).toBe('Une erreur inconnue est survenue.')
  })

  it('devrait retourner un message par défaut si error est undefined', () => {
    expect(getSupabaseErrorMessage(undefined)).toBe('Une erreur inconnue est survenue.')
  })

  describe('erreurs auth par code', () => {
    it('devrait mapper invalid_credentials', () => {
      const error = { code: 'invalid_credentials' }
      expect(getSupabaseErrorMessage(error)).toBe('Email ou mot de passe incorrect.')
    })

    it('devrait mapper email_not_confirmed', () => {
      const error = { code: 'email_not_confirmed' }
      expect(getSupabaseErrorMessage(error)).toBe('Veuillez confirmer votre email avant de vous connecter.')
    })

    it('devrait mapper email_exists', () => {
      const error = { code: 'email_exists' }
      expect(getSupabaseErrorMessage(error)).toBe('Un compte existe déjà avec cet email.')
    })

    it('devrait mapper over_request_rate_limit', () => {
      const error = { code: 'over_request_rate_limit' }
      expect(getSupabaseErrorMessage(error)).toBe('Trop de tentatives. Veuillez réessayer plus tard.')
    })
  })

  describe('erreurs DB par code', () => {
    it('devrait mapper PGRST116 (no rows)', () => {
      const error = { code: 'PGRST116' }
      expect(getSupabaseErrorMessage(error)).toBe('Aucune donnée trouvée.')
    })

    it('devrait mapper 23505 (unique violation)', () => {
      const error = { code: '23505' }
      expect(getSupabaseErrorMessage(error)).toBe('Cette entrée existe déjà.')
    })

    it('devrait mapper 42501 (permission denied)', () => {
      const error = { code: '42501' }
      expect(getSupabaseErrorMessage(error)).toBe('Permission refusée.')
    })
  })

  describe('erreurs par message', () => {
    it('devrait détecter invalid login credentials', () => {
      const error = { message: 'Invalid login credentials' }
      expect(getSupabaseErrorMessage(error)).toBe('Email ou mot de passe incorrect.')
    })

    it('devrait détecter email not confirmed', () => {
      const error = { message: 'Email not confirmed' }
      expect(getSupabaseErrorMessage(error)).toBe('Veuillez confirmer votre email.')
    })

    it('devrait détecter user already registered', () => {
      const error = { message: 'User already registered' }
      expect(getSupabaseErrorMessage(error)).toBe('Un compte existe déjà avec cet email.')
    })

    it('devrait détecter jwt expired', () => {
      const error = { message: 'JWT expired' }
      expect(getSupabaseErrorMessage(error)).toBe('Votre session a expiré. Veuillez vous reconnecter.')
    })

    it('devrait détecter network error', () => {
      const error = { message: 'network error occurred' }
      expect(getSupabaseErrorMessage(error)).toBe('Erreur de connexion. Vérifiez votre connexion internet.')
    })

    it('devrait détecter rate limit', () => {
      const error = { message: 'Rate limit exceeded' }
      expect(getSupabaseErrorMessage(error)).toBe('Trop de tentatives. Veuillez patienter quelques minutes.')
    })

    it('devrait détecter permission denied', () => {
      const error = { message: 'Permission denied for table' }
      expect(getSupabaseErrorMessage(error)).toBe('Vous n\'avez pas les droits pour effectuer cette action.')
    })
  })

  it('devrait retourner le message original si non mappé', () => {
    const error = { message: 'Custom error message' }
    expect(getSupabaseErrorMessage(error)).toBe('Custom error message')
  })
})

describe('handleError()', () => {
  it('devrait gérer AppError', () => {
    const error = new AppError('Test error', 'TEST_CODE')
    const result = handleError(error)

    expect(result.message).toBe('Test error')
    expect(result.code).toBe('TEST_CODE')
    expect(result.isRetryable).toBe(false)
  })

  it('devrait gérer NetworkError comme retryable', () => {
    const error = new NetworkError()
    const result = handleError(error)

    expect(result.code).toBe('NETWORK_ERROR')
    expect(result.isRetryable).toBe(true)
  })

  it('devrait gérer les erreurs Supabase avec code', () => {
    const error = { code: 'invalid_credentials', message: 'Bad credentials' }
    const result = handleError(error)

    expect(result.message).toBe('Email ou mot de passe incorrect.')
    expect(result.code).toBe('invalid_credentials')
  })

  it('devrait gérer les erreurs Supabase avec error_code', () => {
    const error = { error_code: 'email_exists', message: 'Email exists' }
    const result = handleError(error)

    expect(result.message).toBe('Un compte existe déjà avec cet email.')
    expect(result.code).toBe('email_exists')
  })

  it('devrait gérer les TypeError fetch', () => {
    const error = new TypeError('fetch failed')
    const result = handleError(error)

    expect(result.message).toBe('Erreur de connexion. Vérifiez votre connexion internet.')
    expect(result.code).toBe('NETWORK_ERROR')
    expect(result.isRetryable).toBe(true)
  })

  it('devrait gérer les erreurs inconnues', () => {
    const error = { foo: 'bar' }
    const result = handleError(error)

    expect(result.code).toBe('UNKNOWN_ERROR')
    expect(result.isRetryable).toBe(false)
  })

  it('devrait gérer les erreurs avec message simple', () => {
    const error = { message: 'Something went wrong' }
    const result = handleError(error)

    expect(result.message).toBe('Something went wrong')
  })
})

describe('isRetryableError()', () => {
  it('devrait retourner true pour NETWORK_ERROR', () => {
    expect(isRetryableError({ code: 'NETWORK_ERROR' })).toBe(true)
  })

  it('devrait retourner true pour over_request_rate_limit', () => {
    expect(isRetryableError({ code: 'over_request_rate_limit' })).toBe(true)
  })

  it('devrait retourner true pour over_email_send_rate_limit', () => {
    expect(isRetryableError({ code: 'over_email_send_rate_limit' })).toBe(true)
  })

  it('devrait retourner true pour PGRST116', () => {
    expect(isRetryableError({ code: 'PGRST116' })).toBe(true)
  })

  it('devrait retourner false pour les autres codes', () => {
    expect(isRetryableError({ code: 'UNKNOWN_ERROR' })).toBe(false)
    expect(isRetryableError({ code: 'AUTH_ERROR' })).toBe(false)
  })

  it('devrait gérer error_code', () => {
    expect(isRetryableError({ error_code: 'NETWORK_ERROR' })).toBe(true)
  })

  it('devrait gérer les erreurs sans code', () => {
    expect(isRetryableError({})).toBe(false)
    expect(isRetryableError(null)).toBe(false)
  })
})

describe('logError()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('devrait logger l\'erreur dans la console', () => {
    const error = new AppError('Test', 'TEST')
    logError(error)

    expect(console.error).toHaveBeenCalledWith('[Error]', expect.objectContaining({
      name: 'AppError',
      message: 'Test',
      code: 'TEST',
    }))
  })

  it('devrait inclure le contexte', () => {
    const error = new Error('Test')
    logError(error, { userId: '123', action: 'login' })

    expect(console.error).toHaveBeenCalledWith('[Error]', expect.objectContaining({
      context: { userId: '123', action: 'login' },
    }))
  })

  it('devrait inclure le timestamp', () => {
    const error = new Error('Test')
    logError(error)

    expect(console.error).toHaveBeenCalledWith('[Error]', expect.objectContaining({
      timestamp: expect.any(String),
    }))
  })
})
