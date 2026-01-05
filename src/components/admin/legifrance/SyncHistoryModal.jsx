// ============================================================================
// Composant SyncHistoryModal - Historique des synchronisations
// ============================================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
// Note: formatDate local conservé car format spécifique (month: 'short')
import {
    X,
    History,
    CheckCircle,
    XCircle,
    Clock,
    Loader2,
    RefreshCw,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Database,
    Zap
} from 'lucide-react';

/**
 * Badge de statut du job
 */
function JobStatusBadge({ status }) {
    const configs = {
        pending: {
            icon: Clock,
            label: 'En attente',
            className: 'bg-slate-100 text-slate-600'
        },
        running: {
            icon: Loader2,
            label: 'En cours',
            className: 'bg-blue-100 text-blue-700',
            animate: true
        },
        completed: {
            icon: CheckCircle,
            label: 'Terminé',
            className: 'bg-emerald-100 text-emerald-700'
        },
        failed: {
            icon: XCircle,
            label: 'Échec',
            className: 'bg-red-100 text-red-700'
        }
    };

    const config = configs[status] || configs.pending;
    const Icon = config.icon;

    return (
        <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full
            ${config.className}
        `}>
            <Icon className={`w-3.5 h-3.5 ${config.animate ? 'animate-spin' : ''}`} />
            {config.label}
        </span>
    );
}

/**
 * Ligne d'un job de synchronisation
 */
function JobRow({ job, expanded, onToggleExpand }) {
    const startedAt = job.started_at ? new Date(job.started_at) : null;
    const duration = job.duration_seconds;

    const formatDuration = (seconds) => {
        if (!seconds) return '-';
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className={`
            border-b border-slate-100 last:border-b-0 transition-colors
            ${expanded ? 'bg-slate-50' : 'hover:bg-slate-50/50'}
        `}>
            {/* Ligne principale */}
            <div 
                className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                onClick={() => onToggleExpand(job.id)}
            >
                {/* Icône type */}
                <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                    ${job.job_type === 'full_sync' 
                        ? 'bg-amber-100 text-amber-600' 
                        : 'bg-indigo-100 text-indigo-600'
                    }
                `}>
                    {job.job_type === 'full_sync' ? (
                        <RefreshCw className="w-4 h-4" />
                    ) : (
                        <Zap className="w-4 h-4" />
                    )}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                            {job.job_type === 'full_sync' ? 'Sync complète' : 'Sync incrémentale'}
                        </span>
                        <JobStatusBadge status={job.status} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {formatDate(startedAt)}
                        {duration && ` • Durée: ${formatDuration(duration)}`}
                    </p>
                </div>

                {/* Stats rapides */}
                <div className="flex items-center gap-4 text-sm text-slate-600">
                    <div className="text-right">
                        <span className="font-medium">{job.processed_articles || 0}</span>
                        <span className="text-slate-400 ml-1">traités</span>
                    </div>
                    {expanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                </div>
            </div>

            {/* Détails étendus */}
            {expanded && (
                <div className="px-4 pb-4 pt-0">
                    <div className="ml-13 p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                        {/* Grille de stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                                    <Database className="w-3 h-3" />
                                    Total articles
                                </div>
                                <p className="text-lg font-bold text-slate-800">
                                    {job.total_articles?.toLocaleString() || 0}
                                </p>
                            </div>
                            <div className="p-3 bg-emerald-50 rounded-lg">
                                <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Traités
                                </div>
                                <p className="text-lg font-bold text-emerald-700">
                                    {job.processed_articles?.toLocaleString() || 0}
                                </p>
                            </div>
                            <div className="p-3 bg-amber-50 rounded-lg">
                                <div className="flex items-center gap-1.5 text-xs text-amber-600 mb-1">
                                    <Clock className="w-3 h-3" />
                                    Ignorés
                                </div>
                                <p className="text-lg font-bold text-amber-700">
                                    {job.skipped_articles?.toLocaleString() || 0}
                                </p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-lg">
                                <div className="flex items-center gap-1.5 text-xs text-red-600 mb-1">
                                    <XCircle className="w-3 h-3" />
                                    Échecs
                                </div>
                                <p className="text-lg font-bold text-red-700">
                                    {job.failed_articles?.toLocaleString() || 0}
                                </p>
                            </div>
                        </div>

                        {/* Infos supplémentaires */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-500">Verticales cibles:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {(job.target_verticals || []).map(v => (
                                        <span 
                                            key={v}
                                            className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-md"
                                        >
                                            {v}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <span className="text-slate-500">Tokens utilisés:</span>
                                <p className="font-medium text-slate-800 mt-1">
                                    {job.tokens_used?.toLocaleString() || 0}
                                </p>
                            </div>
                        </div>

                        {/* Erreur si présente */}
                        {job.error_message && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-red-800">
                                            Erreur
                                        </p>
                                        <p className="text-xs text-red-600 mt-1 font-mono">
                                            {job.error_message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ID et timestamps */}
                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                            <span className="font-mono">ID: {job.id}</span>
                            <span>
                                Créé le {new Date(job.created_at).toLocaleString('fr-FR')}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Modal d'historique des synchronisations
 */
export default function SyncHistoryModal({
    isOpen,
    onClose,
    code
}) {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedJobs, setExpandedJobs] = useState(new Set());

    // Charger les jobs
    useEffect(() => {
        if (!isOpen || !code) return;

        const loadJobs = async () => {
            try {
                setLoading(true);
                setError(null);

                const { data, error: fetchError } = await supabase
                    .from('sync_jobs')  // Tables dans search_path: legifrance
                    .select('*')
                    .eq('code_id', code.id)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (fetchError) throw fetchError;
                setJobs(data || []);
            } catch (err) {
                console.error('Erreur chargement historique:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadJobs();
    }, [isOpen, code]);

    // Toggle expand
    const toggleExpand = (jobId) => {
        setExpandedJobs(prev => {
            const next = new Set(prev);
            if (next.has(jobId)) {
                next.delete(jobId);
            } else {
                next.add(jobId);
            }
            return next;
        });
    };

    if (!isOpen || !code) return null;

    // Stats globales
    const stats = {
        total: jobs.length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        avgDuration: jobs.filter(j => j.duration_seconds).length > 0
            ? Math.round(
                jobs.filter(j => j.duration_seconds)
                    .reduce((acc, j) => acc + j.duration_seconds, 0) / 
                jobs.filter(j => j.duration_seconds).length
              )
            : null
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Overlay */}
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div 
                    className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl transform transition-all"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                <History className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">
                                    Historique des synchronisations
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {code.name}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Stats header */}
                    <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-100">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                            <p className="text-xs text-slate-500">Total jobs</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
                            <p className="text-xs text-slate-500">Réussis</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                            <p className="text-xs text-slate-500">Échecs</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-slate-800">
                                {stats.avgDuration ? `${Math.floor(stats.avgDuration / 60)}m` : '-'}
                            </p>
                            <p className="text-xs text-slate-500">Durée moy.</p>
                        </div>
                    </div>

                    {/* Contenu */}
                    <div className="max-h-[60vh] overflow-y-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                                <p className="text-slate-500">Chargement de l'historique...</p>
                            </div>
                        ) : error ? (
                            <div className="p-6">
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-red-800">
                                            Erreur de chargement
                                        </p>
                                        <p className="text-xs text-red-600">{error}</p>
                                    </div>
                                </div>
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <History className="w-12 h-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">Aucune synchronisation</p>
                                <p className="text-sm text-slate-400 mt-1">
                                    Ce code n'a pas encore été synchronisé
                                </p>
                            </div>
                        ) : (
                            <div>
                                {jobs.map(job => (
                                    <JobRow
                                        key={job.id}
                                        job={job}
                                        expanded={expandedJobs.has(job.id)}
                                        onToggleExpand={toggleExpand}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                        <button
                            onClick={onClose}
                            className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
