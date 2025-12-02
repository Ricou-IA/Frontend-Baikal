import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ClipboardCheck,
  Building2,
  Scale,
  Users,
  Layers,
  Info
} from 'lucide-react';

/**
 * SmartUploader - Composant d'upload intelligent avec tagging multi-verticales
 * 
 * Permet de :
 * - Upload de documents par drag & drop ou sélection
 * - Tagging sur plusieurs verticales simultanément
 * - Validation des fichiers (type, taille)
 * - Feedback visuel du statut d'upload
 * 
 * @param {Object} props
 * @param {function} props.onUpload - Callback appelé après upload réussi
 * @param {Object} props.supabaseClient - Instance Supabase
 * @param {Array} props.availableVerticals - Liste des verticales disponibles
 * @param {string} props.defaultVertical - Verticale pré-sélectionnée par défaut
 * @param {number} props.maxFileSize - Taille max en MB (défaut: 20)
 * @param {string[]} props.acceptedTypes - Types MIME acceptés
 */

// Configuration des verticales par défaut
const DEFAULT_VERTICALS = [
  { id: 'audit', name: 'Audit', icon: ClipboardCheck, color: '#6366f1' },
  { id: 'btp', name: 'BTP', icon: Building2, color: '#f59e0b' },
  { id: 'juridique', name: 'Juridique', icon: Scale, color: '#10b981' },
  { id: 'rh', name: 'RH', icon: Users, color: '#ec4899' },
];

// Types de fichiers acceptés
const DEFAULT_ACCEPTED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'application/vnd.ms-excel',  // XLS (ancien format Excel)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  // XLSX (nouveau format Excel)
];

