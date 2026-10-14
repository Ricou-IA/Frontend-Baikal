/**
 * Mailing.jsx - Baikal Console
 * ============================================================================
 * Le mailing du site selectionne (specs 2026-10-13 et 2026-10-14) :
 *  - Campagnes : liste, composition (entonnoir commun, redaction assistee),
 *    suivi ; ponctuelles ou continues.
 *  - Statistiques : delivrabilite de TOUS les mails du site.
 * Baikal garde la campagne ; qui a recu, ouvert, clique ou s'est desinscrit
 * est lu en direct chez le site (module mailing-v1). Un site sans module n'a
 * pas le mailing (etat, pas erreur).
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { BarChart3, Mail, Plus, Repeat } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { Chargement, Erreur, LigneVide, Section, Vide } from '../components/console/etats';
import LectureSeule from '../components/console/LectureSeule';
import { useDroitModule } from '../hooks/useDroitModule';
import { mailingService } from '../services/mailing.service';
import EditeurCampagne from '../components/console/mailing/EditeurCampagne';
import DetailCampagne from '../components/console/mailing/DetailCampagne';
import StatsMails from '../components/console/mailing/StatsMails';
import {
  Badge, BadgeCampagne, Bouton, ETAPES, fmtDateHeure, fmtNombre, fmtTaux, POPULATIONS,
} from '../components/console/mailing/commun';

function Onglet({ actif, onClick, icone: Icone, children }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors
        ${actif ? 'border-baikal-cyan text-baikal-cyan' : 'border-transparent text-baikal-text hover:text-white'}`}>
      <Icone className="w-4 h-4" />{children}
    </button>
  );
}

// « Engagé, Lead » pour une campagne sur l'entonnoir ; la population sinon.
function libelleCible(c) {
  if (c.population !== 'audience') return POPULATIONS[c.population] || c.population;
  const etapes = c.criteres?.etapes || [];
  if (etapes.length === 0) return 'Toute l\'audience';
  return etapes.map((e) => ETAPES.find((x) => x.id === e)?.libelle || e).join(', ');
}

function MailingContent() {
  const { currentApp } = useApp();
  const { ecriture } = useDroitModule('mailing');
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0);
  const [onglet, setOnglet] = useState('campagnes');
  // vue : null = liste ; {mode:'editer', campagne} ; {mode:'suivre', id}
  const [vue, setVue] = useState(null);

  // Changement de site : vidage pendant le rendu (meme principe que /prospect),
  // jamais une image des campagnes de l'ancien site sous le nom du nouveau.
  const [appRendu, setAppRendu] = useState(currentApp);
  if (currentApp !== appRendu) {
    setAppRendu(currentApp);
    setEtat(null);
    setErreur(null);
    setVue(null);
  }

  useEffect(() => {
    let actif = true;
    mailingService.etat(currentApp).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message); else { setEtat(data); setErreur(null); }
    });
    return () => { actif = false; };
  }, [currentApp, version]);

  // Rafraichissement de la liste tant qu'une campagne part.
  const enCours = (etat?.campagnes || []).some((c) => c.statut === 'en_cours');
  useEffect(() => {
    if (!enCours || vue || onglet !== 'campagnes') return undefined;
    const t = setInterval(() => setVersion((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, [enCours, vue, onglet]);

  const rafraichir = () => setVersion((v) => v + 1);

  if (erreur) return <Erreur message={erreur} />;
  if (!etat) return <Chargement />;
  if (etat.disponible === false) {
    return <Vide message="Ce site n'a pas installé le module mailing (docs/contrats/mailing-v1.sql)." />;
  }

  if (vue?.mode === 'editer') {
    return (
      <EditeurCampagne
        appId={currentApp}
        etat={etat}
        campagne={vue.campagne}
        ecriture={ecriture}
        onChange={rafraichir}
        onFerme={(id, suivre) => { setVue(id && suivre ? { mode: 'suivre', id } : null); rafraichir(); }}
      />
    );
  }
  if (vue?.mode === 'suivre') {
    return (
      <DetailCampagne
        appId={currentApp}
        campagneId={vue.id}
        ecriture={ecriture}
        onChange={rafraichir}
        onFerme={() => { setVue(null); rafraichir(); }}
        onModifier={() => {
          const c = (etat.campagnes || []).find((x) => x.id === vue.id);
          if (c) setVue({ mode: 'editer', campagne: c });
        }}
      />
    );
  }

  const campagnes = etat.campagnes || [];
  const e = etat.envoi || {};
  const sansPopulation = Object.keys(etat.populations || {}).length === 0;

  return (
    <>
      {!ecriture && <LectureSeule module="Mailing" />}
      <Section
        titre="Mailing"
        action={ecriture && onglet === 'campagnes' && !sansPopulation && (
          <Bouton variante="primaire" onClick={() => setVue({ mode: 'editer', campagne: null })}>
            <Plus className="w-4 h-4" />Nouvelle campagne
          </Bouton>
        )}
      >
        <div className="flex items-center gap-2 border-b border-baikal-border">
          <Onglet actif={onglet === 'campagnes'} onClick={() => setOnglet('campagnes')} icone={Mail}>Campagnes</Onglet>
          <Onglet actif={onglet === 'stats'} onClick={() => setOnglet('stats')} icone={BarChart3}>Statistiques</Onglet>
        </div>

        {onglet === 'stats' && <StatsMails appId={currentApp} />}

        {onglet === 'campagnes' && (
          <>
            <div className="flex items-center gap-x-6 gap-y-1 flex-wrap text-xs text-baikal-text">
              <span><span className="opacity-60">Expéditeur</span>{' '}
                {e.expediteur ? <span className="text-white">{e.expediteur}</span> : <Badge couleur="red">à renseigner dans Paramétrage</Badge>}
              </span>
              <span><span className="opacity-60">Envoyés aujourd'hui</span>{' '}
                <span className="text-white tabular-nums">{fmtNombre(e.envoyes_aujourdhui)} / {fmtNombre(e.plafond_jour)}</span>
              </span>
              {!e.cle && <Badge couleur="red">clé Resend absente</Badge>}
              {e.ecriture === false && <Badge couleur="amber">relais mailing du site non configuré</Badge>}
            </div>

            {sansPopulation ? (
              <Vide message="Ce site ne publie pas encore son audience (docs/contrats/audience-v1.sql)." />
            ) : (
              <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
                <table data-mobile="1,3,4" className="w-full text-sm text-baikal-text">
                  <thead>
                    <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                      <th className="px-4 py-2">Campagne</th>
                      <th className="px-4 py-2">Cible</th>
                      <th className="px-4 py-2">Statut</th>
                      <th className="px-4 py-2 text-right">Envoyés</th>
                      <th className="px-4 py-2 text-right">Ouverts</th>
                      <th className="px-4 py-2 text-right">Cliqués</th>
                      <th className="px-4 py-2 text-right">Bounce</th>
                      <th className="px-4 py-2 text-right">Désabos</th>
                      <th className="px-4 py-2 whitespace-nowrap">Lancée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campagnes.length === 0 && (
                      <LigneVide colonnes={9} message="Aucune campagne pour ce site. Commencez par « Nouvelle campagne »." />
                    )}
                    {campagnes.map((c) => {
                      const k = c.compteurs || {};
                      return (
                        <tr key={c.id}
                          onClick={() => setVue(c.statut === 'brouillon' ? { mode: 'editer', campagne: c } : { mode: 'suivre', id: c.id })}
                          className="border-t border-baikal-border/50 cursor-pointer hover:bg-baikal-bg/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-white truncate max-w-[280px]">
                              {c.continue && <Repeat className="w-3.5 h-3.5 text-baikal-cyan shrink-0" title="En continu" />}
                              <span className="truncate">{c.nom}</span>
                            </div>
                            <div className="text-xs opacity-60 truncate max-w-[280px]">{c.objet || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-xs">{libelleCible(c)}</td>
                          <td className="px-4 py-3"><BadgeCampagne statut={c.statut} /></td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtNombre(k.envoyes)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtTaux(k.ouverts, k.envoyes)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtTaux(k.cliques, k.envoyes)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtNombre(k.rebonds)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtNombre(k.desinscrits)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{fmtDateHeure(c.lancee_le)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}

export default function Mailing() {
  return (
    <ConsoleLayout actif="mailing">
      <MailingContent />
    </ConsoleLayout>
  );
}
