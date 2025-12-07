// ============================================================================
// VerticalSelector - Composant de sélection de verticale
// Version 2 : Chargement depuis Supabase uniquement
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Layers, Loader2 } from 'lucide-react';

/**
 * VerticalSelector - Sélecteur de verticale métier
 * 
 * @param {Object} props
 * @param {string} props.currentVertical - ID de la verticale actuellement sélectionnée
 * @param {function} props.onVerticalChange - Callback lors du changement
 * @param {Object} props.supabaseClient - Instance Supabase (optionnel)
 * @param {Array} props.verticals - Liste des verticales (si déjà chargées)
 * @param {boolean} props.showLabel - Afficher le label (défaut: true)
 * @param {string} props.className - Classes CSS additionnelles
 */
const VerticalSelector = ({
    currentVertical,
    onVerticalChange,
    supabaseClient = null,
    verticals: propVerticals = null,
    showLabel = true,
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [verticals, setVerticals] = useState(propVerticals || []);
    const [loading, setLoading] = useState(!propVerticals);
    const dropdownRef = useRef(null);

    // Charger les verticales depuis Supabase si non fournies
    useEffect(() => {
        if (propVerticals) {
            setVerticals(propVerticals);
            setLoading(false);
            return;
        }

        if (!supabaseClient) {
            setLoading(false);
            return;
        }

        const fetchVerticals = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabaseClient
                    .from('verticals')
                    .select('id, name, description, icon, color, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true });

                if (error) throw error;

                if (data && data.length > 0) {
                    setVerticals(data);
                }
            } catch (err) {
                console.warn('Impossible de charger les verticales:', err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchVerticals();
    }, [supabaseClient, propVerticals]);

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

    // Trouver la verticale sélectionnée
    const selectedVertical = verticals.find(v => v.id === currentVertical) || verticals[0];

    // Gérer la sélection
    const handleSelect = (verticalId) => {
        setIsOpen(false);
        if (onVerticalChange && verticalId !== currentVertical) {
            onVerticalChange(verticalId);
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

    if (verticals.length === 0) {
        return null;
    }

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {/* Label optionnel */}
            {showLabel && (
                <label className="block text-xs font-medium text-slate-500 mb-1">
                    Verticale active
                </label>
            )}

            {/* Bouton principal */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    relative w-full min-w-[180px] px-4 py-2.5
                    bg-white border border-slate-200 rounded-xl
                    shadow-sm hover:shadow-md
                    transition-all duration-200
                    flex items-center justify-between gap-3
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                `}
            >
                <div className="flex items-center gap-3">
                    <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${selectedVertical?.color || '#6366f1'}20` }}
                    >
                        <Layers 
                            className="w-4 h-4" 
                            style={{ color: selectedVertical?.color || '#6366f1' }}
                        />
                    </div>
                    <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">
                            {selectedVertical?.name || 'Sélectionner'}
                        </p>
                        {selectedVertical?.description && (
                            <p className="text-xs text-slate-500 truncate max-w-[120px]">
                                {selectedVertical.description}
                            </p>
                        )}
                    </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="py-1 max-h-64 overflow-y-auto">
                        {verticals.map((vertical) => {
                            const isSelected = vertical.id === currentVertical;

                            return (
                                <button
                                    key={vertical.id}
                                    onClick={() => handleSelect(vertical.id)}
                                    className={`
                                        w-full px-4 py-3 flex items-center gap-3 text-left
                                        transition-colors duration-150
                                        ${isSelected 
                                            ? 'bg-indigo-50' 
                                            : 'hover:bg-slate-50'
                                        }
                                    `}
                                >
                                    <div 
                                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: `${vertical.color || '#6366f1'}20` }}
                                    >
                                        <Layers 
                                            className="w-4 h-4" 
                                            style={{ color: vertical.color || '#6366f1' }}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                                            {vertical.name}
                                        </p>
                                        {vertical.description && (
                                            <p className="text-xs text-slate-500 truncate">
                                                {vertical.description}
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

export default VerticalSelector;
