/**
 * ComptesPro.jsx - Baikal Console
 * ============================================================================
 * Les entreprises qui achètent au site sélectionné, lues en direct dans sa
 * vue contractuelle baikal_comptes_pro (contrat comptes-pro-v1, spec
 * 2026-09-23).
 *
 * Deux populations, jamais mélangées : Clients liste l'acte commercial, le
 * dossier ; ici on liste le COMPTE, qui vit dans le temps. L'agence
 * immobilière de Pré-état-daté, le diagnostiqueur abonné de MonsieurDPE,
 * l'installateur de Conseil Solaire.
 *
 * Les colonnes affichées sont celles que le site publie : pas de bloc crédits
 * chez un site qui n'en vend pas, pas d'abonnement chez un site qui n'en a
 * pas. La capacité se lit à la présence, jamais à une colonne vide.
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import BandeauMesures from '../components/console/BandeauMesures';
import { useDonneesCachees } from '../hooks/useDonneesCachees';
import {
  Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide,
} from '../components/console/etats';
import { comptesProService } from '../services/comptesPro.service';
import { fmtDate, fmtEur } from '../components/console/badges-clients';

const PAR_PAGE = 25;

function Chip({ actif, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors
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

function ComptesProContent() {
  const { currentApp } = useApp();
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [actifsSeuls, setActifsSeuls] = useState(false);
  const [exclureTests, setExclureTests] = useState(true);
  const [inclureSupprimes, setInclureSupprimes] = useState(false);
  const [tri, setTri] = useState('raison_sociale');
  const [ordre, setOrdre] = useState('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setRecherche(saisie.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [saisie]);

  useEffect(() => {
    setPage(1);
    setTri('raison_sociale');
  }, [currentApp]);

  const criteres = useMemo(() => ({
    recherche, actifsSeuls, exclureTests, inclureSupprimes, tri, ordre, page, parPage: PAR_PAGE,
  }), [recherche, actifsSeuls, exclureTests, inclureSupprimes, tri, ordre, page]);

  const { donnees, erreur, enCours } = useDonneesCachees(
    `comptes-pro:${currentApp}:${JSON.stringify(criteres)}`,
    () => comptesProService.getListe(currentApp, criteres),
    currentApp,
  );

  const comptes = donnees?.comptes || [];
  const blocs = donnees?.blocs || {};
  const total = donnees?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));

  // Un tri demandé sur une colonne que le site ne publie pas retombe sur la
  // raison sociale, côté EF : la console suit ce qu'elle a réellement obtenu
  // plutôt que d'afficher une flèche là où rien n'a été trié.
  const triServi = donnees?.tri || tri;
  const trierPar = (colonne) => {
    if (triServi === colonne) setOrdre((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setTri(colonne); setOrdre('asc'); }
    setPage(1);
  };
  const Fleche = ({ colonne }) => (triServi === colonne
    ? <span className="opacity-60">{ordre === 'asc' ? ' ▲' : ' ▼'}</span>
    : null);

  if (donnees && donnees.disponible === false) {
    return (
      <Section titre="Comptes pro">
        <Vide message="Module non disponible pour ce site — la vue baikal_comptes_pro n'est pas publiée dans sa base. Voir docs/contrats/comptes-pro-v1.sql." />
      </Section>
    );
  }

  return (
    <Section
      titre="Comptes pro"
      sousTitre="Les entreprises qui achètent au site — lecture directe dans sa base"
    >
      {/* Les tuiles du chapitre coiffent la liste, et viennent des mesures du
          site, jamais de cette vue : une liste ne porte pas d'agrégat. */}
      <BandeauMesures appId={currentApp} chapitre="comptes_pro" />

      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-baikal-text opacity-60" />
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Société, email…"
              className="w-full pl-9 pr-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan"
            />
          </div>
          <Chip actif={actifsSeuls} onClick={() => { setActifsSeuls((a) => !a); setPage(1); }}>
            Actifs seulement
          </Chip>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Case coche={exclureTests} onChange={() => { setExclureTests((v) => !v); setPage(1); }}>
            Exclure les tests
          </Case>
          <Case coche={inclureSupprimes} onChange={() => { setInclureSupprimes((v) => !v); setPage(1); }}>
            Inclure les supprimés
          </Case>
          <span className="text-xs text-baikal-text opacity-60 ml-auto tabular-nums">
            {total} compte{total > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}

      {donnees && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2 cursor-pointer" onClick={() => trierPar('raison_sociale')}>
                    Société<Fleche colonne="raison_sociale" />
                  </th>
                  <th className="px-4 py-2">Contact</th>
                  {blocs.categorie && <th className="px-4 py-2">Catégorie</th>}
                  {blocs.credits && (
                    <th className="px-4 py-2 text-right cursor-pointer" onClick={() => trierPar('credits_stock')}>
                      Crédits<Fleche colonne="credits_stock" />
                    </th>
                  )}
                  {blocs.argent && (
                    <th className="px-4 py-2 text-right cursor-pointer" onClick={() => trierPar('ca_ttc')}>
                      CA TTC<Fleche colonne="ca_ttc" />
                    </th>
                  )}
                  {blocs.abonnement && <th className="px-4 py-2">Abonnement</th>}
                  <th className="px-4 py-2 whitespace-nowrap cursor-pointer" onClick={() => trierPar('cree_le')}>
                    Créé<Fleche colonne="cree_le" />
                  </th>
                  {blocs.activite && (
                    <th className="px-4 py-2 whitespace-nowrap cursor-pointer" onClick={() => trierPar('derniere_activite_le')}>
                      Dernière activité<Fleche colonne="derniere_activite_le" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {comptes.length === 0 && (
                  <LigneVide colonnes={8} message="Aucun compte ne correspond aux filtres." />
                )}
                {comptes.map((c) => (
                  <tr
                    key={c.compte_id}
                    className={`border-t border-baikal-border/50
                      ${c.supprime_le ? 'opacity-50' : ''} ${c.actif === false ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="text-white truncate max-w-[260px]">{c.raison_sociale}</div>
                      {c.actif === false && (
                        <span className="text-xs opacity-60">compte fermé</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="truncate max-w-[240px]">
                        {c.email || <span className="opacity-50">— pas d'email</span>}
                      </div>
                      {(c.contact_nom || c.telephone) && (
                        <div className="text-xs opacity-60 truncate max-w-[240px]">
                          {[c.contact_nom, c.telephone].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    {blocs.categorie && (
                      <td className="px-4 py-3 text-xs">{c.categorie || '—'}</td>
                    )}
                    {blocs.credits && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {new Intl.NumberFormat('fr-FR').format(c.credits_stock ?? 0)}
                        {(c.credits_achetes !== undefined || c.credits_consommes !== undefined) && (
                          <div className="text-xs opacity-60">
                            {c.credits_achetes ?? 0} achetés · {c.credits_consommes ?? 0} consommés
                          </div>
                        )}
                      </td>
                    )}
                    {blocs.argent && (
                      <td className="px-4 py-3 text-right tabular-nums">{fmtEur(c.ca_ttc)}</td>
                    )}
                    {blocs.abonnement && (
                      <td className="px-4 py-3 text-xs">
                        {c.abo_statut
                          ? (
                            <>
                              {c.abo_statut}{c.abo_plan ? ` · ${c.abo_plan}` : ''}
                              {c.abo_prochaine_echeance && (
                                <div className="opacity-60">
                                  échéance {fmtDate(c.abo_prochaine_echeance)}
                                </div>
                              )}
                            </>
                          )
                          : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(c.cree_le)}</td>
                    {blocs.activite && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.derniere_activite_le ? fmtDate(c.derniere_activite_le) : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-baikal-border disabled:opacity-40 hover:text-baikal-cyan"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular-nums text-baikal-text">{page} / {pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="p-1.5 rounded border border-baikal-border disabled:opacity-40 hover:text-baikal-cyan"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </ContenuEstompe>
      )}
    </Section>
  );
}

export default function ComptesPro() {
  return (
    <ConsoleLayout actif="comptes_pro">
      <ComptesProContent />
    </ConsoleLayout>
  );
}
