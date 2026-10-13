/**
 * Mailing.jsx - Baikal Console
 * ============================================================================
 * Les campagnes du site selectionne (spec 2026-10-13) : tableau de bord,
 * composition, suivi. Baikal garde la campagne ; qui a recu, ouvert, clique
 * ou s'est desinscrit est lu en direct dans le journal du site (module
 * mailing-v1). Un site sans module n'a pas le mailing (etat, pas erreur).
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import { Chargement, Erreur, LigneVide, Section, Vide } from '../components/console/etats';
import KpiCarte from '../components/console/KpiCarte';
import LectureSeule from '../components/console/LectureSeule';
import { useDroitModule } from '../hooks/useDroitModule';
import { mailingService } from '../services/mailing.service';
import EditeurCampagne from '../components/console/mailing/EditeurCampagne';
import DetailCampagne from '../components/console/mailing/DetailCampagne';
import {
  Badge, BadgeCampagne, Bouton, fmtDateHeure, fmtNombre, fmtTaux, POPULATIONS,
} from '../components/console/mailing/commun';

function MailingContent() {
  const { currentApp } = useApp();
  const { ecriture } = useDroitModule('mailing');
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0);
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
    if (!enCours || vue) return undefined;
    const t = setInterval(() => setVersion((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, [enCours, vue]);

  const rafraichir = () => setVersion((v) => v + 1);

  if (erreur) return <Erreur message={erreur} />;
  if (!etat) return <Chargement />;
  if (etat.disponible === false) {
    return <Vide message="Ce site n'a pas installé le module mailing (docs/contrats/mailing-v1.sql)." />;
  }
  if (Object.keys(etat.populations || {}).length === 0) {
    return <Vide message="Ce site n'expose ni prospects, ni clients, ni comptes." />;
  }

  if (vue?.mode === 'editer') {
    return (
      <EditeurCampagne
        appId={currentApp}
        etat={etat}
        campagne={vue.campagne}
        ecriture={ecriture}
        onChange={rafraichir}
        onFerme={(id, suivre) => {
          setVue(id && suivre ? { mode: 'suivre', id } : null);
          rafraichir();
        }}
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
  const total = campagnes.reduce((acc, c) => {
    const k = c.compteurs || {};
    for (const cle of ['envoyes', 'delivres', 'ouverts', 'cliques', 'rebonds', 'desinscrits', 'plaintes']) {
      acc[cle] = (acc[cle] || 0) + (k[cle] || 0);
    }
    return acc;
  }, {});
  const e = etat.envoi || {};

  return (
    <>
      {!ecriture && <LectureSeule module="Mailing" />}
      <Section
        titre="Mailing"
        action={ecriture && (
          <Bouton variante="primaire" onClick={() => setVue({ mode: 'editer', campagne: null })}>
            <Plus className="w-4 h-4" />Nouvelle campagne
          </Bouton>
        )}
      >
        <div className="bg-baikal-surface border border-baikal-border rounded-lg px-4 py-3 text-sm text-baikal-text flex items-center gap-x-6 gap-y-1 flex-wrap">
          <span><span className="opacity-60">Expéditeur</span>{' '}
            {e.expediteur ? <span className="text-white">{e.expediteur}</span> : <Badge couleur="red">à renseigner dans Paramétrage</Badge>}
          </span>
          <span><span className="opacity-60">Clé Resend</span>{' '}
            {e.cle ? <span className="text-white font-mono text-xs">{e.cle}</span> : <Badge couleur="red">absente</Badge>}
          </span>
          <span><span className="opacity-60">Aujourd'hui</span>{' '}
            <span className="text-white tabular-nums">{fmtNombre(e.envoyes_aujourdhui)} / {fmtNombre(e.plafond_jour)}</span>
          </span>
          {!e.ecriture && <Badge couleur="amber">relais mailing du site non configuré</Badge>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCarte label="Envoyés" valeur={fmtNombre(total.envoyes)} />
          <KpiCarte label="Délivrés" valeur={fmtTaux(total.delivres, total.envoyes)} sous={fmtNombre(total.delivres)} accent="info" />
          <KpiCarte label="Ouverts" valeur={fmtTaux(total.ouverts, total.envoyes)} sous={fmtNombre(total.ouverts)} />
          <KpiCarte label="Cliqués" valeur={fmtTaux(total.cliques, total.envoyes)} sous={fmtNombre(total.cliques)} accent="success" />
          <KpiCarte label="Rebonds" valeur={fmtNombre(total.rebonds)} accent={total.rebonds ? 'warning' : 'default'} />
          <KpiCarte label="Désinscrits" valeur={fmtNombre(total.desinscrits)} sous={`${fmtNombre(total.plaintes)} spam`} />
        </div>

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
                <th className="px-4 py-2 text-right">Rebonds</th>
                <th className="px-4 py-2 text-right">Désinscrits</th>
                <th className="px-4 py-2 whitespace-nowrap">Lancée</th>
              </tr>
            </thead>
            <tbody>
              {campagnes.length === 0 && <LigneVide colonnes={9} message="Aucune campagne pour ce site." />}
              {campagnes.map((c) => {
                const k = c.compteurs || {};
                return (
                  <tr key={c.id}
                    onClick={() => setVue(c.statut === 'brouillon' ? { mode: 'editer', campagne: c } : { mode: 'suivre', id: c.id })}
                    className="border-t border-baikal-border/50 cursor-pointer hover:bg-baikal-bg/50">
                    <td className="px-4 py-3">
                      <div className="text-white truncate max-w-[260px]">{c.nom}</div>
                      <div className="text-xs opacity-60 truncate max-w-[260px]">{c.objet || '—'}</div>
                    </td>
                    <td className="px-4 py-3">{POPULATIONS[c.population] || c.population}</td>
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
