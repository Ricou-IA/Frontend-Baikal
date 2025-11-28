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
          {/* Routes publiques (redirige si déjà connecté) */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          {/* Route de réinitialisation de mot de passe (publique) */}
          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />

          {/* Route d'onboarding (requiert auth, redirige si déjà onboardé) */}
          <Route
            path="/onboarding"
            element={
              <OnboardingRoute>
                <Onboarding />
              </OnboardingRoute>
            }
          />

          {/* Routes protégées (requiert auth + onboarding complété) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Route des paramètres (protégée) */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Route Admin (protégée + rôle admin requis) */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />

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

