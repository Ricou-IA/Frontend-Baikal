/**
 * Prospects.jsx - Baikal Console
 * ============================================================================
 * La base adressable du site selectionne, lue en direct dans sa vue
 * contractuelle baikal_prospects (spec 2026-08-27). Baikal ne stocke aucun
 * prospect. Une seule liste : le metier est un filtre, pas un onglet.
 * Un site sans vue n'a pas le module (etat explicite, pas une erreur).
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Search, Upload,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import KpiCarte from '../components/console/KpiCarte';
import FicheProspect from '../components/console/FicheProspect';
import ImportProspectsDialog from '../components/console/ImportProspectsDialog';
import { prospectsService } from '../services/prospects.service';
import {
  BadgeClient, BadgeMetier, BadgeStatut, fmtDate, fmtNombre,
} from '../components/console/badges-prospects';

const STATUTS = [
  ['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['relance', 'Relancé'],
  ['repondu', 'A répondu'], ['refus', 'Refus'], ['desinscrit', 'Désinscrit'],
];
const PROVENANCES = [
  ['annuaire_public', 'Annuaire public'], ['acquisition_propre', 'Acquisition propre'],
  ['import', 'Import'], ['scrape', 'Scrape'],
];
const PAR_PAGE = 25;

function Chip({ actif, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors
        ${actif
          ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
          : 'border-baikal-border text-baikal-text hover:text-white'}`}
    >
      {children}
    </button>
  );
}

function Case({ coche, onChange, children }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-baikal-text cursor-pointer select-none">
      <input type="checkbox" checked={coche} onChange={onChange} className="accent-baikal-cyan" />
      {children}
    </label>
  );
}

function ProspectsContent() {
  const { currentApp } = useApp();
  const [saisieRecherche, setSaisieRecherche] = useState('');
  const [recherche, setRecherche] = useState('');
  const [saisieDepartement, setSaisieDepartement] = useState('');
  const [departement, setDepartement] = useState('');
  const [metiers, setMetiers] = useState([]);
  const [statuts, setStatuts] = useState([]);
  const [provenances, setProvenances] = useState([]);
  const [avecTelephone, setAvecTelephone] = useState(false);
  const [exclureTests, setExclureTests] = useState(true);
  const [exclureClients, setExclureClients] = useState(true);
  const [page, setPage] = useState(1);
  // Email du prospect dont la fiche laterale est ouverte, null si aucune.
  const [emailOuvert, setEmailOuvert] = useState(null);
  // Dialogue d'import CSV ouvert ou non — un seul a la fois, comme emailOuvert.
  const [importOuvert, setImportOuvert] = useState(false);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);
  // Incremente par FicheProspect apres une ecriture reussie (statut, note,
  // desinscrire, supprimer). Une simple valeur dans le tableau de
  // dependances de l'effet de chargement ci-dessous : elle herite
  // gratuitement de sa garde de peremption `actif`, contrairement a un
  // charger() imperatif qui devrait re-implementer sa propre protection
  // contre une reponse perimee arrivant apres une plus recente.
  const [versionListe, setVersionListe] = useState(0);

  // Changement de site : vidage PENDANT le rendu, pas dans un effet — meme
  // principe que scopeRendu dans useDonneesCachees (utilise par Clients.jsx) :
  // React reexecute le composant avant de peindre, donc aucune image, meme
  // fugace, ne montre les prospects de l'ancien site sous le nom du nouveau.
  // Sur cette page les lignes sont cliquables : une action prise dans cette
  // fenetre marquerait le mauvais prospect (site errone), pas juste un
  // chiffre faux. metiers/statuts/provenances ne sont PAS remis a zero :
  // contrairement au funnel de /clients (config.apps.funnel_etapes, propre a
  // chaque site), ce sont des taxonomies PARTAGEES (admin.metier, funnel de
  // statut fixe cote backend) qui gardent le meme sens d'un site a l'autre —
  // seuls la page et le panneau ouvert n'en gardent pas.
  const [appRendu, setAppRendu] = useState(currentApp);
  if (currentApp !== appRendu) {
    setAppRendu(currentApp);
    setDonnees(null);
    setErreur(null);
    setChargement(true);
    setPage(1);
    setEmailOuvert(null);
    // Meme risque que la fiche ci-dessus : appId est une prop reactive du
    // dialogue d'import, un envoi lance apres bascule partirait sur le
    // site nouvellement selectionne sans que rien ne le signale.
    setImportOuvert(false);
  }

  // Debounce commun aux deux champs texte : sans lui, chaque frappe (dans
  // l'un OU l'autre champ) declenche trois agregats sur 65 000 lignes. Un
  // seul minuteur pour les deux plutot qu'un par champ, pour que les deux
  // aient le meme comportement — ils commettent ensemble 300 ms apres la
  // derniere frappe, quel que soit le champ qui l'a recue.
  useEffect(() => {
    const t = setTimeout(() => {
      setRecherche(saisieRecherche);
      setDepartement(saisieDepartement);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [saisieRecherche, saisieDepartement]);

  // Chargement, avec garde de peremption : meme principe que l'`actif` de
  // useDonneesCachees (transpose ici sans le hook, cette page n'a pas de cle
  // de cache) — sans lui, taper "31" peut faire arriver APRES coup la
  // reponse de "3" (rejetee par normaliserCriteres, donc non filtree,
  // ~64 850 lignes) et ecraser celle de "31" (~1 487) : l'ordre d'arrivee
  // reseau n'est jamais garanti. Fusionne avec l'ancien `charger` (qui
  // n'avait pas d'autre appelant que cet effet) : plus simple qu'un
  // useCallback qui n'apportait rien.
  useEffect(() => {
    let actif = true;
    setChargement(true);
    prospectsService.getListe(currentApp, {
      recherche, metiers, statuts, provenances, departement,
      avecTelephone, exclureTests, exclureClients, page, parPage: PAR_PAGE,
    }).then(({ data, error }) => {
      if (!actif) return;
      if (error) { setErreur(error.message); setDonnees(null); }
      else { setDonnees(data); setErreur(null); }
      setChargement(false);
    });
    return () => { actif = false; };
  }, [currentApp, recherche, metiers, statuts, provenances, departement,
      avecTelephone, exclureTests, exclureClients, page, versionListe]);

  function basculer(liste, setListe, valeur) {
    setListe(liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur]);
    setPage(1);
  }

  const pages = useMemo(
    () => Math.max(1, Math.ceil((donnees?.total ?? 0) / PAR_PAGE)),
    [donnees?.total],
  );

  if (erreur) return <Erreur message={erreur} />;
  if (chargement && !donnees) return <Chargement />;
  if (donnees && donnees.disponible === false) {
    return <Vide message="Ce site n'expose pas de base de prospects." />;
  }

  const aTelephone = (donnees.colonnes || []).includes('telephone');

  return (
    <Section
      titre="Prospects"
      sousTitre="Lecture directe dans la base du site — le métier est un filtre, pas un onglet"
      // Meme garde que la barre d'actions de la fiche : proposer un import
      // qui echouerait a coup sur (site sans interface d'ecriture) est pire
      // que ne rien proposer.
      action={donnees.actions === true && (
        <button
          onClick={() => setImportOuvert(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-baikal-border
            text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan"
        >
          <Upload className="w-4 h-4" />
          Importer un CSV
        </button>
      )}
    >
      {/* KPI : le parc ENTIER du site (tests exclus), pas la selection filtree
          ci-dessous (qui exclut aussi les clients par defaut). Les deux
          nombres ne coincident pas — volontairement, voir le texte sous le
          titre : c'est le defaut que ce lot corrige, pas un bug de cet ecran. */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold text-baikal-text">Le parc du site</h3>
          <p className="text-xs text-baikal-text opacity-60">
            Vivier adressable complet, adresses de test exclues — ne coïncide pas avec le
            total filtré ci-dessous (qui exclut aussi les clients par défaut), volontairement.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCarte label="Adressables"
            valeur={<span className="tabular-nums">{fmtNombre(donnees.kpi?.adressables)}</span>} />
          <KpiCarte label="Nouveaux"
            valeur={<span className="tabular-nums">{fmtNombre(donnees.kpi?.nouveaux)}</span>} accent="info" />
          <KpiCarte label="Contactés"
            valeur={<span className="tabular-nums">{fmtNombre(donnees.kpi?.contactes)}</span>} />
          <KpiCarte label="Convertis"
            valeur={<span className="tabular-nums">{fmtNombre(donnees.kpi?.convertis)}</span>} accent="success" />
          <KpiCarte label="Désinscrits"
            valeur={<span className="tabular-nums">{fmtNombre(donnees.kpi?.desinscrits)}</span>} accent="danger" />
        </div>
      </div>

      {/* Chips metier : construits depuis donnees.metiers (donnee serveur,
          table admin.metier), jamais une liste figee ici — voir BadgeMetier
          pour le repli gris d'un slug hors table. */}
      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-baikal-text opacity-60 mr-1">Métier</span>
          {(donnees.metiers || []).map((m) => (
            <Chip key={m.slug} actif={metiers.includes(m.slug)}
              onClick={() => basculer(metiers, setMetiers, m.slug)}>
              {m.libelle} · <span className="tabular-nums">{fmtNombre(donnees.compteurs?.[m.slug] ?? 0)}</span>
            </Chip>
          ))}
        </div>
      </div>

      {/* Barre de filtres */}
      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-baikal-text opacity-60" />
            <input
              value={saisieRecherche}
              onChange={(e) => setSaisieRecherche(e.target.value)}
              placeholder="Email, nom, commune…"
              className="w-full pl-9 pr-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan"
            />
          </div>
          <input
            value={saisieDepartement}
            onChange={(e) => setSaisieDepartement(e.target.value)}
            placeholder="Dépt"
            maxLength={3}
            className="w-20 px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white uppercase placeholder:text-baikal-text/50 placeholder:normal-case focus:outline-none focus:border-baikal-cyan"
          />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-baikal-text opacity-60 mr-1">Statut</span>
            {STATUTS.map(([slug, libelle]) => (
              <Chip key={slug} actif={statuts.includes(slug)}
                onClick={() => basculer(statuts, setStatuts, slug)}>
                {libelle}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-baikal-text opacity-60 mr-1">Provenance</span>
            {PROVENANCES.map(([slug, libelle]) => (
              <Chip key={slug} actif={provenances.includes(slug)}
                onClick={() => basculer(provenances, setProvenances, slug)}>
                {libelle}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Pas de colonne telephone chez ce site -> pas de case, sur le meme
              principe que l'abonnement sur /clients : la capacite se lit a la
              presence de la colonne. */}
          {aTelephone && (
            <Case coche={avecTelephone}
              onChange={(e) => { setAvecTelephone(e.target.checked); setPage(1); }}>
              Avec téléphone
            </Case>
          )}
          {/* exclureTests/exclureClients valent true par defaut (masques) : la
              case "Voir..." doit donc partir decochee et s'inverser au clic —
              binder coche={exclureTests} afficherait une case cochee par
              defaut pour "voir les tests" alors qu'ils sont caches. */}
          <Case coche={!exclureTests}
            onChange={(e) => { setExclureTests(!e.target.checked); setPage(1); }}>
            Voir les tests
          </Case>
          <Case coche={!exclureClients}
            onChange={(e) => { setExclureClients(!e.target.checked); setPage(1); }}>
            Voir les clients
          </Case>
        </div>
      </div>

      <p className="text-sm text-baikal-text">
        <span className="text-baikal-cyan font-semibold tabular-nums">{fmtNombre(donnees.total)}</span> prospects correspondent à ces filtres
      </p>

      <ContenuEstompe enCours={chargement}>
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Métier</th>
                <th className="px-4 py-2">Spécialité</th>
                <th className="px-4 py-2">Commune</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 whitespace-nowrap">Dernier contact</th>
              </tr>
            </thead>
            <tbody>
              {(donnees.prospects || []).length === 0 && (
                <LigneVide colonnes={6} message="Aucun prospect ne correspond aux filtres." />
              )}
              {(donnees.prospects || []).map((p) => (
                <tr
                  key={p.prospect_id ?? p.email}
                  onClick={() => setEmailOuvert(p.email)}
                  className="border-t border-baikal-border/50 cursor-pointer hover:bg-baikal-bg/50"
                >
                  <td className="px-4 py-3">
                    <div className="text-white truncate max-w-[240px]">{p.nom_affiche || p.email}</div>
                    <div className="text-xs opacity-60 truncate max-w-[240px]">{p.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <BadgeMetier slug={p.metier} metiers={donnees.metiers} />
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {Array.isArray(p.specialite) && p.specialite.length > 0 ? (
                      <>
                        {p.specialite[0]}
                        {p.specialite.length > 1 ? ` +${p.specialite.length - 1}` : ''}
                      </>
                    ) : <span className="opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.commune || <span className="opacity-50">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <BadgeClient depuis={p.client_depuis} />
                      <BadgeStatut statut={p.statut} />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(p.dernier_contact_le)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-baikal-text">
          <span>
            Page <span className="tabular-nums">{page}</span> sur <span className="tabular-nums">{pages}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 border border-baikal-border rounded-md hover:border-baikal-cyan hover:text-baikal-cyan disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="p-2 border border-baikal-border rounded-md hover:border-baikal-cyan hover:text-baikal-cyan disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </ContenuEstompe>

      {emailOuvert && (
        <FicheProspect
          appId={currentApp}
          email={emailOuvert}
          actions={donnees.actions}
          metiers={donnees.metiers}
          onFerme={() => setEmailOuvert(null)}
          onChange={() => setVersionListe((v) => v + 1)}
        />
      )}

      {importOuvert && (
        <ImportProspectsDialog
          appId={currentApp}
          metiers={donnees.metiers}
          onFerme={() => setImportOuvert(false)}
          // Meme mecanisme de rafraichissement que la fiche ci-dessus : un
          // seul chemin de rafraichissement pour toute la page.
          onImporte={() => setVersionListe((v) => v + 1)}
        />
      )}
    </Section>
  );
}

export default function Prospects() {
  return (
    <ConsoleLayout actif="prospects">
      <ProspectsContent />
    </ConsoleLayout>
  );
}
