/**
 * PlatformLayout.jsx - Baïkal Platform Console
 * ============================================================================
 * Layout minimaliste pour les pages de la plateforme (login, dashboard, etc.)
 * Pas de navbar marketing, juste un conteneur plein écran.
 * ============================================================================
 */

export default function PlatformLayout({ children }) {
  return (
    <div className="h-screen w-full">
      {children}
    </div>
  );
}






















