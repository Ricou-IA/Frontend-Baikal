import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import VerticalSelector from '../components/VerticalSelector'
import { VerticalProvider, useVertical } from '../components/VerticalContext'
import SmartUploader from '../components/SmartUploader'
import InvoiceUploader from '../components/InvoiceUploader'
import { ChatInterface } from '../components/chat'
import AudioRecorder from '../components/AudioRecorder'
import supabase from '../lib/supabaseClient'
import {
  MessageSquare,
  Settings,
  Mic,
  Upload,
  LogOut,
  Menu,
  X as XIcon,
  Shield,
  Receipt
} from 'lucide-react'

function DashboardLayout() {
  const navigate = useNavigate()
  const { user, profile, signOut, isOrgAdmin, isSuperAdmin, isImpersonating, stopImpersonating } = useAuth()
  const { currentVertical, setCurrentVertical, getCurrentVerticalInfo } = useVertical()

  const [activeTab, setActiveTab] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = async () => {
    await signOut()
  }

  const handleUploadSuccess = (result) => {
    console.log('Document uploadé:', result)
  }

  const handleInvoiceUploadSuccess = (result) => {
    console.log('Facture uploadée:', result)
  }

  const handleRecordingSuccess = (meeting) => {
    console.log('Meeting processed:', meeting)
    // Ici on pourrait ajouter une notif ou rafraîchir une liste
  }

  const verticalInfo = getCurrentVerticalInfo()

  return (
    <div className="h-screen flex bg-baikal-bg">
      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? 'w-72' : 'w-0'}
          bg-baikal-surface border-r border-baikal-border
          flex flex-col
          transition-all duration-300 overflow-hidden
        `}
      >
        <div className="p-4 border-b border-baikal-border">
          <div className="flex items-center justify-between mb-4">
            <h1
              className="text-lg font-mono font-bold text-white"
            >
              {verticalInfo?.name || 'BAÏKAL'}
            </h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-baikal-bg rounded-md lg:hidden"
            >
              <XIcon className="w-5 h-5 text-baikal-text" />
            </button>
          </div>

          <VerticalSelector
            currentVertical={currentVertical}
            onVerticalChange={setCurrentVertical}
            supabaseClient={supabase}
            showLabel={true}
          />
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 border ${
                activeTab === 'chat'
                  ? 'bg-transparent text-baikal-cyan border-baikal-cyan'
                  : 'text-baikal-text hover:bg-baikal-bg border-transparent'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium font-sans">Chat IA</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 border ${
                activeTab === 'upload'
                  ? 'bg-transparent text-baikal-cyan border-baikal-cyan'
                  : 'text-baikal-text hover:bg-baikal-bg border-transparent'
              }`}
            >
              <Upload className="w-5 h-5" />
              <span className="font-medium font-sans">Importer</span>
            </button>

            <button
              onClick={() => setActiveTab('invoices')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 border ${
                activeTab === 'invoices'
                  ? 'bg-transparent text-baikal-cyan border-baikal-cyan'
                  : 'text-baikal-text hover:bg-baikal-bg border-transparent'
              }`}
            >
              <Receipt className="w-5 h-5" />
              <span className="font-medium font-sans">Factures</span>
            </button>

            <button
              onClick={() => setActiveTab('meetings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 border ${
                activeTab === 'meetings'
                  ? 'bg-transparent text-baikal-cyan border-baikal-cyan'
                  : 'text-baikal-text hover:bg-baikal-bg border-transparent'
              }`}
            >
              <Mic className="w-5 h-5" />
              <span className="font-medium font-sans">Réunions</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 border ${
                activeTab === 'settings'
                  ? 'bg-transparent text-baikal-cyan border-baikal-cyan'
                  : 'text-baikal-text hover:bg-baikal-bg border-transparent'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium font-sans">Paramètres</span>
            </button>

            {/* Bouton Administration - visible uniquement pour les admins */}
            {(isOrgAdmin || isSuperAdmin) && (
              <button
                onClick={() => navigate('/admin')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 text-baikal-cyan hover:bg-baikal-bg border border-baikal-cyan"
              >
                <Shield className="w-5 h-5" />
                <span className="font-medium font-sans">Administration</span>
              </button>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-baikal-border">
          {/* Indicateur d'impersonation */}
          {isImpersonating && (
            <div className="mb-3 p-2 bg-amber-900/20 border border-amber-500/50 rounded-md">
              <p className="text-xs font-medium text-amber-400 mb-1 font-mono">MODE_IMPERSONATION</p>
              <button
                onClick={stopImpersonating}
                className="text-xs text-amber-300 hover:text-amber-200 underline font-mono"
              >
                Revenir au profil Super Admin
              </button>
            </div>
          )}
          
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-black font-semibold font-mono bg-baikal-cyan"
            >
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate font-sans">
                {profile?.full_name || user?.email}
              </p>
              <p className="text-xs text-baikal-text truncate font-mono">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-baikal-text hover:text-red-400 hover:bg-red-900/20 border border-baikal-border hover:border-red-500/50 rounded-md transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-sans">Se déconnecter</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden bg-baikal-bg">
        {!sidebarOpen && (
          <div className="p-4 border-b border-baikal-border bg-baikal-surface flex items-center gap-4 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-baikal-bg rounded-md"
            >
              <Menu className="w-5 h-5 text-baikal-text" />
            </button>
            <span className="font-bold font-mono text-white">
              {verticalInfo?.name || 'BAÏKAL'}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && (
            <ChatInterface
              verticalId={currentVertical || 'audit'}
              onError={(err) => console.error('Chat error:', err)}
            />
          )}

          {activeTab === 'upload' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xl font-bold text-white mb-2 font-mono">
                  IMPORTER_UN_DOCUMENT
                </h2>
                <p className="text-baikal-text mb-6 font-sans">
                  Ajoutez des documents à votre base de connaissances et taguez-les sur plusieurs verticales.
                </p>
                <SmartUploader
                  supabaseClient={supabase}
                  defaultVertical={currentVertical || 'audit'}
                  onUpload={handleUploadSuccess}
                />
              </div>
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xl font-bold text-white mb-2 font-mono">
                  IMPORTER_UNE_FACTURE
                </h2>
                <p className="text-baikal-text mb-6 font-sans">
                  Téléchargez vos factures pour traitement et extraction automatique des données.
                </p>
                <InvoiceUploader
                  supabaseClient={supabase}
                  onUpload={handleInvoiceUploadSuccess}
                />
              </div>
            </div>
          )}

          {activeTab === 'meetings' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2 font-mono">COMPTE_RENDU_INTELLIGENT</h2>
                  <p className="text-baikal-text mb-8 font-sans">
                    Enregistrez vos réunions de chantier ou d'audit. L'IA générera automatiquement un résumé structuré et la liste des actions.
                  </p>
                  <AudioRecorder onRecordingComplete={handleRecordingSuccess} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xl font-bold text-white mb-6 font-mono">
                  PARAMÈTRES
                </h2>
                {/* Contenu existant des paramètres... */}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function Dashboard() {
  return (
    <VerticalProvider supabaseClient={supabase} defaultVertical="audit">
      <DashboardLayout />
    </VerticalProvider>
  )
}
