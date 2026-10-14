/**
 * DetailCampagne - Mailing
 * ============================================================================
 * Suivi d'une campagne partie : compteurs lus en direct dans le journal du
 * site (mail_envoi), progression, motif d'arret, destinataires un par un.
 * Rafraichi toutes les 20 s tant qu'elle est en cours.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Pencil, Play } from 'lucide-react';
import { mailingService } from '../../../services/mailing.service';
import KpiCarte from '../KpiCarte';
import { Chargement, ContenuEstompe, Erreur, LigneVide } from '../etats';
import {
  BadgeCampagne, BadgeEnvoi, Bouton, Chip, fmtDateHeure, fmtNombre, fmtTaux, POPULATIONS, STATUTS_ENVOI,
} from './commun';

export default function DetailCampagne({ appId, campagneId, ecriture, onFerme, onModifier, onChange }) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [page, setPage] = useState(1);
  const [statut, setStatut] = useState(null);
  const [version, setVersion] = useState(0);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;
    setChargement(true);
    mailingService.detail(appId, campagneId, page, statut).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message); else { setDonnees(data); setErreur(null); }
      setChargement(false);
    });
    return () => { actif = false; };
  }, [appId, campagneId, page, statut, version]);

  const enCours = donnees?.campagne?.statut === 'en_cours';
  useEffect(() => {
    if (!enCours) return undefined;
    const t = setInterval(() => setVersion((v) => v + 1), 20000);
    return () => clearInterval(t);
  }, [enCours]);

  async function agir(fn) {
    const { error } = await fn(appId, campagneId);
    if (error) { setErreur(error.message); return; }
    setVersion((v) => v + 1);
    onChange?.();
  }

  if (erreur && !donnees) return <Erreur message={erreur} />;
  if (!donnees) return <Chargement />;

  const { campagne: c, compteurs: k, restants } = donnees;
  const envoyes = k?.envoyes ?? 0;
  const prevus = envoyes + (k?.en_attente ?? 0) + (restants ?? 0);
  const progression = prevus ? Math.round((100 * envoyes) / prevus) : 0;
  const pages = Math.max(1, Math.ceil((donnees.total || 0) / donnees.parPage));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onFerme} className="flex items-center gap-2 text-sm text-baikal-text hover:text-baikal-cyan">
          <ArrowLeft className="w-4 h-4" /> Campagnes
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {ecriture && c.statut !== 'terminee' && (
            <Bouton onClick={onModifier}><Pencil className="w-4 h-4" />Modifier le contenu</Bouton>
          )}
          {ecriture && c.statut === 'en_cours' && (
            <Bouton onClick={() => agir(mailingService.suspendre)}><Pause className="w-4 h-4" />Suspendre</Bouton>
          )}
          {ecriture && c.statut === 'suspendue' && (
            <Bouton variante="primaire" onClick={() => agir(mailingService.lancer)}><Play className="w-4 h-4" />Reprendre</Bouton>
          )}
        </div>
      </div>

      {erreur && <Erreur message={erreur} />}

      <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-semibold text-white">{c.nom}</h3>
          <BadgeCampagne statut={c.statut} />
          <span className="text-xs text-baikal-text opacity-70">{POPULATIONS[c.population]}</span>
        </div>
        <p className="text-sm text-baikal-text truncate"><span className="opacity-60">Objet :</span> {c.objet}</p>
        {c.motif && <p className="text-sm text-amber-300">{c.motif}</p>}
        <div className="text-xs text-baikal-text opacity-70 flex gap-4 flex-wrap">
          <span>Lancée {fmtDateHeure(c.lancee_le)}</span>
          {c.dernier_lot_le && <span>Dernier lot {fmtDateHeure(c.dernier_lot_le)}</span>}
          {c.terminee_le && <span>Terminée {fmtDateHeure(c.terminee_le)}</span>}
        </div>
        <div className="pt-1">
          <div className="h-2 bg-baikal-bg rounded-full overflow-hidden">
            <div className="h-full bg-baikal-cyan transition-all" style={{ width: `${progression}%` }} />
          </div>
          <p className="text-xs text-baikal-text mt-1 tabular-nums">
            {fmtNombre(envoyes)} envoyés sur {fmtNombre(prevus)} · {fmtNombre(restants ?? 0)} restants
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCarte label="Envoyés" valeur={fmtNombre(envoyes)} />
        <KpiCarte label="Délivrés" valeur={fmtTaux(k?.delivres, envoyes)} sous={fmtNombre(k?.delivres)} accent="info" />
        <KpiCarte label="Ouverts" valeur={fmtTaux(k?.ouverts, envoyes)} sous={fmtNombre(k?.ouverts)} />
        <KpiCarte label="Cliqués" valeur={fmtTaux(k?.cliques, envoyes)} sous={fmtNombre(k?.cliques)} accent="success" />
        <KpiCarte label="Rebonds" valeur={fmtNombre(k?.rebonds)} sous={`${fmtNombre(k?.rebonds_durs)} définitifs`}
          accent={(k?.rebonds_durs ?? 0) > 0 ? 'warning' : 'default'} />
        <KpiCarte label="Désinscrits" valeur={fmtNombre(k?.desinscrits)} sous={`${fmtNombre(k?.plaintes)} spam`}
          accent={(k?.plaintes ?? 0) > 0 ? 'danger' : 'default'} />
        <KpiCarte label="Erreurs" valeur={fmtNombre(k?.erreurs)} accent={(k?.erreurs ?? 0) > 0 ? 'danger' : 'default'} />
      </div>

      {(donnees.par_mail || []).length > 1 && (
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="text-xs opacity-70 border-b border-baikal-border">
                <th className="px-4 py-2 text-left">Mail de la séquence</th>
                <th className="px-4 py-2 text-right">Envoyés</th>
                <th className="px-4 py-2 text-right">Délivrés</th>
                <th className="px-4 py-2 text-right">Ouverts</th>
                <th className="px-4 py-2 text-right">Cliqués</th>
                <th className="px-4 py-2 text-right">Rebonds</th>
                <th className="px-4 py-2 text-right">Désinscrits</th>
              </tr>
            </thead>
            <tbody>
              {donnees.par_mail.map((m) => (
                <tr key={m.touche} className="border-t border-baikal-border/50">
                  <td className="px-4 py-2 text-white">
                    {m.touche === 1 ? 'Mail 1' : `Relance ${m.touche - 1}`}
                    {m.touche > 1 && <span className="text-xs opacity-60 ml-1">J+{c.relances?.[m.touche - 2]?.delai_jours ?? '?'}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNombre(m.envoyes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtTaux(m.delivres, m.envoyes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtTaux(m.ouverts, m.envoyes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtTaux(m.cliques, m.envoyes)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNombre(m.rebonds)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNombre(m.desinscrits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Chip actif={!statut} onClick={() => { setStatut(null); setPage(1); }}>Tous</Chip>
        {Object.entries(STATUTS_ENVOI).map(([s, [, l]]) => (
          <Chip key={s} actif={statut === s} onClick={() => { setStatut(s); setPage(1); }}>{l}</Chip>
        ))}
      </div>

      <ContenuEstompe enCours={chargement}>
        <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
          <table data-mobile="1,2" className="w-full text-sm text-baikal-text">
            <thead>
              <tr className="text-left text-xs opacity-70 border-b border-baikal-border">
                <th className="px-4 py-2">Destinataire</th>
                {(c.relances || []).length > 0 && <th className="px-4 py-2">Mail</th>}
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 whitespace-nowrap">Envoyé</th>
                <th className="px-4 py-2 whitespace-nowrap">Ouvert</th>
                <th className="px-4 py-2 whitespace-nowrap">Cliqué</th>
                <th className="px-4 py-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {donnees.lignes.length === 0 && (
                <LigneVide colonnes={(c.relances || []).length > 0 ? 7 : 6} message="Aucun envoi pour l'instant." />
              )}
              {donnees.lignes.map((l) => (
                <tr key={`${l.email}:${l.touche ?? 1}`} className="border-t border-baikal-border/50">
                  <td className="px-4 py-2 text-white truncate max-w-[260px]">{l.email}</td>
                  {(c.relances || []).length > 0 && (
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{l.touche > 1 ? `Relance ${l.touche - 1}` : 'Mail 1'}</td>
                  )}
                  <td className="px-4 py-2"><BadgeEnvoi statut={l.statut} /></td>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtDateHeure(l.envoye_le)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {fmtDateHeure(l.ouvert_le)}{l.nb_ouvertures > 1 ? ` (×${l.nb_ouvertures})` : ''}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {fmtDateHeure(l.clique_le)}{l.nb_clics > 1 ? ` (×${l.nb_clics})` : ''}
                  </td>
                  <td className="px-4 py-2 text-xs opacity-80 max-w-[320px] truncate" title={l.erreur || ''}>
                    {l.desinscrit_le ? 'Désinscrit · ' : ''}
                    {l.rebond_type ? `Rebond ${l.rebond_type === 'Permanent' ? 'définitif' : 'temporaire'} · ` : ''}
                    {l.erreur || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm text-baikal-text">
          <span>Page <span className="tabular-nums">{page}</span> sur <span className="tabular-nums">{pages}</span></span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 border border-baikal-border rounded-md hover:border-baikal-cyan hover:text-baikal-cyan disabled:opacity-40 disabled:pointer-events-none">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
              className="p-2 border border-baikal-border rounded-md hover:border-baikal-cyan hover:text-baikal-cyan disabled:opacity-40 disabled:pointer-events-none">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </ContenuEstompe>
    </div>
  );
}
