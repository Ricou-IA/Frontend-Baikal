// ============================================================================
// Composant SyncModal - Modal de synchronisation Légifrance
// Version 2 : Verticales depuis props (chargées via Supabase)
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    X,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Search,
    Building2,
    Trash2,
    Plus,
    Loader2,
    Zap,
    Database,
    Clock
} from 'lucide-react';

/**
 * Badge de verticale avec couleur dynamique
 */
function VerticalBadge({ vertical, selected, onClick, disabled }) {
    // Générer les styles basés sur la couleur hex
    const baseColor = vertical.color || '#6366f1';
    
    const selectedStyles = {
        backgroundColor: `${baseColor}20`,
        borderColor: `${baseColor}60`,
        color: baseColor,
    };
    
    const unselectedStyles = {
        backgroundColor: 'white',
        borderColor: '#e2e8f0',
        color: baseColor,
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`
                px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}
                ${selected ? 'ring-2 ring-offset-1' : ''}
            `}
            style={{
                ...(selected ? selectedStyles : unselectedStyles),
                '--tw-ring-color': selected ? `${baseColor}40` : 'transparent',
            }}
        >
            <span className="flex items-center gap-1.5">
                {selected && <CheckCircle className="w-3.5 h-3.5" />}
                {vertical.label || vertical.name}
            </span>
        </button>
    );
}

/**
 * Composant principal du modal de synchronisation
 */
