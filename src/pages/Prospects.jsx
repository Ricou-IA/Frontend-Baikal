/**
 * Prospects.jsx - Baikal Console
 * ============================================================================
 * La base adressable du site selectionne, lue en direct dans sa vue
 * contractuelle baikal_prospects (spec 2026-08-27). Baikal ne stocke aucun
 * prospect. Une seule liste : le metier est un filtre, pas un onglet.
 * Un site sans vue n'a pas le module (etat explicite, pas une erreur).
 * ============================================================================
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import KpiCarte from '../components/console/KpiCarte';
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
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [metiers, setMetiers] = useState([]);
  const [statuts, setStatuts] = useState([]);
  const [provenances, setProvenances] = useState([]);
  const [departement, setDepartement] = useState('');
  const [avecTelephone, setAvecTelephone] = useState(false);
  const [exclureTests, setExclureTests] = useState(true);
  const [exclureClients, setExclureClients] = useState(true);
  const [page, setPage] = useState(1);
  // Stocke seulement pour l'instant : le panneau qui le lit (FicheProspect)
  // arrive tache 9.
  // eslint-disable-next-line no-unused-vars
  const [emailOuvert, setEmailOuvert] = useState(null);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

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
    setData(null);
    setErreur(null);
    setChargement(true);
    setPage(1);
    setEmailOuvert(null);
  }

  // Debounce : sans lui, chaque frappe declenche trois agregats sur
  // 65 000 lignes.
  useEffect(() => {
    const t = setTimeout(() => { setRecherche(saisie); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [saisie]);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data: d, error } = await prospectsService.getListe(currentApp, {
      recherche, metiers, statuts, provenances, departement,
      avecTelephone, exclureTests, exclureClients, page, parPage: PAR_PAGE,
    });
    if (error) { setErreur(error.message); setData(null); }
    else { setData(d); setErreur(null); }
    setChargement(false);
  }, [currentApp, recherche, metiers, statuts, provenances, departement,
      avecTelephone, exclureTests, exclureClients, page]);

  useEffect(() => { charger(); }, [charger]);

  function basculer(liste, setListe, valeur) {
    setListe(liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur]);
    setPage(1);
  }

  const pages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / PAR_PAGE)),
    [data?.total],
  );

  if (erreur) return <Erreur message={erreur} />;
  if (chargement && !data) return <Chargement />;
  if (data && data.disponible === false) {
    return <Vide message="Ce site n'expose pas de base de prospects." />;
  }

  const aTelephone = (data.colonnes || []).includes('telephone');

  return (
    <Section
      titre="Prospects"
      sousTitre="Lecture directe dans la base du site — le métier est un filtre, pas un onglet"
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
            valeur={<span className="tabular-nums">{fmtNombre(data.kpi?.adressables)}</span>} />
          <KpiCarte label="Nouveaux"
            valeur={<span className="tabular-nums">{fmtNombre(data.kpi?.nouveaux)}</span>} accent="info" />
          <KpiCarte label="Contactés"
            valeur={<span className="tabular-nums">{fmtNombre(data.kpi?.contactes)}</span>} />
          <KpiCarte label="Convertis"
            valeur={<span className="tabular-nums">{fmtNombre(data.kpi?.convertis)}</span>} accent="success" />
          <KpiCarte label="Désinscrits"
            valeur={<span className="tabular-nums">{fmtNombre(data.kpi?.desinscrits)}</span>} accent="danger" />
        </div>
      </div>

      {/* Chips metier : construits depuis data.metiers (donnee serveur, table
          admin.metier), jamais une liste figee ici — voir BadgeMetier pour le
          repli gris d'un slug hors table. */}
      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-baikal-text opacity-60 mr-1">Métier</span>
          {(data.metiers || []).map((m) => (
            <Chip key={m.slug} actif={metiers.includes(m.slug)}
              onClick={() => basculer(metiers, setMetiers, m.slug)}>
              {m.libelle} · <span className="tabular-nums">{fmtNombre(data.compteurs?.[m.slug] ?? 0)}</span>
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
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Email, nom, commune…"
              className="w-full pl-9 pr-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan"
            />
          </div>
          <input
            value={departement}
            onChange={(e) => { setDepartement(e.target.value); setPage(1); }}
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
        <span className="text-baikal-cyan font-semibold tabular-nums">{fmtNombre(data.total)}</span> prospects correspondent à ces filtres
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
              {(data.prospects || []).length === 0 && (
                <LigneVide colonnes={6} message="Aucun prospect ne correspond aux filtres." />
              )}
              {(data.prospects || []).map((p) => (
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
                    <BadgeMetier slug={p.metier} metiers={data.metiers} />
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
