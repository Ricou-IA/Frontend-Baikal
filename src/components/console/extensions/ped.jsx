/**
 * ped.jsx - Baikal Console
 * ============================================================================
 * Onglets d'extension Pre-etat-date de la fiche client : Documents, Resultat,
 * Chat, Logs IA, Donnees. Tous consomment la reponse `detail` de
 * pv-admin-dossiers (relayee par admin-dossiers, action site-detail) -- les
 * URLs signees du storage n'existent que la (TTL 1 h), jamais recomposees ici.
 * ============================================================================
 */
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Chargement, Vide } from '../etats';
import { fmtDateHeure, fmtEur } from '../badges-clients';

function fmtOctets(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(4)} $`;
}

function EnAttente({ detail, children }) {
  if (!detail) return <Chargement />;
  return children;
}

function OngletDocuments({ detail, dossier }) {
  return (
    <EnAttente detail={detail}>
      {dossier.documents_purges_le && (
        <p className="mb-3 text-xs text-amber-300">
          Documents purgés le {fmtDateHeure(dossier.documents_purges_le)} — les fichiers ont été supprimés.
        </p>
      )}
      {(!detail?.documents || detail.documents.length === 0) ? (
        <Vide message="Aucun document sur ce dossier." />
      ) : (
        <table className="w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
              <th className="py-2 pr-4">Fichier</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Pages</th>
              <th className="py-2 pr-4">Taille</th>
              <th className="py-2 pr-4">Confiance IA</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {detail.documents.map((doc, i) => (
              <tr key={doc.id ?? i} className="border-t border-baikal-border/50">
                <td className="py-2 pr-4 max-w-[220px] truncate" title={doc.original_filename}>
                  {doc.normalized_filename || doc.original_filename}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{doc.document_type || '—'}</td>
                <td className="py-2 pr-4">{doc.page_count ?? '—'}</td>
                <td className="py-2 pr-4">{fmtOctets(doc.file_size_bytes)}</td>
                <td className="py-2 pr-4">
                  {doc.ai_confidence != null ? `${Math.round(Number(doc.ai_confidence) * 100)} %` : '—'}
                </td>
                <td className="py-2">
                  {doc.signed_url && (
                    <a
                      href={doc.signed_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-baikal-cyan hover:underline text-xs"
                    >
                      Ouvrir <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {detail?.documents?.length > 0 && (
        <p className="mt-2 text-xs text-baikal-text opacity-60">
          Liens valables {Math.round((detail.signed_url_ttl_seconds || 3600) / 60)} minutes.
        </p>
      )}
    </EnAttente>
  );
}

function OngletResultat({ detail }) {
  const d = detail?.dossier;
  return (
    <EnAttente detail={detail}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Pré-état-daté (PDF)</dt>
          <dd className="text-sm mt-0.5">
            {detail?.pdf_signed_url ? (
              <a
                href={detail.pdf_signed_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-baikal-cyan hover:underline"
              >
                Ouvrir le PDF <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : <span className="text-baikal-text opacity-60">Pas encore généré</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Lien de partage notaire</dt>
          <dd className="text-sm mt-0.5">
            {detail?.share_url ? (
              <a href={detail.share_url} target="_blank" rel="noreferrer"
                className="text-baikal-cyan hover:underline break-all text-xs">
                {detail.share_url}
              </a>
            ) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Consulté par le notaire</dt>
          <dd className="text-sm text-white mt-0.5">{fmtDateHeure(d?.notary_accessed_at)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">Téléchargements</dt>
          <dd className="text-sm text-white mt-0.5">{d?.download_count ?? 0}</dd>
        </div>
      </dl>
    </EnAttente>
  );
}

function OngletChat({ detail }) {
  return (
    <EnAttente detail={detail}>
      {(!detail?.chat_logs || detail.chat_logs.length === 0) ? (
        <Vide message="Aucun échange de chat sur ce dossier." />
      ) : (
        <ul className="space-y-3">
          {detail.chat_logs.map((c, i) => (
            <li key={c.id ?? i} className="text-sm">
              <div className="text-xs text-baikal-text opacity-60">
                {fmtDateHeure(c.created_at)} · {c.page_path || '—'}
              </div>
              <div className="text-white mt-0.5">{c.question}</div>
              <div className="text-baikal-text mt-0.5 whitespace-pre-wrap">{c.answer}</div>
            </li>
          ))}
        </ul>
      )}
    </EnAttente>
  );
}

function OngletLogsIa({ detail }) {
  return (
    <EnAttente detail={detail}>
      {(!detail?.ai_logs || detail.ai_logs.length === 0) ? (
        <Vide message="Aucun appel IA sur ce dossier." />
      ) : (
        <>
          <p className="mb-2 text-sm text-baikal-text">
            Coût total : <span className="text-white font-semibold">{fmtUsd(detail.ai_total_cost_usd)}</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Modèle</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Coût</th>
                  <th className="py-2">Latence</th>
                </tr>
              </thead>
              <tbody>
                {detail.ai_logs.map((l, i) => (
                  <tr key={l.id ?? i} className={`border-t border-baikal-border/50 ${l.error ? 'text-red-300' : ''}`}>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs">{fmtDateHeure(l.created_at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{l.model_used || l.model || '—'}</td>
                    <td className="py-2 pr-4 text-xs">{l.prompt_type || '—'}</td>
                    <td className="py-2 pr-4">{l.total_tokens ?? '—'}</td>
                    <td className="py-2 pr-4">{fmtUsd(l.cost_usd)}</td>
                    <td className="py-2">{l.latency_ms != null ? `${l.latency_ms} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </EnAttente>
  );
}

