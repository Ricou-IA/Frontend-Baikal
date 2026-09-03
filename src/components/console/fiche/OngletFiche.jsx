/**
 * OngletFiche.jsx - Baikal Console
 * ============================================================================
 * Onglet Vue : le noyau commun (contact, transaction, origine, abonnement)
 * puis les sections declarees par le site. Baikal ne connait aucun des
 * libelles declares : il les range et applique le format demande.
 *
 * Un champ declare porteur d'un niveau (attention/danger) se rend en encart
 * pleine largeur plutot qu'en ligne de grille ordinaire -- c'est ce qui
 * remplace les encarts d'alerte codes en dur (spec section 3.3).
 * ============================================================================
 */
import { BadgeCanal, BadgeCategorie, fmtDate, fmtDateHeure, fmtEur } from '../badges-clients';
import { CLASSES_NIVEAU_ENCART, formaterValeur } from './formats';

function Ligne({ libelle, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">{libelle}</dt>
      <dd className="text-sm mt-0.5 text-white">{children ?? '—'}</dd>
    </div>
  );
}

// Rendu d'un champ declare porteur d'un niveau : encart pleine largeur (la
// grille est en grid-cols-1 sm:grid-cols-2), teinte selon le niveau, libelle
// en casse normale -- ce sont des phrases, pas des intitules de champ. Un
// niveau non reconnu retombe sur l'habillage "attention" plutot que de ne
// rendre aucune couleur.
function Encart({ libelle, niveau, children }) {
  const classes = CLASSES_NIVEAU_ENCART[niveau] || CLASSES_NIVEAU_ENCART.attention;
  return (
    <div className={`sm:col-span-2 p-4 rounded-md border ${classes}`}>
      <dt className="text-sm font-medium break-words">{libelle}</dt>
      <dd className="text-sm mt-1 break-words">{children ?? '—'}</dd>
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
              c.niveau ? (
                <Encart key={`${c.libelle}-${i}`} libelle={c.libelle} niveau={c.niveau}>
                  {formaterValeur(c.valeur, c.format)}
                </Encart>
              ) : (
                <Ligne key={`${c.libelle}-${i}`} libelle={c.libelle}>
                  {formaterValeur(c.valeur, c.format)}
                </Ligne>
              )
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
