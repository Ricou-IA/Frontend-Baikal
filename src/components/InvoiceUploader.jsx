import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Receipt
} from 'lucide-react';

/**
 * InvoiceUploader - Composant d'upload dédié aux documents commerciaux
 * 
 * Flux séparé du système d'upload de documents standard.
 * Permet de :
 * - Upload de factures, BDC, BDL par drag & drop ou sélection
 * - Validation des fichiers (type, taille)
 * - Feedback visuel du statut d'upload
 * - Envoi vers le bucket "invoices" et webhook N8N Gare de Triage
 * 
 * Architecture:
 * - Storage: invoices/{user_id}/{timestamp}_{filename}
 * - Webhook: POST vers N8N avec {user_id, path, filename}
 * - Tables: invoicing.documents_staging → invoicing.invoices/purchase_orders/deliveries
 * 
 * @param {Object} props
 * @param {function} props.onUpload - Callback appelé après upload réussi
 * @param {Object} props.supabaseClient - Instance Supabase
 * @param {number} props.maxFileSize - Taille max en MB (défaut: 20)
 * @param {string[]} props.acceptedTypes - Types MIME acceptés
 */

// Types de fichiers acceptés pour les documents commerciaux
const DEFAULT_ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const InvoiceUploader = ({
  onUpload,
  supabaseClient,
  maxFileSize = 20, // MB
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  className = '',
}) => {
  // States
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingInfo, setProcessingInfo] = useState(null); // Info retournée par N8N
  
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
    setProcessingInfo(null);

    // Vérification du type
    if (!acceptedTypes.includes(file.type)) {
      setErrorMessage(`Type de fichier non supporté. Acceptés: PDF, Images (JPG, PNG), Word, Excel`);
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
  // UPLOAD DU FICHIER
  // ============================================

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Veuillez sélectionner un fichier');
      return;
    }

    if (!supabaseClient) {
      setErrorMessage('Client Supabase non configuré');
      return;
    }

    setUploadStatus('uploading');
    setUploadProgress(0);
    setProcessingInfo(null);

    try {
      // ============================================
      // ÉTAPE 1: Récupérer l'utilisateur connecté
      // ============================================
      const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
      
      if (sessionError || !session?.user?.id) {
        throw new Error('Utilisateur non connecté. Veuillez vous reconnecter.');
      }
      
      const userId = session.user.id;
      setUploadProgress(10);

      // ============================================
      // ÉTAPE 2: Préparer le path Storage
      // ============================================
      // Structure: {user_id}/{timestamp}_{filename_sanitized}
      const timestamp = Date.now();
      const sanitizedFileName = selectedFile.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Remplace caractères spéciaux
        .replace(/_+/g, '_'); // Évite les underscores multiples
      
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const filePath = `${userId}/${fileName}`;

      setUploadProgress(20);

      // ============================================
      // ÉTAPE 3: Upload vers Supabase Storage
      // ============================================
      const { data: storageData, error: storageError } = await supabaseClient
        .storage
        .from('invoices') // Bucket dédié aux documents commerciaux
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        // Gestion des erreurs spécifiques
        if (storageError.message.includes('duplicate')) {
          throw new Error('Ce fichier existe déjà. Veuillez le renommer.');
        }
        if (storageError.message.includes('bucket')) {
          throw new Error('Bucket "invoices" non configuré. Contactez l\'administrateur.');
        }
        throw new Error(`Erreur Storage: ${storageError.message}`);
      }

      setUploadProgress(50);

      // ============================================
      // ÉTAPE 4: Récupérer l'URL publique (optionnel)
      // ============================================
      let publicUrl = null;
      try {
        const { data } = supabaseClient
          .storage
          .from('invoices')
          .getPublicUrl(filePath);
        publicUrl = data?.publicUrl;
      } catch (urlError) {
        console.warn('Impossible de récupérer l\'URL publique:', urlError);
      }

      setUploadProgress(60);

      // ============================================
      // ÉTAPE 5: Appeler le Webhook N8N (Gare de Triage)
      // ============================================
      const n8nWebhookUrl = import.meta.env.VITE_N8N_INVOICE_WEBHOOK_URL?.trim();
      
      let webhookResponse = null;
      
      if (n8nWebhookUrl) {
        try {
          setUploadProgress(70);
          
          // Payload attendu par le workflow N8N
          const webhookPayload = {
            user_id: userId,
            path: filePath,              // Ex: "uuid-user/1234567890_facture.pdf"
            filename: selectedFile.name  // Nom original pour affichage
          };

          console.log('📤 Envoi webhook N8N:', webhookPayload);

          const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookPayload)
          });

          setUploadProgress(90);

          if (response.ok) {
            try {
              webhookResponse = await response.json();
              console.log('✅ Réponse N8N:', webhookResponse);
              setProcessingInfo(webhookResponse);
            } catch (jsonError) {
              // Réponse non-JSON, c'est OK
              console.log('✅ Webhook N8N appelé avec succès');
            }
          } else {
            console.warn('⚠️ Webhook N8N a retourné:', response.status);
          }
        } catch (n8nError) {
          // Non bloquant - le fichier est déjà uploadé
          console.warn('⚠️ Erreur webhook N8N (non bloquant):', n8nError.message);
        }
      } else {
        console.warn('⚠️ VITE_N8N_INVOICE_WEBHOOK_URL non configuré dans .env');
      }

      setUploadProgress(100);
      setUploadStatus('success');

      // ============================================
      // ÉTAPE 6: Callback parent
      // ============================================
      if (onUpload) {
        onUpload({
          file: selectedFile,
          fileName: fileName,
          filePath: filePath,
          storageUrl: publicUrl,
          userId: userId,
          webhookResponse: webhookResponse,
          documentType: webhookResponse?.type || 'pending'
        });
      }

      // Reset après 4 secondes
      setTimeout(() => {
        resetUploader();
      }, 4000);

    } catch (error) {
      console.error('❌ Erreur upload:', error);
      setUploadStatus('error');
      setErrorMessage(error.message || 'Erreur lors de l\'upload');
    }
  };

  // ============================================
  // RESET
  // ============================================

  const resetUploader = () => {
    setSelectedFile(null);
    setUploadStatus('idle');
    setUploadProgress(0);
    setErrorMessage('');
    setProcessingInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const getDocumentTypeLabel = (type) => {
    const labels = {
      'INVOICE': 'Facture',
      'CREDIT_NOTE': 'Avoir',
      'QUOTE': 'Devis',
      'PURCHASE_ORDER': 'Bon de commande',
      'DELIVERY_NOTE': 'Bon de livraison',
      'UNKNOWN': 'Document',
      'pending': 'Document'
    };
    return labels[type] || 'Document';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            ? 'border-purple-500 bg-purple-50 scale-[1.02]' 
            : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
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
              ${isDragging ? 'bg-purple-100' : 'bg-slate-100'}
              transition-colors duration-200
            `}>
              <Receipt className={`w-8 h-8 ${isDragging ? 'text-purple-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <p className="text-slate-700 font-medium">
                {isDragging ? 'Déposez le document ici' : 'Glissez-déposez un document'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                ou cliquez pour parcourir
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Factures, Devis, Bons de commande, Bons de livraison
            </p>
            <p className="text-xs text-slate-400">
              PDF, Images (JPG, PNG), Word, Excel • Max {maxFileSize} MB
            </p>
          </div>
        )}

        {/* État: Fichier sélectionné */}
        {selectedFile && uploadStatus === 'idle' && (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatFileSize(selectedFile.size)}
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
            <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
            <div className="w-full max-w-xs">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-600 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-slate-600 text-center mt-2">
                {uploadProgress < 50 && 'Upload du fichier...'}
                {uploadProgress >= 50 && uploadProgress < 70 && 'Fichier uploadé, analyse en cours...'}
                {uploadProgress >= 70 && uploadProgress < 100 && 'Classification du document...'}
                {uploadProgress === 100 && 'Terminé !'}
              </p>
            </div>
          </div>
        )}

        {/* État: Succès */}
        {uploadStatus === 'success' && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
            <p className="text-green-700 font-medium">
              {processingInfo?.type 
                ? `${getDocumentTypeLabel(processingInfo.type)} uploadé avec succès !`
                : 'Document uploadé avec succès !'
              }
            </p>
            <p className="text-sm text-green-600">
              Le traitement automatique est en cours...
            </p>
            {processingInfo?.type && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Classifié: {getDocumentTypeLabel(processingInfo.type)}
              </span>
            )}
          </div>
        )}

        {/* État: Erreur */}
        {uploadStatus === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-12 h-12 text-red-600" />
            <p className="text-red-700 font-medium">Erreur lors de l'upload</p>
            <p className="text-sm text-red-600 text-center max-w-sm">{errorMessage}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUploadStatus('idle');
                setErrorMessage('');
              }}
              className="text-sm text-purple-600 hover:underline"
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

      {/* Bouton Upload (visible si fichier sélectionné) */}
      {selectedFile && uploadStatus === 'idle' && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleUpload}
            className={`
              w-full py-3 px-6
              bg-gradient-to-r from-purple-600 to-purple-700
              hover:from-purple-700 hover:to-purple-800
              text-white font-medium rounded-xl
              shadow-lg shadow-purple-200
              transition-all duration-200
              flex items-center justify-center gap-2
            `}
          >
            <Upload className="w-5 h-5" />
            Analyser le document
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            Le document sera automatiquement classifié (Facture, Devis, BC, BL)
          </p>
        </div>
      )}
    </div>
  );
};

export default InvoiceUploader;

