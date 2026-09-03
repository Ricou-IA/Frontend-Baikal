/**
 * Clients.jsx - Baikal Console
 * ============================================================================
 * Vue transverse des dossiers clients du site selectionne, lue en direct
 * dans la vue contractuelle baikal_dossiers du site (spec 2026-08-26).
 * Le funnel est une donnee du registre (config.apps.funnel_etapes) : les
 * filtres de statut se construisent dynamiquement ; un site sans funnel
 * n'affiche que Paye/— derive de paye_le. Un site sans vue n'a pas le
 * module (etat explicite, pas une erreur).
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { useDonneesCachees } from '../hooks/useDonneesCachees';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import { dossiersService } from '../services/dossiers.service';
import Fiche from '../components/console/fiche/Fiche';
import { BadgeCanal, BadgeEtape, fmtDate } from '../components/console/badges-clients';

const PERIODES = [[null, 'Tout'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours']];
const PERIMETRES = [[null, 'Tous'], ['b2c', 'B2C'], ['b2b', 'B2B']];
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

function ClientsContent() {
  const { currentApp } = useApp();
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [periodeJours, setPeriodeJours] = useState(null);
  const [perimetre, setPerimetre] = useState(null);
  const [statuts, setStatuts] = useState([]);
  const [payesSeuls, setPayesSeuls] = useState(false);
  const [inclureMasquees, setInclureMasquees] = useState(false);
  const [exclureTests, setExclureTests] = useState(true);
  const [inclureSupprimes, setInclureSupprimes] = useState(false);
  const [page, setPage] = useState(1);
  const [ficheId, setFicheId] = useState(null);

  // Debounce de la recherche : 400 ms apres la derniere frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      setRecherche(saisie.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [saisie]);

  // Changement de site : filtres de statut et pagination remis a zero
  // (les slugs d'un funnel n'ont pas de sens sur un autre site).
  useEffect(() => {
    setStatuts([]);
    setPayesSeuls(false);
    setPage(1);
    setFicheId(null);
  }, [currentApp]);

  const criteres = useMemo(() => ({
    recherche,
    periodeJours,
    perimetre,
    statuts,
    payesSeuls,
    inclureMasquees,
    exclureTests,
    inclureSupprimes,
    page,
    parPage: PAR_PAGE,
  }), [recherche, periodeJours, perimetre, statuts, payesSeuls, inclureMasquees,
    exclureTests, inclureSupprimes, page]);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `clients:${currentApp}:${JSON.stringify(criteres)}`,
    () => dossiersService.getListe(currentApp, criteres),
    currentApp,
  );

  const funnel = donnees?.funnel || null;
  const masquees = (funnel || []).filter((e) => e.masquee_par_defaut === true);
  const dossiers = donnees?.dossiers || [];
  const total = donnees?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const aAbonnement = dossiers.some((d) => 'abo_statut' in d);
  const basculerStatut = (slug) => {
    setStatuts((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
    setPage(1);
  };

  if (donnees && donnees.disponible === false) {
    return (
      <Section titre="Clients">
        <Vide message="Module non disponible pour ce site — la vue baikal_dossiers n'est pas publiée dans sa base. Voir le contrat de données de la spec 2026-08-26." />
      </Section>
    );
  }

  return (
    <Section
      titre="Clients"
      sousTitre="Lecture directe dans la base du site — funnel défini au registre des sites"
    >
      {/* Barre de filtres */}
      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-baikal-text opacity-60" />
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Email, nom, libellé…"
              className="w-full pl-9 pr-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-baikal-text opacity-60 mr-1">Période</span>
            {PERIODES.map(([val, libelle]) => (
              <Chip key={libelle} actif={periodeJours === val}
                onClick={() => { setPeriodeJours(val); setPage(1); }}>
                {libelle}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-baikal-text opacity-60 mr-1">Type</span>
            {PERIMETRES.map(([val, libelle]) => (
              <Chip key={libelle} actif={perimetre === val}
                onClick={() => { setPerimetre(val); setPage(1); }}>
                {libelle}
              </Chip>
            ))}
          </div>
          <span className="ml-auto text-sm text-baikal-text">
            <span className="text-baikal-cyan font-semibold">{total}</span> dossiers
          </span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {funnel && funnel.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-baikal-text opacity-60 mr-1">Statut</span>
              {funnel.map((e) => (
                <Chip key={e.slug} actif={statuts.includes(e.slug)}
                  onClick={() => basculerStatut(e.slug)}>
                  {e.libelle}
                </Chip>
              ))}
              {/* Derive de paye_le, pas d'une etape : un client payant peut
                  etre dans une etape d'apres-vente (envoye, a traiter…). */}
              <Chip actif={payesSeuls}
                onClick={() => { setPayesSeuls((v) => !v); setPage(1); }}>
                Ont payé
              </Chip>
            </div>
          )}
          {masquees.length > 0 && (
            <Case coche={inclureMasquees}
              onChange={(e) => { setInclureMasquees(e.target.checked); setPage(1); }}>
              Inclure {masquees.map((e) => `${e.libelle.toLowerCase()}s`).join(' + ')}
            </Case>
          )}
          <Case coche={exclureTests}
            onChange={(e) => { setExclureTests(e.target.checked); setPage(1); }}>
            Exclure tests
          </Case>
          <Case coche={inclureSupprimes}
            onChange={(e) => { setInclureSupprimes(e.target.checked); setPage(1); }}>
            Inclure supprimés
          </Case>
        </div>
      </div>

      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {donnees && donnees.disponible !== false && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Contact</th>
                  <th className="px-4 py-2">Statut</th>
                  {aAbonnement && <th className="px-4 py-2">Abonnement</th>}
                  <th className="px-4 py-2 whitespace-nowrap">Créé</th>
                  <th className="px-4 py-2 whitespace-nowrap">Payé le</th>
                  <th className="px-4 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {dossiers.length === 0 && (
                  <LigneVide colonnes={aAbonnement ? 7 : 6}
                    message="Aucun dossier ne correspond aux filtres." />
                )}
                {dossiers.map((d) => (
                  <tr
                    key={d.dossier_id}
                    onClick={() => setFicheId(d.dossier_id)}
                    className={`border-t border-baikal-border/50 cursor-pointer hover:bg-baikal-bg/50
                      ${d.supprime_le ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs opacity-60">
                      {d.dossier_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white truncate max-w-[280px]">
                        {d.email || <span className="opacity-50">— pas d'email</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {d.contact_nom && (
                          <span className="text-xs opacity-60 truncate max-w-[140px]">{d.contact_nom}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs opacity-70">
                          <Mail className="w-3 h-3" />
                          {d.emails_envoyes} / {d.emails_ouverts}
                        </span>
                        <BadgeCanal canal={d.canal} attribution={d.attribution} />
                        {d.apporteur && (
                          <span className="text-xs text-baikal-cyan">via {d.apporteur}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <BadgeEtape statut={d.statut} payeLe={d.paye_le} funnel={funnel} />
                    </td>
                    {aAbonnement && (
                      <td className="px-4 py-3 text-xs">
                        {d.abo_statut
                          ? <>{d.abo_statut}{d.abo_plan ? ` · ${d.abo_plan}` : ''}</>
                          : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(d.cree_le)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(d.paye_le)}</td>
                    <td className="px-4 py-3 text-xs opacity-70">
                      {d.perimetre === 'b2b' ? 'B2B' : 'B2C'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-baikal-text">
            <span>
              Page {page} sur {pages}
              {total > 0 && (
                <> · {(page - 1) * PAR_PAGE + 1}–{Math.min(page * PAR_PAGE, total)} / {total}</>
              )}
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
      )}

      {ficheId && (
        <Fiche appId={currentApp} dossierId={ficheId} onClose={() => setFicheId(null)} />
      )}
    </Section>
  );
}

export default function Clients() {
  return (
    <ConsoleLayout actif="clients">
      <ClientsContent />
    </ConsoleLayout>
  );
}
