/**
 * IngestionContent.jsx - Baikal Console
 * ============================================================================
 * Contenu d'ingestion intégré pour l'onglet "Connaissances" de la page Admin.
 * Version sans header (le header est géré par Admin.jsx).
 * 
 * Sources disponibles :
 * - Upload de fichiers (PDF, Word, Excel, etc.)
 * - Légifrance (codes juridiques) - super_admin uniquement
 * 
 * MODIFICATIONS 17/12/2025:
 * - org_admin : App auto-sélectionnée (profile.app_id), pas de sélecteur
 * - org_admin : Layer "Verticale Métier" masqué
 * - Ajout ProjectSelector (multi-select) - UNIQUEMENT si layer = project
 * - Layer "project" : au moins 1 projet obligatoire
 * ============================================================================
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { documentsService } from '../services/documents.service';
import { referentielsService } from '../services/referentiels.service';
import { projectsService } from '../services/projects.service';
import {
    ACCEPTED_MIME_TYPES,
    ACCEPTED_EXTENSIONS,
    MAX_FILE_SIZE_MB,
    MAX_FILE_SIZE_BYTES,
    formatFileSize,
} from '../config/rag-layers.config';
import {
    Upload,
    FileText,
    Scale,
    BookOpen,
    Building2,
    FolderOpen,
    X,
    CheckCircle2,
    AlertCircle,
    Loader2,
    File,
    Image,
    FileSpreadsheet,
    AlertTriangle,
    Globe,
    Link2,
    Search,
    Play,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION DES SOURCES
// ============================================================================

const INGESTION_SOURCES = [
    { 
        id: 'file-upload', 
        label: 'UPLOAD_FICHIERS', 
        description: 'PDF, Word, Excel, texte...', 
        icon: Upload, 
        color: 'indigo', 
        available: true 
    },
    { 
        id: 'legifrance', 
        label: 'LÉGIFRANCE', 
        description: 'Codes juridiques français', 
        icon: Scale, 
        color: 'emerald', 
        available: true, 
        superAdminOnly: true 
    },
    { 
        id: 'api-externe', 
        label: 'API_EXTERNE', 
        description: 'Connecteurs personnalisés', 
        icon: Globe, 
        color: 'blue', 
        available: false, 
        comingSoon: true 
    },
    { 
        id: 'web-scraping', 
        label: 'WEB_SCRAPING', 
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
    
    return (
        <button
            onClick={onClick}
            disabled={disabled || !source.available}
            className={`
                relative w-full p-4 rounded-md border-2 text-left transition-all duration-200
                ${isActive 
                    ? 'border-baikal-cyan bg-baikal-cyan/10' 
                    : 'border-baikal-border bg-baikal-surface hover:border-baikal-cyan/50'
                }
                ${(!source.available || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
        >
            {source.comingSoon && (
                <span className="absolute top-2 right-2 text-xs px-2 py-0.5 bg-baikal-surface text-baikal-text rounded-full font-mono">
                    BIENTÔT
                </span>
            )}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-baikal-cyan/20">
                    <Icon className="w-5 h-5 text-baikal-cyan" />
                </div>
                <div>
                    <p className={`font-medium font-mono ${isActive ? 'text-baikal-cyan' : 'text-white'}`}>
                        {source.label}
                    </p>
                    <p className="text-xs text-baikal-text font-sans">{source.description}</p>
                </div>
            </div>
        </button>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE VERTICALES (Multi-select) - SUPER_ADMIN UNIQUEMENT
// ============================================================================

function VerticalSelector({ verticals, selectedVerticals, onToggle, loading }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <label className="block text-xs font-mono text-baikal-text uppercase">
                    Applications cibles *
                </label>
                <div className="flex items-center gap-2 text-baikal-text">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-sans">Chargement...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="block text-xs font-mono text-baikal-text uppercase">
                Applications cibles *
            </label>
            <div className="flex flex-wrap gap-2">
                {verticals.map((v) => {
                    const isSelected = selectedVerticals.includes(v.id);
                    return (
                        <button
                            key={v.id}
                            onClick={() => onToggle(v.id)}
                            className={`
                                px-3 py-1.5 rounded-md text-sm transition-all font-sans
                                ${isSelected 
                                    ? 'bg-baikal-cyan text-black' 
                                    : 'bg-baikal-surface border border-baikal-border text-baikal-text hover:border-baikal-cyan/50'
                                }
                            `}
                        >
                            {v.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE COUCHE (LAYER)
// ============================================================================

function LayerSelector({ selectedLayer, onSelect, availableLayers }) {
    const layers = [
        { id: 'app', icon: BookOpen, label: 'Verticale Métier', description: 'Partagé entre organisations' },
        { id: 'org', icon: Building2, label: 'Organisation', description: "Interne à l'organisation" },
        { id: 'project', icon: FolderOpen, label: 'Projet', description: "Restreint aux membres des projets" },
    ];

    // Filtrer les layers disponibles
    const visibleLayers = layers.filter(l => availableLayers.includes(l.id));

    return (
        <div className="space-y-3">
            <label className="block text-xs font-mono text-baikal-text uppercase">
                Couche de destination *
            </label>
            <div className={`grid gap-3 ${visibleLayers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {visibleLayers.map((layer) => {
                    const Icon = layer.icon;
                    const isSelected = selectedLayer === layer.id;

                    return (
                        <button
                            key={layer.id}
                            onClick={() => onSelect(layer.id)}
                            className={`
                                relative p-4 rounded-md border-2 text-left transition-all
                                ${isSelected 
                                    ? 'border-baikal-cyan bg-baikal-cyan/10' 
                                    : 'border-baikal-border bg-baikal-surface hover:border-baikal-cyan/50'
                                }
                                cursor-pointer
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-baikal-cyan/20">
                                    <Icon className="w-5 h-5 text-baikal-cyan" />
                                </div>
                                <div>
                                    <p className={`font-medium font-mono ${isSelected ? 'text-baikal-cyan' : 'text-white'}`}>
                                        {layer.label}
                                    </p>
                                    <p className="text-xs text-baikal-text font-sans">{layer.description}</p>
                                </div>
                            </div>
                            {isSelected && (
                                <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-baikal-cyan" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT SÉLECTEUR DE PROJETS (Multi-select)
// ============================================================================

function ProjectSelector({ projects, selectedProjects, onToggle, loading }) {
    if (loading) {
        return (
            <div className="space-y-3">
                <label className="block text-xs font-mono text-baikal-text uppercase">
                    Projets cibles <span className="text-red-400">*</span>
                </label>
                <div className="flex items-center gap-2 text-baikal-text">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-sans">Chargement des projets...</span>
                </div>
            </div>
        );
    }

    if (!projects || projects.length === 0) {
        return (
            <div className="space-y-3">
                <label className="block text-xs font-mono text-baikal-text uppercase">
                    Projets cibles <span className="text-red-400">*</span>
                </label>
                <div className="p-4 bg-baikal-surface border border-baikal-border rounded-md text-center">
                    <FolderOpen className="w-8 h-8 text-baikal-text mx-auto mb-2" />
                    <p className="text-sm text-baikal-text font-sans">Aucun projet disponible</p>
                    <p className="text-xs text-baikal-text/70 font-sans mt-1">Créez d'abord un projet dans l'onglet Projets</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="block text-xs font-mono text-baikal-text uppercase">
                Projets cibles <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-baikal-text font-sans -mt-1">
                Sélectionnez au moins un projet
            </p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-baikal-bg border border-baikal-border rounded-md">
                {projects.map((project) => {
                    const isSelected = selectedProjects.includes(project.id);
                    return (
                        <button
                            key={project.id}
                            onClick={() => onToggle(project.id)}
                            className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all font-sans
                                ${isSelected 
                                    ? 'bg-baikal-cyan text-black' 
                                    : 'bg-baikal-surface border border-baikal-border text-baikal-text hover:border-baikal-cyan/50'
                                }
                            `}
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            {project.name}
                        </button>
                    );
                })}
            </div>
            {selectedProjects.length > 0 && (
                <p className="text-xs text-baikal-cyan font-mono">
                    {selectedProjects.length} projet{selectedProjects.length > 1 ? 's' : ''} sélectionné{selectedProjects.length > 1 ? 's' : ''}
                </p>
            )}
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
            <div className="border-2 border-baikal-border rounded-md p-4 bg-baikal-surface">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-baikal-cyan/20 rounded-md">
                        <FileIcon className="w-6 h-6 text-baikal-cyan" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate font-sans">{file.name}</p>
                        <p className="text-sm text-baikal-text font-mono">{formatFileSize(file.size)}</p>
                    </div>
                    {isCheckingDuplicate ? (
                        <Loader2 className="w-5 h-5 text-baikal-text animate-spin" />
                    ) : duplicateInfo?.isDuplicate ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                    ) : (
                        <button
                            onClick={onFileRemove}
                            className="p-2 text-baikal-text hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
                {duplicateInfo?.isDuplicate && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/50 rounded-md">
                        <p className="text-sm text-amber-300 font-sans">
                            ⚠️ Ce fichier existe déjà : {duplicateInfo.existingFile?.original_filename}
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
                border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-all
                ${isDragging 
                    ? 'border-baikal-cyan bg-baikal-cyan/10' 
                    : 'border-baikal-border hover:border-baikal-cyan/50 bg-baikal-surface'
                }
            `}
        >
            <input
                ref={inputRef}
                type="file"
                onChange={(e) => e.target.files[0] && onFileSelect(e.target.files[0])}
                accept={ACCEPTED_EXTENSIONS.join(',')}
                className="hidden"
            />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-baikal-cyan' : 'text-baikal-text'}`} />
            <p className="text-white font-mono">
                {isDragging ? 'DÉPOSEZ_ICI' : 'GLISSEZ_OU_CLIQUEZ'}
            </p>
            <p className="text-sm text-baikal-text mt-1 font-sans">
                PDF, Word, Excel, texte... (max {MAX_FILE_SIZE_MB} MB)
            </p>
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
                <label className="block text-xs font-mono text-baikal-text mb-1.5 uppercase">
                    Titre du document *
                </label>
                <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Titre descriptif du document"
                    className={`w-full px-4 py-2.5 bg-baikal-surface border rounded-md focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent text-white font-sans ${
                        errors?.title ? 'border-red-500 bg-red-500/10' : 'border-baikal-border'
                    }`}
                />
                {errors?.title && <p className="text-sm text-red-400 mt-1 font-mono">{errors.title}</p>}
            </div>

            {/* Catégorie */}
            <div>
                <label className="block text-xs font-mono text-baikal-text mb-1.5 uppercase">
                    Catégorie
                </label>
                <select
                    value={metadata.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    disabled={loadingCategories}
                    className="w-full px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent text-white font-sans"
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
                <label className="block text-xs font-mono text-baikal-text mb-1.5 uppercase">
                    Description
                </label>
                <textarea
                    value={metadata.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Description optionnelle du document"
                    rows={3}
                    className="w-full px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent resize-none text-white font-sans"
                />
            </div>

            {/* Version */}
            <div>
                <label className="block text-xs font-mono text-baikal-text mb-1.5 uppercase">
                    Version
                </label>
                <input
                    type="text"
                    value={metadata.version}
                    onChange={(e) => handleChange('version', e.target.value)}
                    placeholder="ex: 1.0.0"
                    className="w-full px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent text-white font-mono"
                />
            </div>

            {/* Options avancées */}
            <div className="flex items-center gap-3 pt-2">
                <input
                    type="checkbox"
                    id="extractToc"
                    checked={metadata.extractToc}
                    onChange={(e) => handleChange('extractToc', e.target.checked)}
                    className="w-4 h-4 text-baikal-cyan border-baikal-border rounded focus:ring-baikal-cyan bg-black"
                />
                <label htmlFor="extractToc" className="text-sm text-baikal-text font-sans">
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

    const filteredCodes = codes.filter(code => {
        const matchSearch = !searchTerm || 
            code.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.code_id?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchDomain = selectedDomain === 'all' || code.domain_id === selectedDomain;
        return matchSearch && matchDomain;
    });

    const toggleCode = (codeId) => {
        setSelectedCodes(prev => 
            prev.includes(codeId) 
                ? prev.filter(id => id !== codeId)
                : [...prev, codeId]
        );
    };

    const toggleAll = () => {
        if (selectedCodes.length === filteredCodes.length) {
            setSelectedCodes([]);
        } else {
            setSelectedCodes(filteredCodes.map(c => c.code_id));
        }
    };

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
                <Loader2 className="w-8 h-8 animate-spin text-baikal-cyan" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-md">
                <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-mono">{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {syncResult && (
                <div className={`p-4 rounded-md flex items-center gap-3 ${
                    syncResult.success 
                        ? 'bg-green-900/20 border border-green-500/50' 
                        : 'bg-red-900/20 border border-red-500/50'
                }`}>
                    {syncResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-red-400" />
                    )}
                    <span className={`font-mono ${syncResult.success ? 'text-green-300' : 'text-red-300'}`}>
                        {syncResult.message}
                    </span>
                </div>
            )}

            {/* Filtres */}
            <div className="flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher un code..."
                        className="w-full pl-10 pr-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md focus:outline-none focus:ring-2 focus:ring-baikal-cyan text-white font-sans"
                    />
                </div>
                <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="px-4 py-2.5 bg-baikal-surface border border-baikal-border rounded-md focus:outline-none focus:ring-2 focus:ring-baikal-cyan text-white font-sans"
                >
                    <option value="all">Tous les domaines</option>
                    {domains.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </div>

            {/* Liste des codes */}
            <div className="border border-baikal-border rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-baikal-surface border-b border-baikal-border">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedCodes.length === filteredCodes.length && filteredCodes.length > 0}
                            onChange={toggleAll}
                            className="w-4 h-4 text-baikal-cyan border-baikal-border rounded focus:ring-baikal-cyan bg-black"
                        />
                        <span className="text-sm font-mono text-baikal-text">
                            TOUT_SÉLECTIONNER ({filteredCodes.length})
                        </span>
                    </label>
                    <span className="text-sm text-baikal-text font-mono">
                        {selectedCodes.length} SÉLECTIONNÉ(S)
                    </span>
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {filteredCodes.length === 0 ? (
                        <div className="p-8 text-center text-baikal-text">
                            <Scale className="w-8 h-8 mx-auto mb-2 text-baikal-text" />
                            <p className="font-mono">AUCUN_CODE_TROUVÉ</p>
                        </div>
                    ) : (
                        filteredCodes.map(code => (
                            <label
                                key={code.code_id}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-baikal-surface cursor-pointer border-b border-baikal-border last:border-0"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedCodes.includes(code.code_id)}
                                    onChange={() => toggleCode(code.code_id)}
                                    className="w-4 h-4 text-baikal-cyan border-baikal-border rounded focus:ring-baikal-cyan bg-black"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white truncate font-sans">{code.name}</p>
                                    <p className="text-xs text-baikal-text font-mono">{code.code_id}</p>
                                </div>
                                {code.article_count > 0 && (
                                    <span className="text-xs px-2 py-1 bg-baikal-surface text-baikal-text rounded-full font-mono">
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
                    className="flex items-center gap-2 px-6 py-2.5 bg-baikal-cyan text-black rounded-md hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                >
                    {syncing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            SYNCHRONISATION...
                        </>
                    ) : (
                        <>
                            <Play className="w-4 h-4" />
                            SYNCHRONISER {selectedCodes.length} CODE(S)
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export default function IngestionContent({ orgId, isSuperAdmin }) {
    const { profile } = useAuth();

    // États - Référentiels
    const [verticals, setVerticals] = useState([]);
    const [categories, setCategories] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loadingReferentiels, setLoadingReferentiels] = useState(true);
    const [loadingProjects, setLoadingProjects] = useState(true);

    // États - Formulaire commun
    const [activeSource, setActiveSource] = useState('file-upload');
    const [selectedVerticals, setSelectedVerticals] = useState([]);
    const [selectedLayer, setSelectedLayer] = useState('org');
    const [selectedProjects, setSelectedProjects] = useState([]);

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

    // Permissions et layers disponibles
    const availableLayers = useMemo(() => {
        if (isSuperAdmin) {
            return ['app', 'org', 'project'];
        }
        // org_admin : pas de layer "app"
        return ['org', 'project'];
    }, [isSuperAdmin]);

    // App ID : auto pour org_admin, sélection pour super_admin
    const effectiveAppId = useMemo(() => {
        if (isSuperAdmin) {
            return selectedVerticals[0] || null;
        }
        // org_admin : utiliser l'app_id du profil
        return profile?.app_id || null;
    }, [isSuperAdmin, selectedVerticals, profile?.app_id]);

    // Filtrer les sources disponibles
    const availableSources = useMemo(() => {
        return INGESTION_SOURCES.filter(source => {
            if (source.superAdminOnly && !isSuperAdmin) return false;
            return true;
        });
    }, [isSuperAdmin]);

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
                
                // Super admin : sélectionner la première verticale par défaut
                if (isSuperAdmin && verticalsRes.data?.length > 0 && selectedVerticals.length === 0) {
                    setSelectedVerticals([verticalsRes.data[0].id]);
                }
            } catch (err) {
                console.error('Erreur chargement référentiels:', err);
            } finally {
                setLoadingReferentiels(false);
            }
        }
        loadReferentiels();
    }, [isSuperAdmin]);

    // Charger les projets de l'organisation
    useEffect(() => {
        async function loadProjects() {
            if (!orgId) {
                setProjects([]);
                setLoadingProjects(false);
                return;
            }

            setLoadingProjects(true);
            try {
                const result = await projectsService.getProjects({
                    orgId: orgId,
                    includeArchived: false,
                });
                setProjects(result.data || []);
            } catch (err) {
                console.error('Erreur chargement projets:', err);
                setProjects([]);
            } finally {
                setLoadingProjects(false);
            }
        }
        loadProjects();
    }, [orgId]);

    // Mettre à jour le layer par défaut
    useEffect(() => {
        if (availableLayers.length > 0 && !availableLayers.includes(selectedLayer)) {
            setSelectedLayer(availableLayers[0]);
        }
    }, [availableLayers, selectedLayer]);

    // Reset projets sélectionnés quand on change de layer
    useEffect(() => {
        setSelectedProjects([]);
    }, [selectedLayer]);

    // Toggle verticale
    const toggleVertical = (verticalId) => {
        setSelectedVerticals(prev => 
            prev.includes(verticalId)
                ? prev.filter(id => id !== verticalId)
                : [...prev, verticalId]
        );
    };

    // Toggle projet
    const toggleProject = (projectId) => {
        setSelectedProjects(prev => 
            prev.includes(projectId)
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]
        );
    };

    // Handlers drag & drop
    const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) handleFileSelect(droppedFile);
    };

    const handleFileSelect = async (selectedFile) => {
        if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
            setErrors({ file: `Le fichier dépasse la limite de ${MAX_FILE_SIZE_MB} MB` });
            return;
        }

        const isValidType = ACCEPTED_MIME_TYPES.some(type => selectedFile.type === type);
        if (!isValidType && !selectedFile.name.match(/\.(pdf|docx?|xlsx?|txt|md|csv)$/i)) {
            setErrors({ file: 'Type de fichier non supporté' });
            return;
        }

        setFile(selectedFile);
        setErrors({});

        if (!metadata.title) {
            const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
            setMetadata(prev => ({ ...prev, title: nameWithoutExt }));
        }

        if (orgId) {
            setIsCheckingDuplicate(true);
            try {
                const result = await documentsService.checkFileBeforeUpload(selectedFile, orgId);
                setDuplicateInfo(result);
            } catch (err) {
                console.error('Erreur vérification doublon:', err);
            } finally {
                setIsCheckingDuplicate(false);
            }
        }
    };

    const handleFileRemove = () => {
        setFile(null);
        setDuplicateInfo(null);
        setErrors({});
    };

    const handleSubmit = async () => {
        const newErrors = {};
        
        // Validation
        if (isSuperAdmin && selectedVerticals.length === 0) {
            newErrors.vertical = 'Veuillez sélectionner au moins une application';
        }
        if (!file) {
            newErrors.file = 'Veuillez sélectionner un fichier';
        }
        if (!metadata.title) {
            newErrors.title = 'Le titre est obligatoire';
        }
        // Layer project : au moins 1 projet obligatoire
        if (selectedLayer === 'project' && selectedProjects.length === 0) {
            newErrors.projects = 'Veuillez sélectionner au moins un projet';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setIsUploading(true);
        setUploadResult(null);

        try {
            // Déterminer les apps à cibler
            const targetApps = isSuperAdmin ? selectedVerticals : [effectiveAppId];

            const uploadPromises = targetApps.map(appId =>
                documentsService.uploadDocument({
                    file,
                    layer: selectedLayer,
                    appId: appId,
                    orgId: orgId,
                    userId: profile?.id,
                    // Passer les projets sélectionnés uniquement si layer = project
                    projectIds: selectedLayer === 'project' ? selectedProjects : null,
                    metadata: {
                        title: metadata.title,
                        category: metadata.category,
                        description: metadata.description,
                        version: metadata.version,
                        extractToc: metadata.extractToc,
                    },
                    qualityLevel: 'premium',
                    status: 'approved',
                })
            );

            const results = await Promise.all(uploadPromises);
            const uploadErrors = results.filter(r => r.error);
            
            if (uploadErrors.length > 0) {
                throw new Error(`Erreur lors de l'upload pour ${uploadErrors.length} application(s)`);
            }

            setUploadResult({
                success: true,
                message: `Document uploadé avec succès${targetApps.length > 1 ? ` pour ${targetApps.length} application(s)` : ''} !`,
                path: results[0]?.path
            });

            // Reset formulaire
            setFile(null);
            setMetadata({ title: '', category: '', description: '', version: '', extractToc: false });
            setDuplicateInfo(null);
            setSelectedProjects([]);
        } catch (err) {
            setUploadResult({
                success: false,
                message: err.message || 'Erreur lors de l\'upload'
            });
        } finally {
            setIsUploading(false);
        }
    };

    const isSelectionValid = (isSuperAdmin ? selectedVerticals.length > 0 : effectiveAppId) && selectedLayer;

    return (
        <div className="space-y-6">
            {/* Sélection de source */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {availableSources.map(source => (
                    <SourceCard
                        key={source.id}
                        source={source}
                        isActive={activeSource === source.id}
                        onClick={() => setActiveSource(source.id)}
                    />
                ))}
            </div>

            {/* Contenu principal */}
            <div className="bg-black border border-baikal-border rounded-md p-6">
                <div className="space-y-6">
                    {/* Résultat upload */}
                    {uploadResult && (
                        <div className={`p-4 rounded-md flex items-center gap-3 ${
                            uploadResult.success 
                                ? 'bg-green-900/20 border border-green-500/50' 
                                : 'bg-red-900/20 border border-red-500/50'
                        }`}>
                            {uploadResult.success ? (
                                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                            )}
                            <p className={uploadResult.success ? 'text-green-300 font-mono' : 'text-red-300 font-mono'}>
                                {uploadResult.message}
                            </p>
                        </div>
                    )}

                    {/* Sélection commune */}
                    <div className="space-y-6 pb-6 border-b border-baikal-border">
                        {/* Sélecteur de verticales - SUPER_ADMIN uniquement */}
                        {isSuperAdmin && (
                            <>
                                <VerticalSelector
                                    verticals={verticals}
                                    selectedVerticals={selectedVerticals}
                                    onToggle={toggleVertical}
                                    loading={loadingReferentiels}
                                />
                                {errors?.vertical && (
                                    <p className="text-sm text-red-400 -mt-3 font-mono">{errors.vertical}</p>
                                )}
                            </>
                        )}

                        {/* Affichage de l'app pour org_admin (lecture seule) */}
                        {!isSuperAdmin && effectiveAppId && (
                            <div className="space-y-3">
                                <label className="block text-xs font-mono text-baikal-text uppercase">
                                    Application
                                </label>
                                <div className="px-3 py-2 bg-baikal-surface border border-baikal-border rounded-md">
                                    <span className="text-white font-mono uppercase">{effectiveAppId}</span>
                                </div>
                            </div>
                        )}

                        {/* Sélecteur de couche */}
                        <LayerSelector
                            selectedLayer={selectedLayer}
                            onSelect={setSelectedLayer}
                            availableLayers={availableLayers}
                        />

                        {/* Sélecteur de projets - UNIQUEMENT si layer = project */}
                        {selectedLayer === 'project' && (
                            <>
                                <ProjectSelector
                                    projects={projects}
                                    selectedProjects={selectedProjects}
                                    onToggle={toggleProject}
                                    loading={loadingProjects}
                                />
                                {errors?.projects && (
                                    <p className="text-sm text-red-400 -mt-3 font-mono">{errors.projects}</p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Contenu spécifique */}
                    {activeSource === 'file-upload' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-mono text-baikal-text mb-1.5 uppercase">
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
                                    <p className="text-sm text-red-400 mt-1 font-mono">{errors.file}</p>
                                )}
                            </div>

                            {file && (
                                <MetadataForm
                                    metadata={metadata}
                                    onChange={setMetadata}
                                    errors={errors}
                                    categories={categories}
                                    loadingCategories={loadingReferentiels}
                                />
                            )}

                            {file && (
                                <div className="flex items-center justify-end gap-4 pt-4 border-t border-baikal-border">
                                    <button
                                        onClick={handleFileRemove}
                                        className="px-4 py-2 text-baikal-text hover:text-white transition-colors font-sans"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isUploading || duplicateInfo?.isDuplicate}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-baikal-cyan text-black rounded-md hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                                    >
                                        {isUploading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                UPLOAD_EN_COURS...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-4 h-4" />
                                                UPLOADER
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeSource === 'legifrance' && isSelectionValid && (
                        <LegifranceInterface
                            selectedVertical={isSuperAdmin ? selectedVerticals[0] : effectiveAppId}
                            selectedLayer={selectedLayer}
                            verticals={verticals}
                        />
                    )}

                    {activeSource === 'legifrance' && !isSelectionValid && (
                        <div className="p-8 text-center text-baikal-text">
                            <Scale className="w-12 h-12 mx-auto mb-4 text-baikal-text" />
                            <p className="font-medium font-mono">SÉLECTIONNEZ_UNE_VERTICALE_ET_UNE_COUCHE</p>
                            <p className="text-sm mt-1 font-sans">pour accéder à l'import Légifrance</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
