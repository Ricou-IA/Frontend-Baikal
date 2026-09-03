/**
 * OngletConversation.jsx - Baikal Console
 * ============================================================================
 * Onglet Chat : les echanges, dans l'ordre chronologique. Le role vient du
 * contrat (client / assistant / agent) -- aucun produit n'est nomme ici.
 * ============================================================================
 */
import { Vide } from '../etats';
import { fmtDateHeure } from '../badges-clients';

const STYLE_ROLE = {
  client: 'bg-baikal-bg border-baikal-border',
  assistant: 'bg-baikal-surface border-baikal-cyan/40',
  agent: 'bg-amber-900/10 border-amber-500/40',
};
const NOM_ROLE = { client: 'Client', assistant: 'Assistant', agent: 'Équipe' };

export default function OngletConversation({ lignes, vide }) {
  if (!lignes || lignes.length === 0) return <Vide message={vide} />;
  return (
    <ul className="space-y-3">
      {lignes.map((m, i) => (
        <li
          key={m.message_id || i}
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
  );
}
