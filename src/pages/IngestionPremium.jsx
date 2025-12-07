// ============================================================================
// Page Ingestion Premium - Upload enrichi + Sources externes
// Version 2 : Chargement des référentiels depuis Supabase
// ============================================================================

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { documentsService } from '../services/documents.service';
import { referentielsService } from '../services/referentiels.service';
import {
    LAYER_LABELS,
    LAYER_COLORS,
    LAYER_ICONS,
    ACCEPTED_MIME_TYPES,
    ACCEPTED_EXTENSIONS,
    MAX_FILE_SIZE_MB,
    MAX_FILE_SIZE_BYTES,
    formatFileSize,
    getPermissions,
} from '../config/rag-layers.config';
import LegifranceAdmin from '../components/admin/LegifranceAdmin';
import {
    ArrowLeft,
    Upload,
    FileText,
    Scale,
    Database,
    BookOpen,
    Building2,
    X,
    CheckCircle2,
    AlertCircle,
    Loader2,
    File,
    Image,
    FileSpreadsheet,
    AlertTriangle,
    Info,
    ChevronDown,
    ChevronRight,
    Sparkles,
    Globe,
    Link2,
    Layers,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION DES SOURCES
// ============================================================================

const INGESTION_SOURCES = [
    { id: 'file-upload', label: 'Upload de fichiers', description: 'PDF, Word, Excel, texte...', icon: Upload, color: 'indigo', available: true },
    { id: 'legifrance', label: 'Légifrance', description: 'Codes juridiques français', icon: Scale, color: 'emerald', available: true, superAdminOnly: true },
    { id: 'api-externe', label: 'API Externe', description: 'Connecteurs personnalisés', icon: Globe, color: 'blue', available: false, comingSoon: true },
    { id: 'web-scraping', label: 'Web Scraping', description: 'Extraction de sites web', icon: Link2, color: 'violet', available: false, comingSoon: true },
];

// ============================================================================
// COMPOSANT CARTE DE SOURCE
// ============================================================================

function SourceCard({ source, isActive, onClick, disabled }) {
    const Icon = source.icon;
    const colorClasses = {
        indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-300', activeBg: 'bg-indigo-50' },
        emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-300', activeBg: 'bg-emerald-50' },
        blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-300', activeBg: 'bg-blue-50' },
        violet: { bg: 'bg-violet-100', text: 'text-violet-600', border: 'border-violet-300', activeBg: 'bg-violet-50' },
    };
    const colors = colorClasses[source.color] || colorClasses.indigo;

    return (
        <button
            onClick={() => !disabled && !source.comingSoon && onClick(source.id)}
            disabled={disabled || source.comingSoon}
            className={`
                relative w-full p-4 rounded-xl border-2 text-left transition-all duration-200
                ${isActive ? `${colors.border} ${colors.activeBg} shadow-md` : 'border-slate-200 bg-white hover:border-slate-300'}
                ${disabled || source.comingSoon ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
        >
            {source.comingSoon && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-slate-600 text-white rounded-full">Bientôt</span>
            )}
            {source.superAdminOnly && !source.comingSoon && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-amber-500 text-white rounded-full">Admin</span>
            )}
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className={`font-medium ${isActive ? colors.text : 'text-slate-800'}`}>{source.label}</h3>
                    <p className="text-sm text-slate-500 truncate">{source.description}</p>
                </div>
                {isActive && <CheckCircle2 className={`w-5 h-5 ${colors.text}`} />}
            </div>
        </button>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE VERTICALE
// ============================================================================

function VerticalSelector({ verticals, selectedVertical, onSelect, loading }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Verticale métier *</label>
                <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Chargement...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Verticale métier *</label>
            <div className="grid grid-cols-2 gap-3">
                {verticals.map((vertical) => {
                    const isSelected = selectedVertical === vertical.id;
                    return (
                        <button
                            key={vertical.id}
                            onClick={() => onSelect(vertical.id)}
                            className={`
                                relative p-4 rounded-xl border-2 text-left transition-all
                                ${isSelected ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: `${vertical.color}20` }}
                                >
                                    <Layers className="w-5 h-5" style={{ color: vertical.color }} />
                                </div>
                                <div>
                                    <p className={`font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{vertical.name}</p>
                                    <p className="text-xs text-slate-500 line-clamp-1">{vertical.description}</p>
                                </div>
                            </div>
                            {isSelected && <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-indigo-600" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE COUCHE
// ============================================================================

function LayerSelector({ selectedLayer, onSelect, availableLayers }) {
    const getIcon = (iconName) => {
        return iconName === 'BookOpen' ? BookOpen : Building2;
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Couche de destination *</label>
            <div className="grid grid-cols-2 gap-3">
                {['vertical', 'org'].map((layer) => {
                    const colors = LAYER_COLORS[layer];
                    const isAvailable = availableLayers.includes(layer);
                    const isSelected = selectedLayer === layer;
                    const Icon = getIcon(LAYER_ICONS[layer]);

                    return (
                        <button
                            key={layer}
                            onClick={() => isAvailable && onSelect(layer)}
                            disabled={!isAvailable}
                            className={`
                                relative p-4 rounded-xl border-2 text-left transition-all
                                ${isSelected ? `${colors.border} ${colors.bg}` : 'border-slate-200 bg-white hover:border-slate-300'}
                                ${!isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${colors.bg}`}>
                                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                                </div>
                                <div>
                                    <p className={`font-medium ${isSelected ? colors.text : 'text-slate-800'}`}>{LAYER_LABELS[layer]}</p>
                                    <p className="text-xs text-slate-500">
                                        {layer === 'vertical' ? 'Partagé entre organisations' : "Interne à l'organisation"}
                                    </p>
                                </div>
                            </div>
                            {isSelected && <CheckCircle2 className={`absolute top-3 right-3 w-5 h-5 ${colors.text}`} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT ZONE D'UPLOAD
// ============================================================================

function UploadZone({ file, onFileSelect, onFileRemove, isDragging, onDragEnter, onDragLeave, onDrop, duplicateInfo, isCheckingDuplicate }) {
    const inputRef = useRef(null);

    const getFileIcon = (mimeType) => {
        if (mimeType?.includes('pdf')) return FileText;
        if (mimeType?.includes('image')) return Image;
        if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return FileSpreadsheet;
        return File;
    };

    if (file) {
        const FileIcon = getFileIcon(file.type);
        return (
            <div className="border-2 border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-100 rounded-lg">
                        <FileIcon className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{file.name}</p>
                        <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                    </div>
                    {isCheckingDuplicate ? (
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                    ) : duplicateInfo?.isDuplicate ? (
                        <div className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="text-sm font-medium">Doublon</span>
                        </div>
                    ) : duplicateInfo && !duplicateInfo.isDuplicate ? (
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Unique</span>
                        </div>
                    ) : null}
                    <button onClick={onFileRemove} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {duplicateInfo?.isDuplicate && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-medium text-amber-800">Ce fichier existe déjà</p>
                                <p className="text-amber-700 mt-1">
                                    Uploadé le {new Date(duplicateInfo.existingFile.created_at).toLocaleDateString('fr-FR')}
                                    {duplicateInfo.existingFile.created_by_name && ` par ${duplicateInfo.existingFile.created_by_name}`}
                                    {' '}dans la couche "{LAYER_LABELS[duplicateInfo.existingFile.layer]}"
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}
            `}
        >
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
                className="hidden"
            />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-indigo-500' : 'text-slate-400'}`} />
            <p className="text-slate-700 font-medium">
                {isDragging ? 'Déposez le fichier ici' : 'Glissez-déposez ou cliquez pour sélectionner'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
                {ACCEPTED_EXTENSIONS.join(', ')} • Max {MAX_FILE_SIZE_MB} MB
            </p>
        </div>
    );
}

// ============================================================================
// COMPOSANT FORMULAIRE DE MÉTADONNÉES
// ============================================================================

function MetadataForm({ metadata, onChange, errors, categories, loadingCategories }) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    return (
        <div className="space-y-5">
            {/* Titre */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Titre du document *</label>
                <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => onChange({ ...metadata, title: e.target.value })}
                    placeholder="Ex: DTU 31.2 - Construction de maisons à ossature bois"
                    className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${errors?.title ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-indigo-500'}
                        focus:outline-none focus:ring-2 focus:ring-indigo-500/20
                    `}
                />
                {errors?.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
            </div>

            {/* Catégorie */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Catégorie *</label>
                {loadingCategories ? (
                    <div className="flex items-center gap-2 text-slate-500 py-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Chargement...</span>
                    </div>
                ) : (
                    <select
                        value={metadata.category}
                        onChange={(e) => onChange({ ...metadata, category: e.target.value })}
                        className={`
                            w-full px-4 py-2.5 rounded-lg border transition-colors appearance-none bg-white
                            ${errors?.category ? 'border-red-300' : 'border-slate-300 focus:border-indigo-500'}
                            focus:outline-none focus:ring-2 focus:ring-indigo-500/20
                        `}
                    >
                        <option value="">Sélectionner une catégorie</option>
                        {categories.map((cat) => (
                            <option key={cat.slug} value={cat.slug}>{cat.label}</option>
                        ))}
                    </select>
                )}
                {errors?.category && <p className="text-sm text-red-600 mt-1">{errors.category}</p>}
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                    value={metadata.description}
                    onChange={(e) => onChange({ ...metadata, description: e.target.value })}
                    placeholder="Description optionnelle du document..."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                />
            </div>

            {/* Options avancées */}
            <div>
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
                >
                    {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Options avancées
                </button>

                {showAdvanced && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Version</label>
                            <input
                                type="text"
                                value={metadata.version}
                                onChange={(e) => onChange({ ...metadata, version: e.target.value })}
                                placeholder="Ex: 2024-01, v2.1..."
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:outline-none"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={metadata.extractToc}
                                    onChange={(e) => onChange({ ...metadata, extractToc: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-700">Extraire la table des matières</span>
                            </label>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function IngestionPremium() {
    const navigate = useNavigate();
    const { profile, isSuperAdmin, isOrgAdmin } = useAuth();

    // États - Référentiels
    const [verticals, setVerticals] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loadingReferentiels, setLoadingReferentiels] = useState(true);

    // États - Formulaire
    const [activeSource, setActiveSource] = useState('file-upload');
    const [selectedVertical, setSelectedVertical] = useState('');
    const [selectedLayer, setSelectedLayer] = useState('org');
    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [duplicateInfo, setDuplicateInfo] = useState(null);
    const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
    const [metadata, setMetadata] = useState({
        title: '',
        category: '',
        description: '',
        version: '',
        extractToc: false,
    });
    const [errors, setErrors] = useState({});
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);

    // Permissions
    const userRole = profile?.app_role || 'member';
    const permissions = getPermissions(userRole);
    const availableLayers = [];
    if (permissions.canUploadVertical) availableLayers.push('vertical');
    if (permissions.canUploadOrg) availableLayers.push('org');

    // Filtrer les sources
    const availableSources = INGESTION_SOURCES.filter(source => {
        if (source.superAdminOnly && !isSuperAdmin) return false;
        return true;
    });

    // Chargement des référentiels
    useEffect(() => {
        async function loadReferentiels() {
            setLoadingReferentiels(true);
            try {
                const [verticalsResult, categoriesResult] = await Promise.all([
                    referentielsService.getVerticals(),
                    referentielsService.getDocumentCategories(),
                ]);

                if (verticalsResult.data) {
                    setVerticals(verticalsResult.data);
                    if (verticalsResult.data.length > 0) {
                        setSelectedVertical(verticalsResult.data[0].id);
                    }
                }
                if (categoriesResult.data) {
                    setCategories(categoriesResult.data);
                }
            } catch (err) {
                console.error('Erreur chargement référentiels:', err);
            } finally {
                setLoadingReferentiels(false);
            }
        }
        loadReferentiels();
    }, []);

    // Handlers Drag & Drop
    const handleDragEnter = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
            await handleFileSelect(droppedFile);
        }
    }, []);

    // Sélection fichier + vérification doublon
    const handleFileSelect = async (selectedFile) => {
        if (!ACCEPTED_MIME_TYPES.includes(selectedFile.type)) {
            setErrors({ file: 'Type de fichier non supporté' });
            return;
        }
        if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
            setErrors({ file: `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} MB)` });
            return;
        }

        setFile(selectedFile);
        setErrors({});
        setDuplicateInfo(null);

        if (!metadata.title) {
            const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
            setMetadata(prev => ({ ...prev, title: nameWithoutExt }));
        }

        setIsCheckingDuplicate(true);
        try {
            const hash = await documentsService.calculateFileHash(selectedFile);
            const { isDuplicate, existingFile } = await documentsService.checkDuplicate(hash, profile?.org_id);
            setDuplicateInfo({ isDuplicate, existingFile, contentHash: hash });
        } catch (err) {
            console.error('Erreur vérification doublon:', err);
        } finally {
            setIsCheckingDuplicate(false);
        }
    };

    const handleFileRemove = () => {
        setFile(null);
        setDuplicateInfo(null);
        setErrors({});
    };

    // Validation & Upload
    const validateForm = () => {
        const newErrors = {};
        if (activeSource === 'file-upload') {
            if (!file) newErrors.file = 'Veuillez sélectionner un fichier';
            if (!selectedVertical) newErrors.vertical = 'Veuillez sélectionner une verticale';
            if (!metadata.title.trim()) newErrors.title = 'Le titre est obligatoire';
            if (!metadata.category) newErrors.category = 'La catégorie est obligatoire';
            if (!selectedLayer) newErrors.layer = 'Sélectionnez une couche de destination';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        setIsUploading(true);
        setUploadResult(null);

        try {
            const { path, error: uploadError } = await documentsService.uploadToStorage(file, profile?.id, selectedLayer);
            if (uploadError) throw uploadError;

            const { error: webhookError } = await documentsService.triggerIngestionWebhook({
                path,
                user_id: profile?.id,
                org_id: profile?.org_id,
                layer: selectedLayer,
                status: 'approved',
                quality_level: 'premium',
                target_verticals: [selectedVertical],
                metadata: {
                    title: metadata.title,
                    category: metadata.category,
                    description: metadata.description,
                    version: metadata.version,
                    extract_toc: metadata.extractToc,
                    original_filename: file.name,
                    file_size: file.size,
                    mime_type: file.type,
                    content_hash: duplicateInfo?.contentHash,
                },
            });

            if (webhookError) {
                console.warn('Webhook error (non-blocking):', webhookError);
            }

            setUploadResult({
                success: true,
                message: 'Document ingéré avec succès ! Le traitement est en cours.',
                path,
            });

            setTimeout(() => {
                setFile(null);
                setMetadata({ title: '', category: '', description: '', version: '', extractToc: false });
                setDuplicateInfo(null);
            }, 3000);

        } catch (err) {
            console.error('Erreur upload:', err);
            setUploadResult({
                success: false,
                message: err.message || "Erreur lors de l'upload",
            });
        } finally {
            setIsUploading(false);
        }
    };

    // Accès non autorisé
    if (!isOrgAdmin && !isSuperAdmin) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-800 mb-2">Accès restreint</h2>
                    <p className="text-slate-600 mb-6">L'ingestion Premium est réservée aux administrateurs.</p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        Retour au Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Render principal
    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-purple-600" />
                                    Ingestion Premium
                                </h1>
                                <p className="text-sm text-slate-500">Documents de haute qualité</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
                                Qualité Premium
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Contenu */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar - Sources */}
                    <div className="lg:col-span-1">
                        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-4">Source de données</h2>
                        <div className="space-y-3">
                            {availableSources.map((source) => (
                                <SourceCard
                                    key={source.id}
                                    source={source}
                                    isActive={activeSource === source.id}
                                    onClick={setActiveSource}
                                    disabled={!source.available}
                                />
                            ))}
                        </div>

                        <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-indigo-700">
                                    <p className="font-medium mb-1">Ingestion Premium</p>
                                    <p className="text-indigo-600">
                                        Les documents Premium sont automatiquement approuvés et bénéficient d'un traitement enrichi.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contenu principal */}
                    <div className="lg:col-span-3">
                        {/* Upload de fichiers */}
                        {activeSource === 'file-upload' && (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                        <Upload className="w-5 h-5 text-indigo-600" />
                                        Upload de document
                                    </h3>
                                </div>

                                <div className="p-6 space-y-6">
                                    {/* Message succès/erreur */}
                                    {uploadResult && (
                                        <div className={`p-4 rounded-lg flex items-start gap-3 ${
                                            uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                                        }`}>
                                            {uploadResult.success ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                                            ) : (
                                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                            )}
                                            <p className={uploadResult.success ? 'text-green-700' : 'text-red-700'}>
                                                {uploadResult.message}
                                            </p>
                                        </div>
                                    )}

                                    {/* Sélecteur de verticale */}
                                    <VerticalSelector
                                        verticals={verticals}
                                        selectedVertical={selectedVertical}
                                        onSelect={setSelectedVertical}
                                        loading={loadingReferentiels}
                                    />
                                    {errors?.vertical && <p className="text-sm text-red-600 -mt-4">{errors.vertical}</p>}

                                    {/* Sélecteur de couche */}
                                    <LayerSelector
                                        selectedLayer={selectedLayer}
                                        onSelect={setSelectedLayer}
                                        availableLayers={availableLayers}
                                    />

                                    {/* Zone d'upload */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Fichier *</label>
                                        <UploadZone
                                            file={file}
                                            onFileSelect={handleFileSelect}
                                            onFileRemove={handleFileRemove}
                                            isDragging={isDragging}
                                            onDragEnter={handleDragEnter}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            duplicateInfo={duplicateInfo}
                                            isCheckingDuplicate={isCheckingDuplicate}
                                        />
                                        {errors?.file && <p className="text-sm text-red-600 mt-1">{errors.file}</p>}
                                    </div>

                                    {/* Formulaire métadonnées */}
                                    {file && (
                                        <MetadataForm
                                            metadata={metadata}
                                            onChange={setMetadata}
                                            errors={errors}
                                            categories={categories}
                                            loadingCategories={loadingReferentiels}
                                        />
                                    )}

                                    {/* Bouton submit */}
                                    {file && (
                                        <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-100">
                                            <button
                                                onClick={handleFileRemove}
                                                className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                                            >
                                                Annuler
                                            </button>
                                            <button
                                                onClick={handleSubmit}
                                                disabled={isUploading || duplicateInfo?.isDuplicate}
                                                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isUploading ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Ingestion en cours...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="w-4 h-4" />
                                                        Ingérer le document
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Légifrance */}
                        {activeSource === 'legifrance' && <LegifranceAdmin />}

                        {/* Sources à venir */}
                        {(activeSource === 'api-externe' || activeSource === 'web-scraping') && (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-medium text-slate-700 mb-2">Fonctionnalité à venir</h3>
                                <p className="text-slate-500 max-w-md mx-auto">
                                    Cette source de données sera disponible prochainement. Contactez-nous pour plus d'informations.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
