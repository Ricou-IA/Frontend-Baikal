/**
 * ConceptModal.jsx - Baikal Console
 * ============================================================================
 * Modal de création/édition d'un concept.
 * 
 * Champs :
 * - label, slug (verrouillé par défaut), description
 * - parent_id (dropdown - LIMITÉ AUX RACINES pour max 2 niveaux)
 * 
 * @version 2.0.0 - Slug verrouillé avec bouton cadenas
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
    X,
    Save,
    Loader2,
    AlertCircle,
    FolderTree,
    Info,
    Lock,
    LockOpen,
} from 'lucide-react';
import { indexationService } from '../../services/indexation.service';

// ============================================================================
// COMPOSANT INPUT
// ============================================================================

function FormInput({ label, required, error, hint, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white font-mono">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            {children}
            {hint && !error && (
                <p className="text-xs text-baikal-text">{hint}</p>
            )}
            {error && (
                <p className="text-xs text-red-400 font-mono">{error}</p>
            )}
        </div>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function ConceptModal({
    isOpen,
    onClose,
    concept,
    concepts,
    selectedAppId,
    onSaved,
}) {
    const isEditing = Boolean(concept);

    // État du formulaire
    const [formData, setFormData] = useState({
        slug: '',
        label: '',
        description: '',
        parent_id: '',
        target_apps: [selectedAppId],
    });

    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [apiError, setApiError] = useState(null);
    const [slugLocked, setSlugLocked] = useState(true); // Slug verrouillé par défaut

    // =========================================================================
    // LISTE DES PARENTS POSSIBLES - LIMITÉ AUX RACINES (2 niveaux max)
    // =========================================================================
    const parentOptions = useMemo(() => {
        if (!concepts) return [];

        // Filtrer pour ne garder que les concepts RACINES (parent_id = null)
        let filtered = concepts.filter((c) => c.parent_id === null);

        // En mode édition, exclure le concept lui-même
        if (isEditing && concept) {
            filtered = filtered.filter((c) => c.id !== concept.id);
        }

        // Trier par label
        return filtered.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr'));
    }, [concepts, concept, isEditing]);

    // Vérifier si le concept actuel est une racine (pour afficher un warning)
    const isCurrentConceptRoot = useMemo(() => {
        if (!isEditing || !concept) return false;
        return concept.parent_id === null;
    }, [concept, isEditing]);

    // Vérifier si le concept actuel a des enfants
    const hasChildren = useMemo(() => {
        if (!isEditing || !concept || !concepts) return false;
        return concepts.some((c) => c.parent_id === concept.id);
    }, [concept, concepts, isEditing]);

    // Initialiser le formulaire
    useEffect(() => {
        if (concept) {
            setFormData({
                slug: concept.slug || '',
                label: concept.label || '',
                description: concept.description || '',
                parent_id: concept.parent_id || '',
                target_apps: concept.target_apps || [selectedAppId],
            });
        } else {
            setFormData({
                slug: '',
                label: '',
                description: '',
                parent_id: '',
                target_apps: [selectedAppId],
            });
        }
        setErrors({});
        setApiError(null);
        setSlugLocked(true); // Toujours verrouiller à l'ouverture
    }, [concept, isOpen, selectedAppId]);

    // Handler de changement
    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    // Auto-générer le slug depuis le label (seulement en création et si verrouillé)
    const generateSlug = () => {
        if (!isEditing && formData.label && slugLocked) {
            const slug = formData.label
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_|_$/g, '');
            handleChange('slug', slug);
        }
    };

    // Validation
    const validate = () => {
        const newErrors = {};

        if (!formData.slug.trim()) {
            newErrors.slug = 'Le slug est requis';
        } else if (!/^[a-z0-9_]+$/.test(formData.slug)) {
            newErrors.slug = 'Le slug doit contenir uniquement des lettres minuscules, chiffres et underscores';
        }

        if (!formData.label.trim()) {
            newErrors.label = 'Le label est requis';
        }

        // Vérifier si on essaie de transformer une racine avec enfants en enfant
        if (isEditing && isCurrentConceptRoot && hasChildren && formData.parent_id) {
            newErrors.parent_id = 'Ce concept a des enfants et ne peut pas devenir un enfant lui-même';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Soumission
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validate()) return;

        setSaving(true);
        setApiError(null);

        try {
            const dataToSave = {
                slug: formData.slug.trim(),
                label: formData.label.trim(),
                description: formData.description.trim() || null,
                parent_id: formData.parent_id || null,
                target_apps: formData.target_apps.length > 0 ? formData.target_apps : [selectedAppId],
            };

            let result;
            if (isEditing) {
                result = await indexationService.updateConcept(concept.id, dataToSave);
            } else {
                result = await indexationService.createConcept(dataToSave);
            }

            if (result.error) throw result.error;

            onSaved();
        } catch (err) {
            console.error('Error saving concept:', err);
            
            // Gérer l'erreur de slug dupliqué
            if (err.message?.includes('duplicate') || err.code === '23505') {
                setErrors({ slug: 'Ce slug existe déjà' });
            } else {
                setApiError(err.message || 'Erreur lors de la sauvegarde');
            }
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-baikal-surface border border-baikal-border rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-baikal-border">
                    <div className="flex items-center gap-2">
                        <FolderTree className="w-5 h-5 text-baikal-cyan" />
                        <h2 className="text-lg font-semibold text-white font-mono">
                            {isEditing ? 'MODIFIER_CONCEPT' : 'NOUVEAU_CONCEPT'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-baikal-text hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Erreur API */}
                    {apiError && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-2 text-red-300 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="font-mono">{apiError}</span>
                        </div>
                    )}

                    {/* Label */}
                    <FormInput label="Nom du concept" required error={errors.label}>
                        <input
                            type="text"
                            value={formData.label}
                            onChange={(e) => handleChange('label', e.target.value)}
                            onBlur={generateSlug}
                            placeholder="Ex: Conformité & Qualité"
                            className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-white text-sm font-mono placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                        />
                    </FormInput>

                    {/* Slug */}
                    <FormInput 
                        label="Slug" 
                        required 
                        error={errors.slug}
                        hint={
                            isEditing 
                                ? (slugLocked ? "Cliquez sur le cadenas pour modifier" : "⚠️ Modifier le slug peut casser des références existantes")
                                : (slugLocked ? "Généré automatiquement depuis le nom" : "Mode édition manuelle activé")
                        }
                    >
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) => handleChange('slug', e.target.value.toLowerCase())}
                                placeholder="Ex: conformite_qualite"
                                disabled={slugLocked}
                                className={`
                                    flex-1 px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md 
                                    text-baikal-cyan text-sm font-mono placeholder-baikal-text 
                                    focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent
                                    ${slugLocked ? 'opacity-60 cursor-not-allowed' : ''}
                                `}
                            />
                            <button
                                type="button"
                                onClick={() => setSlugLocked(!slugLocked)}
                                className={`
                                    p-2 rounded-md border transition-colors
                                    ${slugLocked 
                                        ? 'border-baikal-border text-baikal-text hover:text-amber-400 hover:border-amber-400' 
                                        : 'border-amber-400 text-amber-400 bg-amber-400/10'
                                    }
                                `}
                                title={slugLocked ? "Déverrouiller pour modifier" : "Verrouiller"}
                            >
                                {slugLocked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                            </button>
                        </div>
                    </FormInput>

                    {/* Description */}
                    <FormInput label="Description" hint="Aide à comprendre le périmètre du concept">
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="Description optionnelle du concept..."
                            rows={2}
                            className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-white text-sm font-mono placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent resize-none"
                        />
                    </FormInput>

                    {/* Concept parent */}
                    <FormInput 
                        label="Domaine parent"
                        hint="Laisser vide pour créer un domaine racine"
                        error={errors.parent_id}
                    >
                        <select
                            value={formData.parent_id}
                            onChange={(e) => handleChange('parent_id', e.target.value)}
                            disabled={isEditing && isCurrentConceptRoot && hasChildren}
                            className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="">— Aucun (domaine racine) —</option>
                            {parentOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </FormInput>

                    {/* Warning si concept racine avec enfants */}
                    {isEditing && isCurrentConceptRoot && hasChildren && (
                        <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-md flex items-start gap-2 text-amber-300 text-sm">
                            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span className="font-mono">
                                Ce domaine a des concepts enfants. Il ne peut pas devenir un enfant d'un autre domaine.
                            </span>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-baikal-border bg-baikal-bg/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-mono text-baikal-text hover:text-white transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-baikal-cyan text-black text-sm font-mono font-medium rounded-md hover:bg-baikal-cyan/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                SAUVEGARDE...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                {isEditing ? 'ENREGISTRER' : 'CRÉER'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
