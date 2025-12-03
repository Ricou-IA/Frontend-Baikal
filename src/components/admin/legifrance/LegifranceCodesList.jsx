// ============================================================================
// Composant LegifranceCodesList - Liste des codes juridiques
// ============================================================================

import React, { useState } from 'react';
import { VERTICALS } from '../../../hooks/useLegifrance';
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
    Loader2
} from 'lucide-react';

/**
 * Badge de verticale compact
 */
function VerticalTag({ verticalId }) {
    const vertical = VERTICALS.find(v => v.id === verticalId);
    if (!vertical) return null;

    const colorClasses = {
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        pink: 'bg-pink-50 text-pink-700 border-pink-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        violet: 'bg-violet-50 text-violet-700 border-violet-200',
    };

    return (
        <span className={`
            inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border
            ${colorClasses[vertical.color] || colorClasses.indigo}
        `}>
            {vertical.label}
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
        <div className="w-full">
            <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-slate-600">
                    {indexed?.toLocaleString() || 0} / {total?.toLocaleString() || '?'}
                </span>
                <span className="text-slate-400">{percentage}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                        percentage === 100 ? 'bg-emerald-500' : 
                        percentage > 50 ? 'bg-blue-500' : 
                        percentage > 0 ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

/**
 * Carte d'un code juridique
 */
function CodeCard({ 
    code, 
    onSync, 
    onToggleEnabled, 
    onViewHistory,
    getOrganizationById,
    expanded,
    onToggleExpand,
    toggling
}) {
    const grantedOrgs = (code.granted_org_ids || [])
        .map(id => getOrganizationById(id))
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
                        
                        <p className="text-xs text-slate-400 font-mono mb-2">
                            {code.id}
                        </p>

                        {/* Verticales */}
                        <div className="flex flex-wrap gap-1.5">
                            {(code.default_verticals || []).map(v => (
                                <VerticalTag key={v} verticalId={v} />
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
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }
                            `}
                            title={code.is_enabled ? 'Désactiver' : 'Activer'}
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

                        {/* Statut sync */}
                        <SyncStatusBadge code={code} />
                    </div>
                </div>

                {/* Progression indexation */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <IndexProgressBar 
                                indexed={code.indexed_articles} 
                                total={code.total_articles} 
                            />
                        </div>
                        
                        {/* Boutons d'action */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onViewHistory(code)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Historique des syncs"
                            >
                                <History className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onSync(code)}
                                disabled={!code.is_enabled}
                                className={`
                                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                                    ${code.is_enabled
                                        ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-md shadow-indigo-500/25'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    }
                                `}
                            >
                                <RefreshCw className="w-4 h-4" />
                                Sync
                            </button>
                        </div>
                    </div>
                </div>

                {/* Bouton expand */}
                {grantedOrgs.length > 0 && (
                    <button
                        onClick={() => onToggleExpand(code.id)}
                        className="w-full mt-3 flex items-center justify-center gap-2 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                        <Building2 className="w-3.5 h-3.5" />
                        {grantedOrgs.length} organisation{grantedOrgs.length > 1 ? 's' : ''} avec accès
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

/**
 * Composant principal de la liste des codes
 */
export default function LegifranceCodesList({
    codes = [],
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

    // Handler toggle enabled avec état local
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

                {/* Filtre verticale */}
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                        value={filterVertical}
                        onChange={e => setFilterVertical(e.target.value)}
                        className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                    >
                        <option value="all">Toutes verticales</option>
                        {VERTICALS.map(v => (
                            <option key={v.id} value={v.id}>{v.label}</option>
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
                        {searchTerm || filterVertical !== 'all' || filterStatus !== 'all'
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