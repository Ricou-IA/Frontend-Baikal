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
 * ============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { documentsService } from '../services/documents.service';
import { referentielsService } from '../services/referentiels.service';
import {
    LAYER_LABELS,
    LAYER_COLORS,
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
    Sparkles,
    Globe,
    Link2,
    Layers,
    Search,
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
// COMPOSANT CARTE DE SOURCE
// ============================================================================

function SourceCard({ source, isActive, onClick, disabled }) {
    const Icon = source.icon;
    const colorClasses = {
        indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-400', activeBg: 'bg-indigo-50' },
        emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-400', activeBg: 'bg-emerald-50' },
        blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-400', activeBg: 'bg-blue-50' },
        violet: { bg: 'bg-violet-100', text: 'text-violet-600', border: 'border-violet-400', activeBg: 'bg-violet-50' },
    };
    const colors = colorClasses[source.color] || colorClasses.indigo;

    return (
        <button
            onClick={onClick}
            disabled={disabled || !source.available}
            className={`
                relative w-full p-4 rounded-xl border-2 text-left transition-all duration-200
                ${isActive ? `${colors.border} ${colors.activeBg}` : 'border-slate-200 bg-white hover:border-slate-300'}
                ${(!source.available || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
        >
            {source.comingSoon && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                    Bientôt
                </span>
            )}
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`font-medium ${isActive ? colors.text : 'text-slate-800'}`}>
                        {source.label}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{source.description}</p>
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
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
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
                                ${isSelected 
                                    ? 'border-indigo-400 bg-indigo-50' 
                                    : 'border-slate-200 bg-white hover:border-slate-300'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div 
                                    className="p-2 rounded-lg"
                                    style={{ backgroundColor: `${vertical.color}20` }}
                                >
                                    <Layers 
                                        className="w-5 h-5" 
                                        style={{ color: vertical.color }} 
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-medium ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
                                        {vertical.name}
                                    </p>
                                    <p className="text-xs text-slate-500 line-clamp-1">
                                        {vertical.description}
                                    </p>
                                </div>
                            </div>
                            {isSelected && (
                                <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-indigo-600" />
                            )}
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
    const layers = [
        { id: 'vertical', icon: BookOpen, label: 'Verticale Métier', description: 'Partagé entre organisations' },
        { id: 'org', icon: Building2, label: 'Organisation', description: "Interne à l'organisation" },
    ];

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Couche de destination *</label>
            <div className="grid grid-cols-2 gap-3">
                {layers.map((layer) => {
                    const colors = LAYER_COLORS[layer.id];
                    const isAvailable = availableLayers.includes(layer.id);
                    const isSelected = selectedLayer === layer.id;
                    const Icon = layer.icon;

                    return (
                        <button
                            key={layer.id}
                            onClick={() => isAvailable && onSelect(layer.id)}
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
                                    <p className={`font-medium ${isSelected ? colors.text : 'text-slate-800'}`}>
                                        {layer.label}
                                    </p>
                                    <p className="text-xs text-slate-500">{layer.description}</p>
                                </div>
                            </div>
                            {isSelected && (
                                <CheckCircle2 className={`absolute top-3 right-3 w-5 h-5 ${colors.text}`} />
                            )}
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

function UploadZone({ 
    file, 
    onFileSelect, 
    onFileRemove, 
    isDragging, 
    onDragEnter, 
    onDragLeave, 
    onDrop, 
    duplicateInfo, 
    isCheckingDuplicate 
}) {
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
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : null}
                    <button
                        onClick={onFileRemove}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {duplicateInfo?.isDuplicate && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-700">
                            Ce fichier existe déjà : <strong>{duplicateInfo.existingFile?.title}</strong>
                        </p>
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
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-indigo-600' : 'text-slate-400'}`} />
            <p className="font-medium text-slate-700">
                {isDragging ? 'Déposez votre fichier ici' : 'Glissez-déposez ou cliquez pour sélectionner'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
                PDF, Word, Excel, texte • Max {MAX_FILE_SIZE_MB} MB
            </p>
        </div>
    );
}

// ============================================================================
// COMPOSANT FORMULAIRE MÉTADONNÉES
// ============================================================================

function MetadataForm({ metadata, onChange, errors, categories, loadingCategories }) {
    const handleChange = (field, value) => {
        onChange({ ...metadata, [field]: value });
    };

    return (
        <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="font-medium text-slate-800">Métadonnées du document</h4>

            {/* Titre */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Titre *</label>
                <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Titre du document"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {errors?.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
            </div>

            {/* Catégorie */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                {loadingCategories ? (
                    <div className="flex items-center gap-2 text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Chargement...</span>
                    </div>
                ) : (
                    <select
                        value={metadata.category}
                        onChange={(e) => handleChange('category', e.target.value)}
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                        <option value="">Sélectionner une catégorie</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                    value={metadata.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Description optionnelle..."
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Version */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Version</label>
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
                // Charger domaines et codes en parallèle
                const [domainsResult, codesResult] = await Promise.all([
                    referentielsService.getLegifranceDomains(),
                    referentielsService.getLegifranceCodes(),
                ]);

                if (domainsResult.error) {
                    console.error('Erreur domaines:', domainsResult.error);
                }
                if (codesResult.error) {
                    console.error('Erreur codes:', codesResult.error);
                    setError('Erreur lors du chargement des codes Légifrance');
                }

                setDomains(domainsResult.data || []);
                setCodes(codesResult.data || []);
            } catch (err) {
                console.error('Erreur chargement Légifrance:', err);
                setError(err.message || 'Erreur de chargement');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Filtrer les codes selon recherche et domaine
    const filteredCodes = codes.filter(code => {
        // Filtre par recherche textuelle
        const matchesSearch = !searchTerm || 
            code.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.short_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.description?.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Filtre par domaine
        const matchesDomain = selectedDomain === 'all' || code.domain_id === selectedDomain;
        
        return matchesSearch && matchesDomain;
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
            setSelectedCodes(filteredCodes.map(c => c.id));
        }
    };

    // Lancer la synchronisation
    const handleSync = async () => {
        if (selectedCodes.length === 0) return;
        
        setSyncing(true);
        setSyncResult(null);
        
        try {
            // Appel API pour synchroniser les codes sélectionnés
            const { data, error } = await documentsService.syncLegifranceCodes({
                codeIds: selectedCodes,
                verticalId: selectedVertical,
                layer: selectedLayer,
            });

            if (error) throw error;

            setSyncResult({
                success: true,
                message: `${selectedCodes.length} code(s) synchronisé(s) avec succès`,
                details: data
            });
            setSelectedCodes([]);
        } catch (err) {
            setSyncResult({
                success: false,
                message: err.message || 'Erreur lors de la synchronisation'
            });
        } finally {
            setSyncing(false);
        }
    };

    const selectedVerticalName = verticals.find(v => v.id === selectedVertical)?.name || 'Non sélectionnée';

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
                <p className="text-slate-500">Chargement des codes Légifrance...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <div>
                        <p className="font-medium">Erreur de chargement</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Résumé de la destination */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-3">
                    <Scale className="w-5 h-5 text-emerald-600" />
                    <div>
                        <p className="font-medium text-emerald-800">
                            Import Légifrance → {selectedVerticalName}
                        </p>
                        <p className="text-sm text-emerald-600">
                            Couche : {LAYER_LABELS[selectedLayer]}
                        </p>
                    </div>
                </div>
            </div>

            {/* Message succès/erreur */}
            {syncResult && (
                <div className={`p-4 rounded-lg flex items-start gap-3 ${
                    syncResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                    {syncResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    )}
                    <p className={syncResult.success ? 'text-green-700' : 'text-red-700'}>
                        {syncResult.message}
                    </p>
                </div>
            )}

            {/* Barre de recherche et filtres */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher un code..."
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[200px]"
                >
                    <option value="all">Tous les domaines ({codes.length})</option>
                    {domains.map(domain => {
                        const count = codes.filter(c => c.domain_id === domain.id).length;
                        return (
                            <option key={domain.id} value={domain.id}>
                                {domain.name} ({count})
                            </option>
                        );
                    })}
                </select>
            </div>

            {/* Actions groupées */}
            <div className="flex items-center justify-between">
                <button
                    onClick={toggleAll}
                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                >
                    {selectedCodes.length === filteredCodes.length && filteredCodes.length > 0 
                        ? 'Tout désélectionner' 
                        : 'Tout sélectionner'}
                </button>
                <span className="text-sm text-slate-500">
                    {selectedCodes.length} code(s) sélectionné(s) sur {filteredCodes.length}
                </span>
            </div>

            {/* Liste des codes */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
                {codes.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Scale className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="font-medium">Aucun code Légifrance disponible</p>
                        <p className="text-sm mt-1">
                            Vérifiez que les codes sont configurés dans la base de données
                        </p>
                    </div>
                ) : filteredCodes.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                        <p className="font-medium">Aucun code trouvé</p>
                        <p className="text-sm mt-1">
                            Essayez de modifier votre recherche ou le filtre de domaine
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                        {filteredCodes.map((code) => {
                            const isSelected = selectedCodes.includes(code.id);
                            const domain = domains.find(d => d.id === code.domain_id);
                            
                            return (
                                <label
                                    key={code.id}
                                    className={`
                                        flex items-center gap-4 p-4 cursor-pointer transition-colors
                                        ${isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'}
                                    `}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleCode(code.id)}
                                        className="w-5 h-5 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-800">
                                            {code.name || code.short_name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {code.short_name && code.name !== code.short_name && (
                                                <span className="text-xs text-slate-500">
                                                    {code.short_name}
                                                </span>
                                            )}
                                            {domain && (
                                                <span 
                                                    className="px-2 py-0.5 text-xs rounded-full"
                                                    style={{ 
                                                        backgroundColor: domain.color ? `${domain.color}20` : '#e2e8f0',
                                                        color: domain.color || '#64748b'
                                                    }}
                                                >
                                                    {domain.name}
                                                </span>
                                            )}
                                            {code.indexed_articles > 0 && (
                                                <span className="text-xs text-slate-400">
                                                    {code.indexed_articles} articles indexés
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {code.last_sync_at && (
                                        <div className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                                            <Clock className="w-3 h-3" />
                                            {new Date(code.last_sync_at).toLocaleDateString('fr-FR')}
                                        </div>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Bouton de synchronisation */}
            <div className="flex justify-end pt-4 border-t border-slate-100">
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
    const { profile, isSuperAdmin } = useAuth();

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
    const availableLayers = [];
    if (permissions.canUploadVertical) availableLayers.push('vertical');
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
    }, [availableLayers]);

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
        setIsCheckingDuplicate(true);
        try {
            const { isDuplicate, existingFile } = await documentsService.checkDuplicate(
                selectedFile.name,
                selectedFile.size,
                profile?.org_id
            );
            setDuplicateInfo({ isDuplicate, existingFile });
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

    // Validation et soumission upload
    const validateForm = () => {
        const newErrors = {};
        if (!selectedVertical) newErrors.vertical = 'Veuillez sélectionner une verticale';
        if (!file) newErrors.file = 'Veuillez sélectionner un fichier';
        if (!metadata.title.trim()) newErrors.title = 'Le titre est obligatoire';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;
        if (duplicateInfo?.isDuplicate) return;

        setIsUploading(true);
        setUploadResult(null);

        try {
            const { error, path } = await documentsService.uploadDocument({
                file,
                layer: selectedLayer,
                verticalId: selectedVertical,
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

            if (error) throw error;

            setUploadResult({
                success: true,
                message: 'Document uploadé avec succès ! Le traitement est en cours.',
                path
            });

            // Reset formulaire
            setFile(null);
            setMetadata({
                title: '',
                category: '',
                description: '',
                version: '',
                extractToc: false,
            });
            setDuplicateInfo(null);
        } catch (err) {
            setUploadResult({
                success: false,
                message: err.message || 'Erreur lors de l\'upload'
            });
        } finally {
            setIsUploading(false);
        }
    };

    // Vérifier si la sélection Verticale/Couche est valide
    const isSelectionValid = selectedVertical && selectedLayer;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/admin')}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-lg font-bold text-slate-800">Ingestion de documents</h1>
                                <p className="text-sm text-slate-500">Alimentez votre base de connaissances</p>
                            </div>
                        </div>

                        {/* Badge Premium */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full text-sm font-medium">
                            <Sparkles className="w-4 h-4" />
                            Premium
                        </div>
                    </div>
                </div>
            </header>

            {/* Contenu principal */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar - Sources */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                <Database className="w-5 h-5 text-slate-400" />
                                Source
                            </h3>
                            <div className="space-y-3">
                                {availableSources.map((source) => (
                                    <SourceCard
                                        key={source.id}
                                        source={source}
                                        isActive={activeSource === source.id}
                                        onClick={() => setActiveSource(source.id)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Aide contextuelle */}
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-medium text-indigo-800">Ingestion Premium</p>
                                    <p className="text-indigo-600 mt-1">
                                        {activeSource === 'legifrance' 
                                            ? 'Importez des codes juridiques depuis Légifrance vers votre base RAG.'
                                            : 'Upload enrichi avec métadonnées et traitement automatique.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contenu principal */}
                    <div className="lg:col-span-3">
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {/* Header de la section */}
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                    {activeSource === 'legifrance' ? (
                                        <>
                                            <Scale className="w-5 h-5 text-emerald-600" />
                                            Import Légifrance
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-5 h-5 text-indigo-600" />
                                            Upload de document
                                        </>
                                    )}
                                </h3>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Message succès/erreur (upload fichier) */}
                                {activeSource === 'file-upload' && uploadResult && (
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
                                    <div className="space-y-6">
                                        {/* Zone d'upload */}
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                Fichier *
                                            </label>
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
                                            {errors?.file && (
                                                <p className="text-sm text-red-600 mt-1">{errors.file}</p>
                                            )}
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
