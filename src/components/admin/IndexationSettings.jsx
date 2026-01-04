/**
 * IndexationSettings.jsx - Baikal Console
 * ============================================================================
 * Interface d'administration des concepts et catégories documentaires.
 * Accessible uniquement aux super_admin.
 * 
 * Structure:
 * - Sélecteur d'application en haut
 * - Bloc Catégories documentaires (avec drag & drop)
 * - Bloc Concepts (tree view)
 * 
 * @version 2.1.0 - Support drag & drop pour réordonnancement des catégories
 * 
 * MODIFICATIONS 04/01/2026:
 * - Titre uniforme style Dashboard (text-xl au lieu de text-2xl)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Database,
    FolderTree,
    Tags,
    Loader2,
    AlertCircle,
    RefreshCw,
    ChevronDown,
} from 'lucide-react';
import { indexationService } from '../../services/indexation.service';
import CategoryList from './CategoryList';
import ConceptTree from './ConceptTree';
import CategoryModal from './CategoryModal';
import ConceptModal from './ConceptModal';

// ============================================================================
// COMPOSANT SÉLECTEUR D'APPLICATION
// ============================================================================

function AppSelector({ apps, selectedAppId, onSelect, loading }) {
    if (loading) {
        return (
            <div className="flex items-center gap-2 text-baikal-text">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-mono">CHARGEMENT...</span>
            </div>
        );
    }

    return (
        <div className="relative">
            <select
                value={selectedAppId}
                onChange={(e) => onSelect(e.target.value)}
                className="
                    appearance-none w-full md:w-64 px-4 py-2.5 pr-10
                    bg-baikal-surface border border-baikal-border rounded-md
                    text-white font-mono text-sm
                    focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent
                    cursor-pointer
                "
            >
                <option value="">-- Sélectionner une application --</option>
                {apps.map((app) => (
                    <option key={app.id} value={app.id}>
                        {app.name}
                    </option>
                ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text pointer-events-none" />
        </div>
    );
}

// ============================================================================
// COMPOSANT SECTION WRAPPER
// ============================================================================

function Section({ title, icon: Icon, children, actions }) {
    return (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-baikal-border bg-baikal-bg/50">
                <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-baikal-cyan" />
                    <h2 className="text-lg font-semibold text-white font-mono">{title}</h2>
                </div>
                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
            {/* Content */}
            <div className="p-4">
                {children}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function IndexationSettings() {
    // État - Applications
    const [apps, setApps] = useState([]);
    const [selectedAppId, setSelectedAppId] = useState('');
    const [loadingApps, setLoadingApps] = useState(true);

    // État - Concepts
    const [concepts, setConcepts] = useState([]);
    const [loadingConcepts, setLoadingConcepts] = useState(false);

    // État - Catégories
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);

    // État - Erreurs
    const [error, setError] = useState(null);

    // État - Modals
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState(null);
    const [conceptModalOpen, setConceptModalOpen] = useState(false);
    const [conceptToEdit, setConceptToEdit] = useState(null);

    // ========================================================================
    // CHARGEMENT DES APPS
    // ========================================================================

    useEffect(() => {
        async function loadApps() {
            setLoadingApps(true);
            try {
                const { data, error } = await indexationService.getApps();
                if (error) throw error;
                setApps(data);
                
                // Sélectionner la première app par défaut si disponible
                if (data.length > 0 && !selectedAppId) {
                    setSelectedAppId(data[0].id);
                }
            } catch (err) {
                console.error('Error loading apps:', err);
                setError('Impossible de charger les applications');
            } finally {
                setLoadingApps(false);
            }
        }
        loadApps();
    }, []);

    // ========================================================================
    // CHARGEMENT DES DONNÉES PAR APP
    // ========================================================================

    const loadData = useCallback(async () => {
        if (!selectedAppId) {
            setConcepts([]);
            setCategories([]);
            return;
        }

        setError(null);
        setLoadingConcepts(true);
        setLoadingCategories(true);

        try {
            // Charger en parallèle
            const [conceptsResult, categoriesResult] = await Promise.all([
                indexationService.getConceptsByApp(selectedAppId),
                indexationService.getCategoriesByApp(selectedAppId),
            ]);

            if (conceptsResult.error) throw conceptsResult.error;
            if (categoriesResult.error) throw categoriesResult.error;

            setConcepts(conceptsResult.data);
            setCategories(categoriesResult.data);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Impossible de charger les données');
        } finally {
            setLoadingConcepts(false);
            setLoadingCategories(false);
        }
    }, [selectedAppId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ========================================================================
    // HANDLERS CATÉGORIES
    // ========================================================================

    const handleCreateCategory = () => {
        setCategoryToEdit(null);
        setCategoryModalOpen(true);
    };

    const handleEditCategory = (category) => {
        setCategoryToEdit(category);
        setCategoryModalOpen(true);
    };

    /**
     * Supprime une catégorie
     * Note: La confirmation est gérée dans CategoryList via ConfirmModal
     */
    const handleDeleteCategory = async (categoryId) => {
        try {
            const { success, error } = await indexationService.deleteCategory(categoryId);
            if (error) throw error;
            if (success) {
                // Recharger les catégories
                loadData();
            }
        } catch (err) {
            console.error('Error deleting category:', err);
            setError('Impossible de supprimer la catégorie');
        }
    };

    /**
     * Réordonne les catégories (drag & drop)
     * Note: L'UI est mise à jour immédiatement (optimistic update dans CategoryList)
     * Cette fonction sauvegarde simplement en base sans recharger
     */
    const handleReorderCategories = async (updates) => {
        try {
            const { success, error } = await indexationService.reorderCategories(updates);
            if (error) throw error;
            // Pas de loadData() ici : l'optimistic update gère l'affichage
        } catch (err) {
            console.error('Error reordering categories:', err);
            setError('Impossible de réordonner les catégories');
            // En cas d'erreur, recharger pour rollback
            loadData();
        }
    };

    const handleCategorySaved = () => {
        setCategoryModalOpen(false);
        setCategoryToEdit(null);
        loadData();
    };

    // ========================================================================
    // HANDLERS CONCEPTS
    // ========================================================================

    const handleCreateConcept = () => {
        setConceptToEdit(null);
        setConceptModalOpen(true);
    };

    const handleEditConcept = (concept) => {
        setConceptToEdit(concept);
        setConceptModalOpen(true);
    };

    /**
     * Supprime un concept
     * Note: La confirmation est gérée dans ConceptTree via ConfirmModal
     */
    const handleDeleteConcept = async (conceptId) => {
        try {
            const { success, error, hasChildren } = await indexationService.deleteConcept(conceptId);
            
            if (hasChildren) {
                setError('Impossible de supprimer : ce concept a des enfants. Supprimez d\'abord les concepts enfants.');
                return;
            }
            
            if (error) throw error;
            if (success) {
                loadData();
            }
        } catch (err) {
            console.error('Error deleting concept:', err);
            setError('Impossible de supprimer le concept');
        }
    };

    const handleConceptSaved = () => {
        setConceptModalOpen(false);
        setConceptToEdit(null);
        loadData();
    };

    // ========================================================================
    // RENDER
    // ========================================================================

    const selectedApp = apps.find(a => a.id === selectedAppId);

    return (
        <div className="space-y-6">
            {/* ⭐ Header uniforme style Dashboard (text-xl au lieu de text-2xl) */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
                        <Database className="w-5 h-5 text-baikal-cyan" />
                        INDEXATION
                    </h2>
                    <p className="text-baikal-text text-sm mt-1 font-sans">
                        Configuration des concepts et catégories documentaires par application
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <AppSelector
                        apps={apps}
                        selectedAppId={selectedAppId}
                        onSelect={setSelectedAppId}
                        loading={loadingApps}
                    />
                    
                    {selectedAppId && (
                        <button
                            onClick={loadData}
                            disabled={loadingConcepts || loadingCategories}
                            className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors disabled:opacity-50"
                            title="Rafraîchir"
                        >
                            <RefreshCw className={`w-5 h-5 ${(loadingConcepts || loadingCategories) ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Erreur globale */}
            {error && (
                <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-mono text-sm">{error}</p>
                    <button
                        onClick={() => setError(null)}
                        className="ml-auto text-sm font-medium hover:underline font-mono"
                    >
                        FERMER
                    </button>
                </div>
            )}

            {/* Message si aucune app sélectionnée */}
            {!selectedAppId && !loadingApps && (
                <div className="p-8 bg-baikal-surface border border-baikal-border rounded-lg text-center">
                    <Database className="w-12 h-12 text-baikal-text mx-auto mb-4" />
                    <p className="text-baikal-text font-mono">
                        Sélectionnez une application pour gérer ses concepts et catégories
                    </p>
                </div>
            )}

            {/* Contenu principal */}
            {selectedAppId && (
                <div className="space-y-6">
                    {/* Section Catégories */}
                    <Section
                        title="CATÉGORIES_DOCUMENTAIRES"
                        icon={Tags}
                        actions={
                            <button
                                onClick={handleCreateCategory}
                                className="px-3 py-1.5 bg-baikal-cyan text-black text-sm font-mono font-medium rounded-md hover:bg-baikal-cyan/80 transition-colors"
                            >
                                + NOUVELLE
                            </button>
                        }
                    >
                        {loadingCategories ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 text-baikal-cyan animate-spin" />
                            </div>
                        ) : (
                            <CategoryList
                                categories={categories}
                                concepts={concepts}
                                onEdit={handleEditCategory}
                                onDelete={handleDeleteCategory}
                                onReorder={handleReorderCategories}
                            />
                        )}
                    </Section>

                    {/* Section Concepts */}
                    <Section
                        title="CONCEPTS"
                        icon={FolderTree}
                        actions={
                            <button
                                onClick={handleCreateConcept}
                                className="px-3 py-1.5 bg-baikal-cyan text-black text-sm font-mono font-medium rounded-md hover:bg-baikal-cyan/80 transition-colors"
                            >
                                + NOUVEAU
                            </button>
                        }
                    >
                        {loadingConcepts ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 text-baikal-cyan animate-spin" />
                            </div>
                        ) : (
                            <ConceptTree
                                concepts={concepts}
                                onEdit={handleEditConcept}
                                onDelete={handleDeleteConcept}
                            />
                        )}
                    </Section>
                </div>
            )}

            {/* Modal Catégorie */}
            {categoryModalOpen && (
                <CategoryModal
                    isOpen={categoryModalOpen}
                    onClose={() => {
                        setCategoryModalOpen(false);
                        setCategoryToEdit(null);
                    }}
                    category={categoryToEdit}
                    concepts={concepts}
                    selectedAppId={selectedAppId}
                    onSaved={handleCategorySaved}
                />
            )}

            {/* Modal Concept */}
            {conceptModalOpen && (
                <ConceptModal
                    isOpen={conceptModalOpen}
                    onClose={() => {
                        setConceptModalOpen(false);
                        setConceptToEdit(null);
                    }}
                    concept={conceptToEdit}
                    concepts={concepts}
                    selectedAppId={selectedAppId}
                    onSaved={handleConceptSaved}
                />
            )}
        </div>
    );
}