const SmartUploader = ({
  onUpload,
  supabaseClient,
  availableVerticals = DEFAULT_VERTICALS,
  defaultVertical = 'audit',
  maxFileSize = 20, // MB
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  className = '',
}) => {
  // States
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedVerticals, setSelectedVerticals] = useState([defaultVertical]);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // ============================================
  // GESTION DU DRAG & DROP
  // ============================================

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Vérifie qu'on quitte vraiment la zone (pas juste un enfant)
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  }, []);

  // ============================================
  // VALIDATION DES FICHIERS
  // ============================================

  const validateAndSetFile = (file) => {
    setErrorMessage('');
    setUploadStatus('idle');

    // Vérification du type
    if (!acceptedTypes.includes(file.type)) {
      setErrorMessage(`Type de fichier non supporté. Acceptés: PDF, Word, Excel, TXT, Markdown, CSV`);
      return false;
    }

    // Vérification de la taille
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxFileSize) {
      setErrorMessage(`Fichier trop volumineux (${fileSizeMB.toFixed(1)} MB). Maximum: ${maxFileSize} MB`);
      return false;
    }

    setSelectedFile(file);
    return true;
  };

  // ============================================
  // GESTION DES VERTICALES
  // ============================================

  const toggleVertical = (verticalId) => {
    setSelectedVerticals(prev => {
      if (prev.includes(verticalId)) {
        // Ne pas permettre de tout désélectionner
        if (prev.length === 1) return prev;
        return prev.filter(v => v !== verticalId);
      }
      return [...prev, verticalId];
    });
  };

  // ============================================
  // UPLOAD DU FICHIER
  // ============================================

  const handleUpload = async () => {
    if (!selectedFile || selectedVerticals.length === 0) {
      setErrorMessage('Veuillez sélectionner un fichier et au moins une verticale');
      return;
    }

    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      // Upload vers Supabase Storage
      setUploadProgress(30);
      let storageUrl = null;
      
      if (supabaseClient) {
        const fileName = `${Date.now()}-${selectedFile.name}`;
        const { data: storageData, error: storageError } = await supabaseClient
          .storage
          .from('documents')
          .upload(fileName, selectedFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (storageError) {
          throw new Error(`Erreur lors de l'upload: ${storageError.message}`);
        } else {
          // Récupérer l'URL publique
          const { data: { publicUrl } } = supabaseClient
            .storage
            .from('documents')
            .getPublicUrl(fileName);
          storageUrl = publicUrl;

          // Récupérer l'utilisateur pour l'envoyer à N8N
        const { data: { session } } = await supabaseClient.auth.getSession();
          const userId = session?.user?.id;

          // Appel au webhook N8N pour la vectorisation
          const n8nIngestWebhookUrl = import.meta.env.VITE_N8N_INGEST_WEBHOOK_URL?.trim();
          if (userId && n8nIngestWebhookUrl) {
            setUploadProgress(80);
            try {
              await fetch(n8nIngestWebhookUrl, {
        method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
        body: JSON.stringify({
                  filename: selectedFile.name,
                  path: `documents/${fileName}`,  // Path dans Supabase Storage
                  user_id: userId,
                  tag: selectedVerticals[0] || 'default',
                  target_verticals: selectedVerticals || ['default']
                })
              });
              // Ne pas bloquer si l'appel N8N échoue (non bloquant)
            } catch (n8nError) {
              console.warn('Erreur lors de l\'appel N8N (non bloquant):', n8nError);
            }
          }
        }
      } else {
        throw new Error('Client Supabase non configuré');
      }

      setUploadProgress(100);
      setUploadStatus('success');

      // Callback parent
      if (onUpload) {
        onUpload({
          file: selectedFile,
          verticals: selectedVerticals,
          storageUrl: storageUrl,
        });
      }

      // Reset après 3 secondes
      setTimeout(() => {
        resetUploader();
      }, 3000);

    } catch (error) {
      console.error('Erreur upload:', error);
      setUploadStatus('error');
      setErrorMessage(error.message || 'Erreur lors de l\'upload');
    }
  };

  // Reset complet
  const resetUploader = () => {
    setSelectedFile(null);
    setSelectedVerticals([defaultVertical]);
    setUploadStatus('idle');
    setUploadProgress(0);
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ============================================
  // RENDU
  // ============================================

  return (
    <div className={`w-full ${className}`}>
      {/* Zone de Drop */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => uploadStatus === 'idle' && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8
          transition-all duration-300 cursor-pointer
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
            : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
          }
          ${uploadStatus === 'success' ? 'border-green-500 bg-green-50' : ''}
          ${uploadStatus === 'error' ? 'border-red-500 bg-red-50' : ''}
          ${uploadStatus === 'uploading' ? 'pointer-events-none opacity-80' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
          className="hidden"
        />

        {/* État: Idle (pas de fichier) */}
        {!selectedFile && uploadStatus === 'idle' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center
              ${isDragging ? 'bg-indigo-100' : 'bg-slate-100'}
              transition-colors duration-200
            `}>
              <Upload className={`w-8 h-8 ${isDragging ? 'text-indigo-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <p className="text-slate-700 font-medium">
                {isDragging ? 'Déposez le fichier ici' : 'Glissez-déposez un fichier'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                ou cliquez pour parcourir
              </p>
            </div>
            <p className="text-xs text-slate-400">
              PDF, Word, Excel, TXT, Markdown, CSV • Max {maxFileSize} MB
            </p>
          </div>
        )}

        {/* État: Fichier sélectionné */}
        {selectedFile && uploadStatus === 'idle' && (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-500">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetUploader();
              }}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        )}

        {/* État: Upload en cours */}
        {uploadStatus === 'uploading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <div className="w-full max-w-xs">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-slate-600 text-center mt-2">
                Upload en cours... {uploadProgress}%
              </p>
            </div>
          </div>
        )}

        {/* État: Succès */}
        {uploadStatus === 'success' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <p className="text-green-700 font-medium">Document uploadé avec succès !</p>
            <p className="text-sm text-green-600">
              Indexé dans : {selectedVerticals.join(', ')}
            </p>
          </div>
        )}

        {/* État: Erreur */}
        {uploadStatus === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-12 h-12 text-red-600" />
            <p className="text-red-700 font-medium">Erreur lors de l'upload</p>
            <p className="text-sm text-red-600">{errorMessage}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUploadStatus('idle');
              }}
              className="text-sm text-indigo-600 hover:underline"
            >
              Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Message d'erreur de validation */}
      {errorMessage && uploadStatus === 'idle' && (
        <div className="mt-3 flex items-start gap-2 text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{errorMessage}</p>
        </div>
      )}

      {/* Sélection des verticales (visible si fichier sélectionné) */}
      {selectedFile && uploadStatus === 'idle' && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-medium text-slate-700">
              Verticales cibles
            </p>
            <div className="group relative">
              <Info className="w-4 h-4 text-slate-400 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Sélectionnez les verticales où ce document sera visible
              </div>
            </div>
          </div>

          {/* Checkboxes des verticales */}
          <div className="flex flex-wrap gap-3">
            {availableVerticals.map((vertical) => {
              const Icon = vertical.icon || Layers;
              const isSelected = selectedVerticals.includes(vertical.id);

              return (
                <label
                  key={vertical.id}
                  className={`
                    flex items-center gap-2 px-4 py-2.5
                    border rounded-xl cursor-pointer
                    transition-all duration-200
                    ${isSelected 
                      ? 'border-transparent shadow-md' 
                      : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                  style={{
                    backgroundColor: isSelected ? `${vertical.color}15` : 'white',
                    boxShadow: isSelected ? `0 4px 12px ${vertical.color}25` : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleVertical(vertical.id)}
                    className="sr-only"
                  />
                  
                  {/* Checkbox custom */}
                  <div 
                    className={`
                      w-5 h-5 rounded border-2 flex items-center justify-center
                      transition-all duration-200
                    `}
                    style={{
                      borderColor: isSelected ? vertical.color : '#cbd5e1',
                      backgroundColor: isSelected ? vertical.color : 'white',
                    }}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Icône et nom */}
                  <Icon 
                    className="w-4 h-4" 
                    style={{ color: isSelected ? vertical.color : '#64748b' }}
                  />
                  <span 
                    className="text-sm font-medium"
                    style={{ color: isSelected ? vertical.color : '#475569' }}
                  >
                    {vertical.name}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Bouton Upload */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={selectedVerticals.length === 0}
            className={`
              mt-6 w-full py-3 px-6
              bg-gradient-to-r from-indigo-600 to-indigo-700
              hover:from-indigo-700 hover:to-indigo-800
              text-white font-medium rounded-xl
              shadow-lg shadow-indigo-200
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
            `}
          >
            <Upload className="w-5 h-5" />
            Indexer dans {selectedVerticals.length} verticale{selectedVerticals.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
};

export default SmartUploader;