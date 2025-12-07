/**
 * Documents.jsx - Baikal Console
 * ============================================================================
 * Page de visualisation des couches RAG.
 * Interface d'exploration et gestion des documents par couche.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { documentsService } from '../services/documents.service';
import {
  DocumentLayer,
  DocumentStatus,
  LAYER_LABELS,
  LAYER_DESCRIPTIONS,
  LAYER_COLORS,
  LAYER_ICONS,
  STATUS_LABELS,
  STATUS_COLORS,
  getPermissions,
} from '../config/rag-layers.config';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  FolderOpen,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  Upload,
  Eye,
  Layers,
  TrendingUp,
} from 'lucide-react';

// ============================================================================
// MAPPING DES ICÔNES
// ============================================================================

const IconMap = {
  BookOpen,
  Building2,
  FolderOpen,
  User,
};

// ============================================================================
// COMPOSANT CARTE DE COUCHE
// ============================================================================

function LayerCard({ layer, stats, isActive, onClick, canAccess }) {
  const colors = LAYER_COLORS[layer];
  const IconComponent = IconMap[LAYER_ICONS[layer]] || FileText;
  
  return (
    <button
      onClick={() => canAccess && onClick(layer)}
      disabled={!canAccess}
      className={`
        relative w-full p-5 rounded-xl border-2 text-left transition-all duration-200
        ${isActive 
          ? `${colors.border} ${colors.bg} shadow-md` 
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
        }
        ${!canAccess ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {stats.total > 0 && (
        <div className={`absolute -top-2 -right-2 px-2 py-0.5 text-xs font-bold text-white rounded-full ${colors.badge}`}>
          {stats.total}
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${colors.bg}`}>
          <IconComponent className={`w-6 h-6 ${colors.icon}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${isActive ? colors.text : 'text-slate-800'}`}>
            {LAYER_LABELS[layer]}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
            {LAYER_DESCRIPTIONS[layer]}
          </p>

          {stats.total > 0 && (
            <div className="flex items-center gap-3 mt-3 text-xs">
              {stats.approved > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {stats.approved}
                </span>
              )}
              {stats.pending > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Clock className="w-3.5 h-3.5" />
                  {stats.pending}
                </span>
              )}
              {stats.rejected > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="w-3.5 h-3.5" />
                  {stats.rejected}
                </span>
              )}
            </div>
          )}
        </div>

        {canAccess && (
          <ChevronRight className={`w-5 h-5 mt-1 ${isActive ? colors.text : 'text-slate-400'}`} />
        )}
      </div>
    </button>
  );
}

// ============================================================================
// COMPOSANT STAT GLOBALE
// ============================================================================

function GlobalStatCard({ icon: Icon, label, value, subValue, color = 'slate' }) {
  const colorClasses = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
          {subValue && (
            <p className="text-xs text-slate-400 mt-0.5">{subValue}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT LISTE DE DOCUMENTS PREVIEW
// ============================================================================

function DocumentsPreview({ documents, isLoading, onViewAll, layer }) {
  const colors = LAYER_COLORS[layer];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Aucun document dans cette couche</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.slice(0, 5).map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <FileText className={`w-5 h-5 ${colors.icon}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">
              {doc.metadata?.source_file || `Document #${doc.id}`}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {doc.content?.substring(0, 100)}...
            </p>
          </div>
          <span className={`
            px-2 py-0.5 text-xs font-medium rounded-full
            ${STATUS_COLORS[doc.status]?.bg} ${STATUS_COLORS[doc.status]?.text}
          `}>
            {STATUS_LABELS[doc.status]}
          </span>
        </div>
      ))}

      {documents.length > 5 && (
        <button
          onClick={onViewAll}
          className="w-full py-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium hover:bg-indigo-50 rounded-lg transition-colors"
        >
          Voir les {documents.length - 5} autres documents →
        </button>
      )}
    </div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function Documents() {
  const navigate = useNavigate();
  const { profile, organization, isSuperAdmin, isOrgAdmin } = useAuth();

  const [activeLayer, setActiveLayer] = useState(null);
  const [layerStats, setLayerStats] = useState({
    vertical: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
    org: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
    project: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
    user: { total: 0, pending: 0, approved: 0, rejected: 0, draft: 0 },
  });
  const [layerDocuments, setLayerDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [error, setError] = useState(null);

  const userRole = profile?.app_role || 'member';
  const permissions = getPermissions(userRole);

  const totalDocuments = Object.values(layerStats).reduce((sum, s) => sum + s.total, 0);
  const totalPending = Object.values(layerStats).reduce((sum, s) => sum + s.pending, 0);
  const totalApproved = Object.values(layerStats).reduce((sum, s) => sum + s.approved, 0);

  const loadStats = async () => {
    if (!profile?.org_id) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: statsError } = await documentsService.getLayerStats(profile.org_id);
      
      if (statsError) throw statsError;
      
      if (data) {
        setLayerStats(data);
      }
    } catch (err) {
      console.error('[Documents] Error loading stats:', err);
      setError('Impossible de charger les statistiques');
    } finally {
      setIsLoading(false);
    }
  };

  const loadLayerDocuments = async (layer) => {
    if (!profile?.org_id) return;

    setIsLoadingDocuments(true);

    try {
      const { data, error: docsError } = await documentsService.getDocuments(
        { orgId: profile.org_id, layer },
        { page: 1, pageSize: 10, sortBy: 'created_at', sortOrder: 'desc' }
      );

      if (docsError) throw docsError;

      setLayerDocuments(data || []);
    } catch (err) {
      console.error('[Documents] Error loading documents:', err);
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [profile?.org_id]);

  useEffect(() => {
    if (activeLayer) {
      loadLayerDocuments(activeLayer);
    } else {
      setLayerDocuments([]);
    }
  }, [activeLayer]);

  const handleLayerClick = (layer) => {
    setActiveLayer(activeLayer === layer ? null : layer);
  };

  const handleRefresh = () => {
    loadStats();
    if (activeLayer) {
      loadLayerDocuments(activeLayer);
    }
  };

  const handleViewAllDocuments = () => {
    navigate(`/admin/documents?layer=${activeLayer}`);
  };

  // Render - Non autorisé
  if (!isOrgAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Accès restreint
          </h2>
          <p className="text-slate-600 mb-6">
            Vous n'avez pas les droits nécessaires pour accéder à cette page.
          </p>
          <button
            onClick={() => navigate('/admin')}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Retour à l'administration
          </button>
        </div>
      </div>
    );
  }

  // Render - Page principale
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Base documentaire
                </h1>
                <p className="text-sm text-slate-500">
                  {organization?.name || 'Organisation'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => navigate('/admin/ingestion')}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Ingérer un document</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Erreur globale */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
            <button
              onClick={handleRefresh}
              className="ml-auto text-sm font-medium hover:underline"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Stats globales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <GlobalStatCard
            icon={FileText}
            label="Documents totaux"
            value={isLoading ? '...' : totalDocuments}
            color="slate"
          />
          <GlobalStatCard
            icon={CheckCircle2}
            label="Approuvés"
            value={isLoading ? '...' : totalApproved}
            subValue={totalDocuments > 0 ? `${Math.round((totalApproved / totalDocuments) * 100)}%` : undefined}
            color="green"
          />
          <GlobalStatCard
            icon={Clock}
            label="En attente"
            value={isLoading ? '...' : totalPending}
            color="yellow"
          />
          <GlobalStatCard
            icon={TrendingUp}
            label="Couches actives"
            value={isLoading ? '...' : Object.values(layerStats).filter(s => s.total > 0).length}
            subValue="sur 4"
            color="purple"
          />
        </div>

        {/* Grille principale */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne gauche : Couches */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">
              Couches documentaires
            </h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="space-y-3">
                {Object.values(DocumentLayer).map((layer) => (
                  <LayerCard
                    key={layer}
                    layer={layer}
                    stats={layerStats[layer]}
                    isActive={activeLayer === layer}
                    onClick={handleLayerClick}
                    canAccess={
                      permissions.canViewAllLayers || 
                      layer === DocumentLayer.PROJECT || 
                      layer === DocumentLayer.USER
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Colonne droite : Détails */}
          <div className="lg:col-span-2">
            {activeLayer ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header du panel */}
                <div className={`px-6 py-4 border-b ${LAYER_COLORS[activeLayer].bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {React.createElement(IconMap[LAYER_ICONS[activeLayer]] || FileText, {
                        className: `w-6 h-6 ${LAYER_COLORS[activeLayer].icon}`
                      })}
                      <div>
                        <h3 className={`font-semibold ${LAYER_COLORS[activeLayer].text}`}>
                          {LAYER_LABELS[activeLayer]}
                        </h3>
                        <p className="text-sm text-slate-600">
                          {layerStats[activeLayer].total} document{layerStats[activeLayer].total > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleViewAllDocuments}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-white/50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Voir tout
                      </button>
                    </div>
                  </div>
                </div>

                {/* Liste des documents */}
                <div className="p-6">
                  <DocumentsPreview
                    documents={layerDocuments}
                    isLoading={isLoadingDocuments}
                    onViewAll={handleViewAllDocuments}
                    layer={activeLayer}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Layers className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">
                  Sélectionnez une couche
                </h3>
                <p className="text-slate-500 max-w-md mx-auto">
                  Cliquez sur une couche documentaire à gauche pour visualiser 
                  son contenu et accéder aux documents.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Alerte documents en attente */}
        {totalPending > 0 && permissions.canValidate && (
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">
                  {totalPending} document{totalPending > 1 ? 's' : ''} en attente de validation
                </p>
                <p className="text-sm text-yellow-600">
                  Des documents nécessitent votre approbation
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/validation')}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
            >
              Valider maintenant
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
