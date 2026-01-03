/**
 * Confer.jsx - Confer Landing Page
 * ============================================================================
 * Landing page pour Confer - Marque mère institutionnelle
 * Design: Blanc, Sérif élégant, Style High Ticket Institutionnel
 * ============================================================================
 */

import { Link } from 'react-router-dom';

export default function Confer() {
  return (
    <div className="min-h-screen bg-white">
      {/* ==================================================================== */}
      {/* NAVBAR */}
      {/* ==================================================================== */}
      <nav className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="text-2xl font-serif font-bold text-[#0B0F17]">
              Confer
            </Link>
            <div className="flex items-center gap-6">
              <Link
                to="/baikal"
                className="text-sm font-sans text-[#6B7280] hover:text-[#0B0F17] transition-colors"
              >
                Baïkal
              </Link>
              <Link
                to="/login"
                className="text-sm font-sans text-[#6B7280] hover:text-[#0B0F17] transition-colors"
              >
                Connexion
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ==================================================================== */}
      {/* HERO SECTION */}
      {/* ==================================================================== */}
      <section className="py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-bold text-[#0B0F17] mb-6 leading-tight">
            L'Operating Partner nouvelle génération.
          </h1>
          <p className="font-sans text-xl md:text-2xl text-[#6B7280] mb-10 max-w-2xl mx-auto">
            Conseil en gestion. Intelligence technologique. Résultats mesurables.
          </p>
          <Link
            to="#contact"
            className="inline-block px-8 py-4 bg-[#0B0F17] text-white font-sans text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Prendre contact
          </Link>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* PROPOSITION DE VALEUR - 3 COLONNES */}
      {/* ==================================================================== */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[#0B0F17] text-center mb-16">
            Notre approche
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
            {/* Pilier 1: Gestion */}
            <div className="text-center md:text-left">
              <div className="text-6xl font-serif text-[#0B0F17] mb-6 opacity-20">01</div>
              <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-4">
                Gestion
              </h3>
              <p className="font-sans text-[#6B7280] leading-relaxed">
                Pilotage opérationnel, reporting, optimisation des process.
              </p>
            </div>

            {/* Pilier 2: Stratégie */}
            <div className="text-center md:text-left">
              <div className="text-6xl font-serif text-[#0B0F17] mb-6 opacity-20">02</div>
              <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-4">
                Stratégie
              </h3>
              <p className="font-sans text-[#6B7280] leading-relaxed">
                Business plan, valorisation, accompagnement M&A.
              </p>
            </div>

            {/* Pilier 3: Technologie */}
            <div className="text-center md:text-left">
              <div className="text-6xl font-serif text-[#0B0F17] mb-6 opacity-20">03</div>
              <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-4">
                Technologie
              </h3>
              <p className="font-sans text-[#6B7280] leading-relaxed">
                Data, automatisation, outils sur-mesure via Baïkal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* CIBLES - 3 COLONNES */}
      {/* ==================================================================== */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-[#F9FAFB]">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[#0B0F17] text-center mb-16">
            Pour qui ?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
            {/* Cible 1: Repreneurs */}
            <div>
              <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-4">
                Repreneurs de PME
              </h3>
              <p className="font-sans text-[#6B7280] leading-relaxed">
                Sécurisez votre acquisition avec un copilote opérationnel.
              </p>
            </div>

            {/* Cible 2: Fonds */}
            <div>
              <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-4">
                Fonds d'investissement
              </h3>
              <p className="font-sans text-[#6B7280] leading-relaxed">
                Accélérez la création de valeur sur vos participations.
              </p>
            </div>

            {/* Cible 3: Dirigeants */}
            <div>
              <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-4">
                Dirigeants
              </h3>
              <p className="font-sans text-[#6B7280] leading-relaxed">
                Structurez votre croissance avec méthode.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* MÉTHODE - 4 ÉTAPES */}
      {/* ==================================================================== */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[#0B0F17] text-center mb-16">
            Notre méthode
          </h2>
          
          <div className="space-y-12">
            {/* Étape 1: Diagnostic */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 border-2 border-[#0B0F17] flex items-center justify-center">
                  <span className="font-serif text-2xl font-bold text-[#0B0F17]">1</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-3">
                  Diagnostic
                </h3>
                <p className="font-sans text-[#6B7280] leading-relaxed">
                  Audit flash de la situation
                </p>
              </div>
            </div>

            {/* Étape 2: Roadmap */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 border-2 border-[#0B0F17] flex items-center justify-center">
                  <span className="font-serif text-2xl font-bold text-[#0B0F17]">2</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-3">
                  Roadmap
                </h3>
                <p className="font-sans text-[#6B7280] leading-relaxed">
                  Plan d'action priorisé
                </p>
              </div>
            </div>

            {/* Étape 3: Exécution */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 border-2 border-[#0B0F17] flex items-center justify-center">
                  <span className="font-serif text-2xl font-bold text-[#0B0F17]">3</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-3">
                  Exécution
                </h3>
                <p className="font-sans text-[#6B7280] leading-relaxed">
                  Déploiement opérationnel
                </p>
              </div>
            </div>

            {/* Étape 4: Mesure */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 border-2 border-[#0B0F17] flex items-center justify-center">
                  <span className="font-serif text-2xl font-bold text-[#0B0F17]">4</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-2xl font-bold text-[#0B0F17] mb-3">
                  Mesure
                </h3>
                <p className="font-sans text-[#6B7280] leading-relaxed">
                  KPIs et ajustements continus
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* À PROPOS / FOUNDER */}
      {/* ==================================================================== */}
      <section className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-[#F9FAFB]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[#0B0F17] mb-8">
            Un profil hybride
          </h2>
          <p className="font-sans text-lg md:text-xl text-[#6B7280] leading-relaxed max-w-3xl mx-auto">
            Expert-comptable diplômé (DEC) et passionné de technologie, je combine rigueur financière et innovation pour transformer les PME.
          </p>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* CTA FINAL */}
      {/* ==================================================================== */}
      <section id="contact" className="py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-[#0B0F17] mb-8">
            Discutons de votre projet
          </h2>
          <Link
            to="#contact"
            className="inline-block px-8 py-4 bg-[#0B0F17] text-white font-sans text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Prendre rendez-vous
          </Link>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* FOOTER */}
      {/* ==================================================================== */}
      <footer className="border-t border-[#E5E7EB] bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-sm font-sans text-[#6B7280]">
              © 2025 Confer. Tous droits réservés.
            </div>
            <Link
              to="/baikal"
              className="text-sm font-sans text-[#6B7280] hover:text-[#0B0F17] transition-colors"
            >
              Découvrir Baïkal Engine →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

