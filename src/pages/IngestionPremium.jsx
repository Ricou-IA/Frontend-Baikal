/**
 * IngestionPremium.jsx - Baikal Console
 * ============================================================================
 * Page d'ingestion unifiée avec sélection Verticale/Couche commune.
 * 
 * Sources disponibles :
 * - Upload de fichiers (PDF, Word, Excel, etc.)
 * - Légifrance (codes juridiques) - super_admin uniquement
 * - API Externe (à venir)
 * - Web Scraping (à venir)
 * 
 * Architecture :
 * 1. Sélection de la source
 * 2. Sélection Verticale + Couche (commune à toutes les sources)
 * 3. Interface spécifique à la source
 * 
 * MIGRATION PHASE 3:
 * - 'vertical' → 'app' dans LayerSelector
 * - canUploadVertical → canUploadApp
 * ============================================================================
 */

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
    FolderOpen,
    User,
    RefreshCw,
    Search,
    Settings,
    Play,
    Clock,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION DES SOURCES
// ============================================================================

const INGESTION_SOURCES = [
    { 
        id: 'file-upload', 
        label: 'Upload de fichiers', 
        description: 'PDF, Word, Excel, texte...', 
        icon: Upload, 
        color: 'indigo', 
        available: true 
    },
    { 
        id: 'legifrance', 
        label: 'Légifrance', 
        description: 'Codes juridiques français', 
        icon: Scale, 
        color: 'emerald', 
        available: true, 
        superAdminOnly: true 
    },
    { 
        id: 'api-externe', 
        label: 'API Externe', 
        description: 'Connecteurs personnalisés', 
        icon: Globe, 
        color: 'blue', 
        available: false, 
        comingSoon: true 
    },
    { 
        id: 'web-scraping', 
        label: 'Web Scraping', 
        description: 'Extraction de sites web', 
        icon: Link2, 
        color: 'violet', 
        available: false, 
        comingSoon: true 
    },
];

// ============================================================================
// COMPOSANT SÉLECTEUR DE SOURCE
// ============================================================================

