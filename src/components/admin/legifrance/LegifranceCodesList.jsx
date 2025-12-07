// ============================================================================
// Composant LegifranceCodesList - Liste des codes juridiques
// Version 2 : Verticales et Domaines depuis props (chargés via Supabase)
// ============================================================================

import React, { useState } from 'react';
import {
    BookOpen,
    RefreshCw,
    Search,
    Filter,
    ChevronDown,
    ChevronUp,
    Clock,
    Database,
    Building2,
    CheckCircle,
    XCircle,
    AlertCircle,
    History,
    ToggleLeft,
    ToggleRight,
    Loader2,
    Play,
    Layers,
    FolderOpen,
} from 'lucide-react';

// ============================================================================
// COMPOSANTS UTILITAIRES
// ============================================================================

/**
 * Badge de verticale compact
 */
function VerticalTag({ verticalId, verticals = [] }) {
    const vertical = verticals.find(v => v.id === verticalId);
    if (!vertical) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border bg-slate-50 text-slate-600 border-slate-200">
                {verticalId}
            </span>
        );
    }

    // Générer les classes de couleur basées sur la couleur hex
    const bgColor = vertical.color ? `${vertical.color}15` : '#6366f115';
    const textColor = vertical.color || '#6366f1';
    const borderColor = vertical.color ? `${vertical.color}30` : '#6366f130';

    return (
        <span 
            className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border"
            style={{ 
                backgroundColor: bgColor, 
                color: textColor, 
                borderColor: borderColor 
            }}
        >
            {vertical.label || vertical.name}
        </span>
    );
}

/**
 * Badge de domaine
 */
function DomainBadge({ domain }) {
    if (!domain) return null;

    const bgColor = domain.color ? `${domain.color}15` : '#64748b15';
    const textColor = domain.color || '#64748b';

    return (
        <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md"
            style={{ backgroundColor: bgColor, color: textColor }}
        >
            <FolderOpen className="w-3 h-3" />
            {domain.name}
        </span>
    );
}

/**
 * Badge de statut de synchronisation
 */
function SyncStatusBadge({ code }) {
    if (!code.last_sync_at) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                <XCircle className="w-3.5 h-3.5" />
                Non synchronisé
            </span>
        );
    }

    const lastSync = new Date(code.last_sync_at);
    const now = new Date();
    const daysSince = Math.floor((now - lastSync) / (1000 * 60 * 60 * 24));

    if (daysSince > 30) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                <AlertCircle className="w-3.5 h-3.5" />
                {daysSince}j
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle className="w-3.5 h-3.5" />
            {lastSync.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </span>
    );
}

/**
 * Barre de progression des articles indexés
 */
function IndexProgressBar({ indexed, total }) {
    const percentage = total > 0 ? Math.round((indexed / total) * 100) : 0;
    
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="text-xs text-slate-500 tabular-nums min-w-[3rem] text-right">
                {percentage}%
            </span>
        </div>
    );
}

// ============================================================================
// COMPOSANT CARTE DE CODE
// ============================================================================

