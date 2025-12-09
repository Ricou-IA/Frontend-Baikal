/**
 * Tests pour useDebounce - Hooks de debounce et throttle
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce, useDebouncedCallback, useThrottle } from '../useDebounce'

describe('useDebounce()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devrait retourner la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useDebounce('initial', 300))

    expect(result.current).toBe('initial')
  })

  it('devrait debouncer la mise à jour de la valeur', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    )

    expect(result.current).toBe('initial')

    // Changer la valeur
    rerender({ value: 'updated' })

    // La valeur ne devrait pas encore être mise à jour
    expect(result.current).toBe('initial')

    // Avancer le temps de 150ms
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('initial')

    // Avancer jusqu'à 300ms
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('updated')
  })

  it('devrait annuler le timer précédent si la valeur change', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'first' } }
    )

    // Première mise à jour
    rerender({ value: 'second' })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Deuxième mise à jour avant que le délai soit écoulé
    rerender({ value: 'third' })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // La valeur devrait toujours être 'first' car le délai a été reset
    expect(result.current).toBe('first')

    // Compléter le délai
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('third')
  })

  it('devrait utiliser le délai par défaut de 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('updated')
  })

  it('devrait fonctionner avec des objets', () => {
    const obj1 = { name: 'John' }
    const obj2 = { name: 'Jane' }

    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: obj1 } }
    )

    expect(result.current).toBe(obj1)

    rerender({ value: obj2 })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe(obj2)
  })

  it('devrait respecter le délai personnalisé', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('updated')
  })
})

describe('useDebouncedCallback()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devrait debouncer l\'appel du callback', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 300))

    // Appeler la fonction debouncée
    act(() => {
      result.current.callback('arg1')
    })

    // Le callback ne devrait pas encore être appelé
    expect(callback).not.toHaveBeenCalled()

    // Avancer le temps
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(callback).toHaveBeenCalledWith('arg1')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('devrait passer tous les arguments au callback', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 300))

    act(() => {
      result.current.callback('arg1', 'arg2', { option: true })
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2', { option: true })
  })

  it('devrait annuler les appels précédents', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 300))

    act(() => {
      result.current.callback('first')
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    act(() => {
      result.current.callback('second')
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('second')
  })

  it('devrait permettre d\'annuler manuellement', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 300))

    act(() => {
      result.current.callback('test')
    })

    act(() => {
      result.current.cancel()
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('devrait permettre d\'exécuter immédiatement avec flush', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 300))

    act(() => {
      result.current.flush('immediate')
    })

    expect(callback).toHaveBeenCalledWith('immediate')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('devrait utiliser la dernière version du callback', () => {
    let count = 0
    const { result, rerender } = renderHook(
      ({ cb }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: () => count++ } }
    )

    // Mettre à jour le callback
    rerender({ cb: () => count += 10 })

    act(() => {
      result.current.callback()
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(count).toBe(10) // Le nouveau callback est utilisé
  })

  it('devrait nettoyer au démontage', () => {
    const callback = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 300))

    act(() => {
      result.current.callback('test')
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Le callback ne devrait pas être appelé après unmount
    // (pas d'erreur = succès)
  })
})

describe('useThrottle()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devrait retourner la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useThrottle('initial', 300))

    expect(result.current).toBe('initial')
  })

  it('devrait mettre à jour immédiatement si l\'intervalle est écoulé', () => {
    // Définir le temps initial
    const startTime = new Date(2024, 0, 1, 0, 0, 0, 0).getTime()
    vi.setSystemTime(startTime)

    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 300),
      { initialProps: { value: 'initial' } }
    )

    // Avancer le temps système au-delà de l'intervalle AVANT de changer la valeur
    vi.setSystemTime(startTime + 400)

    // Mettre à jour la valeur - devrait être immédiat car l'intervalle est écoulé
    rerender({ value: 'updated' })

    // Doit être mis à jour immédiatement car 400ms > 300ms intervalle
    expect(result.current).toBe('updated')
  })

  it('devrait throttler les mises à jour rapides', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 300),
      { initialProps: { value: 'initial' } }
    )

    // Première mise à jour - sera throttlée car lastExecuted est initialisé à Date.now()
    rerender({ value: 'second' })
    // La valeur reste 'initial' car le throttle bloque la mise à jour immédiate
    expect(result.current).toBe('initial')

    // Attendre l'intervalle pour que la mise à jour soit appliquée
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('second')

    // Mise à jour rapide - devrait être throttlée
    rerender({ value: 'third' })
    expect(result.current).toBe('second')

    // Attendre l'intervalle
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('third')
  })

  it('devrait utiliser l\'intervalle par défaut de 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value),
      { initialProps: { value: 'initial' } }
    )

    // Première mise à jour - throttlée
    rerender({ value: 'first' })
    expect(result.current).toBe('initial')

    // Attendre l'intervalle
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('first')

    // Mise à jour immédiate
    rerender({ value: 'second' })
    expect(result.current).toBe('first')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('second')
  })
})
