import React from 'react';

/**
 * COMPOSANT LOGO : Le "Sceau Cinétique"
 * =========================================================
 * Une rosace géométrique qui tourne imperceptiblement.
 */
export const ConferLogo = ({ className = "w-12 h-12", color = "text-slate-900" }) => {
  return (
    <div className={`relative flex items-center justify-center ${className} ${color}`}>
      {/* Centre stable */}
      <div className="absolute w-[4%] h-[4%] bg-current rounded-full" />
      
      {/* ANNEAU EXTERIEUR (Rotation 60s) */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-spin-slow">
        {/* Cercle fin */}
        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.5" className="opacity-40" />
        {/* Arc décoratif principal */}
        <path d="M50 2 A48 48 0 0 1 50 98" fill="none" stroke="currentColor" strokeWidth="1" className="opacity-90" />
        {/* Géométrie interne (Lignes de tension) */}
        <path d="M50 10 L85 80 L15 80 Z" fill="none" stroke="currentColor" strokeWidth="0.3" className="opacity-30" />
      </svg>

      {/* ANNEAU INTERIEUR (Rotation inverse 90s) */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-spin-slower scale-75">
         {/* Carré pivoté */}
         <rect x="30" y="30" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.5" transform="rotate(45 50 50)" className="opacity-60" />
         {/* Cercle interne */}
         <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="0.5" className="opacity-80" />
      </svg>
    </div>
  );
};

/**
 * VARIANTE WORDMARK (Logo + Texte)
 */
export const ConferWordmark = ({ dark = false }) => (
  <div className="flex items-center gap-4 group cursor-pointer">
    <ConferLogo className="w-10 h-10" color={dark ? "text-white" : "text-slate-900"} />
    <div className="flex flex-col justify-center">
      <span className={`font-serif text-2xl font-bold tracking-tight leading-none ${dark ? "text-white" : "text-slate-900"}`}>
        CONFER
      </span>
      <span className={`font-sans text-[0.6rem] tracking-[0.25em] uppercase leading-none mt-1.5 ${dark ? "text-slate-400" : "text-slate-500"}`}>
        Advisory
      </span>
    </div>
  </div>
);

/**
 * PAGE DE PRÉVISUALISATION (Artefact)
 * =========================================================
 * Affiche le logo dans différents contextes pour valider le style.
 */
const LogoPreview = () => {
  return (
    <div className="min-h-screen bg-[#FDFBF9] font-sans p-12">
      <div className="max-w-6xl mx-auto space-y-20">
        
        {/* Header */}
        <div className="border-b border-slate-200 pb-8">
          <h1 className="font-serif text-3xl text-slate-900">Confer — Identité Visuelle</h1>
          <p className="text-slate-500 mt-2">Étude du "Sceau Cinétique" • Rendu vectoriel • Animation lente</p>
        </div>

        {/* 1. Rendu "En-tête de Lettre" (Papier blanc) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="bg-white p-12 rounded-sm shadow-sm border border-slate-100 flex items-center justify-center h-64">
             <ConferWordmark />
          </div>
          <div className="space-y-4">
             <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Context : Papier à en-tête</h3>
             <p className="text-slate-600 font-light">
               Le logo fonctionne par la finesse de ses traits (`stroke-width: 0.5px`). 
               L'animation est quasi-imperceptible, créant une sensation de "temps suspendu" propre au luxe.
             </p>
          </div>
        </section>

        {/* 2. Rendu "Carte de Visite" (Fond sombre / Baïkal Bridge) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
           <div className="order-2 md:order-1 space-y-4">
             <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Context : Dark Mode / Footer</h3>
             <p className="text-slate-600 font-light">
               En négatif (sur fond sombre), la structure géométrique évoque l'ingénierie et la précision, faisant le pont avec l'identité technologique Baïkal.
             </p>
          </div>
          <div className="order-1 md:order-2 bg-[#0B0F17] p-12 rounded-sm shadow-2xl flex items-center justify-center h-64 border border-slate-800">
             <ConferWordmark dark={true} />
          </div>
        </section>

        {/* 3. L'Échelle (Scale Test) */}
        <section className="bg-white border border-slate-200 p-12 rounded-sm">
           <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-12 text-center">Test d'échelle</h3>
           <div className="flex flex-wrap items-center justify-center gap-16">
              {/* Petit (Favicon / Mobile) */}
              <div className="flex flex-col items-center gap-4">
                <ConferLogo className="w-6 h-6" />
                <span className="text-xs text-slate-300 font-mono">24px</span>
              </div>
              
              {/* Moyen (Navbar) */}
              <div className="flex flex-col items-center gap-4">
                <ConferLogo className="w-12 h-12" />
                <span className="text-xs text-slate-300 font-mono">48px</span>
              </div>

              {/* Grand (Hero / Cover) */}
              <div className="flex flex-col items-center gap-4">
                <ConferLogo className="w-32 h-32" />
                <span className="text-xs text-slate-300 font-mono">128px</span>
              </div>
           </div>
        </section>

      </div>
    </div>
  );
};

export default LogoPreview;



