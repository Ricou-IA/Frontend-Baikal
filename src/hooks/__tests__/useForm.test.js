/**
 * Tests pour useForm - Hook de gestion de formulaires
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useForm } from '../useForm'

describe('useForm()', () => {
  describe('initialisation', () => {
    it('devrait initialiser avec les valeurs par défaut', () => {
      const { result } = renderHook(() => useForm())

      expect(result.current.values).toEqual({})
      expect(result.current.errors).toEqual({})
      expect(result.current.touched).toEqual({})
      expect(result.current.isSubmitting).toBe(false)
      expect(result.current.submitCount).toBe(0)
    })

    it('devrait initialiser avec les valeurs fournies', () => {
      const initialValues = { email: 'test@test.com', password: '' }
      const { result } = renderHook(() => useForm({ initialValues }))

      expect(result.current.values).toEqual(initialValues)
    })

    it('devrait calculer isValid correctement', () => {
      const validate = (values) => {
        const errors = {}
        if (!values.email) errors.email = 'Email requis'
        return errors
      }
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate,
      }))

      expect(result.current.isValid).toBe(false)
    })

    it('devrait calculer isDirty correctement', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      expect(result.current.isDirty).toBe(false)
    })
  })

  describe('handleChange()', () => {
    it('devrait mettre à jour une valeur avec un événement', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.handleChange({
          target: { name: 'email', value: 'new@test.com', type: 'text' },
        })
      })

      expect(result.current.values.email).toBe('new@test.com')
    })

    it('devrait mettre à jour une valeur avec nom et valeur directement', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.handleChange('email', 'direct@test.com')
      })

      expect(result.current.values.email).toBe('direct@test.com')
    })

    it('devrait gérer les checkboxes', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { remember: false },
      }))

      act(() => {
        result.current.handleChange({
          target: { name: 'remember', checked: true, type: 'checkbox' },
        })
      })

      expect(result.current.values.remember).toBe(true)
    })

    it('devrait marquer le formulaire comme dirty', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.handleChange('email', 'new@test.com')
      })

      expect(result.current.isDirty).toBe(true)
    })

    it('devrait valider au changement si validateOnChange est activé', () => {
      const validate = vi.fn().mockReturnValue({ email: 'Email invalide' })
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate,
        validateOnChange: true,
      }))

      act(() => {
        result.current.handleChange('email', 'invalid')
      })

      expect(validate).toHaveBeenCalled()
      expect(result.current.errors.email).toBe('Email invalide')
    })
  })

  describe('handleBlur()', () => {
    it('devrait marquer le champ comme touched avec un événement', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.handleBlur({
          target: { name: 'email' },
        })
      })

      expect(result.current.touched.email).toBe(true)
    })

    it('devrait marquer le champ comme touched avec un nom directement', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.handleBlur('email')
      })

      expect(result.current.touched.email).toBe(true)
    })

    it('devrait valider le champ au blur par défaut', () => {
      const validate = (values) => {
        const errors = {}
        if (!values.email) errors.email = 'Email requis'
        return errors
      }
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate,
      }))

      act(() => {
        result.current.handleBlur('email')
      })

      expect(result.current.errors.email).toBe('Email requis')
    })

    it('ne devrait pas valider au blur si validateOnBlur est false', () => {
      // Note: validate est quand même appelé pour calculer isValid (useMemo)
      // mais handleBlur ne déclenche pas de validation supplémentaire
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validateOnBlur: false,
      }))

      act(() => {
        result.current.handleBlur('email')
      })

      expect(result.current.touched.email).toBe(true)
      // Pas d'erreur ajoutée au blur car validateOnBlur est false
      expect(result.current.errors.email).toBeUndefined()
    })
  })

  describe('handleSubmit()', () => {
    it('devrait prévenir le comportement par défaut de l\'événement', async () => {
      const preventDefault = vi.fn()
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      await act(async () => {
        await result.current.handleSubmit({ preventDefault })
      })

      expect(preventDefault).toHaveBeenCalled()
    })

    it('devrait incrémenter submitCount', async () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      await act(async () => {
        await result.current.handleSubmit()
      })

      expect(result.current.submitCount).toBe(1)
    })

    it('devrait marquer tous les champs comme touched', async () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '', password: '' },
      }))

      await act(async () => {
        await result.current.handleSubmit()
      })

      expect(result.current.touched.email).toBe(true)
      expect(result.current.touched.password).toBe(true)
    })

    it('ne devrait pas appeler onSubmit si validation échoue', async () => {
      const onSubmit = vi.fn()
      const validate = () => ({ email: 'Email requis' })
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate,
        onSubmit,
      }))

      await act(async () => {
        await result.current.handleSubmit()
      })

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('devrait appeler onSubmit si validation réussit', async () => {
      const onSubmit = vi.fn()
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
        validate: () => ({}),
        onSubmit,
      }))

      await act(async () => {
        await result.current.handleSubmit()
      })

      expect(onSubmit).toHaveBeenCalledWith({ email: 'test@test.com' })
    })

    it('devrait gérer isSubmitting correctement', async () => {
      let resolveSubmit
      const onSubmit = vi.fn().mockImplementation(() => new Promise(resolve => {
        resolveSubmit = resolve
      }))

      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
        validate: () => ({}),
        onSubmit,
      }))

      let submitPromise
      act(() => {
        submitPromise = result.current.handleSubmit()
      })

      // Pendant la soumission
      expect(result.current.isSubmitting).toBe(true)

      await act(async () => {
        resolveSubmit()
        await submitPromise
      })

      // Après la soumission
      expect(result.current.isSubmitting).toBe(false)
    })

    it('devrait propager les erreurs de onSubmit', async () => {
      const error = new Error('Submit failed')
      const onSubmit = vi.fn().mockRejectedValue(error)
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
        validate: () => ({}),
        onSubmit,
      }))

      await expect(act(async () => {
        await result.current.handleSubmit()
      })).rejects.toThrow('Submit failed')

      expect(result.current.isSubmitting).toBe(false)
    })
  })

  describe('reset()', () => {
    it('devrait réinitialiser aux valeurs initiales', () => {
      const initialValues = { email: 'initial@test.com' }
      const { result } = renderHook(() => useForm({ initialValues }))

      act(() => {
        result.current.handleChange('email', 'changed@test.com')
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.values.email).toBe('initial@test.com')
    })

    it('devrait réinitialiser les erreurs', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.setError('email', 'Erreur')
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.errors).toEqual({})
    })

    it('devrait réinitialiser touched', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.handleBlur('email')
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.touched).toEqual({})
    })

    it('devrait réinitialiser submitCount', async () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      await act(async () => {
        await result.current.handleSubmit()
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.submitCount).toBe(0)
    })

    it('devrait accepter de nouvelles valeurs initiales', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'old@test.com' },
      }))

      act(() => {
        result.current.reset({ email: 'new@test.com' })
      })

      expect(result.current.values.email).toBe('new@test.com')
    })
  })

  describe('setValue()', () => {
    it('devrait définir une valeur spécifique', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.setValue('email', 'set@test.com')
      })

      expect(result.current.values.email).toBe('set@test.com')
    })
  })

  describe('setError()', () => {
    it('devrait définir une erreur spécifique', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.setError('email', 'Erreur personnalisée')
      })

      expect(result.current.errors.email).toBe('Erreur personnalisée')
    })
  })

  describe('setMultipleValues()', () => {
    it('devrait définir plusieurs valeurs à la fois', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '', password: '', name: '' },
      }))

      act(() => {
        result.current.setMultipleValues({
          email: 'multi@test.com',
          name: 'Test User',
        })
      })

      expect(result.current.values.email).toBe('multi@test.com')
      expect(result.current.values.name).toBe('Test User')
      expect(result.current.values.password).toBe('')
    })
  })

  describe('validateForm()', () => {
    it('devrait valider le formulaire et retourner les erreurs', () => {
      const validate = (values) => {
        const errors = {}
        if (!values.email) errors.email = 'Email requis'
        if (!values.password) errors.password = 'Mot de passe requis'
        return errors
      }
      const { result } = renderHook(() => useForm({
        initialValues: { email: '', password: '' },
        validate,
      }))

      let errors
      act(() => {
        errors = result.current.validateForm()
      })

      expect(errors).toEqual({
        email: 'Email requis',
        password: 'Mot de passe requis',
      })
      expect(result.current.errors).toEqual(errors)
    })
  })

  describe('validateField()', () => {
    it('devrait valider un champ spécifique', () => {
      const validate = (values) => {
        const errors = {}
        if (!values.email) errors.email = 'Email requis'
        return errors
      }
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate,
      }))

      let error
      act(() => {
        error = result.current.validateField('email')
      })

      expect(error).toBe('Email requis')
      expect(result.current.errors.email).toBe('Email requis')
    })
  })

  describe('getFieldProps()', () => {
    it('devrait retourner les props pour un input', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      const props = result.current.getFieldProps('email')

      expect(props.name).toBe('email')
      expect(props.value).toBe('test@test.com')
      expect(typeof props.onChange).toBe('function')
      expect(typeof props.onBlur).toBe('function')
    })

    it('devrait retourner une chaîne vide pour les valeurs undefined', () => {
      const { result } = renderHook(() => useForm({
        initialValues: {},
      }))

      const props = result.current.getFieldProps('email')

      expect(props.value).toBe('')
    })
  })

  describe('getFieldMeta()', () => {
    it('devrait retourner les métadonnées d\'un champ', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      act(() => {
        result.current.handleBlur('email')
        result.current.setError('email', 'Erreur')
      })

      const meta = result.current.getFieldMeta('email')

      expect(meta.value).toBe('test@test.com')
      expect(meta.error).toBe('Erreur')
      expect(meta.touched).toBe(true)
      expect(meta.hasError).toBe(true)
    })

    it('devrait retourner hasError false si non touched', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
      }))

      act(() => {
        result.current.setError('email', 'Erreur')
      })

      const meta = result.current.getFieldMeta('email')

      expect(meta.error).toBe('Erreur')
      // touched[name] retourne undefined si non initialisé, converti en false par ??
      expect(meta.touched).toBe(false)
      // hasError = touched[name] && !!errors[name]
      // Comme touched est false (undefined converti), hasError est false
      expect(meta.hasError).toBeFalsy()
    })
  })

  describe('isValid', () => {
    it('devrait être true si pas d\'erreurs', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'valid@test.com' },
        validate: () => ({}),
      }))

      expect(result.current.isValid).toBe(true)
    })

    it('devrait être false si erreurs', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate: (values) => {
          if (!values.email) return { email: 'Requis' }
          return {}
        },
      }))

      expect(result.current.isValid).toBe(false)
    })

    it('devrait se mettre à jour quand les valeurs changent', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: '' },
        validate: (values) => {
          if (!values.email) return { email: 'Requis' }
          return {}
        },
      }))

      expect(result.current.isValid).toBe(false)

      act(() => {
        result.current.handleChange('email', 'now@valid.com')
      })

      expect(result.current.isValid).toBe(true)
    })
  })

  describe('isDirty', () => {
    it('devrait être false initialement', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      expect(result.current.isDirty).toBe(false)
    })

    it('devrait être true après modification', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      act(() => {
        result.current.handleChange('email', 'changed@test.com')
      })

      expect(result.current.isDirty).toBe(true)
    })

    it('devrait redevenir false si valeur revient à l\'initial', () => {
      const { result } = renderHook(() => useForm({
        initialValues: { email: 'test@test.com' },
      }))

      act(() => {
        result.current.handleChange('email', 'changed@test.com')
      })

      expect(result.current.isDirty).toBe(true)

      act(() => {
        result.current.handleChange('email', 'test@test.com')
      })

      expect(result.current.isDirty).toBe(false)
    })
  })
})
