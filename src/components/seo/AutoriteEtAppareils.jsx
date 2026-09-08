/**
 * AutoriteEtAppareils.jsx - Baikal Console
 * ============================================================================
 * Deux tableaux de la page SEO :
 *   - Autorite : dernier releve Moz de nos domaines et des concurrents, toutes
 *     les mesures (DA, PA, spam, domaines referents, liens externes, nofollow,
 *     supprimes, dernier crawl), trie par DA decroissant, nous en surbrillance.
 *     Puis l'evolution du DA et des referents mois par mois des qu'il y a
 *     plus d'un releve. L'ecart qui compte : nos domaines referents contre
 *     ceux du concurrent le mieux place.
 *   - Appareils : clics Google mobile / ordinateur / tablette par mois.
 * ============================================================================
 */
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide } from '../console/etats';
import { seoService } from '../../services/seo.service';

const nb = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('fr-FR').format(Number(n)));
const pct = (n) => `${Math.round(Number(n || 0) * 100)} %`;
const dateFr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const APPAREILS = [['mobile', 'Mobile'], ['desktop', 'Ordinateur'], ['tablet', 'Tablette']];

const COLONNES = [
  ['da', 'DA', 'Domain Authority, 0-100, échelle logarithmique'],
  ['pa', 'PA', "Page Authority de la page d'accueil"],
  ['spam', 'Spam', 'Score de spam Moz, 0-100'],
  ['ref_domains', 'Domaines réf.', 'Domaines référents distincts'],
  ['external_links', 'Liens externes', 'Pages externes qui pointent vers le domaine'],
  ['nofollow_ref_domains', 'Nofollow', 'Domaines référents en nofollow'],
  ['deleted_ref_domains', 'Supprimés', 'Domaines référents perdus'],
];

export function Autorite({ appId }) {
  const { donnees, erreur, enCours } = useDonneesCachees(
    `autorite:${appId}`,
    () => seoService.getAutorite(appId),
    appId,
  );
  const mois = [...(donnees?.mois ?? [])].reverse(); // du plus recent au plus ancien
  const domaines = donnees?.domaines ?? [];
  const vide = Boolean(donnees) && mois.length === 0;

  // Dernier releve de chaque domaine, trie par DA decroissant puis referents.
  const derniers = domaines
    .map((d) => ({ domaine: d.domaine, notre: d.notre, r: d.releves[d.releves.length - 1] || null }))
    .filter((d) => d.r)
    .sort((a, b) => (b.r.da ?? -1) - (a.r.da ?? -1) || (b.r.ref_domains ?? -1) - (a.r.ref_domains ?? -1));

  return (
    <Section
      titre="Autorité"
      sousTitre="Relevé Moz mensuel, le 5 du mois — dernier relevé par domaine, du plus fort au plus faible"
    >
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {vide && <Vide message="Aucun relevé d'autorité. Les domaines suivis se déclarent dans /sites ; le premier relevé automatique tombe le 5 du mois." />}
      {donnees && !vide && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-baikal-text">
                <thead>
                  <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                    <th className="px-4 py-2">Domaine</th>
                    {COLONNES.map(([cle, libelle, titre]) => (
                      <th key={cle} className="text-right px-3 py-2 whitespace-nowrap" title={titre}>{libelle}</th>
                    ))}
                    <th className="text-right px-4 py-2 whitespace-nowrap">Dernier crawl</th>
                  </tr>
                </thead>
                <tbody>
                  {derniers.length === 0 && <LigneVide colonnes={2 + COLONNES.length} message="Aucun domaine suivi." />}
                  {derniers.map(({ domaine, notre, r }) => (
                    <tr key={domaine} className={`border-t border-baikal-border/50 ${notre ? 'bg-baikal-cyan/10 text-white' : ''}`}>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{domaine}{notre ? ' · nous' : ''}</td>
                      {COLONNES.map(([cle]) => (
                        <td key={cle} className={`text-right px-3 py-2 tabular-nums ${cle === 'da' || cle === 'ref_domains' ? 'font-semibold' : ''} ${cle === 'spam' && r.spam !== null && r.spam >= 10 ? 'text-amber-400' : ''}`}>
                          {nb(r[cle])}
                        </td>
                      ))}
                      <td className="text-right px-4 py-2 font-mono text-xs opacity-70">{dateFr(r.last_crawled)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {mois.length > 1 && (
            <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 text-xs opacity-60 uppercase tracking-wider text-baikal-text">Évolution — DA en gros, domaines référents en petit</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-baikal-text">
                  <thead>
                    <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                      <th className="px-4 py-2">Domaine</th>
                      {mois.map((m) => <th key={m} className="text-right px-3 py-2 font-mono">{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {derniers.map(({ domaine, notre }) => {
                      const d = domaines.find((x) => x.domaine === domaine);
                      const parMois = new Map((d?.releves ?? []).map((r) => [r.mois, r]));
                      return (
                        <tr key={domaine} className={`border-t border-baikal-border/50 ${notre ? 'bg-baikal-cyan/10 text-white' : ''}`}>
                          <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{domaine}{notre ? ' · nous' : ''}</td>
                          {mois.map((m) => {
                            const r = parMois.get(m);
                            return (
                              <td key={m} className="text-right px-3 py-2 tabular-nums align-top">
                                {r ? (
                                  <>
                                    <div className="text-base font-semibold">{nb(r.da)}</div>
                                    <div className="text-[11px] opacity-60">{r.ref_domains === null ? '—' : `${nb(r.ref_domains)} réf.`}</div>
                                  </>
                                ) : <span className="opacity-30">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · DA = Domain Authority Moz (0-100, échelle
            logarithmique : passer de 7 à 10 coûte plus que de 1 à 4). Les domaines référents sont le chiffre
            à suivre pour le netlinking ; un score de spam à partir de 10 est signalé en orange. Un relevé par
            mois, quota Moz oblige : ne pas ajouter de domaine sans compter les lignes.
          </p>
        </ContenuEstompe>
      )}
    </Section>
  );
}

export function Appareils({ appId }) {
  const { donnees, erreur, enCours } = useDonneesCachees(
    `appareils:${appId}`,
    () => seoService.getAppareils(appId, 12),
    appId,
  );
  const lignes = donnees?.lignes ?? [];
  const vide = Boolean(donnees) && lignes.length === 0;

  return (
    <Section titre="Mobile et ordinateur" sousTitre="Clics Google par appareil, au mois — Search Console">
      {erreur && <Erreur message={erreur} />}
      {!donnees && !erreur && <Chargement />}
      {vide && <Vide message="Aucune répartition par appareil archivée." />}
      {donnees && !vide && (
        <ContenuEstompe enCours={enCours}>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-4 py-2">Mois</th>
                  <th className="text-right px-3 py-2">Clics</th>
                  {APPAREILS.map(([k, l]) => <th key={k} className="text-right px-3 py-2">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...lignes].reverse().map((l) => (
                  <tr key={l.mois} className="border-t border-baikal-border/50">
                    <td className="px-4 py-2 font-mono text-xs">{l.mois}</td>
                    <td className="text-right px-3 py-2 tabular-nums text-white">{nb(l.total_clics)}</td>
                    {APPAREILS.map(([k]) => {
                      const a = l.appareils.find((x) => x.appareil === k);
                      return (
                        <td key={k} className="text-right px-3 py-2 tabular-nums">
                          {a ? <>{nb(a.clics)} <span className="text-xs opacity-60">({pct(a.part_clics)})</span></> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ContenuEstompe>
      )}
    </Section>
  );
}
