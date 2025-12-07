// ============================================================================
// Page Validation - Workflow d'approbation des documents
// Interface de validation pour les documents en attente (status = 'pending')
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { documentsService } from '../services/documents.service';
import {
  DocumentStatus,
  LAYER_LABELS,
  LAYER_COLORS,
  LAYER_ICONS,
  QUALITY_LABELS,
  QUALITY_COLORS,
  STATUS_LABELS,
  formatFileSize,
  formatRelativeDate,
  getPermissions,
} from '../config/rag-layers.config';

import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  User,
  Calendar,
  Building2,
  BookOpen,
  FolderOpen,
  Filter,
  Search,
  CheckCheck,
  X,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  File,
  ExternalLink,
} from 'lucide-react';

// ============================================================================
// COMPOSANT BADGE DE COUCHE
// ============================================================================

function LayerBadge({ layer }) {
  const colors = LAYER_COLORS[layer];
  const IconMap = {
    BookOpen: BookOpen,
    Building2: Building2,
    FolderOpen: FolderOpen,
    User: User,
  };
  const Icon = IconMap[LAYER_ICONS[layer]] || FileText;

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full
      ${colors.bg} ${colors.text}
    `}>
      <Icon className="w-3.5 h-3.5" />
      {LAYER_LABELS[layer]}
    </span>
  );
}

// ============================================================================
// COMPOSANT CARTE DE DOCUMENT EN ATTENTE
// ============================================================================

function PendingDocumentCard({ 
  document, 
  isSelected, 
  onSelect, 
  onPreview,
  isProcessing 
}) {
  const colors = LAYER_COLORS[document.layer];

  return (
    <div
      className={`
        relative bg-white rounded-xl border-2 transition-all duration-200 overflow-hidden
        ${isSelected 
          ? 'border-indigo-400 shadow-md ring-2 ring-indigo-100' 
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
        }
        ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
      `}
      onClick={() => !isProcessing && onSelect(document.id)}
    >
      {/* Barre de couleur selon la couche */}
      <div className={`h-1 ${colors.badge}`} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div className="pt-0.5">
            <div className={`
              w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
              ${isSelected 
                ? 'bg-indigo-600 border-indigo-600' 
                : 'border-slate-300 bg-white'
              }
            `}>
              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
            </div>
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium text-slate-800 truncate">
                  {document.metadata?.title || document.metadata?.source_file || `Document #${document.id}`}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                  {document.content?.substring(0, 150)}...
                </p>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(document);
                }}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>

            {/* Métadonnées */}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <LayerBadge layer={document.layer} />
              
              {document.metadata?.category && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {document.metadata.category}
                </span>
              )}

              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                {formatRelativeDate(document.created_at)}
              </span>

              {document.creator?.display_name && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <User className="w-3.5 h-3.5" />
                  {document.creator.display_name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Indicateur de traitement */}
      {isProcessing && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPOSANT MODAL DE PRÉVISUALISATION
// ============================================================================

function PreviewModal({ document, onClose, onApprove, onReject, isProcessing }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!document) return null;

  const handleReject = () => {
    if (!rejectReason.trim()) {
      return;
    }
    onReject(document.id, rejectReason);
    setShowRejectForm(false);
    setRejectReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${LAYER_COLORS[document.layer].bg}`}>
              <FileText className={`w-5 h-5 ${LAYER_COLORS[document.layer].icon}`} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">
                {document.metadata?.title || `Document #${document.id}`}
              </h2>
              <p className="text-sm text-slate-500">
                Prévisualisation du document
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-auto p-6">
          {/* Métadonnées */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Couche</p>
              <LayerBadge layer={document.layer} />
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Qualité</p>
              <span className={`
                inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
                ${QUALITY_COLORS[document.quality_level]?.bg} ${QUALITY_COLORS[document.quality_level]?.text}
              `}>
                {QUALITY_LABELS[document.quality_level]}
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Créé le</p>
              <p className="text-sm font-medium text-slate-700">
                {new Date(document.created_at).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">Par</p>
              <p className="text-sm font-medium text-slate-700">
                {document.creator?.display_name || 'Inconnu'}
              </p>
            </div>
          </div>

          {/* Tags */}
          {document.metadata?.tags?.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-slate-500 mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {document.metadata.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {document.metadata?.description && (
            <div className="mb-6">
              <p className="text-xs text-slate-500 mb-2">Description</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                {document.metadata.description}
              </p>
            </div>
          )}

          {/* Contenu du document */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Aperçu du contenu</p>
            <div className="bg-slate-50 rounded-lg p-4 max-h-64 overflow-auto">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                {document.content}
              </pre>
            </div>
          </div>

          {/* Formulaire de rejet */}
          {showRejectForm && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <p className="font-medium text-red-800">Motif du rejet</p>
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Expliquez pourquoi ce document est rejeté..."
                rows={3}
                className="w-full px-3 py-2 border border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason('');
                  }}
                  className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || isProcessing}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Confirmer le rejet
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Actions */}
        {!showRejectForm && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
            >
              Fermer
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Rejeter
              </button>
              <button
                onClick={() => onApprove(document.id)}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Approuver
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT BARRE D'ACTIONS EN LOT
// ============================================================================

function BulkActionsBar({ 
  selectedCount, 
  onApproveAll, 
  onClearSelection, 
  isProcessing 
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
        <span className="text-sm">
          <span className="font-semibold">{selectedCount}</span> document{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
        </span>
        
        <div className="w-px h-6 bg-slate-700" />
        
        <button
          onClick={onClearSelection}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        
        <button
          onClick={onApproveAll}
          disabled={isProcessing}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCheck className="w-4 h-4" />
          )}
          Tout approuver
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function Validation() {
  const navigate = useNavigate();
  const { profile, organization, isSuperAdmin, isOrgAdmin } = useAuth();

  // États
  const [documents, setDocuments] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewDocument, setPreviewDocument] = useState(null);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Pagination
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  // Filtres
  const [filterLayer, setFilterLayer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Permissions
  const userRole = profile?.app_role || 'member';
  const permissions = getPermissions(userRole);

  // ============================================================================
  // CHARGEMENT DES DOCUMENTS
  // ============================================================================

  const loadDocuments = useCallback(async () => {
    if (!profile?.org_id) return;

    setIsLoading(true);
    setError(null);

    try {
      const filters = {
        orgId: profile.org_id,
        status: 'pending',
      };

      if (filterLayer) {
        filters.layer = filterLayer;
      }

      const result = await documentsService.getDocuments(filters, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        sortBy: 'created_at',
        sortOrder: 'asc', // Les plus anciens d'abord
      });

      if (result.error) throw result.error;

      setDocuments(result.data || []);
      setPagination(prev => ({
        ...prev,
        total: result.total,
        totalPages: result.totalPages,
      }));
    } catch (err) {
      console.error('[Validation] Error loading documents:', err);
      setError('Impossible de charger les documents en attente');
    } finally {
      setIsLoading(false);
    }
  }, [profile?.org_id, filterLayer, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSelect = (docId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handlePreview = (document) => {
    setPreviewDocument(document);
  };

  const handleClosePreview = () => {
    setPreviewDocument(null);
  };

  // ============================================================================
  // ACTIONS DE VALIDATION
  // ============================================================================

  const handleApprove = async (docId) => {
    setProcessingIds(prev => new Set(prev).add(docId));
    setError(null);

    try {
      const { success, error: approveError } = await documentsService.approveDocument(
        docId,
        profile?.id
      );

      if (!success || approveError) throw approveError || new Error('Échec de l\'approbation');

      // Retirer le document de la liste
      setDocuments(prev => prev.filter(d => d.id !== docId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));

      // Fermer la preview si c'était ce document
      if (previewDocument?.id === docId) {
        setPreviewDocument(null);
      }

      setSuccessMessage('Document approuvé avec succès');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('[Validation] Approve error:', err);
      setError('Erreur lors de l\'approbation');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleReject = async (docId, reason) => {
    setProcessingIds(prev => new Set(prev).add(docId));
    setError(null);

    try {
      const { success, error: rejectError } = await documentsService.rejectDocument(
        docId,
        profile?.id,
        reason
      );

      if (!success || rejectError) throw rejectError || new Error('Échec du rejet');

      // Retirer le document de la liste
      setDocuments(prev => prev.filter(d => d.id !== docId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));

      // Fermer la preview
      setPreviewDocument(null);

      setSuccessMessage('Document rejeté');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('[Validation] Reject error:', err);
      setError('Erreur lors du rejet');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handleApproveAll = async () => {
    const idsToApprove = Array.from(selectedIds);
    
    setProcessingIds(new Set(idsToApprove));
    setError(null);

    try {
      const { success, count, errors } = await documentsService.approveBatch(
        idsToApprove,
        profile?.id
      );

      // Retirer les documents approuvés
      setDocuments(prev => prev.filter(d => !selectedIds.has(d.id)));
      setPagination(prev => ({ ...prev, total: prev.total - count }));
      setSelectedIds(new Set());

      if (errors.length > 0) {
        setError(`${count} documents approuvés, ${errors.length} erreurs`);
      } else {
        setSuccessMessage(`${count} document${count > 1 ? 's' : ''} approuvé${count > 1 ? 's' : ''}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      console.error('[Validation] Batch approve error:', err);
      setError('Erreur lors de l\'approbation en lot');
    } finally {
      setProcessingIds(new Set());
    }
  };

  // ============================================================================
  // RENDER - Accès non autorisé
  // ============================================================================

  if (!permissions.canValidate) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Accès restreint
          </h2>
          <p className="text-slate-600 mb-6">
            Vous n'avez pas les droits pour valider des documents.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Retour au Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER - Page principale
  // ============================================================================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  Validation des documents
                </h1>
                <p className="text-sm text-slate-500">
                  {pagination.total} document{pagination.total > 1 ? 's' : ''} en attente
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={loadDocuments}
                disabled={isLoading}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Barre de filtres */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-4">
            {/* Sélectionner tout */}
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <div className={`
                w-4 h-4 rounded border-2 flex items-center justify-center
                ${selectedIds.size === documents.length && documents.length > 0
                  ? 'bg-indigo-600 border-indigo-600' 
                  : 'border-slate-300'
                }
              `}>
                {selectedIds.size === documents.length && documents.length > 0 && (
                  <CheckCircle2 className="w-3 h-3 text-white" />
                )}
              </div>
              Tout sélectionner
            </button>

            <div className="w-px h-6 bg-slate-200" />

            {/* Filtre par couche */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={filterLayer}
                onChange={(e) => {
                  setFilterLayer(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="text-sm border-0 bg-transparent text-slate-600 focus:outline-none focus:ring-0 cursor-pointer"
              >
                <option value="">Toutes les couches</option>
                <option value="vertical">Verticale Métier</option>
                <option value="org">Organisation</option>
                <option value="project">Projet</option>
                <option value="user">Personnel</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-700">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p>{successMessage}</p>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          /* État vide */
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-800 mb-2">
              Aucun document en attente
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              Tous les documents ont été traités. Revenez plus tard ou 
              vérifiez les autres couches.
            </p>
            <button
              onClick={() => navigate('/admin/documents')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Voir tous les documents
            </button>
          </div>
        ) : (
          /* Liste des documents */
          <>
            <div className="space-y-4">
              {documents.map((doc) => (
                <PendingDocumentCard
                  key={doc.id}
                  document={doc}
                  isSelected={selectedIds.has(doc.id)}
                  onSelect={handleSelect}
                  onPreview={handlePreview}
                  isProcessing={processingIds.has(doc.id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <span className="px-4 py-2 text-sm text-slate-600">
                  Page {pagination.page} sur {pagination.totalPages}
                </span>
                
                <button
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Barre d'actions en lot */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onApproveAll={handleApproveAll}
        onClearSelection={handleClearSelection}
        isProcessing={processingIds.size > 0}
      />

      {/* Modal de prévisualisation */}
      <PreviewModal
        document={previewDocument}
        onClose={handleClosePreview}
        onApprove={handleApprove}
        onReject={handleReject}
        isProcessing={processingIds.has(previewDocument?.id)}
      />
    </div>
  );
}
