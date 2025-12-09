/**
 * Tests pour auth.service.js - Service d'authentification
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authService } from '../auth.service'

// Mock du client Supabase
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      refreshSession: vi.fn(),
    },
    rpc: vi.fn(),
  },
}))

import { supabase } from '../../lib/supabaseClient'

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('signIn()', () => {
    it('devrait retourner les données en cas de succès', async () => {
      const mockData = { user: { id: '123' }, session: { access_token: 'token' } }
      supabase.auth.signInWithPassword.mockResolvedValue({ data: mockData, error: null })

      const result = await authService.signIn('test@test.com', 'password123')

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password123',
      })
      expect(result).toEqual({ data: mockData, error: null })
    })

    it('devrait retourner une erreur en cas d\'échec', async () => {
      const mockError = new Error('Invalid credentials')
      supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: mockError })

      const result = await authService.signIn('test@test.com', 'wrongpassword')

      expect(result).toEqual({ data: null, error: mockError })
    })

    it('devrait gérer les exceptions', async () => {
      const mockError = new Error('Network error')
      supabase.auth.signInWithPassword.mockRejectedValue(mockError)

      const result = await authService.signIn('test@test.com', 'password123')

      expect(result).toEqual({ data: null, error: mockError })
    })
  })

  describe('signUp()', () => {
    it('devrait créer un compte avec email et password', async () => {
      const mockData = { user: { id: '123' } }
      supabase.auth.signUp.mockResolvedValue({ data: mockData, error: null })

      const result = await authService.signUp('new@test.com', 'password123')

      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@test.com',
        password: 'password123',
        options: { data: {} },
      })
      expect(result).toEqual({ data: mockData, error: null })
    })

    it('devrait passer les metadata', async () => {
      const mockData = { user: { id: '123' } }
      supabase.auth.signUp.mockResolvedValue({ data: mockData, error: null })

      const metadata = { full_name: 'Test User', role: 'user' }
      await authService.signUp('new@test.com', 'password123', metadata)

      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@test.com',
        password: 'password123',
        options: { data: metadata },
      })
    })

    it('devrait retourner une erreur si email existe', async () => {
      const mockError = { code: 'email_exists', message: 'User already registered' }
      supabase.auth.signUp.mockResolvedValue({ data: null, error: mockError })

      const result = await authService.signUp('existing@test.com', 'password123')

      expect(result).toEqual({ data: null, error: mockError })
    })
  })

  describe('signOut()', () => {
    it('devrait déconnecter l\'utilisateur', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: null })

      const result = await authService.signOut()

      expect(supabase.auth.signOut).toHaveBeenCalled()
      expect(result).toEqual({ error: null })
    })

    it('devrait retourner une erreur en cas d\'échec', async () => {
      const mockError = new Error('Signout failed')
      supabase.auth.signOut.mockResolvedValue({ error: mockError })

      const result = await authService.signOut()

      expect(result).toEqual({ error: mockError })
    })
  })

  describe('signInWithGoogle()', () => {
    it('devrait initier la connexion Google OAuth', async () => {
      const mockData = { url: 'https://google.com/oauth' }
      supabase.auth.signInWithOAuth.mockResolvedValue({ data: mockData, error: null })

      const result = await authService.signInWithGoogle()

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: expect.stringContaining('/dashboard'),
        },
      })
      expect(result).toEqual({ data: mockData, error: null })
    })

    it('devrait accepter une URL de redirection personnalisée', async () => {
      const mockData = { url: 'https://google.com/oauth' }
      supabase.auth.signInWithOAuth.mockResolvedValue({ data: mockData, error: null })

      await authService.signInWithGoogle('https://custom.com/callback')

      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://custom.com/callback',
        },
      })
    })
  })

  describe('resetPassword()', () => {
    it('devrait envoyer un email de réinitialisation', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

      const result = await authService.resetPassword('reset@test.com')

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'reset@test.com',
        { redirectTo: expect.stringContaining('/reset-password') }
      )
      expect(result).toEqual({ data: {}, error: null })
    })

    it('devrait accepter une URL de redirection personnalisée', async () => {
      supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

      await authService.resetPassword('reset@test.com', 'https://custom.com/reset')

      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'reset@test.com',
        { redirectTo: 'https://custom.com/reset' }
      )
    })
  })

  describe('updatePassword()', () => {
    it('devrait mettre à jour le mot de passe', async () => {
      const mockData = { user: { id: '123' } }
      supabase.auth.updateUser.mockResolvedValue({ data: mockData, error: null })

      const result = await authService.updatePassword('newPassword123')

      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'newPassword123',
      })
      expect(result).toEqual({ data: mockData, error: null })
    })

    it('devrait retourner une erreur si mot de passe faible', async () => {
      const mockError = { code: 'weak_password', message: 'Password too weak' }
      supabase.auth.updateUser.mockResolvedValue({ data: null, error: mockError })

      const result = await authService.updatePassword('123')

      expect(result).toEqual({ data: null, error: mockError })
    })
  })

  describe('getSession()', () => {
    it('devrait retourner la session courante', async () => {
      const mockSession = { access_token: 'token', user: { id: '123' } }
      supabase.auth.getSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      const result = await authService.getSession()

      expect(result).toEqual({ session: mockSession, error: null })
    })

    it('devrait retourner null si pas de session', async () => {
      supabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      })

      const result = await authService.getSession()

      expect(result).toEqual({ session: null, error: null })
    })

    it('devrait gérer les erreurs', async () => {
      const mockError = new Error('Session error')
      supabase.auth.getSession.mockRejectedValue(mockError)

      const result = await authService.getSession()

      expect(result).toEqual({ session: null, error: mockError })
    })
  })

  describe('getUser()', () => {
    it('devrait retourner l\'utilisateur courant', async () => {
      const mockUser = { id: '123', email: 'user@test.com' }
      supabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const result = await authService.getUser()

      expect(result).toEqual({ user: mockUser, error: null })
    })

    it('devrait retourner null si pas d\'utilisateur', async () => {
      supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const result = await authService.getUser()

      expect(result).toEqual({ user: null, error: null })
    })
  })

  describe('onAuthStateChange()', () => {
    it('devrait souscrire aux changements d\'état', () => {
      const mockSubscription = { unsubscribe: vi.fn() }
      supabase.auth.onAuthStateChange.mockReturnValue({
        data: { subscription: mockSubscription },
      })

      const callback = vi.fn()
      const subscription = authService.onAuthStateChange(callback)

      expect(supabase.auth.onAuthStateChange).toHaveBeenCalled()
      expect(subscription).toBe(mockSubscription)
    })

    it('devrait appeler le callback avec event et session', () => {
      let capturedCallback
      supabase.auth.onAuthStateChange.mockImplementation((cb) => {
        capturedCallback = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      })

      const userCallback = vi.fn()
      authService.onAuthStateChange(userCallback)

      // Simuler un changement d'état
      capturedCallback('SIGNED_IN', { access_token: 'token' })

      expect(userCallback).toHaveBeenCalledWith('SIGNED_IN', { access_token: 'token' })
    })
  })

  describe('checkEmailExists()', () => {
    it('devrait retourner true si l\'email existe', async () => {
      supabase.rpc.mockResolvedValue({ data: true, error: null })

      const result = await authService.checkEmailExists('existing@test.com')

      expect(supabase.rpc).toHaveBeenCalledWith('check_email_exists', {
        email_to_check: 'existing@test.com',
      })
      expect(result).toBe(true)
    })

    it('devrait retourner false si l\'email n\'existe pas', async () => {
      supabase.rpc.mockResolvedValue({ data: false, error: null })

      const result = await authService.checkEmailExists('new@test.com')

      expect(result).toBe(false)
    })

    it('devrait retourner false si la fonction RPC n\'existe pas', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'function does not exist' },
      })

      const result = await authService.checkEmailExists('test@test.com')

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('devrait gérer les exceptions', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      supabase.rpc.mockRejectedValue(new Error('Network error'))

      const result = await authService.checkEmailExists('test@test.com')

      expect(result).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  describe('refreshSession()', () => {
    it('devrait rafraîchir la session', async () => {
      const mockSession = { access_token: 'new_token' }
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      const result = await authService.refreshSession()

      expect(supabase.auth.refreshSession).toHaveBeenCalled()
      expect(result).toEqual({ session: mockSession, error: null })
    })

    it('devrait gérer les erreurs de rafraîchissement', async () => {
      const mockError = new Error('Refresh failed')
      supabase.auth.refreshSession.mockRejectedValue(mockError)

      const result = await authService.refreshSession()

      expect(result).toEqual({ session: null, error: mockError })
    })
  })

  describe('pattern { data, error }', () => {
    it('toutes les méthodes devraient retourner le pattern standardisé', async () => {
      // Test signIn
      supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })
      const signInResult = await authService.signIn('e', 'p')
      expect(signInResult).toHaveProperty('data')
      expect(signInResult).toHaveProperty('error')

      // Test signUp
      supabase.auth.signUp.mockResolvedValue({ data: {}, error: null })
      const signUpResult = await authService.signUp('e', 'p')
      expect(signUpResult).toHaveProperty('data')
      expect(signUpResult).toHaveProperty('error')

      // Test signOut
      supabase.auth.signOut.mockResolvedValue({ error: null })
      const signOutResult = await authService.signOut()
      expect(signOutResult).toHaveProperty('error')

      // Test getSession
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
      const sessionResult = await authService.getSession()
      expect(sessionResult).toHaveProperty('session')
      expect(sessionResult).toHaveProperty('error')

      // Test getUser
      supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
      const userResult = await authService.getUser()
      expect(userResult).toHaveProperty('user')
      expect(userResult).toHaveProperty('error')
    })
  })
})
