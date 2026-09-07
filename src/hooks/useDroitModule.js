/**
 * useDroitModule - Baikal Console
 * ============================================================================
 * Niveau de la personne connectee sur UN module du site selectionne :
 * { niveau: 'lecture'|'ecriture'|null, lecture: bool, ecriture: bool }.
 * super_admin -> ecriture partout. A utiliser dans les pages pour masquer
 * les actions d'ecriture (l'Edge Function les refuse de toute facon).
 * Doit etre appele sous AppProvider (donc dans le contenu d'un ConsoleLayout).
 * ============================================================================
 */
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';

export function useDroitModule(module) {
  const { niveauModule } = useAuth();
  const { currentApp } = useApp();
  const niveau = niveauModule ? niveauModule(currentApp, module) : null;
  return { niveau, lecture: niveau !== null, ecriture: niveau === 'ecriture' };
}