const CHAMPS_FINANCIERS = [
  ['charges_courantes', 'Charges courantes', 'eur'],
  ['charges_calculees', 'Charges calculées', 'eur'],
  ['charges_budget_n1', 'Charges budget N-1', 'eur'],
  ['charges_exceptionnelles', 'Charges exceptionnelles', 'eur'],
  ['fonds_travaux_balance', 'Fonds travaux (solde)', 'eur'],
  ['provisions_exigibles', 'Provisions exigibles', 'eur'],
  ['impaye_vendeur', 'Impayé vendeur', 'eur'],
  ['dette_copro_fournisseurs', 'Dette fournisseurs', 'eur'],
  ['tantiemes_lot', 'Tantièmes du lot', 'brut'],
  ['tantiemes_totaux', 'Tantièmes totaux', 'brut'],
];

function OngletDonnees({ detail }) {
  const d = detail?.dossier;
  const ecart = d?.charges_discrepancy_pct != null ? Number(d.charges_discrepancy_pct) : null;
  return (
    <EnAttente detail={detail}>
      {ecart != null && ecart >= 20 && (
        <div className="mb-3 p-3 bg-amber-900/20 border border-amber-500/50 rounded-md flex items-start gap-2 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Écart {Math.round(ecart)} % entre charges calculées ({fmtEur(d.charges_calculees)})
            et charges budget N-1 ({fmtEur(d.charges_budget_n1)}). Tantièmes probablement à vérifier.
          </span>
        </div>
      )}
      <table className="w-full text-sm text-baikal-text mb-4">
        <tbody>
          {CHAMPS_FINANCIERS.map(([cle, libelle, format]) => (
            <tr key={cle} className="border-t border-baikal-border/50 first:border-t-0">
              <td className="py-1.5 pr-4 text-xs opacity-70">{libelle}</td>
              <td className="py-1.5 text-white">
                {format === 'eur' ? fmtEur(d?.[cle]) : (d?.[cle] ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {['extracted_data', 'validated_data'].map((cle) => (
        d?.[cle] ? (
          <details key={cle} className="mb-2">
            <summary className="text-xs text-baikal-text opacity-70 cursor-pointer select-none">
              {cle === 'extracted_data' ? 'Données extraites (JSON)' : 'Données validées (JSON)'}
            </summary>
            <pre className="mt-1 p-2 bg-baikal-bg border border-baikal-border rounded text-[11px] text-baikal-text overflow-x-auto max-h-64 overflow-y-auto">
              {JSON.stringify(d[cle], null, 2)}
            </pre>
          </details>
        ) : null
      ))}
    </EnAttente>
  );
}

export const ONGLETS_PED = [
  { id: 'documents', label: 'Documents', Composant: OngletDocuments },
  { id: 'resultat', label: 'Résultat', Composant: OngletResultat },
  { id: 'chat', label: 'Chat', Composant: OngletChat },
  { id: 'logs-ia', label: 'Logs IA', Composant: OngletLogsIa },
  { id: 'donnees', label: 'Données', Composant: OngletDonnees },
];
