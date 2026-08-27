/**
 * FicheProspect.jsx - Baikal Console
 * ============================================================================
 * Fiche detail d'un prospect : identite et coordonnees lues en direct dans
 * baikal_prospects (getFiche), barre d'ecriture relayee vers prospect_action
 * du site (executerAction). Masquee entierement si le site n'expose pas
 * d'interface d'ecriture -- proposer des boutons qui echoueraient a coup sur
 * est pire que n'en proposer aucun.
 *
 * Colonnes optionnelles testees par PRESENCE (`!== undefined`), jamais par
 * valeur : un site dont la vue omet une colonne ne doit rien afficher: une
 * valeur nulle sur une colonne existante affiche un tiret, une colonne
 * absente n'affiche rien du tout (sinon le tiret ment sur ce qui a ete
 * demande au site).
 *
 * "Supprimer" n'apparait que pour provenance import/scrape : une ligne
 * d'annuaire (annuaire_public) reviendrait au prochain cron de toute facon,
 * et la fonction du site la refuse. Pour ne plus adresser un annuaire,
 * c'est "Desinscrire", qui est definitif -- l'opt-out prime sur tout statut
 * stocke ensuite (y compris repasser le statut a "contacte").
 * ============================================================================
 */
import { useState } from 'react';
import { Ban, Trash2, X } from 'lucide-react';
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, Erreur, Vide } from './etats';
import { prospectsService } from '../../services/prospects.service';
import ConfirmModal from '../ui/ConfirmModal';
import {
  BadgeClient, BadgeMetier, BadgeStatut, fmtDate, fmtNombre,
} from './badges-prospects';

