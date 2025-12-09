/**
 * Tests pour Button - Composant bouton réutilisable
 * ============================================================================
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../Button'

describe('Button', () => {
  describe('rendu de base', () => {
    it('devrait rendre le bouton avec le texte', () => {
      render(<Button>Click me</Button>)

      expect(screen.getByRole('button')).toHaveTextContent('Click me')
    })

    it('devrait avoir le type button par défaut', () => {
      render(<Button>Test</Button>)

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
    })

    it('devrait accepter un type submit', () => {
      render(<Button type="submit">Submit</Button>)

      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
    })

    it('devrait forwarder la ref', () => {
      const ref = { current: null }
      render(<Button ref={ref}>Test</Button>)

      expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    })
  })

  describe('variantes', () => {
    it('devrait appliquer la variante primary par défaut', () => {
      render(<Button>Primary</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-baikal-cyan')
    })

    it('devrait appliquer la variante secondary', () => {
      render(<Button variant="secondary">Secondary</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-baikal-surface')
    })

    it('devrait appliquer la variante danger', () => {
      render(<Button variant="danger">Danger</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-red-600')
    })

    it('devrait appliquer la variante success', () => {
      render(<Button variant="success">Success</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-green-600')
    })

    it('devrait appliquer la variante warning', () => {
      render(<Button variant="warning">Warning</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-amber-500')
    })

    it('devrait appliquer la variante ghost', () => {
      render(<Button variant="ghost">Ghost</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-transparent')
    })

    it('devrait appliquer la variante outline', () => {
      render(<Button variant="outline">Outline</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('border-baikal-cyan')
    })

    it('devrait appliquer la variante link', () => {
      render(<Button variant="link">Link</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('hover:underline')
    })
  })

  describe('tailles', () => {
    it('devrait appliquer la taille md par défaut', () => {
      render(<Button>Medium</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-4')
      expect(button.className).toContain('py-2')
    })

    it('devrait appliquer la taille xs', () => {
      render(<Button size="xs">Extra Small</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-2')
      expect(button.className).toContain('py-1')
    })

    it('devrait appliquer la taille sm', () => {
      render(<Button size="sm">Small</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-3')
    })

    it('devrait appliquer la taille lg', () => {
      render(<Button size="lg">Large</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-5')
    })

    it('devrait appliquer la taille xl', () => {
      render(<Button size="xl">Extra Large</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-6')
      expect(button.className).toContain('py-3')
    })
  })

  describe('états', () => {
    it('devrait être désactivé quand disabled=true', () => {
      render(<Button disabled>Disabled</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button.className).toContain('disabled:opacity-50')
    })

    it('devrait être désactivé pendant le loading', () => {
      render(<Button loading>Loading</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('devrait afficher le spinner en loading', () => {
      render(<Button loading>Loading</Button>)

      // Le spinner a la classe animate-spin
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('devrait ne pas afficher le leftIcon pendant le loading', () => {
      const icon = <span data-testid="left-icon">Icon</span>
      render(<Button loading leftIcon={icon}>Loading</Button>)

      expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument()
    })
  })

  describe('icônes', () => {
    it('devrait afficher l\'icône gauche', () => {
      const icon = <span data-testid="left-icon">←</span>
      render(<Button leftIcon={icon}>With Icon</Button>)

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('devrait afficher l\'icône droite', () => {
      const icon = <span data-testid="right-icon">→</span>
      render(<Button rightIcon={icon}>With Icon</Button>)

      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('devrait afficher les deux icônes', () => {
      const leftIcon = <span data-testid="left-icon">←</span>
      const rightIcon = <span data-testid="right-icon">→</span>
      render(<Button leftIcon={leftIcon} rightIcon={rightIcon}>Both Icons</Button>)

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('devrait ne pas afficher l\'icône droite pendant le loading', () => {
      const icon = <span data-testid="right-icon">→</span>
      render(<Button loading rightIcon={icon}>Loading</Button>)

      expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument()
    })
  })

  describe('fullWidth', () => {
    it('devrait appliquer w-full quand fullWidth=true', () => {
      render(<Button fullWidth>Full Width</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('w-full')
    })

    it('devrait ne pas avoir w-full par défaut', () => {
      render(<Button>Normal</Button>)

      const button = screen.getByRole('button')
      expect(button.className).not.toContain('w-full')
    })
  })

  describe('interactions', () => {
    it('devrait appeler onClick quand cliqué', async () => {
      const handleClick = vi.fn()
      const user = userEvent.setup()

      render(<Button onClick={handleClick}>Click me</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('ne devrait pas appeler onClick quand disabled', async () => {
      const handleClick = vi.fn()
      const user = userEvent.setup()

      render(<Button disabled onClick={handleClick}>Disabled</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })

    it('ne devrait pas appeler onClick quand loading', async () => {
      const handleClick = vi.fn()
      const user = userEvent.setup()

      render(<Button loading onClick={handleClick}>Loading</Button>)

      await user.click(screen.getByRole('button'))

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('className personnalisée', () => {
    it('devrait fusionner les classes personnalisées', () => {
      render(<Button className="custom-class">Custom</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('custom-class')
    })

    it('devrait conserver les classes de base avec les classes personnalisées', () => {
      render(<Button className="custom-class" variant="danger">Custom Danger</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('custom-class')
      expect(button.className).toContain('bg-red-600')
    })
  })

  describe('props HTML natives', () => {
    it('devrait passer les props HTML au bouton', () => {
      render(
        <Button
          data-testid="custom-button"
          aria-label="Custom label"
          title="Tooltip"
        >
          Test
        </Button>
      )

      const button = screen.getByTestId('custom-button')
      expect(button).toHaveAttribute('aria-label', 'Custom label')
      expect(button).toHaveAttribute('title', 'Tooltip')
    })
  })

  describe('displayName', () => {
    it('devrait avoir le displayName Button', () => {
      expect(Button.displayName).toBe('Button')
    })
  })
})
