/**
 * ConceptTree.jsx - Baikal Console
 * ============================================================================
 * Arborescence hiérarchique des concepts avec expand/collapse.
 * Affiche les concepts racines (en gras) puis leurs enfants (en normal).
 * 
 * @version 2.0.0 - Simplification UI (retrait slug, hiérarchie visuelle)
 * ============================================================================
 */

import React, { useState, useMemo } from 'react';
import {
    ChevronRight,
    ChevronDown,
    Pencil,
    Trash2,
    FolderTree,
    Search,
} from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Organise les concepts en arborescence
 * @param {Array} concepts - Liste plate des concepts
 * @returns {Array} Concepts racines avec leurs enfants imbriqués
 */
function buildTree(concepts) {
    const map = new Map();
    const roots = [];

    // Créer une map de tous les concepts
    concepts.forEach((concept) => {
        map.set(concept.id, { ...concept, children: [] });
    });

    // Construire l'arborescence
    concepts.forEach((concept) => {
        const node = map.get(concept.id);
        if (concept.parent_id && map.has(concept.parent_id)) {
            map.get(concept.parent_id).children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Trier par label
    const sortByLabel = (a, b) => (a.label || '').localeCompare(b.label || '', 'fr');
    roots.sort(sortByLabel);
    map.forEach((node) => node.children.sort(sortByLabel));

    return roots;
}

/**
 * Filtre l'arborescence selon un terme de recherche
 * @param {Array} tree - Arborescence des concepts
 * @param {string} searchTerm - Terme de recherche
 * @returns {Array} Arborescence filtrée
 */
function filterTree(tree, searchTerm) {
    if (!searchTerm) return tree;

    const search = searchTerm.toLowerCase();

    function matches(node) {
        return (
            node.slug?.toLowerCase().includes(search) ||
            node.label?.toLowerCase().includes(search) ||
            node.description?.toLowerCase().includes(search)
        );
    }

    function filterNode(node) {
        // Filtrer récursivement les enfants
        const filteredChildren = node.children
            .map(filterNode)
            .filter(Boolean);

        // Garder le nœud si lui ou ses enfants correspondent
        if (matches(node) || filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
        }

        return null;
    }

    return tree.map(filterNode).filter(Boolean);
}

// ============================================================================
// COMPOSANT NŒUD DE L'ARBRE
// ============================================================================

function TreeNode({ node, level = 0, onEdit, onDeleteRequest, expandedIds, toggleExpand }) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isRoot = level === 0;
    const indent = level * 24;

    return (
        <div>
            {/* Ligne du nœud */}
            <div
                className={`
                    flex items-center gap-2 px-3 py-2 rounded-md
                    hover:bg-baikal-bg/50 transition-colors group
                `}
                style={{ paddingLeft: `${indent + 12}px` }}
            >
                {/* Bouton expand/collapse ou espace */}
                {hasChildren ? (
                    <button
                        onClick={() => toggleExpand(node.id)}
                        className="p-0.5 text-baikal-text hover:text-baikal-cyan transition-colors"
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                    </button>
                ) : (
                    <span className="w-5" /> 
                )}

                {/* Label - gras si racine, normal si enfant */}
                <span className={`flex-1 ${isRoot ? 'text-white font-semibold' : 'text-baikal-text'}`}>
                    {node.label}
                </span>

                {/* Badge nombre d'enfants */}
                {hasChildren && (
                    <span className="text-xs text-baikal-text bg-baikal-bg px-1.5 py-0.5 rounded font-mono">
                        {node.children.length}
                    </span>
                )}

                {/* Actions (visibles au hover) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onEdit(node)}
                        className="p-1 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded transition-colors"
                        title="Modifier"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => onDeleteRequest(node)}
                        className="p-1 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title="Supprimer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Enfants (si expanded) */}
            {hasChildren && isExpanded && (
                <div>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            level={level + 1}
                            onEdit={onEdit}
                            onDeleteRequest={onDeleteRequest}
                            expandedIds={expandedIds}
                            toggleExpand={toggleExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function ConceptTree({ concepts, onEdit, onDelete }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedIds, setExpandedIds] = useState(new Set());
    
    // État pour la modal de confirmation
    const [deleteModal, setDeleteModal] = useState({
        isOpen: false,
        concept: null,
        loading: false,
    });

    // Construire l'arborescence
    const tree = useMemo(() => buildTree(concepts), [concepts]);

    // Filtrer l'arborescence
    const filteredTree = useMemo(
        () => filterTree(tree, searchTerm),
        [tree, searchTerm]
    );

    // Toggle expand/collapse
    const toggleExpand = (id) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Expand all / Collapse all
    const expandAll = () => {
        const allIds = new Set();
        const collectIds = (nodes) => {
            nodes.forEach((node) => {
                if (node.children && node.children.length > 0) {
                    allIds.add(node.id);
                    collectIds(node.children);
                }
            });
        };
        collectIds(tree);
        setExpandedIds(allIds);
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    // Demander la suppression (ouvre la modal)
    const handleDeleteRequest = (concept) => {
        setDeleteModal({
            isOpen: true,
            concept,
            loading: false,
        });
    };

    // Confirmer la suppression
    const handleDeleteConfirm = async () => {
        if (!deleteModal.concept) return;

        setDeleteModal((prev) => ({ ...prev, loading: true }));

        try {
            await onDelete(deleteModal.concept.id);
            setDeleteModal({ isOpen: false, concept: null, loading: false });
        } catch (err) {
            console.error('Error deleting concept:', err);
            setDeleteModal((prev) => ({ ...prev, loading: false }));
        }
    };

    // Fermer la modal
    const handleDeleteCancel = () => {
        setDeleteModal({ isOpen: false, concept: null, loading: false });
    };

    // Compter les concepts (total et racines)
    const rootCount = tree.length;
    const totalCount = concepts.length;

    // Vérifier si le concept à supprimer a des enfants
    const conceptToDeleteHasChildren = deleteModal.concept?.children?.length > 0 ||
        concepts.some((c) => c.parent_id === deleteModal.concept?.id);

    // État vide
    if (concepts.length === 0) {
        return (
            <div className="text-center py-8">
                <FolderTree className="w-10 h-10 text-baikal-text mx-auto mb-3" />
                <p className="text-baikal-text font-mono">Aucun concept pour cette application</p>
                <p className="text-sm text-baikal-text/70 mt-1">
                    Cliquez sur "+ NOUVEAU" pour créer un concept
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Barre d'outils */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Recherche */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baikal-text" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher un concept..."
                        className="
                            w-full sm:w-80 pl-10 pr-4 py-2
                            bg-baikal-bg border border-baikal-border rounded-md
                            text-white text-sm font-mono placeholder-baikal-text
                            focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent
                        "
                    />
                </div>

                {/* Boutons expand/collapse */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={expandAll}
                        className="px-3 py-1.5 text-xs font-mono text-baikal-text hover:text-white border border-baikal-border hover:border-baikal-text rounded-md transition-colors"
                    >
                        TOUT DÉPLIER
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-3 py-1.5 text-xs font-mono text-baikal-text hover:text-white border border-baikal-border hover:border-baikal-text rounded-md transition-colors"
                    >
                        TOUT REPLIER
                    </button>
                </div>
            </div>

            {/* Arborescence */}
            <div className="border border-baikal-border rounded-lg overflow-hidden bg-baikal-surface/50">
                {filteredTree.length > 0 ? (
                    <div className="py-2">
                        {filteredTree.map((node) => (
                            <TreeNode
                                key={node.id}
                                node={node}
                                level={0}
                                onEdit={onEdit}
                                onDeleteRequest={handleDeleteRequest}
                                expandedIds={expandedIds}
                                toggleExpand={toggleExpand}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <p className="text-baikal-text font-mono text-sm">
                            Aucun concept trouvé pour "{searchTerm}"
                        </p>
                    </div>
                )}
            </div>

            {/* Compteur */}
            <div className="text-right text-xs text-baikal-text font-mono">
                {rootCount} domaine(s) — {totalCount} concept(s) au total
            </div>

            {/* Modal de confirmation de suppression */}
            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={handleDeleteCancel}
                onConfirm={handleDeleteConfirm}
                title="SUPPRIMER_CONCEPT"
                message={
                    conceptToDeleteHasChildren
                        ? "Ce concept a des enfants. Supprimez d'abord les concepts enfants avant de pouvoir supprimer celui-ci."
                        : "Ce concept sera supprimé définitivement."
                }
                confirmLabel="SUPPRIMER"
                variant="danger"
                icon={Trash2}
                loading={deleteModal.loading}
                disabled={conceptToDeleteHasChildren}
                itemPreview={
                    deleteModal.concept
                        ? {
                              label: deleteModal.concept.label,
                          }
                        : null
                }
            />
        </div>
    );
}
