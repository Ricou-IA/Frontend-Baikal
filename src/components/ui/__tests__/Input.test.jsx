/**
 * Tests pour Input - Composant input réutilisable
 * ============================================================================
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input, Textarea } from '../Input'

describe('Input', () => {
  describe('rendu de base', () => {
    it('devrait rendre l\'input', () => {
      render(<Input />)

      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('devrait avoir le type text par défaut', () => {
      render(<Input />)

      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text')
    })

    it('devrait accepter un type email', () => {
      render(<Input type="email" />)

      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')
    })

    it('devrait forwarder la ref', () => {
      const ref = { current: null }
      render(<Input ref={ref} />)

      expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })
  })

  describe('label', () => {
    it('devrait afficher le label', () => {
      render(<Input label="Email" />)

      expect(screen.getByText('Email')).toBeInTheDocument()
    })

    it('devrait associer le label à l\'input', () => {
      render(<Input label="Email" id="email-input" />)

      const label = screen.getByText('Email')
      const input = screen.getByRole('textbox')

      expect(label).toHaveAttribute('for', 'email-input')
      expect(input).toHaveAttribute('id', 'email-input')
    })

    it('devrait afficher l\'astérisque si required', () => {
      render(<Input label="Email" required />)

      expect(screen.getByText('*')).toBeInTheDocument()
    })
  })

  describe('erreur', () => {
    it('devrait afficher le message d\'erreur', () => {
      render(<Input error="Email invalide" />)

      expect(screen.getByText('Email invalide')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Email invalide')
    })

    it('devrait appliquer les styles d\'erreur', () => {
      render(<Input error="Error" />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('border-red-500')
    })

    it('devrait avoir aria-invalid true', () => {
      render(<Input error="Error" />)

      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })

    it('devrait avoir aria-describedby lié à l\'erreur', () => {
      render(<Input id="test-input" error="Error message" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'test-input-error')
    })
  })

  describe('helperText', () => {
    it('devrait afficher le texte d\'aide', () => {
      render(<Input helperText="Entrez votre email professionnel" />)

      expect(screen.getByText('Entrez votre email professionnel')).toBeInTheDocument()
    })

    it('ne devrait pas afficher helperText si error existe', () => {
      render(<Input helperText="Helper" error="Error" />)

      expect(screen.queryByText('Helper')).not.toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })

    it('devrait avoir aria-describedby lié au helper', () => {
      render(<Input id="test-input" helperText="Help text" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'test-input-helper')
    })
  })

  describe('icônes', () => {
    it('devrait afficher l\'icône gauche', () => {
      const icon = <span data-testid="left-icon">📧</span>
      render(<Input leftIcon={icon} />)

      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('devrait appliquer le padding pour l\'icône gauche', () => {
      const icon = <span>📧</span>
      render(<Input leftIcon={icon} />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('pl-10')
    })

    it('devrait afficher l\'icône droite', () => {
      const icon = <span data-testid="right-icon">✓</span>
      render(<Input rightIcon={icon} />)

      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })
  })

  describe('toggle password', () => {
    it('devrait afficher le toggle pour les champs password', () => {
      render(<Input type="password" showPasswordToggle />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('devrait basculer entre password et text', async () => {
      const user = userEvent.setup()
      render(<Input type="password" showPasswordToggle />)

      // Les inputs password n'ont pas role="textbox", on utilise querySelector
      const input = document.querySelector('input')
      expect(input).toHaveAttribute('type', 'password')

      await user.click(screen.getByRole('button'))
      expect(input).toHaveAttribute('type', 'text')

      await user.click(screen.getByRole('button'))
      expect(input).toHaveAttribute('type', 'password')
    })

    it('ne devrait pas afficher le toggle si showPasswordToggle est false', () => {
      render(<Input type="password" />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('tailles', () => {
    it('devrait appliquer la taille md par défaut', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('px-4')
      expect(input.className).toContain('py-2.5')
    })

    it('devrait appliquer la taille sm', () => {
      render(<Input size="sm" />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('px-3')
      expect(input.className).toContain('py-1.5')
    })

    it('devrait appliquer la taille lg', () => {
      render(<Input size="lg" />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('py-3')
    })
  })

  describe('états', () => {
    it('devrait être désactivé', () => {
      render(<Input disabled />)

      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('devrait appliquer required', () => {
      render(<Input required />)

      expect(screen.getByRole('textbox')).toBeRequired()
    })
  })

  describe('interactions', () => {
    it('devrait accepter la saisie', async () => {
      const user = userEvent.setup()
      render(<Input />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test@example.com')

      expect(input).toHaveValue('test@example.com')
    })

    it('devrait appeler onChange', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(<Input onChange={handleChange} />)

      await user.type(screen.getByRole('textbox'), 'a')

      expect(handleChange).toHaveBeenCalled()
    })

    it('devrait appeler onBlur', async () => {
      const handleBlur = vi.fn()
      const user = userEvent.setup()
      render(<Input onBlur={handleBlur} />)

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.tab()

      expect(handleBlur).toHaveBeenCalled()
    })
  })

  describe('className personnalisée', () => {
    it('devrait fusionner les classes sur l\'input', () => {
      render(<Input className="custom-input" />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('custom-input')
    })

    it('devrait fusionner les classes sur le container', () => {
      render(<Input containerClassName="custom-container" />)

      const container = screen.getByRole('textbox').closest('div').parentElement
      expect(container.className).toContain('custom-container')
    })
  })

  describe('displayName', () => {
    it('devrait avoir le displayName Input', () => {
      expect(Input.displayName).toBe('Input')
    })
  })
})

describe('Textarea', () => {
  describe('rendu de base', () => {
    it('devrait rendre le textarea', () => {
      render(<Textarea />)

      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('devrait avoir 4 rows par défaut', () => {
      render(<Textarea />)

      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '4')
    })

    it('devrait accepter un nombre de rows personnalisé', () => {
      render(<Textarea rows={8} />)

      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '8')
    })
  })

  describe('label et erreur', () => {
    it('devrait afficher le label', () => {
      render(<Textarea label="Description" />)

      expect(screen.getByText('Description')).toBeInTheDocument()
    })

    it('devrait afficher l\'erreur', () => {
      render(<Textarea error="Ce champ est requis" />)

      expect(screen.getByText('Ce champ est requis')).toBeInTheDocument()
    })

    it('devrait afficher le helperText', () => {
      render(<Textarea helperText="Maximum 500 caractères" />)

      expect(screen.getByText('Maximum 500 caractères')).toBeInTheDocument()
    })
  })

  describe('états', () => {
    it('devrait être désactivé', () => {
      render(<Textarea disabled />)

      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('devrait être required', () => {
      render(<Textarea required />)

      expect(screen.getByRole('textbox')).toBeRequired()
    })
  })

  describe('interactions', () => {
    it('devrait accepter la saisie multiligne', async () => {
      const user = userEvent.setup()
      render(<Textarea />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'Ligne 1{enter}Ligne 2')

      expect(textarea.value).toContain('Ligne 1')
      expect(textarea.value).toContain('Ligne 2')
    })
  })

  describe('displayName', () => {
    it('devrait avoir le displayName Textarea', () => {
      expect(Textarea.displayName).toBe('Textarea')
    })
  })
})
