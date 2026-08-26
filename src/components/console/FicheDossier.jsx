/**
 * FicheDossier.jsx - Baikal Console
 * ============================================================================
 * Fiche detail d'un dossier client : socle generique (Vue / Emails / Events)
 * + registre d'extensions par site (principe VueSite). Les onglets Events et
 * le bloc abonnement n'apparaissent que si le site expose la vue / les
 * colonnes correspondantes — la capacite se lit dans la reponse, jamais en
 * dur par site.
 * ============================================================================
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, Erreur } from './etats';
import { dossiersService } from '../../services/dossiers.service';
import { BadgeEtape, BadgeCanal, fmtDate, fmtDateHeure, fmtEur } from './badges-clients';

// Onglets specifiques par site, branches au lot 3 (PED : Documents, Resultat,
// Chat, Logs IA). Chaque Composant recoit { appId, dossierId, dossier }.
export const EXTENSIONS_FICHE = {};

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

export default function FicheDossier({ appId, dossierId, onClose }) {
  const [onglet, setOnglet] = useState('vue');
  const { donnees, erreur } = useDonneesCachees(
    `fiche:${appId}:${dossierId}`,
    () => dossiersService.getFiche(appId, dossierId),
    appId,
  );
  const d = donnees?.dossier;
  const extensions = EXTENSIONS_FICHE[appId] || [];
  const onglets = d
    ? [
      ['vue', 'Vue'],
      ['emails', `Emails (${(donnees.emails || []).length})`],
      ...(donnees.events ? [['events', `Events (${donnees.events.length})`]] : []),
      ...extensions.map((e) => [e.id, e.label]),
    ]
    : [];
  const extensionActive = extensions.find((e) => e.id === onglet) || null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-2xl my-8"
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
          {d && extensionActive && (
            <extensionActive.Composant appId={appId} dossierId={dossierId} dossier={d} />
          )}
        </div>
      </div>
    </div>
  );
}
