/**
 * Tests pour cn.js - Utilitaire de combinaison de classes CSS
 * ============================================================================
 */

import { describe, it, expect } from 'vitest'
import { cn, clsx } from '../cn'

describe('cn()', () => {
  describe('combinaison basique de classes', () => {
    it('devrait combiner plusieurs chaînes de classes', () => {
      expect(cn('class1', 'class2', 'class3')).toBe('class1 class2 class3')
    })

    it('devrait gérer une seule classe', () => {
      expect(cn('single-class')).toBe('single-class')
    })

    it('devrait retourner une chaîne vide si aucune classe', () => {
      expect(cn()).toBe('')
    })
  })

  describe('gestion des valeurs falsy', () => {
    it('devrait filtrer les valeurs undefined', () => {
      expect(cn('class1', undefined, 'class2')).toBe('class1 class2')
    })

    it('devrait filtrer les valeurs null', () => {
      expect(cn('class1', null, 'class2')).toBe('class1 class2')
    })

    it('devrait filtrer les valeurs false', () => {
      expect(cn('class1', false, 'class2')).toBe('class1 class2')
    })

    it('devrait filtrer les chaînes vides', () => {
      expect(cn('class1', '', 'class2')).toBe('class1 class2')
    })

    it('devrait filtrer 0 (valeur falsy)', () => {
      expect(cn('class1', 0, 'class2')).toBe('class1 class2')
    })
  })

  describe('classes conditionnelles', () => {
    it('devrait inclure une classe si la condition est vraie', () => {
      const isActive = true
      expect(cn('base', isActive && 'active')).toBe('base active')
    })

    it('devrait exclure une classe si la condition est fausse', () => {
      const isActive = false
      expect(cn('base', isActive && 'active')).toBe('base')
    })

    it('devrait gérer plusieurs conditions', () => {
      const isActive = true
      const isDisabled = false
      const isLarge = true
      expect(cn('btn', isActive && 'active', isDisabled && 'disabled', isLarge && 'large'))
        .toBe('btn active large')
    })
  })

  describe('trim et espaces', () => {
    it('devrait trim le résultat final', () => {
      // cn() joint les classes et trim uniquement les extrémités
      expect(cn(' class1 ', ' class2 ')).toBe('class1   class2')
    })

    it('devrait gérer les espaces multiples dans les classes', () => {
      expect(cn('class1', 'class2 class3', 'class4')).toBe('class1 class2 class3 class4')
    })
  })

  describe('cas réels Tailwind', () => {
    it('devrait combiner des classes Tailwind', () => {
      expect(cn('px-4', 'py-2', 'bg-blue-500', 'text-white'))
        .toBe('px-4 py-2 bg-blue-500 text-white')
    })

    it('devrait gérer les variantes responsives', () => {
      expect(cn('text-sm', 'md:text-base', 'lg:text-lg'))
        .toBe('text-sm md:text-base lg:text-lg')
    })

    it('devrait gérer les états hover/focus', () => {
      expect(cn('bg-blue-500', 'hover:bg-blue-700', 'focus:ring-2'))
        .toBe('bg-blue-500 hover:bg-blue-700 focus:ring-2')
    })
  })
})

describe('clsx()', () => {
  it('devrait être un alias de cn()', () => {
    expect(clsx('class1', 'class2')).toBe(cn('class1', 'class2'))
  })

  it('devrait filtrer les valeurs falsy', () => {
    expect(clsx('class1', false, 'class2')).toBe('class1 class2')
  })

  it('devrait gérer les classes conditionnelles', () => {
    const isActive = true
    expect(clsx('base', isActive && 'active')).toBe('base active')
  })
})
