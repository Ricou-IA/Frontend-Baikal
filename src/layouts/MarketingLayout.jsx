/**
 * MarketingLayout.jsx - Baïkal Marketing Site
 * ============================================================================
 * Layout pour les pages marketing (Confer, Baïkal landing, etc.)
 * Inclut navbar et footer marketing.
 * ============================================================================
 */

import { Link } from 'react-router-dom';

export default function MarketingLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar Marketing */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="text-xl font-serif font-bold text-gray-900">
              Confer
            </Link>
            <div className="flex items-center gap-4">
              <Link
                to="/baikal"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Baïkal
              </Link>
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Connexion
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer Marketing */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-600">
            <p>&copy; {new Date().getFullYear()} Confer. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}







