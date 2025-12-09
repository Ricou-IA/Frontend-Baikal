// ============================================================================
// AppSelector - Composant de sélection d'app (anciennement VerticalSelector)
// MIGRATION PHASE 3 - Base de données Baikal v2
// 
// MODIFICATIONS APPORTÉES:
// - VerticalSelector → AppSelector (renommé)
// - currentVertical → currentApp (prop renommée)
// - onVerticalChange → onAppChange (prop renommée)
// - verticals → config.apps (table renommée, schéma changé)
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Layers, Loader2 } from 'lucide-react';

/**
 * AppSelector - Sélecteur d'application métier
 * 
 * MIGRATION:
 * - VerticalSelector → AppSelector
 * - currentVertical → currentApp
 * - onVerticalChange → onAppChange
 * - verticals → apps
 * 
 * @param {Object} props
 * @param {string} props.currentApp - ID de l'app actuellement sélectionnée
 * @param {function} props.onAppChange - Callback lors du changement
 * @param {Object} props.supabaseClient - Instance Supabase (optionnel)
 * @param {Array} props.apps - Liste des apps (si déjà chargées)
 * @param {boolean} props.showLabel - Afficher le label (défaut: true)
 * @param {string} props.className - Classes CSS additionnelles
 */
const AppSelector = ({
    currentApp,                                  // ← CHANGÉ: currentVertical → currentApp
    onAppChange,                                 // ← CHANGÉ: onVerticalChange → onAppChange
    supabaseClient = null,
    apps: propApps = null,                       // ← CHANGÉ: verticals → apps
    showLabel = true,
    className = '',
    
    // Props deprecated pour compatibilité
    currentVertical,
    onVerticalChange,
    verticals: propVerticals,
}) => {
    // Support des anciens noms de props
    const _currentApp = currentApp ?? currentVertical;
    const _onAppChange = onAppChange ?? onVerticalChange;
    const _propApps = propApps ?? propVerticals;

    const [isOpen, setIsOpen] = useState(false);
    const [apps, setApps] = useState(_propApps || []);
    const [loading, setLoading] = useState(!_propApps);
    const dropdownRef = useRef(null);

    // Charger les apps depuis Supabase si non fournies
    // MIGRATION: verticals → config.apps
    useEffect(() => {
        if (_propApps) {
            setApps(_propApps);
            setLoading(false);
            return;
        }

        if (!supabaseClient) {
            setLoading(false);
            return;
        }

        const fetchApps = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabaseClient
                    .from('apps')                        // Tables dans search_path: config
                    .select('id, name, description, icon, color, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true });

                if (error) throw error;

                if (data && data.length > 0) {
                    setApps(data);
                }
            } catch (err) {
                console.warn('Impossible de charger les apps:', err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchApps();
    }, [supabaseClient, _propApps]);

    // Fermer le dropdown au clic extérieur
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Trouver l'app sélectionnée
    const selectedApp = apps.find(v => v.id === _currentApp) || apps[0];

    // Gérer la sélection
    const handleSelect = (appId) => {
        setIsOpen(false);
        if (_onAppChange && appId !== _currentApp) {
            _onAppChange(appId);
        }
    };

    if (loading) {
        return (
            <div className={`flex items-center gap-2 text-slate-400 ${className}`}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Chargement...</span>
            </div>
        );
    }

    if (apps.length === 0) {
        return null;
    }

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {/* Label optionnel */}
            {showLabel && (
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                    Application
                </label>
            )}

            {/* Bouton principal */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${selectedApp?.color || '#6366f1'}20` }}
                    >
                        <Layers 
                            className="w-4 h-4" 
                            style={{ color: selectedApp?.color || '#6366f1' }}
                        />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-medium text-slate-800">
                            {selectedApp?.name || 'Sélectionner'}
                        </p>
                        {selectedApp?.description && (
                            <p className="text-xs text-slate-500 truncate max-w-[150px]">
                                {selectedApp.description}
                            </p>
                        )}
                    </div>
                </div>
                <ChevronDown 
                    className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto py-1">
                        {apps.map((app) => {
                            const isSelected = app.id === _currentApp;
                            return (
                                <button
                                    key={app.id}
                                    onClick={() => handleSelect(app.id)}
                                    className={`
                                        w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                                        ${isSelected 
                                            ? 'bg-indigo-50' 
                                            : 'hover:bg-slate-50'
                                        }
                                    `}
                                >
                                    <div 
                                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: `${app.color || '#6366f1'}20` }}
                                    >
                                        <Layers 
                                            className="w-4 h-4" 
                                            style={{ color: app.color || '#6366f1' }}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                                            {app.name}
                                        </p>
                                        {app.description && (
                                            <p className="text-xs text-slate-500 truncate">
                                                {app.description}
                                            </p>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Alias pour compatibilité ascendante
 * @deprecated Utiliser AppSelector à la place
 */
export const VerticalSelector = AppSelector;

export default AppSelector;
