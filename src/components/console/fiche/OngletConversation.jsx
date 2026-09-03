/**
 * OngletConversation.jsx - Baikal Console
 * ============================================================================
 * Onglet Chat : les echanges, dans l'ordre chronologique. Le role vient du
 * contrat (client / assistant / agent) -- aucun produit n'est nomme ici.
 *
 * Deux vides distincts : total nul (<Vide> seul) et page hors bornes (message
 * distinct suivi du pied de pagination pour revenir) -- c'est ici que ca
 * compte le plus : le tri est `survenu_le ASC`, donc la page 1 montre les
 * echanges les plus anciens et une page hors bornes sans retour rendrait les
 * plus recents definitivement inatteignables au-dela de la premiere page.
 *
 * Cle composite (identifiant + role) : la vue PED degroupe une ligne
 * question/reponse en deux lignes par UNION ALL, qui peuvent partager le
 * meme message_id -- le role les distingue toujours, l'index sert de repli
 * quand le site ne fournit pas d'identifiant.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';
import Pagination from './Pagination';

const STYLE_ROLE = {
  client: 'bg-baikal-bg border-baikal-border',
  assistant: 'bg-baikal-surface border-baikal-cyan/40',
  agent: 'bg-amber-900/10 border-amber-500/40',
};
const NOM_ROLE = { client: 'Client', assistant: 'Assistant', agent: 'Équipe' };

export default function OngletConversation({
  lignes, total, page, parPage, onPage, vide,
}) {
  if (total === 0) return <Vide message={vide} />;
  if (!lignes || lignes.length === 0) {
    return (
      <div className="space-y-3">
        <Vide message="Aucune ligne sur cette page." />
        <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {lignes.map((m, i) => (
          <li
            key={m.message_id ? `${m.message_id}:${m.role}` : i}
            className={`p-3 rounded-md border ${STYLE_ROLE[m.role] || STYLE_ROLE.client}`}
          >
            <div className="flex items-center gap-2 text-xs text-baikal-text opacity-60">
              <span className="text-white">{NOM_ROLE[m.role] || m.role}</span>
              <span>{fmtDateHeure(m.survenu_le)}</span>
              {m.canal && <span>· {m.canal}</span>}
              {m.contexte && <span className="break-all">· {m.contexte}</span>}
            </div>
            <p className="text-sm text-baikal-text mt-1 whitespace-pre-wrap break-words">{m.contenu}</p>
          </li>
        ))}
      </ul>
      <Pagination total={total} page={page} parPage={parPage} onPage={onPage} />
    </div>
  );
}
