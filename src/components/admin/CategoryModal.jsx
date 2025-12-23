/**
 * CategoryModal.jsx - Baikal Console
 * ============================================================================
 * Modal de création/édition d'une catégorie documentaire.
 * 
 * Champs :
 * - label, slug, description
 * - target_layers (multi-select)
 * - linked_concept_id (dropdown)
 * 
 * @version 2.0.0 - Simplification (suppression icon, sort_order, source_type, min_role)
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
    X,
    Save,
    Loader2,
    AlertCircle,
    Tags,
    Lock,
    LockOpen,
} from 'lucide-react';
import { indexationService } from '../../services/indexation.service';

// ============================================================================
// CONFIGURATION
// ============================================================================

const LAYER_OPTIONS = [
    { value: 'app', label: 'App', description: 'Documents métier (super_admin)' },
    { value: 'org', label: 'Org', description: 'Documents organisation (org_admin+)' },
    { value: 'project', label: 'Projet', description: 'Documents projet (team_leader+)' },
    { value: 'user', label: 'User', description: 'Documents personnels' },
];

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

export default function CategoryModal({
    isOpen,
    onClose,
    category,
    concepts,
    selectedAppId,
    onSaved,
}) {
    const isEditing = Boolean(category);

    // État du formulaire
    const [formData, setFormData] = useState({
        slug: '',
        label: '',
        description: '',
        target_layers: ['app', 'org', 'project', 'user'],
        linked_concept_id: '',
    });

    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [apiError, setApiError] = useState(null);
    const [slugLocked, setSlugLocked] = useState(true); // Slug verrouillé par défaut

    // Initialiser le formulaire en mode édition
    useEffect(() => {
        if (category) {
            setFormData({
                slug: category.slug || '',
                label: category.label || '',
                description: category.description || '',
                target_layers: category.target_layers || ['app', 'org', 'project', 'user'],
                linked_concept_id: category.linked_concept_id || '',
            });
        } else {
            // Reset pour création
            setFormData({
                slug: '',
                label: '',
                description: '',
                target_layers: ['app', 'org', 'project', 'user'],
                linked_concept_id: '',
            });
        }
        setErrors({});
        setApiError(null);
        setSlugLocked(true); // Toujours verrouiller à l'ouverture
    }, [category, isOpen]);

    // Handler de changement
    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    // Handler pour les layers (checkbox multiple)
    const handleLayerToggle = (layer) => {
        setFormData((prev) => {
            const layers = prev.target_layers.includes(layer)
                ? prev.target_layers.filter((l) => l !== layer)
                : [...prev.target_layers, layer];
            return { ...prev, target_layers: layers };
        });
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

        if (formData.target_layers.length === 0) {
            newErrors.target_layers = 'Sélectionnez au moins une couche';
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
                target_apps: [selectedAppId],
                target_layers: formData.target_layers,
                linked_concept_id: formData.linked_concept_id || null,
            };

            let result;
            if (isEditing) {
                result = await indexationService.updateCategory(category.id, dataToSave);
            } else {
                result = await indexationService.createCategory(dataToSave);
            }

            if (result.error) throw result.error;

            onSaved();
        } catch (err) {
            console.error('Error saving category:', err);
            setApiError(err.message || 'Erreur lors de la sauvegarde');
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
                        <Tags className="w-5 h-5 text-baikal-cyan" />
                        <h2 className="text-lg font-semibold text-white font-mono">
                            {isEditing ? 'MODIFIER_CATÉGORIE' : 'NOUVELLE_CATÉGORIE'}
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
                    <FormInput label="Nom de la catégorie" required error={errors.label}>
                        <input
                            type="text"
                            value={formData.label}
                            onChange={(e) => handleChange('label', e.target.value)}
                            onBlur={generateSlug}
                            placeholder="Ex: Pièces du marché"
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
                                placeholder="Ex: pieces_marche"
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
                    <FormInput label="Description" hint="Aide les utilisateurs à choisir la bonne catégorie">
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="Description optionnelle..."
                            rows={2}
                            className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-white text-sm font-mono placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent resize-none"
                        />
                    </FormInput>

                    {/* Layers */}
                    <FormInput 
                        label="Couches autorisées" 
                        required 
                        error={errors.target_layers}
                        hint="Définit qui peut uploader dans cette catégorie"
                    >
                        <div className="space-y-2">
                            {LAYER_OPTIONS.map((layer) => (
                                <label
                                    key={layer.value}
                                    className={`
                                        flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
                                        ${formData.target_layers.includes(layer.value)
                                            ? 'bg-baikal-cyan/10 border border-baikal-cyan'
                                            : 'bg-baikal-bg border border-baikal-border hover:border-baikal-text'
                                        }
                                    `}
                                >
                                    <input
                                        type="checkbox"
                                        checked={formData.target_layers.includes(layer.value)}
                                        onChange={() => handleLayerToggle(layer.value)}
                                        className="sr-only"
                                    />
                                    <div className="flex-1">
                                        <span className={`text-sm font-mono font-medium ${formData.target_layers.includes(layer.value) ? 'text-baikal-cyan' : 'text-white'}`}>
                                            {layer.label}
                                        </span>
                                        <p className="text-xs text-baikal-text">{layer.description}</p>
                                    </div>
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${formData.target_layers.includes(layer.value) ? 'bg-baikal-cyan border-baikal-cyan' : 'border-baikal-border'}`}>
                                        {formData.target_layers.includes(layer.value) && (
                                            <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </FormInput>

                    {/* Concept lié */}
                    <FormInput 
                        label="Concept lié (GraphRAG)"
                        hint="Les documents seront automatiquement associés à ce concept"
                    >
                        <select
                            value={formData.linked_concept_id}
                            onChange={(e) => handleChange('linked_concept_id', e.target.value)}
                            className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                        >
                            <option value="">— Aucun —</option>
                            {concepts
                                .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr'))
                                .map((concept) => (
                                    <option key={concept.id} value={concept.id}>
                                        {concept.label}
                                    </option>
                                ))
                            }
                        </select>
                    </FormInput>
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
