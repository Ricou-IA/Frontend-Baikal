import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { callRagBrain } from '../lib/supabaseClient'
import UserMenu from '../components/UserMenu'
import VerticalSelector from '../components/VerticalSelector'
import { VerticalProvider, useVertical } from '../components/VerticalContext'
import SmartUploader from '../components/SmartUploader'
import { ChatInterface } from '../components/chat'
import AudioRecorder from '../components/AudioRecorder'
import supabase from '../lib/supabaseClient'
import {
  Sparkles,
  MessageSquare,
  Settings,
  Paperclip,
  Mic,
  Send,
  Calendar,
  Briefcase,
  Loader2,
  AlertCircle,
  Upload,
  LogOut,
  Menu,
  X as XIcon
} from 'lucide-react'

function DashboardLayout() {
  const { user, profile, signOut } = useAuth()
  const { currentVertical, setCurrentVertical, getCurrentVerticalInfo } = useVertical()

  const [activeTab, setActiveTab] = useState('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = async () => {
    await signOut()
  }

  const handleUploadSuccess = (result) => {
    console.log('Document uploadé:', result)
  }

  const handleRecordingSuccess = (meeting) => {
    console.log('Meeting processed:', meeting)
    // Ici on pourrait ajouter une notif ou rafraîchir une liste
  }

  const verticalInfo = getCurrentVerticalInfo()

  return (
    <div className="h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? 'w-72' : 'w-0'}
          bg-white border-r border-slate-200
          flex flex-col
          transition-all duration-300 overflow-hidden
        `}
      >
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h1
              className="text-lg font-bold"
              style={{ color: verticalInfo?.color || '#6366f1' }}
            >
              {verticalInfo?.name || 'Core RAG'}
            </h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <XIcon className="w-5 h-5 text-slate-500" />
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 ${activeTab === 'chat'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium">Chat IA</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 ${activeTab === 'upload'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Upload className="w-5 h-5" />
              <span className="font-medium">Importer</span>
            </button>

            <button
              onClick={() => setActiveTab('meetings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 ${activeTab === 'meetings'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Mic className="w-5 h-5" />
              <span className="font-medium">Réunions</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 ${activeTab === 'settings'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Paramètres</span>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
              style={{ backgroundColor: verticalInfo?.color || '#6366f1' }}
            >
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {profile?.full_name || user?.email}
              </p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!sidebarOpen && (
          <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-4 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <span
              className="font-bold"
              style={{ color: verticalInfo?.color || '#6366f1' }}
            >
              {verticalInfo?.name || 'Core RAG'}
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
                <h2 className="text-xl font-bold text-slate-800 mb-2">
                  Importer un document
                </h2>
                <p className="text-slate-600 mb-6">
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

          {activeTab === 'meetings' && (
            <div className="h-full overflow-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Compte-rendu intelligent</h2>
                  <p className="text-slate-600 mb-8">
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
                <h2 className="text-xl font-bold text-slate-800 mb-6">
                  Paramètres
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







