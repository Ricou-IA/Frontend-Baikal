/**
 * Ingestion.jsx - Baikal Console
 * ============================================================================
 * Page de monitoring de la queue d'ingestion (super_admin uniquement).
 * 
 * Fonctionnalités :
 * - Stats temps réel (queued, sent, completed, failed)
 * - Liste des jobs avec filtres (App, Org)
 * - Retry manuel des jobs failed
 * - Delete job + file (sauf si completed)
 * - Affichage email uploader
 * 
 * Route : /admin/ingestion
 * Accès : super_admin uniquement
 * 
 * Version: 1.3.0
 * Date: 2026-01-04
 * 
 * MODIFICATIONS v1.2:
 * - Suppression colonnes Durée et Chunks (inutiles)
 * - Suppression file_id sous l'email
 * - Suppression dropdown status (cartes = filtres)
 * 
 * MODIFICATIONS v1.3 (04/01/2026):
 * - retryJob envoie le payload complet à l'Edge Function trigger-ingestion
 * - Récupération des infos fichier + queue pour construire le payload
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
    Database,
    RefreshCw,
    Search,
    AlertCircle,
    Loader2,
    ChevronLeft,
    Clock,
    CheckCircle2,
    XCircle,
    Send,
    FileText,
    RotateCcw,
    Eye,
    X,
    Trash2,
    Building2,
    Layers,
    User,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const STATUS_CONFIG = {
    queued: {
        label: 'EN ATTENTE',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
        borderColor: 'border-amber-500/30',
        icon: Clock,
    },
    sent: {
        label: 'EN COURS',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/20',
        borderColor: 'border-blue-500/30',
        icon: Send,
    },
    completed: {
        label: 'TERMINÉ',
        color: 'text-green-400',
        bgColor: 'bg-green-500/20',
        borderColor: 'border-green-500/30',
        icon: CheckCircle2,
    },
    failed: {
        label: 'ÉCHEC',
        color: 'text-red-400',
        bgColor: 'bg-red-500/20',
        borderColor: 'border-red-500/30',
        icon: XCircle,
    },
};

const AUTO_REFRESH_INTERVAL = 30000; // 30 secondes

// ============================================================================
// SERVICES
// ============================================================================

const ingestionService = {
    /**
     * Récupérer les stats de la queue
     */
    async getStats({ appId = null, orgId = null } = {}) {
        let query = supabase
            .schema('sources')
            .from('ingestion_queue')
            .select('status, file_id');

        const { data: queueData, error: queueError } = await query;
        if (queueError) throw queueError;

        // Si on a des filtres, on doit récupérer les files pour filtrer
        let filteredFileIds = null;
        if (appId || orgId) {
            let filesQuery = supabase
                .schema('sources')
                .from('files')
                .select('id');
            
            if (appId) filesQuery = filesQuery.eq('app_id', appId);
            if (orgId) filesQuery = filesQuery.eq('org_id', orgId);

            const { data: filesData } = await filesQuery;
            filteredFileIds = new Set(filesData?.map(f => f.id) || []);
        }

        const stats = {
            queued: 0,
            sent: 0,
            completed: 0,
            failed: 0,
            total: 0,
        };

        queueData?.forEach(row => {
            // Filtrer si nécessaire
            if (filteredFileIds && !filteredFileIds.has(row.file_id)) {
                return;
            }
            stats.total++;
            if (stats.hasOwnProperty(row.status)) {
                stats[row.status]++;
            }
        });

        return stats;
    },

    /**
     * Récupérer les apps disponibles (depuis sources.files)
     */
    async getApps() {
        const { data, error } = await supabase
            .schema('sources')
            .from('files')
            .select('app_id');

        if (error) throw error;

        // Extraire les app_id distincts et non null
        const uniqueApps = [...new Set((data || []).map(f => f.app_id).filter(Boolean))];
        
        // Retourner sous forme d'objets {id, name}
        return uniqueApps.map(appId => ({
            id: appId,
            name: appId.toUpperCase()
        })).sort((a, b) => a.name.localeCompare(b.name));
    },

    /**
     * Récupérer les orgs disponibles
     */
    async getOrgs() {
        const { data, error } = await supabase
            .schema('core')
            .from('organizations')
            .select('id, name')
            .eq('is_active', true)
            .order('name');

        if (error) throw error;
        return data || [];
    },

    /**
     * Récupérer les jobs avec détails
     */
    async getJobs({ status = null, search = null, appId = null, orgId = null, limit = 50 }) {
        // D'abord récupérer la queue
        let queueQuery = supabase
            .schema('sources')
            .from('ingestion_queue')
            .select(`
                id,
                file_id,
                status,
                attempts,
                max_attempts,
                last_attempt_at,
                next_retry_at,
                n8n_response,
                error_message,
                created_at,
                completed_at
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (status && status !== 'all') {
            queueQuery = queueQuery.eq('status', status);
        }

        const { data: queueData, error: queueError } = await queueQuery;
        if (queueError) throw queueError;

        // Récupérer les infos des fichiers avec created_by
        const fileIds = queueData?.map(q => q.file_id).filter(Boolean) || [];
        
        let filesMap = {};
        let userIds = new Set();

        if (fileIds.length > 0) {
            let filesQuery = supabase
                .schema('sources')
                .from('files')
                .select('id, original_filename, mime_type, processing_status, chunk_count, org_id, app_id, created_by')
                .in('id', fileIds);

            // Filtres app/org
            if (appId) filesQuery = filesQuery.eq('app_id', appId);
            if (orgId) filesQuery = filesQuery.eq('org_id', orgId);

            const { data: filesData } = await filesQuery;

            filesData?.forEach(f => {
                filesMap[f.id] = f;
                if (f.created_by) userIds.add(f.created_by);
            });
        }

        // Récupérer les emails des users
        let usersMap = {};
        if (userIds.size > 0) {
            const { data: usersData } = await supabase
                .schema('core')
                .from('profiles')
                .select('id, email, full_name')
                .in('id', Array.from(userIds));

            usersData?.forEach(u => {
                usersMap[u.id] = u;
            });
        }

        // Combiner les données (filtrer si app/org appliqué)
        let jobs = queueData?.map(q => {
            const file = filesMap[q.file_id] || null;
            // Si filtré par app/org et pas de file correspondant, exclure
            if ((appId || orgId) && !file) return null;

            const user = file?.created_by ? usersMap[file.created_by] : null;
            return {
                ...q,
                file,
                user,
            };
        }).filter(Boolean) || [];

        // Filtrer par recherche si nécessaire
        if (search) {
            const s = search.toLowerCase();
            jobs = jobs.filter(j => 
                j.file?.original_filename?.toLowerCase().includes(s) ||
                j.user?.email?.toLowerCase().includes(s)
            );
        }

        return jobs;
    },

    /**
     * Retry un job failed
     * =========================================================================
     * v1.3: Envoie le payload complet à l'Edge Function trigger-ingestion
     * =========================================================================
     * 1. Récupère les infos complètes du fichier et du job
     * 2. Reset le status dans la queue
     * 3. Reset le status du fichier
     * 4. Appelle l'Edge Function avec le payload complet
     */
    async retryJob(fileId) {
        // 1. Récupérer le job de la queue
        const { data: job, error: jobFetchError } = await supabase
            .schema('sources')
            .from('ingestion_queue')
            .select('id')
            .eq('file_id', fileId)
            .single();

        if (jobFetchError || !job) {
            throw new Error('Job not found in queue');
        }

        // 2. Récupérer les infos complètes du fichier
        const { data: file, error: fileFetchError } = await supabase
            .schema('sources')
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (fileFetchError || !file) {
            throw new Error('File not found');
        }

        // 3. Reset le status du job
        const { error: queueError } = await supabase
            .schema('sources')
            .from('ingestion_queue')
            .update({
                status: 'queued',
                attempts: 0,
                error_message: null,
                next_retry_at: new Date().toISOString(),
            })
            .eq('file_id', fileId);

        if (queueError) throw queueError;

        // 4. Reset le status du fichier
        const { error: fileError } = await supabase
            .schema('sources')
            .from('files')
            .update({
                processing_status: 'pending',
                processing_error: null,
            })
            .eq('id', fileId);

        if (fileError) throw fileError;

        // 5. Construire le payload complet pour l'Edge Function
        const metadata = file.metadata || {};
        const triggerPayload = {
            queue_id: job.id,
            file_id: file.id,
            filename: file.original_filename,
            storage_bucket: file.storage_bucket,
            storage_path: file.storage_path,
            mime_type: file.mime_type,
            layer: file.layer,
            org_id: file.org_id,
            project_id: file.project_id,
            created_by: file.created_by,
            app_id: file.app_id,
            metadata: {
                ...metadata,
                document_title: metadata.document_title || metadata.title || null,
                category_slug: metadata.category_slug || metadata.category || null,
                filename_clean: metadata.filename_clean || file.original_filename,
                quality_level: metadata.quality_level || 'premium',
                file_size: file.file_size,
                target_project_ids: metadata.target_project_ids || (file.project_id ? [file.project_id] : []),
            },
        };

        console.log('[Ingestion] Retrying with payload:', triggerPayload);

        // 6. Appeler l'Edge Function
        const { data, error: fnError } = await supabase.functions.invoke('trigger-ingestion', {
            body: triggerPayload,
        });

        if (fnError) {
            console.error('[Ingestion] Error calling Edge Function:', fnError);
            throw fnError;
        }

        return { success: true, data };
    },

    /**
     * Retry tous les jobs failed et queued bloqués
     */
    async retryAllFailed({ appId = null, orgId = null } = {}) {
        // Récupérer les jobs failed ET queued
        const [failedJobs, queuedJobs] = await Promise.all([
            this.getJobs({ status: 'failed', appId, orgId, limit: 1000 }),
            this.getJobs({ status: 'queued', appId, orgId, limit: 1000 }),
        ]);
        
        const jobs = [...failedJobs, ...queuedJobs];
        
        let successCount = 0;
        let errorCount = 0;

        for (const job of jobs) {
            try {
                await this.retryJob(job.file_id);
                successCount++;
            } catch (err) {
                console.error(`[Ingestion] Error retrying job ${job.file_id}:`, err);
                errorCount++;
            }
        }

        return { success: true, count: successCount, errors: errorCount };
    },

    /**
     * Supprimer un job ET son fichier source
     * (Seulement si status != completed)
     */
    async deleteJob(jobId, fileId) {
        // Vérifier que le job n'est pas completed
        const { data: job } = await supabase
            .schema('sources')
            .from('ingestion_queue')
            .select('status')
            .eq('id', jobId)
            .single();

        if (job?.status === 'completed') {
            throw new Error('Impossible de supprimer un job terminé');
        }

        // Supprimer le job
        const { error: queueError } = await supabase
            .schema('sources')
            .from('ingestion_queue')
            .delete()
            .eq('id', jobId);

        if (queueError) throw queueError;

        // Supprimer le fichier source
        if (fileId) {
            const { error: fileError } = await supabase
                .schema('sources')
                .from('files')
                .delete()
                .eq('id', fileId);

            if (fileError) {
                console.error('[Ingestion] Error deleting file:', fileError);
            }
        }

        return { success: true };
    },
};

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Carte de statistique
 */
function StatCard({ label, value, icon: Icon, color, bgColor, borderColor, onClick, isActive }) {
    return (
        <button
            onClick={onClick}
            className={`
                flex items-center gap-4 p-4 rounded-lg border transition-all
                bg-baikal-surface hover:bg-baikal-bg
                ${isActive ? 'border-baikal-cyan ring-1 ring-baikal-cyan' : borderColor}
                hover:border-baikal-cyan
            `}
        >
            <div className={`p-3 rounded-lg ${bgColor}`}>
                <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div className="text-left">
                <p className={`text-2xl font-mono font-bold ${color}`}>
                    {value}
                </p>
                <p className="text-xs font-mono text-baikal-text uppercase">
                    {label}
                </p>
            </div>
        </button>
    );
}

/**
 * Badge de statut
 */
function StatusBadge({ status }) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
    const Icon = config.icon;

    return (
        <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono
            ${config.bgColor} ${config.color}
        `}>
            <Icon className="w-3.5 h-3.5" />
            {config.label}
        </span>
    );
}

