/**
 * Dashboard.jsx - Baikal Console
 * ============================================================================
 * MIGRATION PHASE 3 - vertical → app
 * 
 * MODIFICATIONS:
 * - VerticalSelector → AppSelector
 * - VerticalProvider, useVertical → AppProvider, useApp
 * - currentVertical → currentApp
 * - setCurrentVertical → setCurrentApp
 * - getCurrentVerticalInfo → getCurrentAppInfo
 * - verticalInfo → appInfo
 * - defaultVertical → defaultApp
 * ============================================================================
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
// MIGRATION: VerticalSelector → AppSelector
import AppSelector from '../components/AppSelector'
// MIGRATION: VerticalProvider, useVertical → AppProvider, useApp
import { AppProvider, useApp } from '../contexts/AppContext'
import SmartUploader from '../components/SmartUploader'
import InvoiceUploader from '../components/InvoiceUploader'
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
  // MIGRATION: useVertical → useApp, currentVertical → currentApp, etc.
  const { currentApp, setCurrentApp, getCurrentAppInfo } = useApp()

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

  // MIGRATION: verticalInfo → appInfo
  const appInfo = getCurrentAppInfo()

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
              {/* MIGRATION: verticalInfo → appInfo */}
              {appInfo?.name || 'BAÏKAL'}
            </h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-baikal-bg rounded-md lg:hidden"
            >
              <XIcon className="w-5 h-5 text-baikal-text" />
            </button>
          </div>

          {/* MIGRATION: VerticalSelector → AppSelector, props renommées */}
          <AppSelector
            currentApp={currentApp}
            onAppChange={setCurrentApp}
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
              <span className="font-sans">Assistant RAG</span>
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
              <span className="font-sans">Documents</span>
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
              <span className="font-sans">Factures</span>
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
              <span className="font-sans">Réunions</span>
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
              <span className="font-sans">Paramètres</span>
            </button>

            {/* Lien Admin pour super_admin et org_admin */}
            {(isSuperAdmin || isOrgAdmin) && (
              <button
                onClick={() => navigate('/admin')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors duration-200 border text-baikal-text hover:bg-baikal-bg border-transparent"
              >
                <Shield className="w-5 h-5" />
                <span className="font-sans">Administration</span>
              </button>
            )}
          </div>
        </nav>

        {/* Profil utilisateur */}
        <div className="p-4 border-t border-baikal-border">
          {isImpersonating && (
            <button
              onClick={stopImpersonating}
              className="w-full mb-3 px-3 py-2 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/50 rounded-md hover:bg-amber-500/20 transition-colors"
            >
              Arrêter l'impersonation
            </button>
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
              {/* MIGRATION: verticalInfo → appInfo */}
              {appInfo?.name || 'BAÏKAL'}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && (
            <div className="h-full flex items-center justify-center">
              <p className="text-baikal-text font-mono">CHAT_INTERFACE_PLACEHOLDER</p>
            </div>
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
                  // MIGRATION: defaultVertical → defaultApp (si le composant est migré)
                  defaultVertical={currentApp || 'audit'}
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

// MIGRATION: VerticalProvider → AppProvider, defaultVertical → defaultApp
export default function Dashboard() {
  return (
    <AppProvider supabaseClient={supabase} defaultApp="audit">
      <DashboardLayout />
    </AppProvider>
  )
}
