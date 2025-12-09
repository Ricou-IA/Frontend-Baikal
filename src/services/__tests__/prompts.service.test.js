/**
 * Tests pour prompts.service.js - Service de gestion des prompts RAG
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  duplicatePrompt,
  togglePromptStatus,
  getVerticals,
  getOrganizations,
  checkPromptExists,
} from '../prompts.service'

// Mock du client Supabase
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// Mock des paramètres par défaut
vi.mock('../../config/prompts', () => ({
  DEFAULT_PARAMETERS: {
    temperature: 0.7,
    max_tokens: 1000,
  },
}))

import { supabase } from '../../lib/supabaseClient'

describe('promptsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('getPrompts()', () => {
    it('devrait récupérer tous les prompts', async () => {
      const mockPrompts = [
        { id: '1', name: 'Prompt 1', agent_type: 'assistant' },
        { id: '2', name: 'Prompt 2', agent_type: 'expert' },
      ]

      // Le chaînage est select -> order -> order -> order (3 order calls)
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      // La dernière méthode du chaînage retourne la promesse
      mockQuery.order.mockImplementation(() => {
        return {
          order: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockResolvedValue({ data: mockPrompts, error: null }),
          })),
        }
      })

      supabase.from.mockReturnValue(mockQuery)

      const result = await getPrompts()

      expect(result.data).toEqual(mockPrompts)
      expect(result.error).toBeNull()
    })

    it('devrait appliquer les filtres', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
      mockQuery.order.mockImplementation(() => ({
        order: vi.fn().mockImplementation(() => ({
          order: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        })),
      }))

      supabase.from.mockReturnValue(mockQuery)

      const result = await getPrompts({
        agent_type: 'assistant',
        vertical_id: 'v-123',
        is_active: true,
      })

      // Juste vérifier que ça retourne sans erreur
      expect(result.error).toBeNull()
    })

    it('devrait gérer les erreurs', async () => {
      const mockError = new Error('Database error')
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation(() => ({
          order: vi.fn().mockImplementation(() => ({
            order: vi.fn().mockResolvedValue({ data: null, error: mockError }),
          })),
        })),
      }

      supabase.from.mockReturnValue(mockQuery)

      const result = await getPrompts()

      expect(result.data).toBeNull()
      expect(result.error).toBe(mockError)
    })
  })

  describe('getPromptById()', () => {
    it('devrait récupérer un prompt par ID', async () => {
      const mockPrompt = { id: 'prompt-123', name: 'Test Prompt' }

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockPrompt, error: null }),
          }),
        }),
      })

      const result = await getPromptById('prompt-123')

      expect(result.data).toEqual(mockPrompt)
      expect(result.error).toBeNull()
    })

    it('devrait gérer prompt non trouvé', async () => {
      const mockError = { code: 'PGRST116' }

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
          }),
        }),
      })

      const result = await getPromptById('not-found')

      expect(result.data).toBeNull()
      expect(result.error).toEqual(mockError)
    })
  })

  describe('createPrompt()', () => {
    it('devrait créer un nouveau prompt', async () => {
      const newPrompt = {
        name: 'New Prompt',
        agent_type: 'assistant',
        system_prompt: 'You are a helpful assistant.',
      }

      const createdPrompt = { id: 'new-123', ...newPrompt }

      supabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: createdPrompt, error: null }),
          }),
        }),
      })

      const result = await createPrompt(newPrompt)

      expect(result.data).toEqual(createdPrompt)
      expect(result.error).toBeNull()
    })

    it('devrait fusionner les paramètres par défaut', async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      })

      supabase.from.mockReturnValue({ insert: insertMock })

      await createPrompt({
        name: 'Test',
        agent_type: 'assistant',
        system_prompt: 'Test',
        parameters: { temperature: 0.5 },
      })

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.objectContaining({
            temperature: 0.5,
            max_tokens: 1000,
          }),
        })
      )
    })

    it('devrait utiliser is_active true par défaut', async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      })

      supabase.from.mockReturnValue({ insert: insertMock })

      await createPrompt({
        name: 'Test',
        agent_type: 'assistant',
        system_prompt: 'Test',
      })

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      )
    })
  })

  describe('updatePrompt()', () => {
    it('devrait mettre à jour un prompt', async () => {
      const updatedPrompt = { id: 'prompt-123', name: 'Updated Name' }

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedPrompt, error: null }),
            }),
          }),
        }),
      })

      const result = await updatePrompt('prompt-123', { name: 'Updated Name' })

      expect(result.data).toEqual(updatedPrompt)
      expect(result.error).toBeNull()
    })

    it('devrait mettre à jour uniquement les champs fournis', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }),
      })

      supabase.from.mockReturnValue({ update: updateMock })

      await updatePrompt('prompt-123', { name: 'New Name', is_active: false })

      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Name',
          is_active: false,
          updated_at: expect.any(String),
        })
      )
    })
  })

  describe('deletePrompt()', () => {
    it('devrait supprimer un prompt', async () => {
      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      const result = await deletePrompt('prompt-123')

      expect(result.error).toBeNull()
    })

    it('devrait gérer les erreurs de suppression', async () => {
      const mockError = new Error('Cannot delete')

      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: mockError }),
        }),
      })

      const result = await deletePrompt('prompt-123')

      expect(result.error).toBe(mockError)
    })
  })

  describe('duplicatePrompt()', () => {
    it('devrait dupliquer un prompt', async () => {
      const originalPrompt = {
        id: 'original-123',
        name: 'Original Prompt',
        agent_type: 'assistant',
        system_prompt: 'Test prompt',
        parameters: { temperature: 0.7 },
        vertical_id: 'v-123',
        org_id: null,
      }

      // Mock getPromptById
      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: originalPrompt, error: null }),
          }),
        }),
      })

      // Mock createPrompt (insert)
      supabase.from.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { ...originalPrompt, id: 'copy-123', name: 'Original Prompt (copie)' },
              error: null
            }),
          }),
        }),
      })

      const result = await duplicatePrompt('original-123')

      expect(result.data.name).toBe('Original Prompt (copie)')
      expect(result.error).toBeNull()
    })

    it('devrait permettre les overrides', async () => {
      const originalPrompt = {
        id: 'original-123',
        name: 'Original',
        agent_type: 'assistant',
        system_prompt: 'Test',
        parameters: {},
      }

      supabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: originalPrompt, error: null }),
          }),
        }),
      })

      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      })

      supabase.from.mockReturnValueOnce({ insert: insertMock })

      await duplicatePrompt('original-123', { name: 'Custom Name', is_active: true })

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Custom Name' })
      )
    })
  })

  describe('togglePromptStatus()', () => {
    it('devrait activer un prompt', async () => {
      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prompt-123', is_active: true },
                error: null
              }),
            }),
          }),
        }),
      })

      const result = await togglePromptStatus('prompt-123', true)

      expect(result.data.is_active).toBe(true)
    })

    it('devrait désactiver un prompt', async () => {
      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'prompt-123', is_active: false },
                error: null
              }),
            }),
          }),
        }),
      })

      const result = await togglePromptStatus('prompt-123', false)

      expect(result.data.is_active).toBe(false)
    })
  })

  describe('getVerticals()', () => {
    it('devrait récupérer les verticales actives', async () => {
      const mockVerticals = [
        { id: 'v-1', name: 'Juridique' },
        { id: 'v-2', name: 'Finance' },
      ]

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockVerticals, error: null }),
          }),
        }),
      })

      const result = await getVerticals()

      expect(result.data).toEqual(mockVerticals)
      expect(result.error).toBeNull()
    })
  })

  describe('getOrganizations()', () => {
    it('devrait récupérer toutes les organisations', async () => {
      const mockOrgs = [
        { id: 'o-1', name: 'Org 1' },
        { id: 'o-2', name: 'Org 2' },
      ]

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockOrgs, error: null }),
        }),
      })

      const result = await getOrganizations()

      expect(result.data).toEqual(mockOrgs)
    })

    it('devrait filtrer par verticale', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      supabase.from.mockReturnValue(mockQuery)

      await getOrganizations('v-123')

      expect(mockQuery.eq).toHaveBeenCalledWith('vertical_id', 'v-123')
    })
  })

  describe('checkPromptExists()', () => {
    it('devrait retourner true si un prompt existe', async () => {
      // Quand vertical_id et org_id sont null, on utilise .is() pour chacun
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [{ id: 'existing' }], error: null }),
            }),
          }),
        }),
      })

      const result = await checkPromptExists('assistant', null, null)

      expect(result.exists).toBe(true)
    })

    it('devrait retourner false si aucun prompt n\'existe', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      })

      const result = await checkPromptExists('assistant', 'v-123', 'o-123')

      expect(result.exists).toBe(false)
    })

    it('devrait exclure un ID spécifique', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        neq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }

      supabase.from.mockReturnValue(mockQuery)

      await checkPromptExists('assistant', null, null, 'exclude-123')

      expect(mockQuery.neq).toHaveBeenCalledWith('id', 'exclude-123')
    })
  })
})