/**
 * Ligne du tableau
 */
function JobRow({ job, onRetry, onDelete, onViewDetails }) {
    const file = job.file;
    const user = job.user;
    const filename = file?.original_filename || 'Fichier inconnu';
    const canDelete = job.status !== 'completed';
    const canRetry = job.status === 'failed' || job.status === 'queued';

    return (
        <tr className="border-b border-baikal-border hover:bg-baikal-surface/50 transition-colors">
            {/* Fichier + Email */}
            <td className="px-4 py-4">
                <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-baikal-text flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="font-medium text-white truncate max-w-xs" title={filename}>
                            {filename}
                        </p>
                        {user?.email && (
                            <p className="text-xs text-baikal-cyan truncate max-w-xs flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {user.email}
                            </p>
                        )}
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className="px-4 py-4">
                <StatusBadge status={job.status} />
            </td>

            {/* Tentatives */}
            <td className="px-4 py-4">
                <span className="font-mono text-baikal-text">
                    {job.attempts}/{job.max_attempts}
                </span>
            </td>

            {/* Date */}
            <td className="px-4 py-4">
                <span className="text-sm text-baikal-text">
                    {new Date(job.created_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </td>

            {/* Actions */}
            <td className="px-4 py-4">
                <div className="flex items-center justify-end gap-2">
                    {/* Voir détails */}
                    <button
                        onClick={() => onViewDetails(job)}
                        className="p-1.5 text-baikal-text hover:text-white border border-baikal-border hover:border-baikal-cyan rounded-md transition-colors"
                        title="Voir détails"
                    >
                        <Eye className="w-4 h-4" />
                    </button>

                    {/* Retry (seulement si failed) */}
                    {canRetry && (
                        <button
                            onClick={() => onRetry(job)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 rounded-md transition-colors"
                            title="Relancer"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retry
                        </button>
                    )}

                    {/* Delete (sauf si completed) */}
                    {canDelete && (
                        <button
                            onClick={() => onDelete(job)}
                            className="p-1.5 text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-md transition-colors"
                            title="Supprimer job + fichier"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

/**
 * Modal de détails d'un job
 */
function JobDetailsModal({ isOpen, onClose, job }) {
    if (!isOpen || !job) return null;

    const file = job.file;
    const user = job.user;
    const n8nResponse = job.n8n_response || {};

    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}>
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl mx-4 bg-baikal-surface border border-baikal-border rounded-lg shadow-xl max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border flex-shrink-0">
                    <h2 className="text-lg font-mono font-semibold text-white">
                        DÉTAILS_JOB
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Status */}
                    <div className="flex items-center gap-4">
                        <StatusBadge status={job.status} />
                        {job.error_message && (
                            <span className="text-sm text-red-400 truncate">
                                {job.error_message}
                            </span>
                        )}
                    </div>

                    {/* Infos fichier */}
                    <div className="bg-baikal-bg rounded-lg p-4 space-y-3">
                        <h3 className="text-sm font-mono text-baikal-cyan uppercase">Fichier</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-baikal-text">Nom</p>
                                <p className="text-white font-mono truncate">
                                    {file?.original_filename || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-baikal-text">Type</p>
                                <p className="text-white font-mono">
                                    {file?.mime_type || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-baikal-text">Uploadé par</p>
                                <p className="text-white font-mono">
                                    {user?.email || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-baikal-text">Chunks</p>
                                <p className="text-white font-mono">
                                    {file?.chunk_count || 0}
                                </p>
                            </div>
                            <div>
                                <p className="text-baikal-text">App</p>
                                <p className="text-white font-mono">
                                    {file?.app_id || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <p className="text-baikal-text">File ID</p>
                                <p className="text-white font-mono text-xs">
                                    {job.file_id}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Infos queue */}
                    <div className="bg-baikal-bg rounded-lg p-4 space-y-3">
                        <h3 className="text-sm font-mono text-baikal-cyan uppercase">Queue</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-baikal-text">Tentatives</p>
                                <p className="text-white font-mono">
                                    {job.attempts} / {job.max_attempts}
                                </p>
                            </div>
                            <div>
                                <p className="text-baikal-text">Créé le</p>
                                <p className="text-white font-mono">
                                    {new Date(job.created_at).toLocaleString('fr-FR')}
                                </p>
                            </div>
                            {job.completed_at && (
                                <div>
                                    <p className="text-baikal-text">Terminé le</p>
                                    <p className="text-white font-mono">
                                        {new Date(job.completed_at).toLocaleString('fr-FR')}
                                    </p>
                                </div>
                            )}
                            {job.last_attempt_at && (
                                <div>
                                    <p className="text-baikal-text">Dernière tentative</p>
                                    <p className="text-white font-mono">
                                        {new Date(job.last_attempt_at).toLocaleString('fr-FR')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Réponse N8N */}
                    {Object.keys(n8nResponse).length > 0 && (
                        <div className="bg-baikal-bg rounded-lg p-4 space-y-3">
                            <h3 className="text-sm font-mono text-baikal-cyan uppercase">
                                Réponse N8N
                            </h3>
                            <pre className="text-xs text-baikal-text overflow-x-auto p-2 bg-black/30 rounded">
                                {JSON.stringify(n8nResponse, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Erreur */}
                    {job.error_message && (
                        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                            <h3 className="text-sm font-mono text-red-400 uppercase mb-2">
                                Erreur
                            </h3>
                            <p className="text-sm text-red-300 font-mono">
                                {job.error_message}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

/**
 * Modal de confirmation de suppression
 */
function DeleteConfirmModal({ isOpen, onClose, job, onConfirm }) {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
            onClose();
        } catch (err) {
            console.error('Delete error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !job) return null;

    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}>
            <div 
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md mx-4 bg-baikal-surface border border-red-500/50 rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-baikal-border bg-red-900/20">
                    <div className="p-2 bg-red-500/20 rounded-md">
                        <Trash2 className="w-5 h-5 text-red-400" />
                    </div>
                    <h2 className="text-lg font-mono font-semibold text-red-400">
                        SUPPRIMER_JOB
                    </h2>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-md">
                        <p className="text-sm text-red-300">
                            <strong>Attention !</strong> Cette action supprimera :
                        </p>
                        <ul className="mt-2 text-sm text-red-300 list-disc list-inside">
                            <li>Le job de la queue d'ingestion</li>
                            <li>Le fichier source associé</li>
                        </ul>
                        <p className="mt-2 text-sm text-red-300">
                            Fichier : <strong className="font-mono">{job.file?.original_filename}</strong>
                        </p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 text-baikal-text hover:text-white transition-colors font-mono"
                        >
                            ANNULER
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white font-medium rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-mono"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            SUPPRIMER
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function Ingestion() {
    const navigate = useNavigate();
    const { isSuperAdmin } = useAuth();

    // États
    const [stats, setStats] = useState({ queued: 0, sent: 0, completed: 0, failed: 0, total: 0 });
    const [jobs, setJobs] = useState([]);
    const [apps, setApps] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    // Filtres
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [appFilter, setAppFilter] = useState('');
    const [orgFilter, setOrgFilter] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Modals
    const [selectedJob, setSelectedJob] = useState(null);
    const [deletingJob, setDeletingJob] = useState(null);

    // Vérifier l'accès super_admin
    useEffect(() => {
        if (!isSuperAdmin) {
            navigate('/admin', { replace: true });
        }
    }, [isSuperAdmin, navigate]);

    // Charger apps et orgs au démarrage
    useEffect(() => {
        async function loadFilters() {
            try {
                const [appsData, orgsData] = await Promise.all([
                    ingestionService.getApps(),
                    ingestionService.getOrgs(),
                ]);
                setApps(appsData);
                setOrgs(orgsData);
            } catch (err) {
                console.error('[Ingestion] Error loading filters:', err);
            }
        }
        loadFilters();
    }, []);

    // Charger les données
    const loadData = useCallback(async (showRefreshing = false) => {
        if (showRefreshing) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const [statsData, jobsData] = await Promise.all([
                ingestionService.getStats({ appId: appFilter || null, orgId: orgFilter || null }),
                ingestionService.getJobs({
                    status: statusFilter,
                    search: search.trim() || null,
                    appId: appFilter || null,
                    orgId: orgFilter || null,
                }),
            ]);

            setStats(statsData);
            setJobs(jobsData);
        } catch (err) {
            console.error('[Ingestion] Error loading data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [statusFilter, search, appFilter, orgFilter]);

    // Chargement initial et sur changement de filtres
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            loadData(true);
        }, AUTO_REFRESH_INTERVAL);

        return () => clearInterval(interval);
    }, [autoRefresh, loadData]);

    // Handlers
    const handleRefresh = () => {
        loadData(true);
    };

    const handleRetry = async (job) => {
        try {
            setRefreshing(true);
            await ingestionService.retryJob(job.file_id);
            loadData(true);
        } catch (err) {
            console.error('[Ingestion] Error retrying job:', err);
            setError(`Erreur lors du retry: ${err.message}`);
            setRefreshing(false);
        }
    };

    const handleRetryAllFailed = async () => {
        const totalToRetry = stats.failed + stats.queued;
        if (!window.confirm(`Relancer tous les jobs bloqués (${totalToRetry}) ?`)) {
            return;
        }

        try {
            setRefreshing(true);
            const result = await ingestionService.retryAllFailed({ 
                appId: appFilter || null,
                orgId: orgFilter || null 
            });
            
            if (result.errors > 0) {
                alert(`${result.count} job(s) relancé(s), ${result.errors} erreur(s)`);
            } else {
                alert(`${result.count} job(s) relancé(s)`);
            }
            
            loadData(true);
        } catch (err) {
            console.error('[Ingestion] Error retrying all:', err);
            setError(err.message);
            setRefreshing(false);
        }
    };

    const handleDelete = (job) => {
        setDeletingJob(job);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingJob) return;

        try {
            await ingestionService.deleteJob(deletingJob.id, deletingJob.file_id);
            setDeletingJob(null);
            loadData(true);
        } catch (err) {
            console.error('[Ingestion] Error deleting job:', err);
            setError(err.message);
        }
    };

    const handleViewDetails = (job) => {
        setSelectedJob(job);
    };

    const handleStatClick = (status) => {
        setStatusFilter(prev => prev === status ? 'all' : status);
    };

    // Accès refusé si pas super_admin
    if (!isSuperAdmin) {
        return (
            <div className="min-h-screen bg-baikal-bg flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <p className="text-white font-mono">ACCÈS_REFUSÉ</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-baikal-bg">
            {/* Header */}
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Retour + Titre */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 text-baikal-text hover:text-white hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-baikal-cyan/20 rounded-md">
                                    <Database className="w-5 h-5 text-baikal-cyan" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-mono font-bold text-white">
                                        INGESTION_QUEUE
                                    </h1>
                                    <p className="text-xs text-baikal-text font-mono">
                                        Monitoring de l'ingestion RAG
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            {/* Auto-refresh toggle */}
                            <label className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-baikal-bg border border-baikal-border rounded-md cursor-pointer hover:border-baikal-cyan transition-colors">
                                <input
                                    type="checkbox"
                                    checked={autoRefresh}
                                    onChange={(e) => setAutoRefresh(e.target.checked)}
                                    className="w-4 h-4 rounded border-baikal-border bg-baikal-bg text-baikal-cyan focus:ring-baikal-cyan"
                                />
                                <span className="text-xs text-baikal-text whitespace-nowrap font-mono">
                                    AUTO_REFRESH
                                </span>
                            </label>

                            {/* Bouton refresh */}
                            <button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black font-medium rounded-md hover:bg-baikal-cyan/90 disabled:opacity-50 transition-colors font-mono"
                            >
                                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                                REFRESH
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Contenu */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        label="En attente"
                        value={stats.queued}
                        icon={Clock}
                        color="text-amber-400"
                        bgColor="bg-amber-500/20"
                        borderColor="border-amber-500/30"
                        onClick={() => handleStatClick('queued')}
                        isActive={statusFilter === 'queued'}
                    />
                    <StatCard
                        label="En cours"
                        value={stats.sent}
                        icon={Send}
                        color="text-blue-400"
                        bgColor="bg-blue-500/20"
                        borderColor="border-blue-500/30"
                        onClick={() => handleStatClick('sent')}
                        isActive={statusFilter === 'sent'}
                    />
                    <StatCard
                        label="Terminés"
                        value={stats.completed}
                        icon={CheckCircle2}
                        color="text-green-400"
                        bgColor="bg-green-500/20"
                        borderColor="border-green-500/30"
                        onClick={() => handleStatClick('completed')}
                        isActive={statusFilter === 'completed'}
                    />
                    <StatCard
                        label="Échecs"
                        value={stats.failed}
                        icon={XCircle}
                        color="text-red-400"
                        bgColor="bg-red-500/20"
                        borderColor="border-red-500/30"
                        onClick={() => handleStatClick('failed')}
                        isActive={statusFilter === 'failed'}
                    />
                </div>

                {/* Filtres */}
                <div className="flex flex-col lg:flex-row gap-4 mb-6">
                    {/* Recherche */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher par nom, email..."
                            className="w-full pl-10 pr-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white placeholder-baikal-text/50 focus:outline-none focus:border-baikal-cyan transition-colors"
                        />
                    </div>

                    {/* Filtre App */}
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-baikal-text" />
                        <select
                            value={appFilter}
                            onChange={(e) => setAppFilter(e.target.value)}
                            className="px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors font-mono min-w-[140px]"
                        >
                            <option value="">TOUTES APPS</option>
                            {apps.map(app => (
                                <option key={app.id} value={app.id}>{app.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Filtre Org */}
                    <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-baikal-text" />
                        <select
                            value={orgFilter}
                            onChange={(e) => setOrgFilter(e.target.value)}
                            className="px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md text-white focus:outline-none focus:border-baikal-cyan transition-colors font-mono min-w-[160px]"
                        >
                            <option value="">TOUTES ORGS</option>
                            {orgs.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Retry all (failed + queued) */}
                    {(stats.failed + stats.queued) > 0 && (
                        <button
                            onClick={handleRetryAllFailed}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 rounded-md transition-colors font-mono whitespace-nowrap disabled:opacity-50"
                        >
                            <RotateCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            RETRY_ALL ({stats.failed + stats.queued})
                        </button>
                    )}
                </div>

                {/* Erreur */}
                {error && (
                    <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="font-mono">{error}</p>
                        <button
                            onClick={() => loadData()}
                            className="ml-auto text-sm font-medium hover:underline font-mono"
                        >
                            RÉESSAYER
                        </button>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                    </div>
                )}

                {/* Liste vide */}
                {!loading && jobs.length === 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md p-12 text-center">
                        <Database className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                        <h3 className="text-lg font-mono font-medium text-white mb-2">
                            AUCUN_JOB
                        </h3>
                        <p className="text-baikal-text">
                            {search || statusFilter !== 'all' || appFilter || orgFilter
                                ? 'Aucun job ne correspond à vos filtres.'
                                : 'La queue d\'ingestion est vide.'
                            }
                        </p>
                    </div>
                )}

                {/* Tableau */}
                {!loading && jobs.length > 0 && (
                    <div className="bg-baikal-surface border border-baikal-border rounded-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-baikal-bg/50 border-b border-baikal-border">
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Fichier
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Tentatives
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-mono font-semibold text-baikal-text uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {jobs.map((job) => (
                                        <JobRow
                                            key={job.id}
                                            job={job}
                                            onRetry={handleRetry}
                                            onDelete={handleDelete}
                                            onViewDetails={handleViewDetails}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer stats */}
                        <div className="px-4 py-3 bg-baikal-bg/30 border-t border-baikal-border flex items-center justify-between text-sm text-baikal-text font-mono">
                            <span>
                                {jobs.length} job{jobs.length > 1 ? 's' : ''} affiché{jobs.length > 1 ? 's' : ''}
                            </span>
                            <span>
                                Total: {stats.total}
                            </span>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal détails */}
            <JobDetailsModal
                isOpen={!!selectedJob}
                onClose={() => setSelectedJob(null)}
                job={selectedJob}
            />

            {/* Modal suppression */}
            <DeleteConfirmModal
                isOpen={!!deletingJob}
                onClose={() => setDeletingJob(null)}
                job={deletingJob}
                onConfirm={handleDeleteConfirm}
            />
        </div>
    );
}
