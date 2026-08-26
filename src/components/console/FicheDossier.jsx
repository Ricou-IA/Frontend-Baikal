/**
 * FicheDossier.jsx - Baikal Console
 * ============================================================================
 * Fiche detail d'un dossier client : socle generique (Vue / Emails / Events),
 * actions d'administration relayees vers l'EF du site (renvoyer un email,
 * re-extraire, purger les documents -- super_admin seul), et onglets
 * d'extension par site (EXTENSIONS_FICHE). Le detail etendu du site est
 * charge UNE fois et partage entre tous les onglets d'extension.
 * ============================================================================
 */
import { useState } from 'react';
import { Coins, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, Erreur } from './etats';
import { dossiersService } from '../../services/dossiers.service';
import ConfirmModal from '../ui/ConfirmModal';
import { BadgeEtape, BadgeCanal, fmtDate, fmtDateHeure, fmtEur } from './badges-clients';
import { ONGLETS_PED } from './extensions/ped';

// Onglets specifiques par site. Chaque Composant recoit
// { appId, dossierId, dossier, detail } -- detail est la reponse site-detail
// du site (null pendant le chargement).
export const EXTENSIONS_FICHE = {
  'pack-vendeur': ONGLETS_PED,
};

const TYPES_EMAIL = [
  ['magic-link-initial', 'Lien magique initial'],
  ['post-purchase', 'Post-achat'],
  ['review-request', "Demande d'avis"],
  ['cart-abandonment', 'Panier abandonné'],
  ['expiration-reminder', "Rappel d'expiration"],
];

function Ligne({ libelle, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">{libelle}</dt>
      <dd className="text-sm text-white mt-0.5">{children ?? '—'}</dd>
    </div>
  );
}

function OngletVue({ d }) {
  const aAbonnement = d && 'abo_statut' in d;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Ligne libelle="Email">{d.email || '—'}</Ligne>
      <Ligne libelle="Contact">{d.contact_nom || '—'}</Ligne>
      {'libelle' in d && <Ligne libelle="Libellé">{d.libelle || '—'}</Ligne>}
      {'apporteur' in d && d.apporteur && <Ligne libelle="Apporteur">via {d.apporteur}</Ligne>}
      <Ligne libelle="Créé le">{fmtDateHeure(d.cree_le)}</Ligne>
      <Ligne libelle="Payé le">{fmtDateHeure(d.paye_le)}</Ligne>
      <Ligne libelle="Montant">{fmtEur(d.montant_ttc)}</Ligne>
      <Ligne libelle="Stripe PI">
        {d.stripe_payment_intent_id
          ? <span className="font-mono text-xs">{d.stripe_payment_intent_id}</span>
          : '—'}
      </Ligne>
      <Ligne libelle="Origine">
        <div className="flex items-center gap-2 flex-wrap">
          <BadgeCanal canal={d.canal} attribution={d.attribution} />
          {d.attribution?.utm_source && (
            <span className="text-xs opacity-70">utm: {d.attribution.utm_source}</span>
          )}
          {d.attribution?.landing_page && (
            <span className="text-xs opacity-70 break-all">{d.attribution.landing_page}</span>
          )}
        </div>
      </Ligne>
      <Ligne libelle="Emails">{d.emails_envoyes} envoyés · {d.emails_ouverts} ouverts</Ligne>
      {aAbonnement && (
        <>
          <Ligne libelle="Abonnement">{d.abo_statut} {d.abo_plan ? `· ${d.abo_plan}` : ''}</Ligne>
          <Ligne libelle="Montant mensuel">{fmtEur(d.abo_montant_mensuel)}</Ligne>
          <Ligne libelle="Prochaine échéance">{fmtDate(d.abo_prochaine_echeance)}</Ligne>
          {d.abo_resilie_le && <Ligne libelle="Résilié le">{fmtDate(d.abo_resilie_le)}</Ligne>}
        </>
      )}
      {d.documents_purges_le && (
        <Ligne libelle="Documents">purgés le {fmtDate(d.documents_purges_le)}</Ligne>
      )}
      {d.supprime_le && <Ligne libelle="Supprimé le">{fmtDateHeure(d.supprime_le)}</Ligne>}
      {d.est_test && <Ligne libelle="Marquage">dossier de test</Ligne>}
    </dl>
  );
}