// "desinscrit" est volontairement absent de cette liste : voir le
// commentaire au-dessus du select dans BarreActions.
const STATUTS = [
  ['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['relance', 'Relancé'],
  ['repondu', 'A répondu'], ['refus', 'Refus'],
];

const PROVENANCES = {
  annuaire_public: 'Annuaire public',
  acquisition_propre: 'Acquisition propre',
  import: 'Import',
  scrape: 'Scrape',
};

function Ligne({ libelle, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-baikal-text opacity-60">{libelle}</dt>
      <dd className="text-sm text-white mt-0.5">{children ?? '—'}</dd>
    </div>
  );
}

function BarreActions({
  appId, email, prospect, onFait,
}) {
  const [note, setNote] = useState(prospect.note ?? '');
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);
  // Confirmation via la ConfirmModal maison (jamais window.confirm, regle du
  // projet) : { actionSite, params, titre, message, variant, confirmLabel, icon }
  const [confirmation, setConfirmation] = useState(null);

  // Une ligne d'annuaire ou d'acquisition propre n'existe pas dans le
  // receptacle du site : la fonction prospect_action('supprimer', ...) la
  // refuserait de toute facon. Meme regle cote client, pour ne jamais
  // proposer un bouton voue a l'echec.
  const peutSupprimer = prospect.provenance === 'import' || prospect.provenance === 'scrape';
  const estDesinscrit = prospect.statut === 'desinscrit';

  const lancer = async (actionSite, params = {}) => {
    setEnCours(actionSite);
    setMessage(null);
    const { data, error } = await prospectsService.executerAction(appId, email, actionSite, params);
    setEnCours(null);
    if (error) {
      setMessage({ ok: false, texte: error.message });
    } else {
      setMessage({ ok: true, texte: data?.message || 'Action exécutée.' });
      onFait();
    }
  };

  return (
    <div className="px-4 py-3 border-b border-baikal-border space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-baikal-text opacity-60">Statut</label>
        {/* "desinscrit" n'est jamais une option choisissable ici : c'est un
            geste a part (bouton "Desinscrire" ci-dessous), qui ecrit EN PLUS
            dans la table d'opt-out du site -- la seule que la campagne
            consulte pour decider qui adresser. Si ce select pouvait ecrire
            "desinscrit" tout seul, l'ecran afficherait "Desinscrit" sans que
            l'opt-out existe, et le prochain envoi partirait quand meme :
            l'ecran mentirait. Une fois desinscrit (opt-out pose), le select
            est desactive et n'affiche que cet etat : on ne peut pas
            re-inscrire quelqu'un depuis cette fiche, seul le site le peut. */}
        <select
          value={prospect.statut}
          onChange={(e) => lancer('statut', { valeur: e.target.value })}
          disabled={enCours !== null || estDesinscrit}
          className="px-2 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-xs text-baikal-text focus:outline-none focus:border-baikal-cyan disabled:opacity-50"
        >
          {estDesinscrit ? (
            <option value="desinscrit">Désinscrit</option>
          ) : STATUTS.map(([slug, libelle]) => (
            <option key={slug} value={slug}>{libelle}</option>
          ))}
        </select>
        <button
          onClick={() => setConfirmation({
            actionSite: 'desinscrire',
            params: {},
            titre: 'DESINSCRIRE_PROSPECT',
            message: "Cette adresse ne sera plus jamais adressée par ce site. L'action est définitive.",
            variant: 'danger',
            confirmLabel: 'DESINSCRIRE',
            icon: Ban,
          })}
          disabled={enCours !== null}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-red-300 hover:border-red-500/50 disabled:opacity-50"
        >
          <Ban className="w-3.5 h-3.5" />
          Désinscrire
        </button>
        {peutSupprimer && (
          <button
            onClick={() => setConfirmation({
              actionSite: 'supprimer',
              params: {},
              titre: 'SUPPRIMER_PROSPECT',
              message: 'Ce prospect sera supprimé définitivement de la base du site.',
              variant: 'danger',
              confirmLabel: 'SUPPRIMER',
              icon: Trash2,
            })}
            disabled={enCours !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-500/50 text-xs text-red-300 hover:bg-red-900/20 disabled:opacity-50 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs text-baikal-text opacity-60">Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Note interne, visible uniquement dans Baikal…"
          className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan"
        />
        <button
          onClick={() => lancer('note', { valeur: note })}
          disabled={enCours !== null}
          className="px-2.5 py-1.5 rounded-md border border-baikal-border text-xs text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan disabled:opacity-50"
        >
          {enCours === 'note' ? 'Enregistrement…' : 'Enregistrer la note'}
        </button>
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

export default function FicheProspect({
  appId, email, actions, metiers, onFerme, onChange,
}) {
  const [version, setVersion] = useState(0);
  const { donnees, erreur } = useDonneesCachees(
    `fiche-prospect:${appId}:${email}:${version}`,
    () => prospectsService.getFiche(appId, email),
    appId,
  );
  const pro = donnees?.prospect;

  // Une action reussie rafraichit CETTE fiche (version, refetch via
  // useDonneesCachees) ET la liste derriere elle (onChange) : sans le
  // second appel la table garde l'ancien statut et l'ecran ment sur ce que
  // l'operateur vient de faire.
  const onFait = () => {
    setVersion((v) => v + 1);
    onChange();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={onFerme}
    >
      <div
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {pro && <BadgeMetier slug={pro.metier} metiers={metiers} />}
              {pro && <BadgeClient depuis={pro.client_depuis} />}
              <h3 className="text-white font-semibold truncate">{pro?.nom_affiche || email}</h3>
            </div>
            <p className="font-mono text-xs text-baikal-text opacity-60 mt-1 break-all">{email}</p>
          </div>
          <button
            onClick={onFerme}
            className="p-1.5 text-baikal-text hover:text-white rounded-md hover:bg-baikal-bg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {pro && actions === true && (
          <BarreActions appId={appId} email={email} prospect={pro} onFait={onFait} />
        )}

        <div className="p-4">
          {erreur && <Erreur message={erreur} />}
          {!donnees && !erreur && <Chargement />}
          {donnees && !pro && !erreur && <Vide message="Prospect introuvable." />}
          {pro && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pro.telephone !== undefined && (
                <Ligne libelle="Téléphone">{pro.telephone || '—'}</Ligne>
              )}
              {pro.site_web !== undefined && (
                <Ligne libelle="Site web">{pro.site_web || '—'}</Ligne>
              )}
              {pro.commune !== undefined && (
                <Ligne libelle="Commune">{pro.commune || '—'}</Ligne>
              )}
              {pro.code_postal !== undefined && (
                <Ligne libelle="Code postal">{pro.code_postal || '—'}</Ligne>
              )}
              {pro.siret !== undefined && pro.siret && (
                <Ligne libelle="SIRET">
                  <span className="font-mono text-xs">{pro.siret}</span>
                </Ligne>
              )}
              {pro.specialite !== undefined && (
                <Ligne libelle="Spécialités">
                  {/* Colonne presente (teste ci-dessus) n'implique pas valeur
                      non nulle : le contrat autorise une colonne absente OU
                      une valeur nulle, ce sont deux choses differentes. DPE
                      ne renvoie jamais null ici, mais un futur site pourrait
                      publier la colonne nullable sans violer le contrat --
                      (pro.specialite || []) evite un .length sur null qui
                      ferait planter toute la fiche, pas seulement la ligne. */}
                  {(pro.specialite || []).length > 0 ? (
                    <ul className="list-disc list-inside space-y-0.5">
                      {pro.specialite.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  ) : '—'}
                </Ligne>
              )}
              {pro.provenance !== undefined && (
                <Ligne libelle="Provenance">{PROVENANCES[pro.provenance] || pro.provenance}</Ligne>
              )}
              <Ligne libelle="Statut"><BadgeStatut statut={pro.statut} /></Ligne>
              {pro.dernier_contact_le !== undefined && (
                <Ligne libelle="Dernier contact">{fmtDate(pro.dernier_contact_le)}</Ligne>
              )}
              {pro.nb_contacts !== undefined && (
                <Ligne libelle="Contacts">
                  <span className="tabular-nums">{fmtNombre(pro.nb_contacts)}</span>
                </Ligne>
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
