// ============================================================================
// BRIQUE LÉGIFRANCE : Composant LegifranceAdmin
// Interface d'administration des codes juridiques Légifrance
// Accessible uniquement aux SuperAdmin
// Version 2 : Verticales et Domaines depuis Supabase
// ============================================================================

import React, { useState } from 'react';
import { useLegifrance } from '../../hooks/useLegifrance';
import { LegifranceCodesList, SyncModal, SyncHistoryModal } from './legifrance';
import { Scale, ExternalLink, Loader2, Database, BookOpen, Layers } from 'lucide-react';

/**
 * Carte de statistique
 */
function StatCard({ label, value, format = 'text', loading, color = 'indigo' }) {
    const colorClasses = {
        indigo: 'bg-indigo-50 text-indigo-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        blue: 'bg-blue-50 text-blue-600',
        violet: 'bg-violet-50 text-violet-600',
    };

    const formatValue = (val, fmt) => {
        if (loading) return '...';
        if (fmt === 'number') return val?.toLocaleString() || '0';
        if (fmt === 'date') {
            if (!val) return 'Jamais';
            return new Date(val).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        }
        return val || '0';
    };

    return (
        <div className={`p-4 rounded-xl ${colorClasses[color]}`}>
            <p className="text-xs font-medium opacity-75 mb-1">{label}</p>
            <p className="text-2xl font-bold">{formatValue(value, format)}</p>
        </div>
    );
}

/**
 * Composant principal d'administration Légifrance
 */
export default function LegifranceAdmin() {
    // Hook de gestion des données
    const {
        codes,
        domains,
        verticals,
        organizations,
        loading,
        error,
        syncing,
        toggleCodeEnabled,
        triggerSync,
        addOrgGrant,
        removeOrgGrant,
        searchOrganizations,
        getOrganizationById,
        refresh
    } = useLegifrance();

    // États locaux pour les modals
    const [syncModalCode, setSyncModalCode] = useState(null);
    const [historyModalCode, setHistoryModalCode] = useState(null);

    // Handlers
    const handleOpenSync = (code) => {
        setSyncModalCode(code);
    };

    const handleCloseSync = () => {
        setSyncModalCode(null);
    };

    const handleOpenHistory = (code) => {
        setHistoryModalCode(code);
    };

    const handleCloseHistory = () => {
        setHistoryModalCode(null);
    };

    const handleToggleEnabled = async (codeId, enabled) => {
        return toggleCodeEnabled(codeId, enabled);
    };

    const handleSync = async (codeId, syncType, targetVerticals) => {
        const result = await triggerSync(codeId, syncType, targetVerticals);
        if (result.success) {
            handleCloseSync();
        }
        return result;
    };

    // Calcul des stats
    const getLastSyncDate = () => {
        const syncedCodes = codes.filter(c => c.last_sync_at);
        if (syncedCodes.length === 0) return null;
        return syncedCodes.reduce((latest, code) => {
            const codeDate = new Date(code.last_sync_at);
            return codeDate > latest ? codeDate : latest;
        }, new Date(0));
    };

    return (
        <div className="space-y-6">
            {/* Header informatif */}
            <div className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-500/25">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                        <Scale className="w-7 h-7" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold mb-1">
                            Administration Légifrance
                        </h2>
                        <p className="text-indigo-100 text-sm leading-relaxed">
                            Gérez l'acquisition et l'indexation des codes juridiques français dans le RAG BAÏKAL. 
                            Les contenus Légifrance sont partagés entre les organisations selon leurs verticales métier.
                        </p>
                        <div className="flex items-center gap-4 mt-4">
                            <a 
                                href="https://www.legifrance.gouv.fr/" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Légifrance
                            </a>
                            <a 
                                href="https://piste.gouv.fr/" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                API PISTE
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Statistiques rapides */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard
                    label="Codes disponibles"
                    value={codes.length}
                    loading={loading}
                />
                <StatCard
                    label="Codes actifs"
                    value={codes.filter(c => c.is_enabled).length}
                    loading={loading}
                    color="emerald"
                />
                <StatCard
                    label="Domaines"
                    value={domains.length}
                    loading={loading}
                    color="blue"
                />
                <StatCard
                    label="Articles indexés"
                    value={codes.reduce((acc, c) => acc + (c.indexed_articles || 0), 0)}
                    format="number"
                    loading={loading}
                    color="violet"
                />
                <StatCard
                    label="Dernière sync"
                    value={getLastSyncDate()}
                    format="date"
                    loading={loading}
                    color="indigo"
                />
            </div>

            {/* Aperçu des domaines */}
            {domains.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Database className="w-4 h-4 text-slate-400" />
                        Domaines juridiques
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {domains.map(domain => {
                            const domainCodes = codes.filter(c => c.domain_id === domain.id);
                            const enabledCount = domainCodes.filter(c => c.is_enabled).length;
                            
                            return (
                                <div 
                                    key={domain.id}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100"
                                >
                                    <span 
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: domain.color || '#64748b' }}
                                    />
                                    <span className="text-sm font-medium text-slate-700">
                                        {domain.name}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        {enabledCount}/{domainCodes.length}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Aperçu des verticales */}
            {verticals.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-slate-400" />
                        Verticales métier disponibles
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {verticals.map(vertical => (
                            <div 
                                key={vertical.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                                style={{ 
                                    backgroundColor: `${vertical.color}10`,
                                    borderColor: `${vertical.color}30`
                                }}
                            >
                                <span 
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: vertical.color || '#6366f1' }}
                                />
                                <span 
                                    className="text-sm font-medium"
                                    style={{ color: vertical.color || '#6366f1' }}
                                >
                                    {vertical.label || vertical.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Liste des codes */}
            <LegifranceCodesList
                codes={codes}
                domains={domains}
                verticals={verticals}
                loading={loading}
                error={error}
                onSync={handleOpenSync}
                onToggleEnabled={handleToggleEnabled}
                onViewHistory={handleOpenHistory}
                onRefresh={refresh}
                getOrganizationById={getOrganizationById}
            />

            {/* Modal de synchronisation */}
            {syncModalCode && (
                <SyncModal
                    isOpen={!!syncModalCode}
                    onClose={handleCloseSync}
                    code={syncModalCode}
                    verticals={verticals}
                    organizations={organizations}
                    onSync={handleSync}
                    onAddOrgGrant={addOrgGrant}
                    onRemoveOrgGrant={removeOrgGrant}
                    searchOrganizations={searchOrganizations}
                    syncing={syncing}
                />
            )}

            {/* Modal d'historique */}
            {historyModalCode && (
                <SyncHistoryModal
                    isOpen={!!historyModalCode}
                    onClose={handleCloseHistory}
                    code={historyModalCode}
                />
            )}
        </div>
    );
}
