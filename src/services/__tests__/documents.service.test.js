/**
 * Tests pour documents.service.js - Service de gestion des documents
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { documentsService } from '../documents.service'

// Mock du client Supabase
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    schema: vi.fn(),
  },
}))

import { supabase } from '../../lib/supabaseClient'

describe('documentsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('getLayerStats()', () => {
    it('devrait retourner les statistiques par couche', async () => {
      const mockData = [
        { layer: 'vertical', status: 'approved', quality_level: 'premium' },
        { layer: 'vertical', status: 'pending', quality_level: 'standard' },
        { layer: 'org', status: 'approved', quality_level: 'standard' },
        { layer: 'project', status: 'draft', quality_level: 'standard' },
      ]

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      })

      const result = await documentsService.getLayerStats('org-123')

      expect(result.error).toBeNull()
      expect(result.data.vertical.total).toBe(2)
      expect(result.data.vertical.approved).toBe(1)
      expect(result.data.vertical.pending).toBe(1)
      expect(result.data.org.total).toBe(1)
      expect(result.data.project.draft).toBe(1)
    })

    it('devrait gérer les données vides', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      })

      const result = await documentsService.getLayerStats('org-123')

      expect(result.error).toBeNull()
      expect(result.data.vertical.total).toBe(0)
      expect(result.data.org.total).toBe(0)
    })

    it('devrait gérer les erreurs', async () => {
      const mockError = new Error('Database error')
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: mockError }),
        }),
      })

      const result = await documentsService.getLayerStats('org-123')

      expect(result.data).toBeNull()
      expect(result.error).toBe(mockError)
    })
  })

  describe('getPendingCount()', () => {
    it('devrait retourner le nombre de documents en attente', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 15, error: null }),
          }),
        }),
      })

      const result = await documentsService.getPendingCount('org-123')

      expect(result.count).toBe(15)
      expect(result.error).toBeNull()
    })

    it('devrait retourner 0 si aucun document', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: null, error: null }),
          }),
        }),
      })

      const result = await documentsService.getPendingCount('org-123')

      expect(result.count).toBe(0)
    })
  })

  describe('getDocuments()', () => {
    it('devrait récupérer les documents avec pagination', async () => {
      const mockDocs = [
        { id: 1, title: 'Doc 1', layer: 'vertical' },
        { id: 2, title: 'Doc 2', layer: 'org' },
      ]

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: mockDocs, count: 2, error: null }),
      }

      supabase.from.mockReturnValue(mockQuery)

      const result = await documentsService.getDocuments(
        { orgId: 'org-123', layer: 'vertical' },
        { page: 1, pageSize: 20 }
      )

      expect(result.data).toEqual(mockDocs)
      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.error).toBeNull()
    })

    it('devrait appliquer les filtres correctement', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
      }

      supabase.from.mockReturnValue(mockQuery)

      await documentsService.getDocuments({
        orgId: 'org-123',
        layer: 'vertical',
        status: 'pending',
        search: 'test',
      })

      expect(mockQuery.eq).toHaveBeenCalledWith('org_id', 'org-123')
      expect(mockQuery.eq).toHaveBeenCalledWith('layer', 'vertical')
      expect(mockQuery.eq).toHaveBeenCalledWith('status', 'pending')
      expect(mockQuery.ilike).toHaveBeenCalledWith('title', '%test%')
    })

    it('devrait calculer totalPages correctement', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], count: 45, error: null }),
      }

      supabase.from.mockReturnValue(mockQuery)

      const result = await documentsService.getDocuments({}, { pageSize: 20 })

      expect(result.totalPages).toBe(3) // 45 / 20 = 2.25 -> ceil = 3
    })
  })

  describe('getDocumentById()', () => {
    it('devrait récupérer un document par ID', async () => {
      const mockDoc = { id: 123, title: 'Test Document' }

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
          }),
        }),
      })

      const result = await documentsService.getDocumentById(123)

      expect(result.data).toEqual(mockDoc)
      expect(result.error).toBeNull()
    })

    it('devrait gérer document non trouvé', async () => {
      const mockError = { code: 'PGRST116', message: 'No rows' }

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
          }),
        }),
      })

      const result = await documentsService.getDocumentById(999)

      expect(result.data).toBeNull()
      expect(result.error).toEqual(mockError)
    })
  })

  describe('checkDuplicate()', () => {
    it('devrait détecter un doublon', async () => {
      const existingFile = {
        id: 'file-123',
        original_filename: 'test.pdf',
        layer: 'vertical',
        created_at: '2024-01-01',
        creator: { display_name: 'John Doe' },
      }

      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingFile, error: null }),
              }),
            }),
          }),
        }),
      })

      const result = await documentsService.checkDuplicate('test.pdf', 1024, 'org-123')

      expect(result.isDuplicate).toBe(true)
      expect(result.existingFile).toBeTruthy()
      expect(result.existingFile.filename).toBe('test.pdf')
    })

    it('devrait retourner false si pas de doublon', async () => {
      supabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      })

      const result = await documentsService.checkDuplicate('new.pdf', 2048, 'org-123')

      expect(result.isDuplicate).toBe(false)
      expect(result.existingFile).toBeNull()
    })
  })

  describe('approveDocument()', () => {
    it('devrait approuver un document', async () => {
      const approvedDoc = { id: 123, status: 'approved', approved_by: 'user-123' }

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: approvedDoc, error: null }),
            }),
          }),
        }),
      })

      const result = await documentsService.approveDocument(123, 'user-123')

      expect(result.success).toBe(true)
      expect(result.data.status).toBe('approved')
      expect(result.error).toBeNull()
    })

    it('devrait gérer les erreurs d\'approbation', async () => {
      const mockError = new Error('Permission denied')

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: mockError }),
            }),
          }),
        }),
      })

      const result = await documentsService.approveDocument(123, 'user-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe(mockError)
    })
  })

  describe('rejectDocument()', () => {
    it('devrait rejeter un document avec raison', async () => {
      const rejectedDoc = { id: 123, status: 'rejected', rejection_reason: 'Contenu incorrect' }

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: rejectedDoc, error: null }),
            }),
          }),
        }),
      })

      const result = await documentsService.rejectDocument(123, 'user-123', 'Contenu incorrect')

      expect(result.success).toBe(true)
      expect(result.data.status).toBe('rejected')
    })
  })

  describe('bulkApprove()', () => {
    it('devrait approuver plusieurs documents', async () => {
      const approvedDocs = [
        { id: 1, status: 'approved' },
        { id: 2, status: 'approved' },
        { id: 3, status: 'approved' },
      ]

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: approvedDocs, error: null }),
          }),
        }),
      })

      const result = await documentsService.bulkApprove([1, 2, 3], 'user-123')

      expect(result.success).toBe(true)
      expect(result.count).toBe(3)
    })
  })

  describe('bulkReject()', () => {
    it('devrait rejeter plusieurs documents', async () => {
      const rejectedDocs = [
        { id: 1, status: 'rejected' },
        { id: 2, status: 'rejected' },
      ]

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: rejectedDocs, error: null }),
          }),
        }),
      })

      const result = await documentsService.bulkReject([1, 2], 'user-123', 'Non conforme')

      expect(result.success).toBe(true)
      expect(result.count).toBe(2)
    })
  })

  describe('changeDocumentLayer()', () => {
    it('devrait changer la couche d\'un document', async () => {
      const updatedDoc = { id: 123, layer: 'org' }

      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedDoc, error: null }),
            }),
          }),
        }),
      })

      const result = await documentsService.changeDocumentLayer(123, 'org', 'user-123')

      expect(result.success).toBe(true)
      expect(result.data.layer).toBe('org')
    })
  })

  describe('deleteDocument()', () => {
    it('devrait supprimer un document', async () => {
      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      const result = await documentsService.deleteDocument(123)

      expect(result.success).toBe(true)
      expect(result.error).toBeNull()
    })

    it('devrait gérer les erreurs de suppression', async () => {
      const mockError = new Error('Delete failed')

      supabase.from.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: mockError }),
        }),
      })

      const result = await documentsService.deleteDocument(123)

      expect(result.success).toBe(false)
      expect(result.error).toBe(mockError)
    })
  })

  describe('deleteSourceFile()', () => {
    it('devrait supprimer un fichier source et ses chunks', async () => {
      // Mock pour la suppression des chunks
      const fromMock = vi.fn()

      fromMock.mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
        }),
      })

      fromMock.mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })

      supabase.from = fromMock

      const result = await documentsService.deleteSourceFile('file-123')

      expect(result.success).toBe(true)
      expect(result.deletedChunks).toBe(5)
    })
  })

  describe('uploadToStorage()', () => {
    it('devrait uploader un fichier vers le storage', async () => {
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })

      supabase.storage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: 'project/user-123/123_test.pdf' },
          error: null,
        }),
      })

      const result = await documentsService.uploadToStorage(mockFile, 'user-123', 'project')

      expect(result.path).toContain('test.pdf')
      expect(result.error).toBeNull()
    })

    it('devrait gérer les erreurs d\'upload', async () => {
      const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' })
      const mockError = new Error('Storage full')

      supabase.storage.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: null, error: mockError }),
      })

      const result = await documentsService.uploadToStorage(mockFile, 'user-123')

      expect(result.path).toBeNull()
      expect(result.error).toBe(mockError)
    })
  })

  describe('syncLegifranceCodes()', () => {
    it('devrait synchroniser des codes Légifrance', async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: { jobId: 'job-123', status: 'started' },
        error: null,
      })

      const result = await documentsService.syncLegifranceCodes({
        codeIds: ['code-1', 'code-2'],
        verticalId: 'vertical-123',
        layer: 'vertical',
      })

      expect(result.data.success).toBe(true)
      expect(result.data.syncedCodes).toBe(2)
      expect(result.error).toBeNull()

      expect(supabase.functions.invoke).toHaveBeenCalledWith('sync-legifrance', {
        body: {
          codeIds: ['code-1', 'code-2'],
          verticalId: 'vertical-123',
          layer: 'vertical',
          action: 'sync',
        },
      })
    })
  })

  describe('getLegifranceSyncStatus()', () => {
    it('devrait récupérer le statut d\'un job', async () => {
      const mockJob = { id: 'job-123', status: 'completed', progress: 100 }

      supabase.schema.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockJob, error: null }),
            }),
          }),
        }),
      })

      const result = await documentsService.getLegifranceSyncStatus('job-123')

      expect(result.data).toEqual(mockJob)
      expect(result.error).toBeNull()
    })
  })

  describe('getLegifranceSyncHistory()', () => {
    it('devrait récupérer l\'historique des synchronisations', async () => {
      const mockHistory = [
        { id: 'job-1', status: 'completed' },
        { id: 'job-2', status: 'failed' },
      ]

      supabase.schema.mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: mockHistory, error: null }),
              }),
            }),
          }),
        }),
      })

      const result = await documentsService.getLegifranceSyncHistory({ codeId: 'code-123' })

      expect(result.data).toEqual(mockHistory)
      expect(result.error).toBeNull()
    })
  })

  describe('calculateFileHash()', () => {
    it('devrait calculer le hash SHA-256 d\'un fichier', async () => {
      // Mock crypto.subtle.digest car il n'est pas disponible dans jsdom
      const mockHashBuffer = new Uint8Array(32).fill(171) // 0xAB = 171
      const mockDigest = vi.fn().mockResolvedValue(mockHashBuffer.buffer)
      Object.defineProperty(global, 'crypto', {
        value: {
          subtle: {
            digest: mockDigest,
          },
        },
        writable: true,
      })

      // Créer un mock file avec arrayBuffer method
      const mockContent = new TextEncoder().encode('test content')
      const mockFile = {
        name: 'test.txt',
        type: 'text/plain',
        arrayBuffer: vi.fn().mockResolvedValue(mockContent.buffer),
      }

      const hash = await documentsService.calculateFileHash(mockFile)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA-256 = 64 caractères hex (32 bytes * 2)
      expect(hash).toBe('ab'.repeat(32)) // Tous les bytes sont 0xAB
      expect(mockFile.arrayBuffer).toHaveBeenCalled()
      expect(mockDigest).toHaveBeenCalled()
    })
  })
})
