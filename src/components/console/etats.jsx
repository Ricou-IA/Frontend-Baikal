/**
 * etats.jsx - Baikal Console
 * ============================================================================
 * Etats d'affichage communs aux modules de la console (/seo, /finances).
 *
 * La distinction qui compte : <Erreur> en rouge = quelque chose a echoue ;
 * <Vide> en neutre = la requete a abouti, il n'y a rien a montrer. Les
 * confondre fait passer un site sans donnees pour un site en panne.
 * ============================================================================
 */
import { AlertTriangle, Database, Loader2 } from 'lucide-react';

// `sousTitre` est accepté mais n'est plus affiché : Eric ne veut pas de texte
// d'explication dans la console (08/09/2026).
export function Section({ titre, sousTitre, action, children }) { // eslint-disable-line no-unused-vars
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-baikal-text">{titre}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ContenuEstompe({ enCours, children }) {
  return (
    <div className={enCours ? 'opacity-50 pointer-events-none transition-opacity space-y-4' : 'space-y-4'}>
      {children}
    </div>
  );
}

export function Erreur({ message }) {
  return (
    <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
      <p className="font-mono text-sm">{message}</p>
    </div>
  );
}

export function Vide({ message }) {
  return (
    <div className="p-4 bg-baikal-surface border border-baikal-border rounded-md flex items-start gap-3 text-baikal-text">
      <Database className="w-5 h-5 flex-shrink-0 opacity-60 mt-0.5" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function LigneVide({ colonnes, message }) {
  return (
    <tr className="border-t border-baikal-border/50">
      <td colSpan={colonnes} className="px-4 py-6 text-center text-sm text-baikal-text opacity-60">
        {message}
      </td>
    </tr>
  );
}

export function Chargement() {
  return (
    <div className="flex items-center justify-center py-10 text-baikal-text">
      <Loader2 className="w-6 h-6 text-baikal-cyan animate-spin" />
    </div>
  );
}