function OngletEmails({ emails }) {
  if (!emails || emails.length === 0) {
    return <p className="text-sm text-baikal-text opacity-60">Aucun email envoyé.</p>;
  }
  return (
    <table className="w-full text-sm text-baikal-text">
      <thead>
        <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
          <th className="py-2 pr-4">Envoyé le</th>
          <th className="py-2 pr-4">Type</th>
          <th className="py-2 pr-4">Statut</th>
          <th className="py-2">Ouvert le</th>
        </tr>
      </thead>
      <tbody>
        {emails.map((e, i) => (
          <tr key={i} className="border-t border-baikal-border/50">
            <td className="py-2 pr-4 whitespace-nowrap">{fmtDateHeure(e.envoye_le)}</td>
            <td className="py-2 pr-4 font-mono text-xs">{e.sujet}</td>
            <td className="py-2 pr-4">{e.statut}</td>
            <td className="py-2 whitespace-nowrap">{fmtDateHeure(e.ouvert_le)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OngletEvents({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-baikal-text opacity-60">Aucun événement.</p>;
  }
  return (
    <ul className="space-y-2">
      {events.map((ev, i) => (
        <li key={i} className="text-sm text-baikal-text flex items-start gap-3">
          <span className="whitespace-nowrap text-xs opacity-60 mt-0.5">{fmtDateHeure(ev.survenu_le)}</span>
          <div className="min-w-0">
            <span className="font-mono text-xs text-white">{ev.type}</span>
            {ev.detail?.page && (
              <span className="ml-2 text-xs opacity-60 break-all">{ev.detail.page}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function BarreActions({ appId, dossierId, dossier, isSuperAdmin, onFait }) {
  const [typeEmail, setTypeEmail] = useState(TYPES_EMAIL[0][0]);
  const [creditsPro, setCreditsPro] = useState(1);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);
  // Confirmation via la ConfirmModal maison (jamais window.confirm) :
  // { actionSite, params, titre, message, variant, confirmLabel, icon }
  const [confirmation, setConfirmation] = useState(null);

  const lancer = async (actionSite, params = {}) => {
    setEnCours(actionSite);
    setMessage(null);
    const { data, error } = await dossiersService.executerActionSite(
      appId, dossierId, actionSite, params,
    );
    setEnCours(null);
    if (error) {
      setMessage({ ok: false, texte: error.message });
    } else {
      setMessage({ ok: true, texte: data?.message || 'Action exécutée.' });
      onFait();
    }
  };

  const executer = (actionSite, params = {}, demande = null) => {
    if (demande) {
      setConfirmation({ actionSite, params, ...demande });
      return;
    }
    lancer(actionSite, params);
  };

  return (
    <div className="px-4 py-3 border-b border-baikal-border space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={typeEmail}
          onChange={(e) => setTypeEmail(e.target.value)}
          className="px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs text-baikal-text focus:outline-none focus:border-baikal-cyan"
        >
          {TYPES_EMAIL.map(([val, libelle]) => (
            <option key={val} value={val}>{libelle}</option>
          ))}
        </select>
        <button
          onClick={() => executer('resend-email', { emailAction: typeEmail })}
          disabled={enCours !== null}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          {enCours === 'resend-email' ? 'Envoi…' : "Renvoyer l'email"}
        </button>
        <button
          onClick={() => executer('re-extract', {}, {
            titre: 'RE-EXTRACTION',
            message: 'Relancer l’analyse de ce dossier sur la base des documents déjà déposés ? '
              + 'Le statut repasse en cours d’analyse et le pré-état-daté sera régénéré.',
            variant: 'warning',
            confirmLabel: 'RELANCER',
            icon: RefreshCw,
          })}
          disabled={enCours !== null}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${enCours === 're-extract' ? 'animate-spin' : ''}`} />
          {enCours === 're-extract' ? 'Relance…' : 'Re-extraire'}
        </button>
        <button
          onClick={() => executer('reset-extractions', {}, {
            titre: 'REDONNER_EXTRACTIONS',
            message: 'Redonner ses 3 extractions au client ? Il pourra relancer l’analyse lui-même depuis son interface.',
            variant: 'info',
            confirmLabel: 'REDONNER',
            icon: Coins,
          })}
          disabled={enCours !== null}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
        >
          <Coins className="w-3.5 h-3.5" />
          {enCours === 'reset-extractions' ? 'Remise…' : 'Redonner 3 extractions'}
        </button>
        {isSuperAdmin && dossier?.perimetre === 'b2b' && (
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              max="100"
              value={creditsPro}
              onChange={(e) => setCreditsPro(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-14 px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs text-baikal-text focus:outline-none focus:border-baikal-cyan"
            />
            <button
              onClick={() => executer('add-pro-credits', { credits: creditsPro }, {
                titre: 'CREDITS_PRO',
                message: `Ajouter ${creditsPro} crédit${creditsPro > 1 ? 's' : ''} au compte pro de ce dossier ?`,
                variant: 'info',
                confirmLabel: 'AJOUTER',
                icon: Coins,
              })}
              disabled={enCours !== null}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
            >
              <Coins className="w-3.5 h-3.5" />
              {enCours === 'add-pro-credits' ? 'Ajout…' : 'Crédits pro'}
            </button>
          </span>
        )}
        {isSuperAdmin && (
          <button
            onClick={() => executer('purge-documents', {}, {
              titre: 'PURGER_DOCUMENTS',
              message: 'Les fichiers et les données extraites seront supprimés DÉFINITIVEMENT. '
                + 'Le dossier, les emails et la transaction sont conservés.',
              variant: 'danger',
              confirmLabel: 'PURGER',
              icon: Trash2,
            })}
            disabled={enCours !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-500/50 text-xs text-red-300 hover:bg-red-900/20 disabled:opacity-50 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {enCours === 'purge-documents' ? 'Purge…' : 'Purger les documents'}
          </button>
        )}
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {message.texte}
        </p>
      )}
      {confirmation && (
        <ConfirmModal
          isOpen
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            const c = confirmation;
            setConfirmation(null);
            lancer(c.actionSite, c.params);
          }}
          title={confirmation.titre}
          message={confirmation.message}
          confirmLabel={confirmation.confirmLabel}
          variant={confirmation.variant}
          icon={confirmation.icon}
        />
      )}
    </div>
  );
}

export default function FicheDossier({ appId, dossierId, onClose }) {
  const [onglet, setOnglet] = useState('vue');
  const [version, setVersion] = useState(0);
  const { isSuperAdmin } = useAuth();
  const { donnees, erreur } = useDonneesCachees(
    `fiche:${appId}:${dossierId}:${version}`,
    () => dossiersService.getFiche(appId, dossierId),
    appId,
  );
  const d = donnees?.dossier;
  const extensions = EXTENSIONS_FICHE[appId] || [];
  const actionsActives = donnees?.actions === true;

  // Detail etendu du site : charge une fois, partage entre les onglets
  // d'extension. Le chargeur est neutre tant que le canal n'est pas actif.
  const { donnees: detail, erreur: erreurDetail } = useDonneesCachees(
    `detail-site:${appId}:${dossierId}:${actionsActives}:${version}`,
    () => (actionsActives && extensions.length > 0
      ? dossiersService.getDetailSite(appId, dossierId)
      : Promise.resolve({ data: null, error: null })),
    appId,
  );

  const onglets = d
    ? [
      ['vue', 'Vue'],
      ['emails', `Emails (${(donnees.emails || []).length})`],
      ...(donnees.events ? [['events', `Events (${donnees.events.length})`]] : []),
      ...(actionsActives ? extensions.map((e) => [e.id, e.label]) : []),
    ]
    : [];
  const extensionActive = extensions.find((e) => e.id === onglet) || null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-4xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {d && <BadgeEtape statut={d.statut} payeLe={d.paye_le} funnel={donnees?.funnel} />}
              <h3 className="text-white font-semibold truncate">{d?.email || d?.contact_nom || dossierId}</h3>
            </div>
            <p className="font-mono text-xs text-baikal-text opacity-60 mt-1">{dossierId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-baikal-text hover:text-white rounded-md hover:bg-baikal-bg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {d && actionsActives && (
          <BarreActions
            appId={appId}
            dossierId={dossierId}
            dossier={d}
            isSuperAdmin={isSuperAdmin}
            onFait={() => setVersion((v) => v + 1)}
          />
        )}
        {onglets.length > 0 && (
          <nav className="flex gap-1 px-4 border-b border-baikal-border overflow-x-auto">
            {onglets.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setOnglet(id)}
                className={`px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors
                  ${onglet === id
                    ? 'border-baikal-cyan text-baikal-cyan'
                    : 'border-transparent text-baikal-text hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="p-4">
          {erreur && <Erreur message={erreur} />}
          {!donnees && !erreur && <Chargement />}
          {d && onglet === 'vue' && <OngletVue d={d} />}
          {d && onglet === 'emails' && <OngletEmails emails={donnees.emails} />}
          {d && onglet === 'events' && <OngletEvents events={donnees.events} />}
          {d && extensionActive && (erreurDetail
            ? <Erreur message={erreurDetail} />
            : (
              <extensionActive.Composant
                appId={appId}
                dossierId={dossierId}
                dossier={d}
                detail={detail}
              />
            ))}

        </div>
      </div>
    </div>
  );
}
