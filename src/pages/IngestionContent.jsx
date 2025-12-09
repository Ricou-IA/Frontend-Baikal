/**
 * IngestionContent.jsx - Baikal Console
 * ============================================================================
 * Contenu d'ingestion intégré pour l'onglet "Connaissances" de la page Admin.
 * Version sans header (le header est géré par Admin.jsx).
 * 
 * Sources disponibles :
 * - Upload de fichiers (PDF, Word, Excel, etc.)
 * - Légifrance (codes juridiques) - super_admin uniquement
 * ============================================================================
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
    INGESTION_SOURCES,
    DARK_THEME_COLORS,
} from '../config/ingestion.config';
import {
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
    Globe,
    Link2,
    Layers,
    Search,
    Clock,
    Play,
} from 'lucide-react';

// ============================================================================
// COMPOSANT CARTE DE SOURCE
// ============================================================================

function SourceCard({ source, isActive, onClick, disabled }) {
    const Icon = source.icon;
    const colorClasses = {
        indigo: { bg: 'bg-baikal-cyan/20', text: 'text-baikal-cyan', border: 'border-baikal-cyan', activeBg: 'bg-baikal-cyan/10' },
        emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500', activeBg: 'bg-emerald-500/10' },
        blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500', activeBg: 'bg-blue-500/10' },
        violet: { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500', activeBg: 'bg-violet-500/10' },
    };
    const colors = colorClasses[source.color] || colorClasses.indigo;

    return (
        <button
            onClick={onClick}
            disabled={disabled || !source.available}
            className={`
                relative w-full p-4 rounded-md border-2 text-left transition-all duration-200
                ${isActive ? `${colors.border} ${colors.activeBg}` : 'border-baikal-border bg-baikal-surface hover:border-baikal-cyan/50'}
                ${(!source.available || disabled) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
        >
            {source.comingSoon && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-baikal-bg text-baikal-text rounded-md border border-baikal-border font-mono">
                    Bientôt
                </span>
            )}
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-md ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`font-medium font-mono ${isActive ? colors.text : 'text-white'}`}>
                        {source.label}
                    </p>
                    <p className="text-xs text-baikal-text truncate font-sans">{source.description}</p>
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
                <label className="block text-xs font-mono text-baikal-text uppercase">Verticale métier *</label>
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-baikal-cyan animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <label className="block text-xs font-mono text-baikal-text uppercase">Verticale métier *</label>
            <div className="grid grid-cols-2 gap-3">
                {verticals.map((vertical) => {
                    const isSelected = selectedVertical === vertical.id;
                    return (
                        <button
                            key={vertical.id}
                            onClick={() => onSelect(vertical.id)}
                            className={`
                                relative p-4 rounded-md border-2 text-left transition-all
                                ${isSelected 
                                    ? 'border-baikal-cyan bg-baikal-cyan/10' 
                                    : 'border-baikal-border bg-baikal-surface hover:border-baikal-cyan/50'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div 
                                    className="p-2 rounded-md"
                                    style={{ backgroundColor: `${vertical.color}20` }}
                                >
                                    <Layers 
                                        className="w-5 h-5" 
                                        style={{ color: vertical.color }} 
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-medium font-mono ${isSelected ? 'text-baikal-cyan' : 'text-white'}`}>
                                        {vertical.name}
                                    </p>
                                    <p className="text-xs text-baikal-text line-clamp-1 font-sans">
                                        {vertical.description}
                                    </p>
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
// COMPOSANT SÉLECTEUR DE COUCHE
// ============================================================================

function LayerSelector({ selectedLayer, onSelect, availableLayers }) {
    const layers = [
        { id: 'vertical', icon: BookOpen, label: 'Verticale Métier', description: 'Partagé entre organisations' },
        { id: 'org', icon: Building2, label: 'Organisation', description: "Interne à l'organisation" },
    ];

    return (
        <div className="space-y-3">
            <label className="block text-xs font-mono text-baikal-text uppercase">Couche de destination *</label>
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
                                relative p-4 rounded-md border-2 text-left transition-all
                                ${isSelected ? `border-baikal-cyan bg-baikal-cyan/10` : 'border-baikal-border bg-baikal-surface hover:border-baikal-cyan/50'}
                                ${!isAvailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-md bg-baikal-cyan/20`}>
                                    <Icon className={`w-5 h-5 text-baikal-cyan`} />
                                </div>
                                <div>
                                    <p className={`font-medium font-mono ${isSelected ? 'text-baikal-cyan' : 'text-white'}`}>
                                        {layer.label}
                                    </p>
                                    <p className="text-xs text-baikal-text font-sans">{layer.description}</p>
                                </div>
                            </div>
                            {isSelected && (
                                <CheckCircle2 className={`absolute top-3 right-3 w-5 h-5 text-baikal-cyan`} />
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
                        <div className="flex items-center gap-2 text-amber-400">
                            <AlertTriangle className="w-5 h-5" />
                            <span className="text-sm font-medium font-mono">DOUBLON</span>
                        </div>
                    ) : duplicateInfo && !duplicateInfo.isDuplicate ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : null}
                    <button
                        onClick={onFileRemove}
                        className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {duplicateInfo?.isDuplicate && (
                    <div className="mt-3 p-3 bg-amber-900/20 border border-amber-500/50 rounded-md">
                        <p className="text-sm text-amber-300 font-sans">
                            Ce fichier existe déjà : <strong className="font-mono">{duplicateInfo.existingFile?.title}</strong>
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
                border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-all bg-baikal-surface
                ${isDragging ? 'border-baikal-cyan bg-baikal-cyan/10' : 'border-baikal-border hover:border-baikal-cyan hover:bg-baikal-bg'}
            `}
        >
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(',')}
                onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
                className="hidden"
            />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-baikal-cyan' : 'text-baikal-text'}`} />
            <p className="font-medium text-white font-sans">
                {isDragging ? 'Déposez votre fichier ici' : 'Glissez-déposez ou cliquez pour sélectionner'}
            </p>
            <p className="text-sm text-baikal-text mt-1 font-mono">
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
        <div className="space-y-4 pt-4 border-t border-baikal-border">
            <h4 className="font-medium text-white font-mono">MÉTADONNÉES_DU_DOCUMENT</h4>

            <div>
                <label className="block text-xs font-mono text-baikal-text mb-1 uppercase">Titre *</label>
                <input
                    type="text"
                    value={metadata.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Titre du document"
                    className="w-full px-4 py-2.5 bg-black border border-baikal-border rounded-md text-white placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                />
                {errors?.title && <p className="text-sm text-red-400 mt-1 font-mono">{errors.title}</p>}
            </div>

            <div>
                <label className="block text-xs font-mono text-baikal-text mb-1 uppercase">Catégorie</label>
                {loadingCategories ? (
                    <div className="flex items-center gap-2 text-baikal-text">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm font-mono">CHARGEMENT...</span>
                    </div>
                ) : (
                    <select
                        value={metadata.category}
                        onChange={(e) => handleChange('category', e.target.value)}
                        className="w-full px-4 py-2.5 bg-black border border-baikal-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent"
                    >
                        <option value="">Sélectionner une catégorie</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name || cat.label}</option>
                        ))}
                    </select>
                )}
            </div>

            <div>
                <label className="block text-xs font-mono text-baikal-text mb-1 uppercase">Description</label>
                <textarea
                    value={metadata.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Description optionnelle..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-black border border-baikal-border rounded-md text-white placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-baikal-cyan focus:border-transparent resize-none"
                />
            </div>

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

                if (domainsResult.error) {
                    console.error('[LegifranceInterface] Error loading domains:', domainsResult.error);
                    setError(`Erreur lors du chargement des domaines Légifrance: ${domainsResult.error.message || domainsResult.error}`);
                } else if (codesResult.error) {
                    console.error('[LegifranceInterface] Error loading codes:', codesResult.error);
                    setError(`Erreur lors du chargement des codes Légifrance: ${codesResult.error.message || codesResult.error}`);
                } else {
                    setDomains(domainsResult.data || []);
                    setCodes(codesResult.data || []);
                }
            } catch (err) {
                console.error('[LegifranceInterface] Unexpected error:', err);
                setError(err.message || 'Erreur de chargement');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const filteredCodes = codes.filter(code => {
        const matchesSearch = !searchTerm || 
            code.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.short_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDomain = selectedDomain === 'all' || code.domain_id === selectedDomain;
        return matchesSearch && matchesDomain;
    });

    const toggleCode = (codeId) => {
        setSelectedCodes(prev => 
            prev.includes(codeId) ? prev.filter(id => id !== codeId) : [...prev, codeId]
        );
    };

    const toggleAll = () => {
        if (selectedCodes.length === filteredCodes.length) {
            setSelectedCodes([]);
        } else {
            setSelectedCodes(filteredCodes.map(c => c.id));
        }
    };

    const handleSync = async () => {
        if (selectedCodes.length === 0) return;
        
        setSyncing(true);
        setSyncResult(null);
        
        try {
            const { data, error } = await documentsService.syncLegifranceCodes({
                codeIds: selectedCodes,
                verticalId: selectedVertical,
                layer: selectedLayer,
            });

            if (error) throw error;

            setSyncResult({
                success: true,
                message: `${selectedCodes.length} code(s) synchronisé(s) avec succès`
            });
            setSelectedCodes([]);
        } catch (err) {
            console.error('[LegifranceInterface] Sync error:', err);
            setSyncResult({
                success: false,
                message: err.message || err.error?.message || 'Erreur lors de la synchronisation'
            });
        } finally {
            setSyncing(false);
        }
    };

    const selectedVerticalName = verticals.find(v => v.id === selectedVertical)?.name || 'Non sélectionnée';

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
                <p className="text-baikal-text font-mono">CHARGEMENT_DES_CODES_LÉGIFRANCE...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-md">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-medium font-mono text-red-300 mb-2">{error}</p>
                        <button
                            onClick={() => {
                                setError(null);
                                setLoading(true);
                                async function retry() {
                                    try {
                                        const [domainsResult, codesResult] = await Promise.all([
                                            referentielsService.getLegifranceDomains(),
                                            referentielsService.getLegifranceCodes(),
                                        ]);
                                        if (domainsResult.error) {
                                            setError(`Erreur lors du chargement des domaines Légifrance: ${domainsResult.error.message || domainsResult.error}`);
                                        } else if (codesResult.error) {
                                            setError(`Erreur lors du chargement des codes Légifrance: ${codesResult.error.message || codesResult.error}`);
                                        } else {
                                            setDomains(domainsResult.data || []);
                                            setCodes(codesResult.data || []);
                                        }
                                    } catch (err) {
                                        setError(err.message || 'Erreur de chargement');
                                    } finally {
                                        setLoading(false);
                                    }
                                }
                                retry();
                            }}
                            className="px-4 py-2 bg-red-900/30 border border-red-500/50 rounded-md text-red-300 hover:bg-red-900/40 transition-colors font-mono text-sm"
                        >
                            RÉESSAYER
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="p-4 bg-emerald-900/20 border border-emerald-500/50 rounded-md">
                <div className="flex items-center gap-3">
                    <Scale className="w-5 h-5 text-emerald-400" />
                    <div>
                        <p className="font-medium text-emerald-300 font-mono">
                            IMPORT_LÉGIFRANCE → {selectedVerticalName}
                        </p>
                        <p className="text-sm text-emerald-400 font-sans">
                            Couche : {LAYER_LABELS[selectedLayer]}
                        </p>
                    </div>
                </div>
            </div>

            {syncResult && (
                <div className={`p-4 rounded-md flex items-start gap-3 ${
                    syncResult.success ? 'bg-green-900/20 border border-green-500/50' : 'bg-red-900/20 border border-red-500/50'
                }`}>
                    {syncResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                        <p className={syncResult.success ? 'text-green-300 font-mono' : 'text-red-300 font-mono'}>
                            {syncResult.message}
                        </p>
                        {!syncResult.success && syncResult.message?.includes('Edge Function') && (
                            <p className="text-red-200 text-sm font-sans mt-2">
                                Contactez l'administrateur pour vérifier le déploiement de l'Edge Function "sync-legifrance".
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-baikal-text" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher un code..."
                        className="w-full pl-10 pr-4 py-2.5 bg-black border border-baikal-border rounded-md text-white placeholder-baikal-text focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="px-4 py-2.5 bg-black border border-baikal-border rounded-md text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[200px]"
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

            <div className="flex items-center justify-between">
                <button
                    onClick={toggleAll}
                    className="text-sm text-emerald-400 hover:text-emerald-300 font-medium font-mono"
                >
                    {selectedCodes.length === filteredCodes.length && filteredCodes.length > 0 
                        ? 'TOUT_DÉSÉLECTIONNER' 
                        : 'TOUT_SÉLECTIONNER'}
                </button>
                <span className="text-sm text-baikal-text font-mono">
                    {selectedCodes.length} code(s) sélectionné(s) sur {filteredCodes.length}
                </span>
            </div>

            <div className="border border-baikal-border rounded-md overflow-hidden bg-baikal-surface">
                {codes.length === 0 ? (
                    <div className="p-8 text-center text-baikal-text">
                        <Scale className="w-12 h-12 mx-auto mb-3 text-baikal-text" />
                        <p className="font-medium font-mono">AUCUN_CODE_LÉGIFRANCE_DISPONIBLE</p>
                    </div>
                ) : filteredCodes.length === 0 ? (
                    <div className="p-8 text-center text-baikal-text">
                        <Search className="w-10 h-10 mx-auto mb-3 text-baikal-text" />
                        <p className="font-medium font-mono">AUCUN_CODE_TROUVÉ</p>
                    </div>
                ) : (
                    <div className="divide-y divide-baikal-border max-h-80 overflow-y-auto">
                        {filteredCodes.map((code) => {
                            const isSelected = selectedCodes.includes(code.id);
                            const domain = domains.find(d => d.id === code.domain_id);
                            
                            return (
                                <label
                                    key={code.id}
                                    className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-900/20' : 'hover:bg-baikal-bg'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleCode(code.id)}
                                        className="w-5 h-5 text-emerald-400 border-baikal-border rounded focus:ring-emerald-500 bg-black"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-white font-sans">{code.name}</p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            {domain && (
                                                <span 
                                                    className="px-2 py-0.5 text-xs rounded-md border"
                                                    style={{ 
                                                        backgroundColor: domain.color ? `${domain.color}20` : 'transparent',
                                                        color: domain.color || '#94A3B8',
                                                        borderColor: domain.color ? `${domain.color}50` : '#2D3748'
                                                    }}
                                                >
                                                    {domain.name}
                                                </span>
                                            )}
                                            {code.indexed_articles > 0 && (
                                                <span className="text-xs text-baikal-text font-mono">
                                                    {code.indexed_articles} articles
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {code.last_sync_at && (
                                        <div className="text-xs text-baikal-text flex items-center gap-1 font-mono">
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

            <div className="flex justify-end pt-4 border-t border-baikal-border">
                <button
                    onClick={handleSync}
                    disabled={selectedCodes.length === 0 || syncing}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
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
    const availableLayers = useMemo(() => {
        const layers = [];
        if (permissions.canUploadVertical) layers.push('vertical');
        if (permissions.canUploadOrg) layers.push('org');
        return layers;
    }, [permissions.canUploadVertical, permissions.canUploadOrg]);

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

    useEffect(() => {
        if (availableLayers.length > 0 && !availableLayers.includes(selectedLayer)) {
            setSelectedLayer(availableLayers[0]);
        }
    }, [availableLayers, selectedLayer]);

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

        setIsCheckingDuplicate(true);
        try {
            const { isDuplicate, existingFile } = await documentsService.checkDuplicate(
                selectedFile.name, selectedFile.size, orgId
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
            const { data, error, path } = await documentsService.uploadDocument({
                file,
                layer: selectedLayer,
                verticalId: selectedVertical,
                orgId: orgId,
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
                message: 'Document uploadé avec succès !',
                path
            });

            setFile(null);
            setMetadata({ title: '', category: '', description: '', version: '', extractToc: false });
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

    const isSelectionValid = selectedVertical && selectedLayer;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar - Sources */}
            <div className="lg:col-span-1 space-y-4">
                <div className="bg-baikal-surface rounded-md border border-baikal-border p-4">
                    <h3 className="font-mono font-semibold text-white mb-4 flex items-center gap-2">
                        <Database className="w-5 h-5 text-baikal-text" />
                        SOURCE
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

                <div className="bg-baikal-cyan/10 border border-baikal-cyan/50 rounded-md p-4">
                    <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-baikal-cyan flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-baikal-cyan font-mono">INGESTION_PREMIUM</p>
                            <p className="text-baikal-text mt-1 font-sans">
                                {activeSource === 'legifrance' 
                                    ? 'Importez des codes juridiques depuis Légifrance.'
                                    : 'Upload enrichi avec métadonnées et traitement automatique.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contenu principal */}
            <div className="lg:col-span-3">
                <div className="bg-baikal-surface rounded-md border border-baikal-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-baikal-border bg-baikal-bg">
                        <h3 className="font-mono font-semibold text-white flex items-center gap-2">
                            {activeSource === 'legifrance' ? (
                                <>
                                    <Scale className="w-5 h-5 text-emerald-400" />
                                    IMPORT_LÉGIFRANCE
                                </>
                            ) : (
                                <>
                                    <Upload className="w-5 h-5 text-baikal-cyan" />
                                    UPLOAD_DE_DOCUMENT
                                </>
                            )}
                        </h3>
                    </div>

                    <div className="p-6 space-y-6">
                        {activeSource === 'file-upload' && uploadResult && (
                            <div className={`p-4 rounded-md flex items-start gap-3 ${
                                uploadResult.success ? 'bg-green-900/20 border border-green-500/50' : 'bg-red-900/20 border border-red-500/50'
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
                            <VerticalSelector
                                verticals={verticals}
                                selectedVertical={selectedVertical}
                                onSelect={setSelectedVertical}
                                loading={loadingReferentiels}
                            />
                            {errors?.vertical && (
                                <p className="text-sm text-red-400 -mt-3 font-mono">{errors.vertical}</p>
                            )}

                            <LayerSelector
                                selectedLayer={selectedLayer}
                                onSelect={setSelectedLayer}
                                availableLayers={availableLayers}
                            />
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
                                selectedVertical={selectedVertical}
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
        </div>
    );
}
