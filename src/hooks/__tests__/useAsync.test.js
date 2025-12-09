/**
 * Tests pour useAsync - Hook de gestion d'états asynchrones
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsync } from '../useAsync'

describe('useAsync()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialisation', () => {
    it('devrait initialiser avec les valeurs par défaut', () => {
      const asyncFn = vi.fn()
      const { result } = renderHook(() => useAsync(asyncFn))

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.isIdle).toBe(true)
      expect(result.current.isSuccess).toBe(false)
      expect(result.current.isError).toBe(false)
    })

    it('devrait initialiser avec initialData', () => {
      const asyncFn = vi.fn()
      const { result } = renderHook(() => useAsync(asyncFn, { initialData: 'initial' }))

      expect(result.current.data).toBe('initial')
      expect(result.current.isIdle).toBe(true)
    })

    it('devrait être en loading si immediate est true', () => {
      const asyncFn = vi.fn().mockResolvedValue('data')
      const { result } = renderHook(() => useAsync(asyncFn, { immediate: true }))

      expect(result.current.loading).toBe(true)
    })
  })

  describe('execute()', () => {
    it('devrait exécuter la fonction async et retourner les données', async () => {
      const asyncFn = vi.fn().mockResolvedValue('result data')
      const { result } = renderHook(() => useAsync(asyncFn))

      let returnedData
      await act(async () => {
        returnedData = await result.current.execute()
      })

      expect(returnedData).toBe('result data')
      expect(result.current.data).toBe('result data')
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('devrait passer les arguments à la fonction async', async () => {
      const asyncFn = vi.fn().mockResolvedValue('result')
      const { result } = renderHook(() => useAsync(asyncFn))

      await act(async () => {
        await result.current.execute('arg1', 'arg2', { option: true })
      })

      expect(asyncFn).toHaveBeenCalledWith('arg1', 'arg2', { option: true })
    })

    it('devrait gérer le loading state', async () => {
      let resolvePromise
      const asyncFn = vi.fn().mockImplementation(() => new Promise(resolve => {
        resolvePromise = resolve
      }))

      const { result } = renderHook(() => useAsync(asyncFn))

      let executePromise
      act(() => {
        executePromise = result.current.execute()
      })

      // Pendant le loading
      expect(result.current.loading).toBe(true)
      expect(result.current.error).toBeNull()

      await act(async () => {
        resolvePromise('data')
        await executePromise
      })

      // Après le loading
      expect(result.current.loading).toBe(false)
      expect(result.current.data).toBe('data')
    })

    it('devrait gérer les erreurs', async () => {
      const error = new Error('Async error')
      const asyncFn = vi.fn().mockRejectedValue(error)
      const { result } = renderHook(() => useAsync(asyncFn))

      // execute() propage l'erreur, il faut la capturer
      await act(async () => {
        try {
          await result.current.execute()
        } catch {
          // Expected
        }
      })

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBe(error)
      expect(result.current.isError).toBe(true)
    })

    it('devrait reset error au début d\'une nouvelle exécution', async () => {
      const asyncFn = vi.fn()
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce('success')

      const { result } = renderHook(() => useAsync(asyncFn))

      // Première exécution qui échoue
      await act(async () => {
        try {
          await result.current.execute()
        } catch {
          // Expected
        }
      })

      expect(result.current.error).not.toBeNull()

      // Deuxième exécution réussit
      await act(async () => {
        await result.current.execute()
      })

      expect(result.current.error).toBeNull()
      expect(result.current.data).toBe('success')
    })
  })

  describe('callbacks', () => {
    it('devrait appeler onSuccess en cas de succès', async () => {
      const onSuccess = vi.fn()
      const asyncFn = vi.fn().mockResolvedValue('data')
      const { result } = renderHook(() => useAsync(asyncFn, { onSuccess }))

      await act(async () => {
        await result.current.execute()
      })

      expect(onSuccess).toHaveBeenCalledWith('data')
    })

    it('devrait appeler onError en cas d\'erreur', async () => {
      const onError = vi.fn()
      const error = new Error('Error')
      const asyncFn = vi.fn().mockRejectedValue(error)
      const { result } = renderHook(() => useAsync(asyncFn, { onError }))

      await expect(act(async () => {
        await result.current.execute()
      })).rejects.toThrow()

      expect(onError).toHaveBeenCalledWith(error)
    })
  })

  describe('immediate execution', () => {
    it('devrait exécuter immédiatement si immediate=true', async () => {
      const asyncFn = vi.fn().mockResolvedValue('immediate data')

      renderHook(() => useAsync(asyncFn, { immediate: true }))

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(asyncFn).toHaveBeenCalled()
    })
  })

  describe('reset()', () => {
    it('devrait réinitialiser l\'état', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data')
      const { result } = renderHook(() => useAsync(asyncFn))

      await act(async () => {
        await result.current.execute()
      })

      expect(result.current.data).toBe('data')

      act(() => {
        result.current.reset()
      })

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.isIdle).toBe(true)
    })

    it('devrait réinitialiser vers initialData', async () => {
      const asyncFn = vi.fn().mockResolvedValue('new data')
      const { result } = renderHook(() => useAsync(asyncFn, { initialData: 'initial' }))

      await act(async () => {
        await result.current.execute()
      })

      expect(result.current.data).toBe('new data')

      act(() => {
        result.current.reset()
      })

      expect(result.current.data).toBe('initial')
    })
  })

  describe('setData()', () => {
    it('devrait mettre à jour les données manuellement', () => {
      const asyncFn = vi.fn()
      const { result } = renderHook(() => useAsync(asyncFn))

      act(() => {
        result.current.setData('manual data')
      })

      expect(result.current.data).toBe('manual data')
    })

    it('devrait accepter une fonction de mise à jour', async () => {
      const asyncFn = vi.fn().mockResolvedValue({ count: 1 })
      const { result } = renderHook(() => useAsync(asyncFn))

      await act(async () => {
        await result.current.execute()
      })

      act(() => {
        result.current.setData(prev => ({ count: prev.count + 1 }))
      })

      expect(result.current.data).toEqual({ count: 2 })
    })
  })

  describe('états dérivés', () => {
    it('isIdle devrait être true initialement', () => {
      const asyncFn = vi.fn()
      const { result } = renderHook(() => useAsync(asyncFn))

      expect(result.current.isIdle).toBe(true)
    })

    it('isIdle devrait être false après exécution', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data')
      const { result } = renderHook(() => useAsync(asyncFn))

      await act(async () => {
        await result.current.execute()
      })

      expect(result.current.isIdle).toBe(false)
    })

    it('isSuccess devrait être true après succès', async () => {
      const asyncFn = vi.fn().mockResolvedValue('data')
      const { result } = renderHook(() => useAsync(asyncFn))

      expect(result.current.isSuccess).toBe(false)

      await act(async () => {
        await result.current.execute()
      })

      expect(result.current.isSuccess).toBe(true)
      expect(result.current.isError).toBe(false)
    })

    it('isError devrait être true après erreur', async () => {
      const asyncFn = vi.fn().mockRejectedValue(new Error('Error'))
      const { result } = renderHook(() => useAsync(asyncFn))

      await act(async () => {
        try {
          await result.current.execute()
        } catch {
          // Expected
        }
      })

      expect(result.current.isError).toBe(true)
      expect(result.current.isSuccess).toBe(false)
    })
  })

  describe('unmount safety', () => {
    it('ne devrait pas mettre à jour l\'état après unmount', async () => {
      let resolvePromise
      const asyncFn = vi.fn().mockImplementation(() => new Promise(resolve => {
        resolvePromise = resolve
      }))

      const { result, unmount } = renderHook(() => useAsync(asyncFn))

      act(() => {
        result.current.execute()
      })

      // Unmount avant la résolution
      unmount()

      // Résoudre après unmount - ne devrait pas causer d'erreur
      await act(async () => {
        resolvePromise('data')
        await vi.runAllTimersAsync()
      })

      // Le test passe si aucune erreur n'est levée
    })
  })

  describe('fonction async mise à jour', () => {
    it('devrait utiliser la dernière version de la fonction', async () => {
      const asyncFn1 = vi.fn().mockResolvedValue('result1')
      const asyncFn2 = vi.fn().mockResolvedValue('result2')

      const { result, rerender } = renderHook(
        ({ fn }) => useAsync(fn),
        { initialProps: { fn: asyncFn1 } }
      )

      // Exécuter avec la première fonction
      await act(async () => {
        await result.current.execute()
      })
      expect(result.current.data).toBe('result1')

      // Mettre à jour la fonction
      rerender({ fn: asyncFn2 })

      // Exécuter avec la nouvelle fonction
      await act(async () => {
        await result.current.execute()
      })
      expect(result.current.data).toBe('result2')
      expect(asyncFn2).toHaveBeenCalled()
    })
  })
})
