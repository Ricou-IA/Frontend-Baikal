/**
 * Tests pour useLocalStorage - Hook de persistance localStorage
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage()', () => {
  const localStorageMock = (() => {
    let store = {}
    return {
      getItem: vi.fn((key) => store[key] ?? null),
      setItem: vi.fn((key, value) => { store[key] = value }),
      removeItem: vi.fn((key) => { delete store[key] }),
      clear: () => { store = {} },
    }
  })()

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    })
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('initialisation', () => {
    it('devrait retourner la valeur initiale si rien en localStorage', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

      expect(result.current[0]).toBe('default')
    })

    it('devrait retourner la valeur du localStorage si elle existe', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify('stored-value'))

      const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

      expect(result.current[0]).toBe('stored-value')
    })

    it('devrait gérer les objets', () => {
      const storedObject = { name: 'John', age: 30 }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(storedObject))

      const { result } = renderHook(() => useLocalStorage('user', null))

      expect(result.current[0]).toEqual(storedObject)
    })

    it('devrait gérer les tableaux', () => {
      const storedArray = [1, 2, 3]
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(storedArray))

      const { result } = renderHook(() => useLocalStorage('numbers', []))

      expect(result.current[0]).toEqual(storedArray)
    })

    it('devrait utiliser la valeur initiale si le parsing échoue', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid-json')
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

      expect(result.current[0]).toBe('default')
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('setValue()', () => {
    it('devrait mettre à jour le state et le localStorage', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

      act(() => {
        result.current[1]('new-value')
      })

      expect(result.current[0]).toBe('new-value')
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify('new-value')
      )
    })

    it('devrait accepter une fonction de mise à jour', () => {
      const { result } = renderHook(() => useLocalStorage('counter', 0))

      act(() => {
        result.current[1](prev => prev + 1)
      })

      expect(result.current[0]).toBe(1)

      act(() => {
        result.current[1](prev => prev + 10)
      })

      expect(result.current[0]).toBe(11)
    })

    it('devrait sauvegarder des objets', () => {
      const { result } = renderHook(() => useLocalStorage('user', null))

      const user = { name: 'Jane', age: 25 }
      act(() => {
        result.current[1](user)
      })

      expect(result.current[0]).toEqual(user)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'user',
        JSON.stringify(user)
      )
    })

    it('devrait gérer les erreurs d\'écriture', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError')
      })

      const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

      act(() => {
        result.current[1]('new-value')
      })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('devrait dispatch un événement storage', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

      act(() => {
        result.current[1]('new-value')
      })

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'storage',
          key: 'test-key',
        })
      )

      dispatchSpy.mockRestore()
    })
  })

  describe('removeValue()', () => {
    it('devrait supprimer la valeur du localStorage', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

      act(() => {
        result.current[1]('stored')
      })

      act(() => {
        result.current[2]() // removeValue
      })

      expect(result.current[0]).toBe('default')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key')
    })

    it('devrait dispatch un événement storage avec newValue null', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      const { result } = renderHook(() => useLocalStorage('test-key', 'default'))

      act(() => {
        result.current[2]() // removeValue
      })

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'storage',
          key: 'test-key',
          newValue: null,
        })
      )

      dispatchSpy.mockRestore()
    })
  })

  describe('synchronisation entre onglets', () => {
    it('devrait mettre à jour le state quand un autre onglet change la valeur', () => {
      const { result } = renderHook(() => useLocalStorage('sync-key', 'initial'))

      // Simuler un changement depuis un autre onglet
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'sync-key',
          newValue: JSON.stringify('from-other-tab'),
        }))
      })

      expect(result.current[0]).toBe('from-other-tab')
    })

    it('devrait ignorer les événements pour d\'autres clés', () => {
      const { result } = renderHook(() => useLocalStorage('my-key', 'initial'))

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'other-key',
          newValue: JSON.stringify('other-value'),
        }))
      })

      expect(result.current[0]).toBe('initial')
    })

    it('devrait réinitialiser à la valeur initiale si newValue est null', () => {
      const { result } = renderHook(() => useLocalStorage('sync-key', 'default'))

      act(() => {
        result.current[1]('stored')
      })

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'sync-key',
          newValue: null,
        }))
      })

      expect(result.current[0]).toBe('default')
    })

    it('devrait se désabonner au démontage', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderHook(() => useLocalStorage('test-key', 'initial'))

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'storage',
        expect.any(Function)
      )

      removeEventListenerSpy.mockRestore()
    })
  })

  describe('options de sérialisation', () => {
    it('devrait utiliser un sérialiseur personnalisé', () => {
      const customSerialize = vi.fn(value => `custom:${value}`)
      const customDeserialize = vi.fn(str => str.replace('custom:', ''))

      localStorageMock.getItem.mockReturnValueOnce('custom:stored')

      const { result } = renderHook(() => useLocalStorage('test-key', 'default', {
        serialize: customSerialize,
        deserialize: customDeserialize,
      }))

      expect(customDeserialize).toHaveBeenCalledWith('custom:stored')
      expect(result.current[0]).toBe('stored')

      act(() => {
        result.current[1]('new-value')
      })

      expect(customSerialize).toHaveBeenCalledWith('new-value')
    })
  })

  describe('cas limites', () => {
    it('devrait gérer les valeurs null', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', null))

      expect(result.current[0]).toBeNull()

      act(() => {
        result.current[1]({ data: 'test' })
      })

      expect(result.current[0]).toEqual({ data: 'test' })

      act(() => {
        result.current[1](null)
      })

      expect(result.current[0]).toBeNull()
    })

    it('devrait gérer les valeurs boolean', () => {
      const { result } = renderHook(() => useLocalStorage('toggle', false))

      expect(result.current[0]).toBe(false)

      act(() => {
        result.current[1](true)
      })

      expect(result.current[0]).toBe(true)
    })

    it('devrait gérer les nombres', () => {
      const { result } = renderHook(() => useLocalStorage('count', 0))

      act(() => {
        result.current[1](42)
      })

      expect(result.current[0]).toBe(42)
      expect(localStorageMock.setItem).toHaveBeenCalledWith('count', '42')
    })
  })
})
