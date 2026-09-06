/**
 * AutoriteEtAppareils.jsx - Baikal Console
 * ============================================================================
 * Deux tableaux de la page SEO :
 *   - Autorite : releve mensuel Moz de nos domaines et des concurrents, un
 *     mois par colonne, DA en gros et domaines referents en petit, nous en
 *     surbrillance. L'ecart qui compte : nos domaines referents contre ceux
 *     du concurrent le mieux place.
 *   - Appareils : clics Google mobile / ordinateur / tablette par mois.
 * ============================================================================
 */
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { Chargement, ContenuEstompe, Erreur, LigneVide, Section, Vide } from '../console/etats';
import { seoService } from '../../services/seo.service';

const nb = (n) => new Intl.NumberFormat('fr-FR').format(Number(n || 0));
const pct = (n) => `${Math.round(Number(n || 0) * 100)} %`;
const APPAREILS = [['mobile', 'Mobile'], ['desktop', 'Ordinateur'], ['tablet', 'Tablette']];

export function Autorite({ appId }) {
  const { donnees, erreur, enCours } = useDonneesCachees(
    `autorite:${appId}`,
    () => seoService.getAutorite(appId),
    appId,
  );
  const mois = donnees?.mois ?? [];
  const domaines = donnees?.domaines ?? [];
  const vide = Boolean(donnees) && mois.length === 0;

  return (
    <Section
      titre="Autorité"
      sousTitre="Relevé Moz mensuel, le 5 du mois — Domain Authority en gros, domaines référents en petit"
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
                    {mois.map((m) => <th key={m} className="text-right px-3 py-2 font-mono">{m}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {domaines.map((d) => {
                    const parMois = new Map(d.releves.map((r) => [r.mois, r]));
                    return (
                      <tr key={d.domaine} className={`border-t border-baikal-border/50 ${d.notre ? 'bg-baikal-cyan/10 text-white' : ''}`}>
                        <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{d.domaine}{d.notre ? ' · nous' : ''}</td>
                        {mois.map((m) => {
                          const r = parMois.get(m);
                          return (
                            <td key={m} className="text-right px-3 py-2 tabular-nums align-top">
                              {r ? (
                                <>
                                  <div className="text-base font-semibold">{r.da === null ? '—' : nb(r.da)}</div>
                                  <div className="text-[11px] opacity-60">{r.ref_domains === null ? '—' : `${nb(r.ref_domains)} réf.`}{r.spam !== null && r.spam >= 10 ? ` · spam ${r.spam}` : ''}</div>
                                </>
                              ) : <span className="opacity-30">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {domaines.length === 0 && <LigneVide colonnes={1 + mois.length} message="Aucun domaine suivi." />}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-baikal-text opacity-50 leading-relaxed">
            <strong className="opacity-100">Lecture</strong> · DA = Domain Authority Moz (0-100, échelle
            logarithmique : passer de 7 à 10 coûte plus que de 1 à 4). Les domaines référents sont le chiffre
            à suivre pour le netlinking. Un relevé par mois, quota Moz oblige : ne pas ajouter de domaine sans
            compter les lignes.
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
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
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
