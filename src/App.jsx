// ============================================================================
// App.jsx - Baikal Console
// Routing principal avec les nouvelles pages RAG Layers (Phase 3)
// ============================================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import {
  ProtectedRoute,
  OnboardingRoute,
  PublicRoute,
  AdminRoute
} from './components/OnboardingGuard';

// ============================================================================
// PAGES - Existantes
// ============================================================================
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Admin from './pages/Admin';

// ============================================================================
// PAGES - RAG Layers (Phase 3)
// ============================================================================
import Documents from './pages/Documents';
import IngestionPremium from './pages/IngestionPremium';
import Validation from './pages/Validation';
import Prompts from './pages/Prompts';
import PromptForm from './pages/PromptForm';

// ============================================================================
// APP COMPONENT
// ============================================================================

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <Routes>
          
          {/* ================================================================ */}
          {/* ROUTES PUBLIQUES                                                */}
          {/* ================================================================ */}
          
          {/* Login (redirige si déjà connecté) */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Réinitialisation mot de passe (publique) */}
          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />

          {/* ================================================================ */}
          {/* ROUTES ONBOARDING                                               */}
          {/* ================================================================ */}
          
          {/* Onboarding (requiert auth, redirige si déjà onboardé) */}
          <Route
            path="/onboarding"
            element={
              <OnboardingRoute>
                <Onboarding />
              </OnboardingRoute>
            }
          />

          {/* ================================================================ */}
          {/* ROUTES PROTÉGÉES (auth + onboarding)                            */}
          {/* ================================================================ */}
          
          {/* Dashboard principal */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Paramètres utilisateur */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* ================================================================ */}
          {/* ROUTES ADMIN (auth + onboarding + rôle admin)                   */}
          {/* ================================================================ */}
          
          {/* Page Admin principale */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />

          {/* ================================================================ */}
          {/* ROUTES RAG LAYERS - Phase 3 (admin)                             */}
          {/* ================================================================ */}
          
          {/* Visualisation des documents par couche */}
          <Route
            path="/admin/documents"
            element={
              <AdminRoute>
                <Documents />
              </AdminRoute>
            }
          />

          {/* Ingestion Premium (upload + sources externes) */}
          <Route
            path="/admin/documents/upload"
            element={
              <AdminRoute>
                <IngestionPremium />
              </AdminRoute>
            }
          />

          {/* Alias pour l'ingestion */}
          <Route
            path="/admin/ingestion"
            element={
              <AdminRoute>
                <IngestionPremium />
              </AdminRoute>
            }
          />

          {/* Validation des documents en attente */}
          <Route
            path="/admin/documents/validation"
            element={
              <AdminRoute>
                <Validation />
              </AdminRoute>
            }
          />

          {/* Alias pour la validation */}
          <Route
            path="/admin/validation"
            element={
              <AdminRoute>
                <Validation />
              </AdminRoute>
            }
          />

          {/* Gestion des Prompts RAG */}
          <Route
            path="/admin/prompts"
            element={
              <AdminRoute>
                <Prompts />
              </AdminRoute>
            }
          />

          {/* Édition d'un Prompt */}
          <Route
            path="/admin/prompts/:id"
            element={
              <AdminRoute>
                <PromptForm />
              </AdminRoute>
            }
          />

          {/* Création d'un nouveau Prompt */}
          <Route
            path="/admin/prompts/new"
            element={
              <AdminRoute>
                <PromptForm />
              </AdminRoute>
            }
          />

          {/* ================================================================ */}
          {/* REDIRECTIONS                                                    */}
          {/* ================================================================ */}
          
          {/* Redirection par défaut */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 - Route non trouvée */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