export default function SyncModal({
    isOpen,
    onClose,
    code,
    verticals = [],
    organizations = [],
    onSync,
    syncing,
    searchOrganizations,
    getOrganizationById,
    onAddOrgGrant,
    onRemoveOrgGrant
}) {
    const { user } = useAuth();
    
    // États locaux
    const [syncType, setSyncType] = useState('incremental');
    const [selectedVerticals, setSelectedVerticals] = useState([]);
    const [orgSearchTerm, setOrgSearchTerm] = useState('');
    const [showOrgSearch, setShowOrgSearch] = useState(false);
    const [localError, setLocalError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Initialiser avec les verticales du code
    useEffect(() => {
        if (code && verticals.length > 0) {
            const defaultVerts = code.default_verticals || [];
            // Filtrer pour ne garder que les verticales valides
            const validVerts = defaultVerts.filter(v => verticals.some(vert => vert.id === v));
            setSelectedVerticals(validVerts.length > 0 ? validVerts : [verticals[0]?.id].filter(Boolean));
        }
    }, [code, verticals]);

    // Réinitialiser à l'ouverture
    useEffect(() => {
        if (isOpen) {
            setLocalError(null);
            setSuccessMessage(null);
            setOrgSearchTerm('');
            setShowOrgSearch(false);
        }
    }, [isOpen]);

    // Fermer si pas ouvert
    if (!isOpen || !code) return null;

    // Gestion des verticales
    const toggleVertical = (verticalId) => {
        setSelectedVerticals(prev => {
            if (prev.includes(verticalId)) {
                if (prev.length === 1) return prev;
                return prev.filter(v => v !== verticalId);
            }
            return [...prev, verticalId];
        });
    };

    // Organisations avec grant actuel
    const grantedOrgs = (code.granted_org_ids || [])
        .map(id => getOrganizationById?.(id))
        .filter(Boolean);

    // Résultats de recherche organisations
    const searchResults = orgSearchTerm.length >= 2 && searchOrganizations
        ? searchOrganizations(orgSearchTerm).filter(
            org => !(code.granted_org_ids || []).includes(org.id)
          ).slice(0, 5)
        : [];

    // Lancer la synchronisation
    const handleSync = async () => {
        if (selectedVerticals.length === 0) {
            setLocalError('Sélectionnez au moins une verticale');
            return;
        }

        setLocalError(null);
        setSuccessMessage(null);

        const result = await onSync(code.id, syncType, selectedVerticals, user?.id);
        
        if (result.success) {
            setSuccessMessage('Synchronisation lancée ! Le processus peut prendre plusieurs minutes.');
            setTimeout(() => {
                onClose();
            }, 3000);
        } else {
            setLocalError(result.error || 'Erreur lors du lancement de la synchronisation');
        }
    };

    // Ajouter un grant
    const handleAddGrant = async (orgId) => {
        if (!onAddOrgGrant) return;
        const result = await onAddOrgGrant(code.id, orgId);
        if (result.success) {
            setOrgSearchTerm('');
            setShowOrgSearch(false);
        } else {
            setLocalError(result.error);
        }
    };

    // Retirer un grant
    const handleRemoveGrant = async (orgId) => {
        if (!onRemoveOrgGrant) return;
        const result = await onRemoveOrgGrant(code.id, orgId);
        if (!result.success) {
            setLocalError(result.error);
        }
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
                    className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl transform transition-all"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">
                                Synchroniser : {code.name}
                            </h2>
                            <p className="text-sm text-slate-500 mt-0.5">
                                {code.short_name} • ID: {code.id}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={syncing}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Contenu */}
                    <div className="px-6 py-5 space-y-6">
                        {/* Type de synchronisation */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-3">
                                Type de synchronisation
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSyncType('incremental')}
                                    disabled={syncing}
                                    className={`
                                        relative p-4 rounded-xl border-2 text-left transition-all
                                        ${syncType === 'incremental'
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`
                                            w-10 h-10 rounded-lg flex items-center justify-center
                                            ${syncType === 'incremental' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}
                                        `}>
                                            <Zap className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-800">Incrémentale</p>
                                            <p className="text-xs text-slate-500">Nouveaux & modifiés uniquement</p>
                                        </div>
                                    </div>
                                    {syncType === 'incremental' && (
                                        <div className="absolute top-2 right-2">
                                            <CheckCircle className="w-5 h-5 text-indigo-500" />
                                        </div>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSyncType('full')}
                                    disabled={syncing}
                                    className={`
                                        relative p-4 rounded-xl border-2 text-left transition-all
                                        ${syncType === 'full'
                                            ? 'border-amber-500 bg-amber-50'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`
                                            w-10 h-10 rounded-lg flex items-center justify-center
                                            ${syncType === 'full' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}
                                        `}>
                                            <Database className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-800">Complète</p>
                                            <p className="text-xs text-slate-500">Réindexe tous les articles</p>
                                        </div>
                                    </div>
                                    {syncType === 'full' && (
                                        <div className="absolute top-2 right-2">
                                            <CheckCircle className="w-5 h-5 text-amber-500" />
                                        </div>
                                    )}
                                </button>
                            </div>
                            
                            {syncType === 'full' && (
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-700">
                                        <p className="font-medium">Attention</p>
                                        <p className="text-xs mt-0.5">
                                            La synchronisation complète peut prendre plusieurs heures selon la taille du code.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sélection des verticales */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-3">
                                Verticales cibles
                                <span className="font-normal text-slate-400 ml-2">
                                    (qui verront ce contenu)
                                </span>
                            </label>
                            {verticals.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {verticals.map(vertical => (
                                        <VerticalBadge
                                            key={vertical.id}
                                            vertical={vertical}
                                            selected={selectedVerticals.includes(vertical.id)}
                                            onClick={() => toggleVertical(vertical.id)}
                                            disabled={syncing}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-500 italic">Aucune verticale disponible</p>
                            )}
                        </div>

                        {/* Gestion des grants organisations */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-semibold text-slate-700">
                                    Accès exceptionnels par organisation
                                    <span className="font-normal text-slate-400 ml-2">
                                        (optionnel)
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowOrgSearch(!showOrgSearch)}
                                    disabled={syncing}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Ajouter
                                </button>
                            </div>

                            {/* Recherche d'organisations */}
                            {showOrgSearch && (
                                <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={orgSearchTerm}
                                            onChange={e => setOrgSearchTerm(e.target.value)}
                                            placeholder="Rechercher une organisation..."
                                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    
                                    {searchResults.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {searchResults.map(org => (
                                                <button
                                                    key={org.id}
                                                    onClick={() => handleAddGrant(org.id)}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white rounded-lg transition-colors"
                                                >
                                                    <Building2 className="w-4 h-4 text-slate-400" />
                                                    <span className="text-slate-700">{org.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {orgSearchTerm.length >= 2 && searchResults.length === 0 && (
                                        <p className="mt-2 text-xs text-slate-500 text-center py-2">
                                            Aucune organisation trouvée
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Organisations avec grant */}
                            {grantedOrgs.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {grantedOrgs.map(org => (
                                        <div 
                                            key={org.id}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg"
                                        >
                                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="text-sm text-slate-700">{org.name}</span>
                                            <button
                                                onClick={() => handleRemoveGrant(org.id)}
                                                disabled={syncing}
                                                className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 italic">
                                    Aucun accès exceptionnel configuré
                                </p>
                            )}
                        </div>

                        {/* Messages d'erreur et succès */}
                        {localError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                {localError}
                            </div>
                        )}

                        {successMessage && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700 text-sm">
                                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                {successMessage}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={syncing}
                            className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={syncing || selectedVerticals.length === 0}
                            className={`
                                flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all
                                ${syncing 
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/25'
                                }
                            `}
                        >
                            {syncing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Lancement...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4" />
                                    Lancer la synchronisation
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
