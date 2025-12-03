// ============================================================================
// BRIQUE LÉGIFRANCE : Composant LegifranceAdmin
// Interface d'administration des codes juridiques Légifrance
// Accessible uniquement aux SuperAdmin
// ============================================================================

import React, { useState } from 'react';
import { useLegifrance } from '../../hooks/useLegifrance';
import { LegifranceCodesList, SyncModal, SyncHistoryModal } from './legifrance';
import { Scale, ExternalLink, Loader2 } from 'lucide-react';

/**
 * Composant principal d'administration Légifrance
 * À intégrer comme onglet dans la page Admin
 */
export default function LegifranceAdmin() {
    // Hook de gestion des données
    const {
        codes,
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
                            <a href="https://www.legifrance.gouv.fr/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                                Légifrance
                            </a>
                            <a href="https://piste.gouv.fr/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" />
                                API PISTE
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Statistiques rapides */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    label="Articles indexés"
                    value={codes.reduce((acc, c) => acc + (c.indexed_articles || 0), 0)}
                    format="number"
                    loading={loading}
                    color="blue"
                />
                <StatCard
                    label="Dernière sync"
                    value={getLastSyncDate(codes)}
                    format="date"
                    loading={loading}
                    color="violet"
                />
            </div>

            {/* Liste des codes */}
            <LegifranceCodesList
                codes={codes}
                loading={loading}
                error={error}
                onSync={handleOpenSync}
                onToggleEnabled={handleToggleEnabled}
                onViewHistory={handleOpenHistory}
                onRefresh={refresh}
                getOrganizationById={getOrganizationById}
            />

            {/* Modal de synchronisation */}
            <SyncModal
                isOpen={!!syncModalCode}
                onClose={handleCloseSync}
                code={syncModalCode}
                organizations={organizations}
                onSync={triggerSync}
                syncing={syncing}
                searchOrganizations={searchOrganizations}
                getOrganizationById={getOrganizationById}
                onAddGrant={addOrgGrant}
                onRemoveGrant={removeOrgGrant}
            />

            {/* Modal d'historique */}
            <SyncHistoryModal
                isOpen={!!historyModalCode}
                onClose={handleCloseHistory}
                code={historyModalCode}
            />
        </div>
    );
}

/**
 * Carte de statistique
 */
function StatCard({ label, value, format, loading, color = 'slate' }) {
    const colorClasses = {
        slate: 'bg-slate-50 border-slate-200',
        emerald: 'bg-emerald-50 border-emerald-200',
        blue: 'bg-blue-50 border-blue-200',
        violet: 'bg-violet-50 border-violet-200'
    };

    const textColors = {
        slate: 'text-slate-800',
        emerald: 'text-emerald-700',
        blue: 'text-blue-700',
        violet: 'text-violet-700'
    };

    const formatValue = () => {
        if (loading) return <Loader2 className="w-5 h-5 animate-spin text-slate-400" />;
        if (format === 'number' && typeof value === 'number') {
            return value.toLocaleString('fr-FR');
        }
        if (format === 'date') {
            return value || 'Jamais';
        }
        return value;
    };

    return (
        <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
            <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${textColors[color]}`}>
                {formatValue()}
            </p>
        </div>
    );
}

/**
 * Obtenir la date de dernière synchronisation
 */
function getLastSyncDate(codes) {
    const syncedCodes = codes.filter(c => c.last_sync_at);
    if (syncedCodes.length === 0) return null;

    const lastSync = syncedCodes.reduce((latest, code) => {
        const syncDate = new Date(code.last_sync_at);
        return syncDate > latest ? syncDate : latest;
    }, new Date(0));

    return lastSync.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short'
    });
}