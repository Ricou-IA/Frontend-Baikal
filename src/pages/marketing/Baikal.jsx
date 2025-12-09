/**
 * Baikal.jsx - Baïkal Landing Page
 * ============================================================================
 * Page d'atterrissage pour le produit Baïkal Engine.
 * Design: Dark mode, Monospace font, Deep Blue/Cyan accents.
 * ============================================================================
 */

import { Link } from 'react-router-dom';

export default function Baikal() {
  return (
    <div className="bg-baikal-bg min-h-screen">
        {/* Navbar Baïkal (Override Marketing Navbar) */}
        <nav className="border-b border-baikal-border bg-baikal-bg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="font-mono font-bold text-white text-lg">
                BAÏKAL_ENGINE
              </div>
              <Link
                to="/login"
                className="px-4 py-2 font-mono text-sm border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan hover:text-black transition-colors"
              >
                ACCÈS CONSOLE
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* Abstract CSS Grid Background */}
          <div className="absolute inset-0 opacity-10">
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(0, 240, 255, 0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0, 240, 255, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px',
              }}
            />
          </div>

          <div className="relative max-w-4xl mx-auto text-center">
            <h1 className="font-mono text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6">
              LE LAC DE DONNÉES
              <br />
              <span className="text-baikal-cyan">SÉCURISÉ.</span>
            </h1>
            <p className="text-baikal-text text-xl md:text-2xl max-w-2xl mx-auto">
              Architecture RAG Multi-tenant. Ingestion universelle.
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1: Ingestion */}
              <div className="bg-baikal-surface border border-baikal-border p-8 hover:border-baikal-cyan transition-colors">
                <div className="font-mono text-baikal-cyan text-sm mb-4">01_INGESTION</div>
                <h3 className="font-mono text-white text-xl mb-4">Ingestion</h3>
                <p className="text-baikal-text">
                  Importez vos documents depuis n'importe quelle source. 
                  Formats multiples, traitement automatique.
                </p>
              </div>

              {/* Feature 2: Sédimentation */}
              <div className="bg-baikal-surface border border-baikal-border p-8 hover:border-baikal-cyan transition-colors">
                <div className="font-mono text-baikal-cyan text-sm mb-4">02_SÉDIMENTATION</div>
                <h3 className="font-mono text-white text-xl mb-4">Sédimentation</h3>
                <p className="text-baikal-text">
                  Structuration intelligente des données. 
                  Indexation multi-couches pour une recherche optimale.
                </p>
              </div>

              {/* Feature 3: Restitution */}
              <div className="bg-baikal-surface border border-baikal-border p-8 hover:border-baikal-cyan transition-colors">
                <div className="font-mono text-baikal-cyan text-sm mb-4">03_RESTITUTION</div>
                <h3 className="font-mono text-white text-xl mb-4">Restitution</h3>
                <p className="text-baikal-text">
                  Accès rapide et précis à l'information. 
                  API et interface console pour tous vos besoins.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-baikal-border py-8 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <Link
              to="/"
              className="text-baikal-text hover:text-baikal-cyan transition-colors font-mono text-sm"
            >
              ← Retour sur Confer.io
            </Link>
          </div>
        </footer>
    </div>
  );
}

