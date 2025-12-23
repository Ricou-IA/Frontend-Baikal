/**
 * CategoryList.jsx - Baikal Console
 * ============================================================================
 * Liste des catégories documentaires avec drag & drop pour réordonner.
 * Affiche un tableau simplifié : Label, Concept lié, Layers, Actions.
 * 
 * Dépendances :
 * - @dnd-kit/core
 * - @dnd-kit/sortable
 * - @dnd-kit/utilities
 * 
 * npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
 * 
 * @version 2.1.0 - Drag & drop pour réordonnancement
 * ============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Pencil,
    Trash2,
    Link2,
    Search,
    FileText,
    GripVertical,
    Loader2,
} from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LAYER_LABELS = {
    app: 'App',
    org: 'Org',
    project: 'Projet',
    user: 'User',
};

// ============================================================================
// COMPOSANT BADGE
// ============================================================================

function Badge({ children, variant = 'default' }) {
    const variants = {
        default: 'bg-baikal-bg text-baikal-text',
        purple: 'bg-purple-500/20 text-purple-300',
    };

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${variants[variant]}`}>
            {children}
        </span>
    );
}

// ============================================================================
// COMPOSANT LIGNE SORTABLE
// ============================================================================

function SortableRow({ category, onEdit, onDeleteRequest, isDragDisabled }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ 
        id: category.id,
        disabled: isDragDisabled,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 'auto',
    };

    const linkedConcept = category.linked_concept;

    return (
        <tr
            ref={setNodeRef}
            style={style}
            className={`
                border-b border-baikal-border hover:bg-baikal-bg/50 transition-colors
                ${isDragging ? 'bg-baikal-bg shadow-lg' : ''}
            `}
        >
            {/* Drag Handle */}
            <td className="px-2 py-3 w-10">
                {!isDragDisabled && (
                    <button
                        {...attributes}
                        {...listeners}
                        className="p-1 text-baikal-text hover:text-baikal-cyan cursor-grab active:cursor-grabbing rounded transition-colors"
                        title="Glisser pour réordonner"
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>
                )}
            </td>

            {/* Label + Description */}
            <td className="px-4 py-3">
                <div>
                    <span className="text-white font-medium">{category.label}</span>
                    {category.description && (
                        <p className="text-xs text-baikal-text mt-0.5 truncate max-w-md">
                            {category.description}
                        </p>
                    )}
                </div>
            </td>

            {/* Concept lié */}
            <td className="px-4 py-3">
                {linkedConcept ? (
                    <div className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-purple-400" />
                        <Badge variant="purple">{linkedConcept.label}</Badge>
                    </div>
                ) : (
                    <span className="text-baikal-text text-sm italic">—</span>
                )}
            </td>

            {/* Layers */}
            <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                    {(category.target_layers || []).map((layer) => (
                        <Badge key={layer} variant="default">
                            {LAYER_LABELS[layer] || layer}
                        </Badge>
                    ))}
                </div>
            </td>

            {/* Actions */}
            <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                    <button
                        onClick={() => onEdit(category)}
                        className="p-1.5 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded transition-colors"
                        title="Modifier"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onDeleteRequest(category)}
                        className="p-1.5 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title="Supprimer"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </td>
        </tr>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function CategoryList({ categories, concepts, onEdit, onDelete, onReorder }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // État local pour optimistic update (ordre immédiat sans attendre la base)
    const [localCategories, setLocalCategories] = useState([]);
    
    // Sync avec les props quand elles changent (chargement initial, refresh externe)
    React.useEffect(() => {
        const sorted = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setLocalCategories(sorted);
    }, [categories]);
    
    // État pour la modal de confirmation
    const [deleteModal, setDeleteModal] = useState({
        isOpen: false,
        category: null,
        loading: false,
    });

    // Sensors pour le drag & drop
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 8px de mouvement avant activation
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Filtrage par recherche (désactive le drag si recherche active)
    const filteredCategories = useMemo(() => {
        if (!searchTerm) {
            return localCategories;
        }
        
        const search = searchTerm.toLowerCase();
        return localCategories.filter((cat) =>
            cat.slug?.toLowerCase().includes(search) ||
            cat.label?.toLowerCase().includes(search) ||
            cat.description?.toLowerCase().includes(search)
        );
    }, [localCategories, searchTerm]);

    const isDragDisabled = Boolean(searchTerm) || isSaving;

    // Handler drag end - Optimistic update
    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        const oldIndex = localCategories.findIndex((cat) => cat.id === active.id);
        const newIndex = localCategories.findIndex((cat) => cat.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        // 1. OPTIMISTIC UPDATE : Mise à jour locale IMMÉDIATE
        const reorderedCategories = arrayMove(localCategories, oldIndex, newIndex);
        const updatedCategories = reorderedCategories.map((cat, index) => ({
            ...cat,
            sort_order: (index + 1) * 10,
        }));
        setLocalCategories(updatedCategories);

        // 2. Préparer les données pour la base
        const updates = updatedCategories.map((cat) => ({
            id: cat.id,
            sort_order: cat.sort_order,
        }));

        // 3. Sauvegarder en arrière-plan (sans bloquer l'UI)
        if (onReorder) {
            setIsSaving(true);
            try {
                await onReorder(updates);
            } catch (err) {
                console.error('Error reordering:', err);
                // Rollback en cas d'erreur : recharger depuis les props
                const sorted = [...categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                setLocalCategories(sorted);
            } finally {
                setIsSaving(false);
            }
        }
    };

    // Demander la suppression (ouvre la modal)
    const handleDeleteRequest = (category) => {
        setDeleteModal({
            isOpen: true,
            category,
            loading: false,
        });
    };

    // Confirmer la suppression
    const handleDeleteConfirm = async () => {
        if (!deleteModal.category) return;

        setDeleteModal((prev) => ({ ...prev, loading: true }));

        try {
            await onDelete(deleteModal.category.id);
            setDeleteModal({ isOpen: false, category: null, loading: false });
        } catch (err) {
            console.error('Error deleting category:', err);
            setDeleteModal((prev) => ({ ...prev, loading: false }));
        }
    };

    // Fermer la modal
    const handleDeleteCancel = () => {
        setDeleteModal({ isOpen: false, category: null, loading: false });
    };

    // État vide
    if (categories.length === 0) {
        return (
            <div className="text-center py-8">
                <FileText className="w-10 h-10 text-baikal-text mx-auto mb-3" />
                <p className="text-baikal-text font-mono">Aucune catégorie pour cette application</p>
                <p className="text-sm text-baikal-text/70 mt-1">
                    Cliquez sur "+ NOUVELLE" pour créer une catégorie
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Barre de recherche + indicateur de sauvegarde */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher une catégorie..."
                        className="
                            w-full md:w-80 pl-10 pr-4 py-2
                            bg-baikal-bg border border-baikal-border rounded-md
                            text-white text-sm font-mono placeholder-baikal-text
                            focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent
                        "
                    />
                </div>
                
                {isSaving && (
                    <div className="flex items-center gap-2 text-baikal-cyan text-sm font-mono">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sauvegarde...</span>
                    </div>
                )}
                
                {searchTerm && (
                    <p className="text-xs text-baikal-text font-mono">
                        ⚠️ Drag & drop désactivé pendant la recherche
                    </p>
                )}
            </div>

            {/* Tableau avec drag & drop */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-baikal-border text-left">
                                <th className="px-2 py-2 w-10"></th>
                                <th className="px-4 py-2 text-xs font-mono text-baikal-text uppercase tracking-wider">
                                    Catégorie
                                </th>
                                <th className="px-4 py-2 text-xs font-mono text-baikal-text uppercase tracking-wider">
                                    Concept lié
                                </th>
                                <th className="px-4 py-2 text-xs font-mono text-baikal-text uppercase tracking-wider">
                                    Layers
                                </th>
                                <th className="px-4 py-2 text-xs font-mono text-baikal-text uppercase tracking-wider text-right">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <SortableContext
                                items={filteredCategories.map((cat) => cat.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {filteredCategories.map((category) => (
                                    <SortableRow
                                        key={category.id}
                                        category={category}
                                        onEdit={onEdit}
                                        onDeleteRequest={handleDeleteRequest}
                                        isDragDisabled={isDragDisabled}
                                    />
                                ))}
                            </SortableContext>
                        </tbody>
                    </table>
                </div>
            </DndContext>

            {/* Message si aucun résultat de recherche */}
            {filteredCategories.length === 0 && searchTerm && (
                <div className="text-center py-6">
                    <p className="text-baikal-text font-mono text-sm">
                        Aucune catégorie trouvée pour "{searchTerm}"
                    </p>
                </div>
            )}

            {/* Compteur */}
            <div className="text-right text-xs text-baikal-text font-mono">
                {filteredCategories.length} / {categories.length} catégorie(s)
            </div>

            {/* Modal de confirmation de suppression */}
            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={handleDeleteCancel}
                onConfirm={handleDeleteConfirm}
                title="SUPPRIMER_CATÉGORIE"
                message="Cette catégorie sera supprimée. Les documents existants conserveront leur catégorie mais elle ne sera plus disponible pour de nouveaux uploads."
                confirmLabel="SUPPRIMER"
                variant="danger"
                icon={Trash2}
                loading={deleteModal.loading}
                itemPreview={
                    deleteModal.category
                        ? {
                              label: deleteModal.category.label,
                              sublabel: deleteModal.category.slug,
                          }
                        : null
                }
            />
        </div>
    );
}