function CodeCard({ 
    code, 
    verticals = [],
    onSync, 
    onToggleEnabled, 
    onViewHistory, 
    getOrganizationById,
    expanded,
    onToggleExpand,
    toggling 
}) {
    const grantedOrgs = (code.granted_org_ids || [])
        .map(id => getOrganizationById?.(id))
        .filter(Boolean);

    return (
        <div className={`
            bg-white rounded-xl border transition-all duration-200
            ${code.is_enabled 
                ? 'border-slate-200 hover:border-indigo-200 hover:shadow-md' 
                : 'border-slate-100 bg-slate-50/50 opacity-75'
            }
        `}>
            {/* Header de la carte */}
            <div className="p-4">
                <div className="flex items-start gap-4">
                    {/* Icône */}
                    <div className={`
                        w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0
                        ${code.is_enabled 
                            ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/25' 
                            : 'bg-slate-200 text-slate-400'
                        }
                    `}>
                        <BookOpen className="w-6 h-6" />
                    </div>

                    {/* Infos principales */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-800 truncate">
                                {code.name}
                            </h3>
                            {code.short_name && (
                                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                    {code.short_name}
                                </span>
                            )}
                        </div>
                        
                        {/* Domaine */}
                        {code.domain && (
                            <div className="mb-2">
                                <DomainBadge domain={code.domain} />
                            </div>
                        )}

                        {/* Verticales */}
                        <div className="flex flex-wrap gap-1.5">
                            {(code.default_verticals || []).map(v => (
                                <VerticalTag key={v} verticalId={v} verticals={verticals} />
                            ))}
                            {(code.default_verticals || []).length === 0 && (
                                <span className="text-xs text-slate-400 italic">
                                    Aucune verticale
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions et stats */}
                    <div className="flex flex-col items-end gap-2">
                        {/* Toggle enabled */}
                        <button
                            onClick={() => onToggleEnabled(code.id, !code.is_enabled)}
                            disabled={toggling}
                            className={`
                                flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                                ${code.is_enabled 
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }
                                ${toggling ? 'opacity-50 cursor-wait' : ''}
                            `}
                        >
                            {toggling ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : code.is_enabled ? (
                                <ToggleRight className="w-3.5 h-3.5" />
                            ) : (
                                <ToggleLeft className="w-3.5 h-3.5" />
                            )}
                            {code.is_enabled ? 'Actif' : 'Inactif'}
                        </button>

                        {/* Badge sync */}
                        <SyncStatusBadge code={code} />
                    </div>
                </div>

                {/* Stats et actions */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                    {/* Progression */}
                    <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>Articles indexés</span>
                            <span className="tabular-nums">
                                {(code.indexed_articles || 0).toLocaleString()} / {(code.total_articles || 0).toLocaleString()}
                            </span>
                        </div>
                        <IndexProgressBar 
                            indexed={code.indexed_articles || 0} 
                            total={code.total_articles || 0} 
                        />
                    </div>

                    {/* Boutons d'action */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onSync(code)}
                            disabled={!code.is_enabled}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Play className="w-3.5 h-3.5" />
                            Synchroniser
                        </button>
                        <button
                            onClick={() => onViewHistory(code)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <History className="w-3.5 h-3.5" />
                            Historique
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer expandable - Organisations */}
            <div className="border-t border-slate-100">
                {grantedOrgs.length > 0 && (
                    <button
                        onClick={() => onToggleExpand(code.id)}
                        className="w-full px-4 py-2 flex items-center justify-center gap-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                        <Building2 className="w-3.5 h-3.5" />
                        {grantedOrgs.length} org{grantedOrgs.length > 1 ? 's' : ''} avec accès
                        {expanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                        )}
                    </button>
                )}
            </div>

            {/* Section étendue - Organisations */}
            {expanded && grantedOrgs.length > 0 && (
                <div className="px-4 pb-4 pt-0">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs font-medium text-slate-500 mb-2">
                            Organisations avec accès exceptionnel :
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {grantedOrgs.map(org => (
                                <span 
                                    key={org.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700"
                                >
                                    <Building2 className="w-3 h-3 text-slate-400" />
                                    {org.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function LegifranceCodesList({
    codes = [],
    domains = [],
    verticals = [],
    loading,
    error,
    onSync,
    onToggleEnabled,
    onViewHistory,
    onRefresh,
    getOrganizationById
}) {
    // États locaux
    const [searchTerm, setSearchTerm] = useState('');
    const [filterVertical, setFilterVertical] = useState('all');
    const [filterDomain, setFilterDomain] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [expandedCodes, setExpandedCodes] = useState(new Set());
    const [togglingCode, setTogglingCode] = useState(null);

    // Filtrer les codes
    const filteredCodes = codes.filter(code => {
        // Recherche texte
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchesName = code.name?.toLowerCase().includes(term);
            const matchesShort = code.short_name?.toLowerCase().includes(term);
            const matchesId = code.id?.toLowerCase().includes(term);
            if (!matchesName && !matchesShort && !matchesId) return false;
        }

        // Filtre verticale
        if (filterVertical !== 'all') {
            if (!(code.default_verticals || []).includes(filterVertical)) return false;
        }

        // Filtre domaine
        if (filterDomain !== 'all') {
            if (code.domain_id !== filterDomain) return false;
        }

        // Filtre statut
        if (filterStatus === 'enabled' && !code.is_enabled) return false;
        if (filterStatus === 'disabled' && code.is_enabled) return false;
        if (filterStatus === 'synced' && !code.last_sync_at) return false;
        if (filterStatus === 'not_synced' && code.last_sync_at) return false;

        return true;
    });

    // Toggle expand
    const toggleExpand = (codeId) => {
        setExpandedCodes(prev => {
            const next = new Set(prev);
            if (next.has(codeId)) {
                next.delete(codeId);
            } else {
                next.add(codeId);
            }
            return next;
        });
    };

    // Handler toggle enabled
    const handleToggleEnabled = async (codeId, enabled) => {
        setTogglingCode(codeId);
        await onToggleEnabled(codeId, enabled);
        setTogglingCode(null);
    };

    // Stats globales
    const stats = {
        total: codes.length,
        enabled: codes.filter(c => c.is_enabled).length,
        synced: codes.filter(c => c.last_sync_at).length,
        totalArticles: codes.reduce((acc, c) => acc + (c.indexed_articles || 0), 0)
    };

    return (
        <div className="space-y-6">
            {/* Header avec stats */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                        Codes juridiques Légifrance
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {stats.total} codes • {stats.enabled} actifs • {stats.totalArticles.toLocaleString()} articles indexés
                    </p>
                </div>
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualiser
                </button>
            </div>

            {/* Erreur globale */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-red-800">Erreur de chargement</p>
                        <p className="text-xs text-red-600">{error}</p>
                    </div>
                </div>
            )}

            {/* Filtres */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Recherche */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Rechercher un code..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>

                {/* Filtre domaine */}
                <div className="relative">
                    <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                        value={filterDomain}
                        onChange={e => setFilterDomain(e.target.value)}
                        className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                    >
                        <option value="all">Tous domaines</option>
                        {domains.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>

                {/* Filtre verticale */}
                <div className="relative">
                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                        value={filterVertical}
                        onChange={e => setFilterVertical(e.target.value)}
                        className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                    >
                        <option value="all">Toutes verticales</option>
                        {verticals.map(v => (
                            <option key={v.id} value={v.id}>{v.label || v.name}</option>
                        ))}
                    </select>
                </div>

                {/* Filtre statut */}
                <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                >
                    <option value="all">Tous statuts</option>
                    <option value="enabled">Activés</option>
                    <option value="disabled">Désactivés</option>
                    <option value="synced">Synchronisés</option>
                    <option value="not_synced">Non synchronisés</option>
                </select>
            </div>

            {/* Liste des codes */}
            {loading && codes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                    <p className="text-slate-500">Chargement des codes...</p>
                </div>
            ) : filteredCodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <BookOpen className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">Aucun code trouvé</p>
                    <p className="text-sm text-slate-400 mt-1">
                        {searchTerm || filterVertical !== 'all' || filterDomain !== 'all' || filterStatus !== 'all'
                            ? 'Modifiez vos filtres pour voir plus de résultats'
                            : 'Les codes juridiques apparaîtront ici'
                        }
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {filteredCodes.map(code => (
                        <CodeCard
                            key={code.id}
                            code={code}
                            verticals={verticals}
                            onSync={onSync}
                            onToggleEnabled={handleToggleEnabled}
                            onViewHistory={onViewHistory}
                            getOrganizationById={getOrganizationById}
                            expanded={expandedCodes.has(code.id)}
                            onToggleExpand={toggleExpand}
                            toggling={togglingCode === code.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
