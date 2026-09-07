/**
 * LectureSeule - Baikal Console
 * ============================================================================
 * Bandeau affiche en tete d'un module quand la personne n'a que la lecture
 * sur ce site : les actions sont masquees, et l'Edge Function les refuserait.
 * ============================================================================
 */
import { Eye } from 'lucide-react';

export default function LectureSeule({ module = 'ce module' }) {
  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-900/10 text-amber-200 text-sm">
      <Eye className="w-4 h-4 shrink-0" />
      <span>Lecture seule sur {module} pour ce site : consultation possible, aucune action.</span>
    </div>
  );
}
