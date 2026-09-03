/**
 * Pagination.jsx - Baikal Console
 * ============================================================================
 * Pied de pagination partage par les onglets pagines (Documents, Resultat,
 * Emails, Logs IA, Chat, Donnees, Events -- tout sauf Vue, qui n'est pas une
 * liste). Ne se rend pas quand il n'y a rien a parcourir.
 *
 * Le garde-fou regarde `page` autant que `total` : une page courante > 1
 * garde le pied visible meme si le total a fondu jusqu'a tenir sur une seule
 * page (une action qui reduit fortement une liste pendant que l'utilisateur
 * est plus loin) -- sinon le seul bouton qui permettrait de revenir
 * disparaitrait avec la donnee qui le justifiait.
 * ============================================================================
 */
export default function Pagination({ total, page, parPage, onPage }) {
  const pages = Math.max(1, Math.ceil(total / parPage));
  if (pages <= 1 && page <= 1) return null;
  return (
    <div className="flex items-center justify-between text-xs text-baikal-text">
      <span>
        Page {page} sur {pages} · {(page - 1) * parPage + 1}–
        {Math.min(page * parPage, total)} / {total}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 rounded-md border border-baikal-border disabled:opacity-40 hover:border-baikal-cyan"
        >
          Précédent
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-2 py-1 rounded-md border border-baikal-border disabled:opacity-40 hover:border-baikal-cyan"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
