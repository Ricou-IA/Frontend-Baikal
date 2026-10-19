/**
 * SelectionMail - Mailing (lot 4)
 * ============================================================================
 * Cocher des lignes (Prospects, Clients, Comptes) pour écrire à ces personnes
 * seulement. La sélection est mémorisée par adresse : elle survit au
 * changement de page et de filtres, et se vide au changement de site.
 * « Écrire à ces N personnes » ouvre l'éditeur de campagne en mode liste ;
 * les adresses passent par l'état de navigation, jamais par l'URL.
 * ============================================================================
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { useDroitModule } from '../../../hooks/useDroitModule';

// Miroir de EMAILS_MAX (_shared/mailing/segment.ts).
export const SELECTION_MAX = 50;

const normal = (e) => String(e || '').trim().toLowerCase();

export function useSelectionMail(appId) {
  const [emails, setEmails] = useState([]);
  const [appRendu, setAppRendu] = useState(appId);
  // Changement de site : vidage pendant le rendu (meme principe que les pages).
  if (appId !== appRendu) {
    setAppRendu(appId);
    setEmails([]);
  }
  const coche = (e) => emails.includes(normal(e));
  const basculer = (e) => {
    const n = normal(e);
    if (!n) return;
    setEmails((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]));
  };
  // « Tout cocher » ne porte que sur la page affichee.
  const basculerPage = (liste) => {
    const page = (liste || []).map(normal).filter(Boolean);
    const toutes = page.length > 0 && page.every((n) => emails.includes(n));
    setEmails((l) => (toutes ? l.filter((x) => !page.includes(x)) : [...new Set([...l, ...page])]));
  };
  const pageCochee = (liste) => {
    const page = (liste || []).map(normal).filter(Boolean);
    return page.length > 0 && page.every((n) => emails.includes(n));
  };
  return { emails, coche, basculer, basculerPage, pageCochee, vider: () => setEmails([]) };
}

// Case d'une ligne : le clic ne doit pas ouvrir la fiche de la ligne.
export function CaseLigne({ selection, email }) {
  if (!email) return <td className="px-3 py-3 w-8" />;
  return (
    <td className="px-3 py-3 w-8" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={selection.coche(email)} onChange={() => selection.basculer(email)}
        className="accent-baikal-cyan cursor-pointer" aria-label={`Sélectionner ${email}`} />
    </td>
  );
}

export function CaseEntete({ selection, emails }) {
  return (
    <th className="px-3 py-2 w-8">
      <input type="checkbox" checked={selection.pageCochee(emails)} onChange={() => selection.basculerPage(emails)}
        className="accent-baikal-cyan cursor-pointer" aria-label="Sélectionner la page" />
    </th>
  );
}

export function BandeauSelection({ selection, population }) {
  const navigate = useNavigate();
  const { ecriture } = useDroitModule('mailing');
  const n = selection.emails.length;
  if (n === 0) return null;
  const trop = n > SELECTION_MAX;
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 flex-wrap px-4 py-2.5 rounded-lg border border-baikal-cyan/40 bg-baikal-surface">
      <span className="text-sm text-white tabular-nums">
        {n} sélectionné{n > 1 ? 's' : ''}
      </span>
      {trop && (
        <span className="text-xs text-amber-300">
          {SELECTION_MAX} au plus : au-delà, utilisez le ciblage d'une campagne.
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        <button type="button" onClick={selection.vider}
          className="px-3 py-1.5 text-xs rounded-md text-baikal-text hover:text-white">Vider</button>
        {ecriture && (
          <button type="button" disabled={trop}
            onClick={() => navigate('/mailing', { state: { selection: { population, emails: selection.emails } } })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 disabled:opacity-40">
            <Send className="w-4 h-4" />Écrire à {n > 1 ? `ces ${n} personnes` : 'cette personne'}
          </button>
        )}
      </span>
    </div>
  );
}
