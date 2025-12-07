/**
 * App.jsx - Baikal Console
 * ============================================================================
 * Point d'entrée de l'application React.
 * Configure le Router et les Guards de protection des routes.
 * ============================================================================
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import {
  ProtectedRoute,
  OnboardingRoute,
  PublicRoute,
  AdminRoute
} from './components/OnboardingGuard';

// Pages
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import Documents from './pages/Documents';
import Validation from './pages/Validation';
import IngestionPremium from './pages/IngestionPremium';
import Prompts from './pages/Prompts';
import PromptForm from './pages/PromptForm';

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
          {/* ============================================ */}
          {/* ROUTES PUBLIQUES */}
          {/* ============================================ */}
          
          {/* Login (redirige si déjà connecté) */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Réinitialisation de mot de passe (publique) */}
          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />

          {/* ============================================ */}
          {/* ROUTES ONBOARDING */}
          {/* ============================================ */}
          
          {/* Onboarding (requiert auth, redirige si déjà onboardé) */}
          <Route
            path="/onboarding"
            element={
              <OnboardingRoute>
                <Onboarding />
              </OnboardingRoute>
            }
          />

          {/* ============================================ */}
          {/* ROUTES PROTÉGÉES (auth + onboarding requis) */}
          {/* ============================================ */}
          
          {/* Dashboard utilisateur */}
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

          {/* ============================================ */}
          {/* ROUTES ADMIN (auth + onboarding + rôle admin) */}
          {/* ============================================ */}
          
          {/* Admin - Page principale */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />

          {/* Admin - Documents */}
          <Route
            path="/admin/documents"
            element={
              <AdminRoute>
                <Documents />
              </AdminRoute>
            }
          />

          {/* Admin - Validation */}
          <Route
            path="/admin/validation"
            element={
              <AdminRoute>
                <Validation />
              </AdminRoute>
            }
          />

          {/* Admin - Ingestion Premium */}
          <Route
            path="/admin/ingestion"
            element={
              <AdminRoute>
                <IngestionPremium />
              </AdminRoute>
            }
          />

          {/* Admin - Liste des Prompts */}
          <Route
            path="/admin/prompts"
            element={
              <AdminRoute>
                <Prompts />
              </AdminRoute>
            }
          />

          {/* Admin - Nouveau Prompt */}
          <Route
            path="/admin/prompts/new"
            element={
              <AdminRoute>
                <PromptForm />
              </AdminRoute>
            }
          />

          {/* Admin - Édition Prompt */}
          <Route
            path="/admin/prompts/:id"
            element={
              <AdminRoute>
                <PromptForm />
              </AdminRoute>
            }
          />

          {/* ============================================ */}
          {/* REDIRECTIONS */}
          {/* ============================================ */}
          
          {/* Redirection racine → /admin */}
          <Route path="/" element={<Navigate to="/admin" replace />} />

          {/* 404 - Route non trouvée → /admin */}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
