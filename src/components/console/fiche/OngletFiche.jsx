/**
 * OngletFiche.jsx - Baikal Console
 * ============================================================================
 * Onglet Vue : le noyau commun (contact, transaction, origine, abonnement)
 * puis les sections declarees par le site. Baikal ne connait aucun des
 * libelles declares : il les range et applique le format demande.
 * ============================================================================
 */
import { BadgeCanal, BadgeCategorie, fmtDate, fmtDateHeure, fmtEur } from '../badges-clients';
import { CLASSES_NIVEAU, formaterValeur } from './formats';

function Ligne({ libelle, className, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">{libelle}</dt>
      <dd className={`text-sm mt-0.5 ${className || 'text-white'}`}>{children ?? '—'}</dd>
    </div>
  );
}

export default function OngletFiche({ dossier: d, sections, categories }) {
  const aAbonnement = d && 'abo_statut' in d;
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Ligne libelle="Email">{d.email || '—'}</Ligne>
        <Ligne libelle="Contact">{d.contact_nom || '—'}</Ligne>
        <Ligne libelle="Catégorie">
          <BadgeCategorie categorie={d.categorie} perimetre={d.perimetre} categories={categories} />
        </Ligne>
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

      {(sections || []).map((s) => (
        <div key={s.section}>
          {s.section && (
            <h4 className="text-xs uppercase tracking-wide text-baikal-text opacity-60 mb-3 pb-1 border-b border-baikal-border">
              {s.section}
            </h4>
          )}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {s.champs.map((c, i) => (
              <Ligne
                key={`${c.libelle}-${i}`}
                libelle={c.libelle}
                className={CLASSES_NIVEAU[c.niveau] || 'text-white'}
              >
                {formaterValeur(c.valeur, c.format)}
              </Ligne>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
