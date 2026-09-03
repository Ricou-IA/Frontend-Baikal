/**
 * Fiche.jsx - Baikal Console
 * ============================================================================
 * Fiche d'une transaction : huit onglets identiques pour tous les produits,
 * lus dans les vues contractuelles du site. Un onglet dont le site n'a pas la
 * vue ne s'affiche pas -- ce n'est pas une erreur, c'est une capacite absente.
 *
 * Chaque onglet charge son contenu a l'ouverture (useDonneesCachees garde le
 * deja-vu) : la fiche ne tire jamais huit lots de donnees d'un coup.
 * ============================================================================
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDonneesCachees } from '../../../hooks/useDonneesCachees';
import { dossiersService } from '../../../services/dossiers.service';
import { Chargement, Erreur } from '../etats';
import { BadgeEtape } from '../badges-clients';
import { COLONNES, ONGLETS_FICHE } from './colonnes';
import { formaterValeur } from './formats';
import BarreActions from './BarreActions';
import OngletBlocs from './OngletBlocs';
import OngletConversation from './OngletConversation';
import OngletFiche from './OngletFiche';
import OngletListe from './OngletListe';
import OngletTimeline from './OngletTimeline';

const VIDES = {
  documents: 'Aucune pièce déposée sur ce dossier.',
  resultats: "Aucun livrable produit pour l'instant.",
  emails: 'Aucun email envoyé.',
  chat: 'Aucun échange dans l’outil.',
  ia: 'Aucun appel IA sur ce dossier.',
  donnees: 'Aucune donnée brute exposée par ce site.',
  events: 'Aucun événement.',
};

function ContenuOnglet({ appId, dossierId, onglet, version, onOuvrir }) {
  const [page, setPage] = useState(1);
  // Un seul ContenuOnglet vit pour toute la fiche (aucun `key` par onglet
  // cote appelant, voir plus bas) : changer d'onglet ne le demonte pas, ce
  // qui laisse le cache de useDonneesCachees survivre aux allers-retours
  // entre onglets au lieu d'etre jete a chaque fois. Contrepartie : la page
  // doit etre remise a 1 nous-memes des que l'onglet change, sinon un onglet
  // rouvert herite de la page ou on s'etait arrete sur le precedent -- page
  // hors bornes garantie si le nouvel onglet a moins de lignes.
  const [ongletRendu, setOngletRendu] = useState(onglet.cle);
  if (onglet.cle !== ongletRendu) {
    setOngletRendu(onglet.cle);
    setPage(1);
  }
  const { donnees, erreur } = useDonneesCachees(
    `onglet:${appId}:${dossierId}:${onglet.cle}:${page}:${version}`,
    () => dossiersService.getOnglet(appId, dossierId, onglet.cle, page),
    // Le scope de useDonneesCachees vide l'affichage pendant le rendu des
    // qu'il change (voir son propre commentaire) : detourne ici sur la cle
    // d'onglet, en plus de appId, pour qu'un changement d'onglet efface les
    // lignes de l'ancien avant de peindre. Sans ca, elles s'afficheraient un
    // instant sous les colonnes du nouvel onglet, le temps que la requete
    // reponde -- un cache-hit reste instantane, lui, car useEffect les
    // remplace par la valeur en cache avant que le navigateur ait peint.
    `${appId}:${onglet.cle}`,
  );
  if (erreur) return <Erreur message={erreur} />;
  if (!donnees) return <Chargement />;

  const commun = {
    lignes: donnees.lignes || [],
    total: donnees.total || 0,
    page: donnees.page || 1,
    parPage: donnees.parPage || 50,
    onPage: setPage,
    vide: VIDES[onglet.cle],
  };
  if (onglet.rendu === 'conversation') return <OngletConversation {...commun} />;
  if (onglet.rendu === 'timeline') return <OngletTimeline {...commun} />;
  if (onglet.rendu === 'blocs') return <OngletBlocs {...commun} />;

  // Le total vient du serveur, somme sur TOUT le dossier : la recette de
  // parite ne tolere aucun ecart sur ce chiffre, et une somme locale ne
  // parlerait que de la page affichee. Il n'apparait que si le site publie la
  // colonne -- aucune cle d'onglet n'est testee ici.
  const coutDossier = donnees.agregats?.cout_usd;
  // La part de page n'a de sens qu'a plus d'une page : sinon elle repeterait
  // le total mot pour mot.
  const coutPage = commun.total > commun.parPage
    ? (donnees.lignes || []).reduce((s, l) => s + (Number(l.cout_usd) || 0), 0)
    : null;
  return (
    <div className="space-y-3">
      {Number.isFinite(coutDossier) && commun.total > 0 && (
        <p className="text-sm text-baikal-text">
          Coût total :{' '}
          <span className="text-white font-semibold">
            {formaterValeur(coutDossier, 'dollar')}
          </span>
          {coutPage !== null && (
            <span className="opacity-60">
              {' '}· dont cette page : {formaterValeur(coutPage, 'dollar')}
            </span>
          )}
        </p>
      )}
      <OngletListe
        {...commun}
        colonnes={COLONNES[onglet.cle] || []}
        onOuvrir={onOuvrir ? (ligne) => onOuvrir(onglet.cle, ligne) : null}
      />
    </div>
  );
}

export default function Fiche({ appId, dossierId, onClose }) {
  const [onglet, setOnglet] = useState('vue');
  const [version, setVersion] = useState(0);
  const [erreurFichier, setErreurFichier] = useState(null);
  const { isSuperAdmin } = useAuth();
  const { donnees, erreur } = useDonneesCachees(
    `fiche:${appId}:${dossierId}:${version}`,
    () => dossiersService.getFiche(appId, dossierId),
    appId,
  );
  const d = donnees?.dossier;
  const vues = donnees?.vues || [];
  const compteurs = donnees?.compteurs || {};

  // L'ouverture d'un fichier passe par le site : lui seul sait signer une URL.
  const ouvrir = async (cleOnglet, ligne) => {
    setErreurFichier(null);
    const cible = cleOnglet === 'resultats' ? 'resultat' : 'document';
    const id = ligne.resultat_id || ligne.document_id;
    const { data, error } = await dossiersService.getFichier(appId, dossierId, cible, id);
    if (error) {
      setErreurFichier(error.message);
      return;
    }
    // L'URL vient telle quelle d'un autre projet : meme garde que le format
    // `lien` de formats.jsx, seuls http(s) sont ouverts. C'est le seul retour
    // de relais qui atteint le navigateur sans passer par la normalisation du
    // manifeste -- un javascript: ou un data: y arriverait sinon intact.
    const url = typeof data?.url === 'string' ? data.url.trim() : '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noreferrer');
    } else if (url) {
      setErreurFichier('Le site a renvoyé un lien de fichier non ouvrable (schéma refusé).');
    } else {
      // Reponse du site sans erreur HTTP mais sans URL non plus (200 avec un
      // corps inattendu) : silence cote reseau, mais pas cote ecran.
      setErreurFichier('Le site n’a pas renvoyé de lien de fichier.');
    }
  };

  const onglets = d
    ? ONGLETS_FICHE.filter((o) => o.cle === 'vue' || vues.includes(o.cle))
    : [];
  const actif = onglets.find((o) => o.cle === onglet) || onglets[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-4xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {d && <BadgeEtape statut={d.statut} payeLe={d.paye_le} funnel={donnees?.funnel} />}
              <h3 className="text-white font-semibold truncate">
                {d?.email || d?.contact_nom || dossierId}
              </h3>
            </div>
            <p className="font-mono text-xs text-baikal-text opacity-60 mt-1">{dossierId}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 text-baikal-text hover:text-white rounded-md hover:bg-baikal-bg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {d && (
          <BarreActions
            appId={appId}
            dossierId={dossierId}
            actions={donnees.actions}
            isSuperAdmin={isSuperAdmin}
            onFait={() => setVersion((v) => v + 1)}
          />
        )}

        {onglets.length > 0 && (
          <nav
            role="tablist"
            className="flex gap-1 px-4 border-b border-baikal-border overflow-x-auto"
          >
            {onglets.map((o) => {
              const n = compteurs[o.cle];
              return (
                <button
                  key={o.cle}
                  role="tab"
                  aria-selected={actif?.cle === o.cle}
                  onClick={() => { setOnglet(o.cle); setErreurFichier(null); }}
                  className={`px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors
                    ${actif?.cle === o.cle
                      ? 'border-baikal-cyan text-baikal-cyan'
                      : 'border-transparent text-baikal-text hover:text-white'}
                    ${n === 0 ? 'opacity-50' : ''}`}
                >
                  {o.libelle}{n !== undefined ? ` (${n})` : ''}
                </button>
              );
            })}
          </nav>
        )}

        <div className="p-4 space-y-3">
          {erreur && <Erreur message={erreur} />}
          {donnees?.actionsErreur && (
            <p className="text-xs text-amber-300">
              Actions indisponibles : {donnees.actionsErreur}
            </p>
          )}
          {erreurFichier && <Erreur message={erreurFichier} />}
          {!donnees && !erreur && <Chargement />}
          {d && actif?.cle === 'vue' && (
            <OngletFiche dossier={d} sections={donnees.sections} />
          )}
          {d && actif && actif.cle !== 'vue' && (
            <ContenuOnglet
              appId={appId}
              dossierId={dossierId}
              onglet={actif}
              version={version}
              onOuvrir={['documents', 'resultats'].includes(actif.cle) ? ouvrir : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