function SourceSelector({ sources, activeSource, onSelect }) {
    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
                Source de données
            </label>
            <div className="grid grid-cols-2 gap-3">
                {sources.map((source) => {
                    const Icon = source.icon;
                    const isActive = activeSource === source.id;
                    const isDisabled = !source.available;

                    return (
                        <button
                            key={source.id}
                            onClick={() => !isDisabled && onSelect(source.id)}
                            disabled={isDisabled}
                            className={`
                                relative p-4 rounded-xl border-2 text-left transition-all
                                ${isActive 
                                    ? 'border-indigo-500 bg-indigo-50' 
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }
                                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {source.comingSoon && (
                                <span className="absolute top-2 right-2 text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                                    Bientôt
                                </span>
                            )}
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                                    <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-600' : 'text-slate-600'}`} />
                                </div>
                                <div>
                                    <p className={`font-medium ${isActive ? 'text-indigo-700' : 'text-slate-800'}`}>
                                        {source.label}
                                    </p>
                                    <p className="text-xs text-slate-500">{source.description}</p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE VERTICALE
// ============================================================================

function VerticalSelector({ verticals, selectedVertical, onSelect, loading }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                    Verticale métier *
                </label>
                <div className="flex items-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Chargement...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
                Verticale métier *
            </label>
            <select
                value={selectedVertical}
                onChange={(e) => onSelect(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
                <option value="">Sélectionner une verticale</option>
                {verticals.map((v) => (
                    <option key={v.id} value={v.id}>
                        {v.name}
                    </option>
                ))}
            </select>
        </div>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE COUCHE (LAYER)
// MIGRATION: 'vertical' → 'app'
// ============================================================================

function LayerSelector({ selectedLayer, onSelect, availableLayers }) {
    // ⭐ CORRIGÉ: 'app' au lieu de 'vertical'
    const layers = [
        { id: 'app', icon: BookOpen, label: 'Verticale Métier', description: 'Partagé entre organisations' },
        { id: 'org', icon: Building2, label: 'Organisation', description: "Interne à l'organisation" },
    ];

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
                Couche de destination *
            </label>
            <div className="grid grid-cols-2 gap-3">
                {layers.map((layer) => {
                    const Icon = layer.icon;
                    const isAvailable = availableLayers.includes(layer.id);
                    const isSelected = selectedLayer === layer.id;

                    return (
                        <button
                            key={layer.id}
                            onClick={() => isAvailable && onSelect(layer.id)}
                            disabled={!isAvailable}
                            className={`
                                relative p-4 rounded-xl border-2 text-left transition-all
                                ${isSelected 
                                    ? 'border-emerald-500 bg-emerald-50' 
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }
                                ${!isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isSelected ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                    <Icon className={`w-5 h-5 ${isSelected ? 'text-emerald-600' : 'text-slate-600'}`} />
                                </div>
                                <div>
                                    <p className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-slate-800'}`}>
                                        {layer.label}
                                    </p>
                                    <p className="text-xs text-slate-500">{layer.description}</p>
                                </div>
                            </div>
                            {isSelected && (
                                <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-emerald-600" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT ZONE DE DROP
// ============================================================================

function DropZone({ isDragging, onDragEnter, onDragLeave, onDrop, onFileSelect, file }) {
    const fileInputRef = useRef(null);

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            onFileSelect(selectedFile);
        }
    };

    return (
        <div
            onClick={handleClick}
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`
                relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${isDragging 
                    ? 'border-indigo-500 bg-indigo-50' 
                    : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                }
            `}
        >
            <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                accept={ACCEPTED_EXTENSIONS.join(',')}
                className="hidden"
            />
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-indigo-500' : 'text-slate-400'}`} />
            <p className="text-slate-700 font-medium">
                {isDragging ? 'Déposez le fichier ici' : 'Glissez-déposez ou cliquez pour sélectionner'}
            </p>
            <p className="text-sm text-slate-500 mt-2">
                PDF, Word, Excel, texte... (max {MAX_FILE_SIZE_MB} MB)
            </p>
        </div>
    );
}

// ============================================================================
// COMPOSANT APERÇU FICHIER
// ============================================================================

function FilePreview({ file, onRemove, duplicateInfo, isCheckingDuplicate }) {
    const getFileIcon = () => {
        if (file.type.includes('pdf')) return <FileText className="w-8 h-8 text-red-500" />;
        if (file.type.includes('image')) return <Image className="w-8 h-8 text-blue-500" />;
        if (file.type.includes('sheet') || file.type.includes('excel')) return <FileSpreadsheet className="w-8 h-8 text-green-500" />;
        return <File className="w-8 h-8 text-slate-500" />;
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                {getFileIcon()}
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{file.name}</p>
                    <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                    onClick={onRemove}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Indicateur vérification doublon */}
            {isCheckingDuplicate && (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Vérification des doublons...
                </div>
            )}

            {/* Alerte doublon */}
            {duplicateInfo?.isDuplicate && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium text-amber-800">Fichier déjà existant</p>
                        <p className="text-sm text-amber-700 mt-1">
                            Un fichier identique ({duplicateInfo.existingFile?.original_filename}) existe déjà.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// COMPOSANT FORMULAIRE METADATA
// ============================================================================

function MetadataForm({ metadata, onChange, errors, categories, loadingCategories }) {
    const handleChange = (field, value) => {
        onChange({ ...metadata, [field]: value });
    };

    return (
        <div className="space-y-4">
            {/* Titre */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Titre du document *
                </label>
                <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Titre descriptif du document"
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        errors?.title ? 'border-red-300 bg-red-50' : 'border-slate-200'
                    }`}
                />
                {errors?.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
            </div>

            {/* Catégorie */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Catégorie
                </label>
                <select
                    value={metadata.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    disabled={loadingCategories}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                </label>
                <textarea
                    value={metadata.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Description optionnelle du document"
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Version */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Version
                </label>
                <input
                    type="text"
                    value={metadata.version}
                    onChange={(e) => handleChange('version', e.target.value)}
                    placeholder="ex: 1.0.0"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
            </div>

            {/* Options avancées */}
            <div className="flex items-center gap-3 pt-2">
                <input
                    type="checkbox"
                    id="extractToc"
                    checked={metadata.extractToc}
                    onChange={(e) => handleChange('extractToc', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="extractToc" className="text-sm text-slate-700">
                    Extraire automatiquement la table des matières
                </label>
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT INTERFACE LÉGIFRANCE
// ============================================================================

function LegifranceInterface({ selectedVertical, selectedLayer, verticals }) {
    const [codes, setCodes] = useState([]);
    const [domains, setDomains] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDomain, setSelectedDomain] = useState('all');
    const [selectedCodes, setSelectedCodes] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    // Charger les codes et domaines Légifrance
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            setError(null);
            try {
                const [domainsResult, codesResult] = await Promise.all([
                    referentielsService.getLegifranceDomains(),
                    referentielsService.getLegifranceCodes(),
                ]);
                setDomains(domainsResult.data || []);
                setCodes(codesResult.data || []);
            } catch (err) {
                console.error('Erreur chargement Légifrance:', err);
                setError('Impossible de charger les données Légifrance');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Filtrer les codes
    const filteredCodes = codes.filter(code => {
        const matchSearch = !searchTerm || 
            code.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.code_id?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchDomain = selectedDomain === 'all' || code.domain_id === selectedDomain;
        return matchSearch && matchDomain;
    });

    // Toggle sélection code
    const toggleCode = (codeId) => {
        setSelectedCodes(prev => 
            prev.includes(codeId) 
                ? prev.filter(id => id !== codeId)
                : [...prev, codeId]
        );
    };

    // Sélectionner/désélectionner tout
    const toggleAll = () => {
        if (selectedCodes.length === filteredCodes.length) {
            setSelectedCodes([]);
        } else {
            setSelectedCodes(filteredCodes.map(c => c.code_id));
        }
    };

    // Synchroniser les codes sélectionnés
    const handleSync = async () => {
        if (selectedCodes.length === 0) return;
        
        setSyncing(true);
        setSyncResult(null);
        
        try {
            const result = await documentsService.syncLegifranceCodes({
                codeIds: selectedCodes,
                appId: selectedVertical,
                layer: selectedLayer,
            });
            
            setSyncResult({
                success: result.data?.success,
                message: result.data?.success 
                    ? `${result.data.synced} code(s) synchronisé(s) avec succès`
                    : `Erreur: ${result.data?.failed} code(s) en échec`,
            });
            
            if (result.data?.success) {
                setSelectedCodes([]);
            }
        } catch (err) {
            setSyncResult({
                success: false,
                message: err.message || 'Erreur lors de la synchronisation',
            });
        } finally {
            setSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Résultat sync */}
            {syncResult && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                    syncResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                    {syncResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className={syncResult.success ? 'text-green-700' : 'text-red-700'}>
                        {syncResult.message}
                    </span>
                </div>
            )}

            {/* Filtres */}
            <div className="flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher un code..."
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                    <option value="all">Tous les domaines</option>
                    {domains.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </div>

            {/* Liste des codes */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedCodes.length === filteredCodes.length && filteredCodes.length > 0}
                            onChange={toggleAll}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-slate-700">
                            Tout sélectionner ({filteredCodes.length})
                        </span>
                    </label>
                    <span className="text-sm text-slate-500">
                        {selectedCodes.length} sélectionné(s)
                    </span>
                </div>

                {/* Liste */}
                <div className="max-h-96 overflow-y-auto">
                    {filteredCodes.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            <Scale className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p>Aucun code trouvé</p>
                        </div>
                    ) : (
                        filteredCodes.map(code => (
                            <label
                                key={code.code_id}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedCodes.includes(code.code_id)}
                                    onChange={() => toggleCode(code.code_id)}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-800 truncate">{code.name}</p>
                                    <p className="text-xs text-slate-500">{code.code_id}</p>
                                </div>
                                {code.article_count > 0 && (
                                    <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                                        {code.article_count} articles
                                    </span>
                                )}
                            </label>
                        ))
                    )}
                </div>
            </div>

            {/* Bouton sync */}
            <div className="flex justify-end">
                <button
                    onClick={handleSync}
                    disabled={selectedCodes.length === 0 || syncing}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {syncing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Synchronisation...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            Synchroniser {selectedCodes.length} code(s)
                        </>
                    )}
                </button>
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

    // États - Formulaire commun
    const [activeSource, setActiveSource] = useState('file-upload');
    const [selectedVertical, setSelectedVertical] = useState('');
    const [selectedLayer, setSelectedLayer] = useState('org');

    // États - Upload fichier
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
    
    // ⭐ CORRIGÉ: canUploadApp au lieu de canUploadVertical, 'app' au lieu de 'vertical'
    const availableLayers = [];
    if (permissions.canUploadApp) availableLayers.push('app');
    if (permissions.canUploadOrg) availableLayers.push('org');

    // Filtrer les sources disponibles
    const availableSources = INGESTION_SOURCES.filter(source => {
        if (source.superAdminOnly && !isSuperAdmin) return false;
        return true;
    });

    // Charger les référentiels
    useEffect(() => {
        async function loadReferentiels() {
            setLoadingReferentiels(true);
            try {
                const [verticalsRes, categoriesRes] = await Promise.all([
                    referentielsService.getVerticals(),
                    referentielsService.getCategories(),
                ]);
                setVerticals(verticalsRes.data || []);
                setCategories(categoriesRes.data || []);
                
                // Sélectionner la première verticale par défaut
                if (verticalsRes.data?.length > 0 && !selectedVertical) {
                    setSelectedVertical(verticalsRes.data[0].id);
                }
            } catch (err) {
                console.error('Erreur chargement référentiels:', err);
            } finally {
                setLoadingReferentiels(false);
            }
        }
        loadReferentiels();
    }, []);

    // Mettre à jour la couche par défaut selon les permissions
    useEffect(() => {
        if (availableLayers.length > 0 && !availableLayers.includes(selectedLayer)) {
            setSelectedLayer(availableLayers[0]);
        }
    }, [availableLayers, selectedLayer]);

    // Handlers drag & drop
    const handleDragEnter = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) handleFileSelect(droppedFile);
    };

    // Handler sélection fichier
    const handleFileSelect = async (selectedFile) => {
        // Validation taille
        if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
            setErrors({ file: `Le fichier dépasse la limite de ${MAX_FILE_SIZE_MB} MB` });
            return;
        }

        // Validation type
        const isValidType = ACCEPTED_MIME_TYPES.some(type => selectedFile.type === type);
        if (!isValidType && !selectedFile.name.match(/\.(pdf|docx?|xlsx?|txt|md|csv)$/i)) {
            setErrors({ file: 'Type de fichier non supporté' });
            return;
        }

        setFile(selectedFile);
        setErrors({});

        // Auto-remplir le titre
        if (!metadata.title) {
            const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
            setMetadata(prev => ({ ...prev, title: nameWithoutExt }));
        }

        // Vérification doublon
        if (profile?.org_id) {
            setIsCheckingDuplicate(true);
            try {
                const result = await documentsService.checkFileBeforeUpload(selectedFile, profile.org_id);
                setDuplicateInfo(result);
            } catch (err) {
                console.error('Erreur vérification doublon:', err);
            } finally {
                setIsCheckingDuplicate(false);
            }
        }
    };

    // Handler suppression fichier
    const handleFileRemove = () => {
        setFile(null);
        setDuplicateInfo(null);
        setErrors({});
    };

    // Handler soumission
    const handleSubmit = async () => {
        // Validation
        const newErrors = {};
        if (!selectedVertical) newErrors.vertical = 'Veuillez sélectionner une verticale';
        if (!file) newErrors.file = 'Veuillez sélectionner un fichier';
        if (!metadata.title) newErrors.title = 'Le titre est obligatoire';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsUploading(true);
        setUploadResult(null);

        try {
            const result = await documentsService.uploadDocument({
                file,
                layer: selectedLayer,
                appId: selectedVertical,
                orgId: profile?.org_id,
                userId: profile?.id,
                metadata: {
                    title: metadata.title,
                    category: metadata.category,
                    description: metadata.description,
                    version: metadata.version,
                    extractToc: metadata.extractToc,
                },
                qualityLevel: 'premium',
                status: 'approved',
            });

            if (result.error) {
                throw result.error;
            }

            setUploadResult({
                success: true,
                message: 'Document uploadé avec succès !',
                path: result.path,
            });

            // Reset formulaire
            setFile(null);
            setMetadata({ title: '', category: '', description: '', version: '', extractToc: false });
            setDuplicateInfo(null);
        } catch (err) {
            setUploadResult({
                success: false,
                message: err.message || "Erreur lors de l'upload",
            });
        } finally {
            setIsUploading(false);
        }
    };

    // Vérifier si la sélection est valide
    const isSelectionValid = selectedVertical && selectedLayer;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-slate-800">
                                Ingestion Premium
                            </h1>
                            <p className="text-sm text-slate-500">
                                Ajoutez du contenu à votre base de connaissances
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Contenu principal */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-12 gap-8">
                    {/* Sidebar - Sélection source */}
                    <div className="col-span-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-6 sticky top-8">
                            <SourceSelector
                                sources={availableSources}
                                activeSource={activeSource}
                                onSelect={setActiveSource}
                            />
                        </div>
                    </div>

                    {/* Contenu principal */}
                    <div className="col-span-8">
                        <div className="bg-white rounded-xl border border-slate-200 p-6">
                            <div className="space-y-6">
                                {/* Message résultat upload */}
                                {uploadResult && (
                                    <div className={`p-4 rounded-lg flex items-center gap-3 ${
                                        uploadResult.success 
                                            ? 'bg-green-50 border border-green-200' 
                                            : 'bg-red-50 border border-red-200'
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

                                {/* SÉLECTION COMMUNE : Verticale + Couche */}
                                <div className="space-y-6 pb-6 border-b border-slate-200">
                                    {/* Sélecteur de verticale */}
                                    <VerticalSelector
                                        verticals={verticals}
                                        selectedVertical={selectedVertical}
                                        onSelect={setSelectedVertical}
                                        loading={loadingReferentiels}
                                    />
                                    {errors?.vertical && (
                                        <p className="text-sm text-red-600 -mt-3">{errors.vertical}</p>
                                    )}

                                    {/* Sélecteur de couche */}
                                    <LayerSelector
                                        selectedLayer={selectedLayer}
                                        onSelect={setSelectedLayer}
                                        availableLayers={availableLayers}
                                    />
                                </div>

                                {/* CONTENU SPÉCIFIQUE À LA SOURCE */}
                                {activeSource === 'file-upload' && (
                                    <div className="space-y-6 pt-2">
                                        {/* Zone de drop ou aperçu fichier */}
                                        {!file ? (
                                            <DropZone
                                                isDragging={isDragging}
                                                onDragEnter={handleDragEnter}
                                                onDragLeave={handleDragLeave}
                                                onDrop={handleDrop}
                                                onFileSelect={handleFileSelect}
                                                file={file}
                                            />
                                        ) : (
                                            <FilePreview
                                                file={file}
                                                onRemove={handleFileRemove}
                                                duplicateInfo={duplicateInfo}
                                                isCheckingDuplicate={isCheckingDuplicate}
                                            />
                                        )}

                                        {errors?.file && (
                                            <p className="text-sm text-red-600">{errors.file}</p>
                                        )}

                                        {/* Formulaire metadata */}
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
                                                            Upload en cours...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="w-4 h-4" />
                                                            Uploader
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeSource === 'legifrance' && isSelectionValid && (
                                    <LegifranceInterface
                                        selectedVertical={selectedVertical}
                                        selectedLayer={selectedLayer}
                                        verticals={verticals}
                                    />
                                )}

                                {activeSource === 'legifrance' && !isSelectionValid && (
                                    <div className="p-8 text-center text-slate-500">
                                        <Scale className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                                        <p className="font-medium">Sélectionnez une verticale et une couche</p>
                                        <p className="text-sm mt-1">pour accéder à l'import Légifrance</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
