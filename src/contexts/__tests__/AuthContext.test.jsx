/**
 * Tests pour AuthContext - Contexte d'authentification
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// Utiliser vi.hoisted pour définir mockSupabase avant le hoisting de vi.mock
const mockSupabase = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  from: vi.fn(),
}))

vi.mock('../../lib/supabaseClient', () => ({
  supabase: mockSupabase,
}))

// Mock du hook useImpersonation
vi.mock('../../hooks/useImpersonation', () => ({
  useImpersonation: vi.fn(() => ({
    isImpersonating: false,
    impersonatedProfile: null,
    impersonatedOrganization: null,
    impersonatedUser: null,
    impersonateUser: vi.fn(),
    stopImpersonating: vi.fn(),
  })),
}))

// Composant de test pour accéder au contexte
function TestComponent({ onAuth }) {
  const auth = useAuth()
  if (onAuth) onAuth(auth)
  return (
    <div>
      <span data-testid="loading">{auth.loading ? 'loading' : 'ready'}</span>
      <span data-testid="authenticated">{auth.isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="user">{auth.user?.email || 'none'}</span>
      <span data-testid="profile">{auth.profile?.display_name || 'none'}</span>
      <span data-testid="is-super-admin">{auth.isSuperAdmin ? 'yes' : 'no'}</span>
      <span data-testid="is-org-admin">{auth.isOrgAdmin ? 'yes' : 'no'}</span>
      <span data-testid="is-onboarded">{auth.isOnboarded ? 'yes' : 'no'}</span>
      <span data-testid="error">{auth.error || 'none'}</span>
    </div>
  )
}

describe('AuthContext', () => {
  let mockSubscription

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default subscription mock
    mockSubscription = { unsubscribe: vi.fn() }
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: mockSubscription },
    })

    // Default: no session
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('useAuth hook', () => {
    it('devrait retourner un contexte vide si utilisé hors du Provider', () => {
      // Note: L'implémentation actuelle retourne {} par défaut (pas d'erreur throw)
      // car createContext({}) initialise avec un objet vide truthy
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Le contexte retourne {} par défaut, pas d'erreur levée
      render(<TestComponent />)

      expect(screen.getByTestId('loading')).toBeInTheDocument()

      consoleSpy.mockRestore()
    })
  })

  describe('initialisation', () => {
    it('devrait initialiser sans session', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      expect(screen.getByTestId('authenticated')).toHaveTextContent('no')
      expect(screen.getByTestId('user')).toHaveTextContent('none')
    })

    it('devrait s\'abonner aux changements d\'état auth', async () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
      })
    })

    it('devrait se désabonner au démontage', async () => {
      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      unmount()

      expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    })
  })

  describe('signIn', () => {
    it('devrait connecter un utilisateur avec succès', async () => {
      const mockUser = { id: 'user-123', email: 'test@test.com' }
      const mockSession = { user: mockUser, access_token: 'token' }

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.signIn('test@test.com', 'password123')
      })

      expect(result.error).toBeNull()
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@test.com',
        password: 'password123',
      })
    })

    it('devrait gérer les erreurs de connexion', async () => {
      const mockError = new Error('Invalid credentials')
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: mockError,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.signIn('test@test.com', 'wrongpassword')
      })

      expect(result.error).toBe(mockError)
    })
  })

  describe('signUp', () => {
    it('devrait créer un compte avec succès', async () => {
      const mockUser = { id: 'new-user', email: 'new@test.com' }
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.signUp('new@test.com', 'password123', { full_name: 'New User' })
      })

      expect(result.error).toBeNull()
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'new@test.com',
        password: 'password123',
        options: { data: { full_name: 'New User' } },
      })
    })
  })

  describe('signOut', () => {
    it('devrait déconnecter l\'utilisateur', async () => {
      mockSupabase.auth.signOut.mockResolvedValue({ error: null })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.signOut()
      })

      expect(result.error).toBeNull()
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })
  })

  describe('signInWithGoogle', () => {
    it('devrait initier la connexion Google OAuth', async () => {
      mockSupabase.auth.signInWithOAuth.mockResolvedValue({
        data: { url: 'https://google.com/oauth' },
        error: null,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.signInWithGoogle()
      })

      expect(result.error).toBeNull()
      expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: expect.stringContaining('/admin') },
      })
    })
  })

  describe('resetPassword', () => {
    it('devrait envoyer un email de réinitialisation', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.resetPassword('reset@test.com')
      })

      expect(result.error).toBeNull()
      expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'reset@test.com',
        { redirectTo: expect.stringContaining('/reset-password') }
      )
    })
  })

  describe('updatePassword', () => {
    it('devrait mettre à jour le mot de passe', async () => {
      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      const result = await act(async () => {
        return authContext.updatePassword('newPassword123')
      })

      expect(result.error).toBeNull()
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'newPassword123',
      })
    })
  })

  describe('clearError', () => {
    it('devrait effacer l\'erreur', async () => {
      const mockError = new Error('Test error')
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: mockError,
      })

      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      // Déclencher une erreur
      await act(async () => {
        await authContext.signIn('test@test.com', 'wrong')
      })

      // Attendre que l'erreur soit mise à jour dans le state
      await waitFor(() => {
        expect(authContext.error).toBe('Test error')
      })

      // Effacer l'erreur
      await act(async () => {
        authContext.clearError()
      })

      // Attendre que l'erreur soit effacée
      await waitFor(() => {
        expect(authContext.error).toBeNull()
      })
    })
  })

  describe('context value', () => {
    it('devrait exposer toutes les méthodes et propriétés attendues', async () => {
      let authContext
      render(
        <AuthProvider>
          <TestComponent onAuth={(auth) => { authContext = auth }} />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('ready')
      })

      // Vérifier les propriétés
      expect(authContext).toHaveProperty('user')
      expect(authContext).toHaveProperty('session')
      expect(authContext).toHaveProperty('profile')
      expect(authContext).toHaveProperty('organization')
      expect(authContext).toHaveProperty('loading')
      expect(authContext).toHaveProperty('error')
      expect(authContext).toHaveProperty('isAuthenticated')
      expect(authContext).toHaveProperty('isOnboarded')
      expect(authContext).toHaveProperty('isOrgAdmin')
      expect(authContext).toHaveProperty('isSuperAdmin')
      expect(authContext).toHaveProperty('hasProfile')
      expect(authContext).toHaveProperty('isImpersonating')

      // Vérifier les méthodes
      expect(typeof authContext.signIn).toBe('function')
      expect(typeof authContext.signUp).toBe('function')
      expect(typeof authContext.signOut).toBe('function')
      expect(typeof authContext.signInWithGoogle).toBe('function')
      expect(typeof authContext.resetPassword).toBe('function')
      expect(typeof authContext.updatePassword).toBe('function')
      expect(typeof authContext.clearError).toBe('function')
      expect(typeof authContext.refreshProfile).toBe('function')
      expect(typeof authContext.impersonateUser).toBe('function')
      expect(typeof authContext.stopImpersonating).toBe('function')
    })
  })
})
