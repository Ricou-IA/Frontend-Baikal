/**
 * EditeurCampagne - Mailing
 * ============================================================================
 * Composer une campagne en trois cartes, l'apercu fidele a droite :
 *  1. Qui   — l'entonnoir commun (etape x profil) quand le site publie
 *             baikal_audience ; sinon les populations du lot 1 (repli).
 *  2. Quoi  — objet, redaction assistee par IA (intention = etape ciblee),
 *             corps en traitement de texte (jamais de HTML visible).
 *  3. Quand — ponctuelle ou continue (plafond par jour), test, lancement.
 *
 * Le compteur vient de la MEME fonction que l'envoi (segment.ts) : le nombre
 * annonce est le nombre envoye. Une campagne partie ne change plus de cible ;
 * objet et corps restent corrigeables tant qu'elle n'est pas terminee.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import {
  ArrowLeft, Monitor, Rocket, Save, Send, Smartphone, Sparkles, Trash2, Users, PenLine, Clock,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { mailingService } from '../../../services/mailing.service';
import { Erreur } from '../etats';
import Entonnoir from './Entonnoir';
import EditeurTexte from './EditeurTexte';
import { Badge, BadgeCampagne, Bouton, Chip, ETAPES, fmtNombre, POPULATIONS } from './commun';

const STATUTS_PROSPECT = [
  ['nouveau', 'Nouveau'], ['contacte', 'Contacté'], ['relance', 'Relancé'], ['repondu', 'A répondu'],
];

const classeInput = 'w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan disabled:opacity-60';

function Carte({ numero, titre, icone: Icone, children, droite }) {
  return (
    <section className="bg-baikal-surface border border-baikal-border rounded-lg">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-baikal-border">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="w-6 h-6 rounded-full bg-baikal-cyan/15 text-baikal-cyan text-xs flex items-center justify-center">{numero}</span>
          <Icone className="w-4 h-4 text-baikal-text" />
          {titre}
        </h3>
        {droite}
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Case({ coche, onChange, children, disabled }) {
  return (
    <label className={`flex items-center gap-1.5 text-xs text-baikal-text select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={coche} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-baikal-cyan" />
      {children}
    </label>
  );
}

export default function EditeurCampagne({ appId, etat, campagne: initiale, ecriture, onFerme, onChange }) {
  const { user } = useAuth();
  const populations = Object.keys(etat.populations || {});
  const [c, setC] = useState(() => initiale ?? {
    nom: '',
    population: etat.population_defaut || populations[0],
    criteres: {},
    objet: '',
    corps_html: '<p>Bonjour {{nom|}},</p><p></p>',
    statut: 'brouillon',
    continue: false,
    plafond_jour: null,
  });
  const [versionCorps, setVersionCorps] = useState(0);
  const [apercu, setApercu] = useState(null);
  const [lignesEntonnoir, setLignesEntonnoir] = useState(null);
  const [rendu, setRendu] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [brief, setBrief] = useState('');
  const [redaction, setRedaction] = useState(null); // consigne en cours
  const [adresseTest, setAdresseTest] = useState(user?.email || '');
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [voirEchantillon, setVoirEchantillon] = useState(false);

  const cibleFigee = c.statut !== 'brouillon';
  const contenuFige = c.statut === 'terminee' || !ecriture;
  const audience = c.population === 'audience';
  const colonnes = new Set(etat.populations?.[c.population] || []);
  const crit = c.criteres || {};
  const setCrit = (maj) => setC((x) => ({ ...x, criteres: { ...(x.criteres || {}), ...maj } }));
  const basculer = (cle, v) => {
    const liste = crit[cle] || [];
    setCrit({ [cle]: liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v] });
  };

  // Libelle d'un profil : registre du site, puis metiers de Baikal, puis slug.
  const libelleProfil = (slug) => (etat.categories || []).find((k) => k.slug === slug)?.libelle
    || (etat.metiers || []).find((m) => m.slug === slug)?.libelle
    || slug;

  // Entonnoir : relu quand les filtres hors facettes changent.
  const cleEntonnoir = JSON.stringify([crit.departement, crit.exclureDejaEcrits]);
  useEffect(() => {
    if (!audience) return undefined;
    let actif = true;
    mailingService.entonnoir(appId, { departement: crit.departement, exclureDejaEcrits: crit.exclureDejaEcrits })
      .then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreur(error.message); else setLignesEntonnoir(data?.lignes || []);
      });
    return () => { actif = false; };
  }, [appId, audience, cleEntonnoir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compteur exact + echantillon (meme WHERE que l'envoi).
  const cleCible = JSON.stringify([c.population, c.criteres]);
  useEffect(() => {
    if (!c.population) return undefined;
    let actif = true;
    const t = setTimeout(() => {
      mailingService.apercu(appId, c.population, c.criteres).then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreur(error.message); else setApercu(data);
      });
    }, 300);
    return () => { actif = false; clearTimeout(t); };
  }, [appId, cleCible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apercu fidele (le vrai message du premier destinataire).
  const cleRendu = JSON.stringify([c.objet, c.corps_html, c.population, c.criteres]);
  useEffect(() => {
    let actif = true;
    const t = setTimeout(() => {
      mailingService.rendu(appId, {
        objet: c.objet, corps_html: c.corps_html, population: c.population, criteres: c.criteres,
      }).then(({ data }) => { if (actif && data) setRendu(data); });
    }, 600);
    return () => { actif = false; clearTimeout(t); };
  }, [appId, cleRendu]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rediger(consigne) {
    setRedaction(consigne); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.rediger(appId, {
      consigne, brief, criteres: c.criteres, objet: c.objet, corps_html: c.corps_html,
      profilsLibelles: (crit.profils || []).map(libelleProfil),
    });
    setRedaction(null);
    if (error) { setErreur(error.message); return; }
    setC((x) => ({ ...x, objet: data.objet || x.objet, corps_html: data.corps_html || x.corps_html }));
    setVersionCorps((v) => v + 1);
  }

  async function enregistrer() {
    setOccupe(true); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.enregistrer(appId, c);
    setOccupe(false);
    if (error) { setErreur(error.message); return null; }
    setC((x) => ({ ...x, ...data }));
    setMessage('Enregistrée');
    onChange?.();
    return data;
  }

  async function envoyerTest() {
    setOccupe(true); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.test(appId, {
      objet: c.objet, corps_html: c.corps_html, population: c.population, criteres: c.criteres,
    }, adresseTest);
    setOccupe(false);
    if (error) setErreur(error.message); else setMessage(`Test envoyé à ${data.envoye}`);
  }

  const plafondSite = etat.envoi?.plafond_jour || 200;
  const rythme = Math.min(plafondSite, c.continue && c.plafond_jour ? c.plafond_jour : plafondSite);
  const total = apercu?.total ?? 0;
  const jours = Math.max(1, Math.ceil(total / rythme));
  const envoiPret = Boolean(etat.envoi?.expediteur && etat.envoi?.cle && etat.envoi?.ecriture !== false);

  async function lancer() {
    const sauvee = await enregistrer();
    if (!sauvee) return;
    const texte = c.continue
      ? `Lancer « ${sauvee.nom} » en continu ?\n\n${fmtNombre(total)} destinataire(s) aujourd'hui, puis chaque nouvel entrant de la cible, ${fmtNombre(rythme)} par jour au plus.`
      : `Lancer « ${sauvee.nom} » vers ${fmtNombre(total)} destinataire(s) ?\n\n${fmtNombre(rythme)} par jour au plus (${jours} jour${jours > 1 ? 's' : ''} environ).`;
    if (!window.confirm(`${texte}\nSuspendable à tout moment.`)) return;
    setOccupe(true);
    const { error } = await mailingService.lancer(appId, sauvee.id);
    setOccupe(false);
    if (error) { setErreur(error.message); return; }
    onChange?.();
    onFerme(sauvee.id, true);
  }

  async function supprimer() {
    if (!c.id || !window.confirm('Supprimer ce brouillon ?')) return;
    const { error } = await mailingService.supprimer(appId, c.id);
    if (error) { setErreur(error.message); return; }
    onChange?.();
    onFerme(null);
  }

  const etapeUnique = (crit.etapes || []).length === 1 ? ETAPES.find((e) => e.id === crit.etapes[0]) : null;

  return (
    <div className="space-y-4">
      {/* Barre de tete */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => onFerme(c.id ?? null, c.statut !== 'brouillon')}
          className="p-2 rounded-md border border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input value={c.nom} disabled={contenuFige} onChange={(e) => setC({ ...c, nom: e.target.value })}
          placeholder="Nom de la campagne"
          className="flex-1 min-w-[200px] bg-transparent text-lg font-semibold text-white placeholder:text-baikal-text/40 focus:outline-none" />
        {c.id && <BadgeCampagne statut={c.statut} />}
        {ecriture && c.statut === 'brouillon' && c.id && (
          <Bouton variante="danger" onClick={supprimer} disabled={occupe} titre="Supprimer le brouillon"><Trash2 className="w-4 h-4" /></Bouton>
        )}
        {!contenuFige && (
          <Bouton onClick={enregistrer} disabled={occupe}><Save className="w-4 h-4" />Enregistrer</Bouton>
        )}
      </div>

      {erreur && <Erreur message={erreur} />}
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* 1. Qui */}
          <Carte numero={1} titre="Destinataires" icone={Users}
            droite={<span className="text-sm text-baikal-text"><span className="text-baikal-cyan font-semibold tabular-nums">{fmtNombre(total)}</span> ciblé(s)</span>}>
            {populations.length > 1 && !audience && (
              <div className="flex gap-1.5 flex-wrap">
                {populations.map((p) => (
                  <Chip key={p} actif={c.population === p} disabled={cibleFigee}
                    onClick={() => setC({ ...c, population: p, criteres: {} })}>{POPULATIONS[p] || p}</Chip>
                ))}
              </div>
            )}

            {audience && (
              lignesEntonnoir === null
                ? <p className="text-sm text-baikal-text opacity-60">Lecture de l'audience…</p>
                : (
                  <Entonnoir
                    lignes={lignesEntonnoir}
                    etapes={crit.etapes || []}
                    profils={crit.profils || []}
                    libelleProfil={libelleProfil}
                    disabled={cibleFigee}
                    onEtapes={(v) => setCrit({ etapes: v })}
                    onProfils={(v) => setCrit({ profils: v })}
                  />
                )
            )}

            {!audience && c.population === 'prospects' && (
              <div className="space-y-2">
                {colonnes.has('metier') && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-baikal-text opacity-60 mr-1">Métier</span>
                    {(etat.metiers || []).map((m) => (
                      <Chip key={m.slug} actif={(crit.metiers || []).includes(m.slug)} disabled={cibleFigee}
                        onClick={() => basculer('metiers', m.slug)}>{m.libelle}</Chip>
                    ))}
                  </div>
                )}
                {colonnes.has('statut') && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-baikal-text opacity-60 mr-1">Statut</span>
                    {STATUTS_PROSPECT.map(([s, l]) => (
                      <Chip key={s} actif={(crit.statuts || []).includes(s)} disabled={cibleFigee}
                        onClick={() => basculer('statuts', s)}>{l}</Chip>
                    ))}
                  </div>
                )}
                {colonnes.has('client_depuis') && (
                  <Case coche={crit.exclureClients !== false} disabled={cibleFigee}
                    onChange={(v) => setCrit({ exclureClients: v })}>Hors clients</Case>
                )}
              </div>
            )}

            {!audience && c.population === 'clients' && colonnes.has('paye_le') && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {[['tous', 'Tous'], ['payes', 'Ont payé'], ['non_payes', "N'ont pas payé"]].map(([v, l]) => (
                  <Chip key={v} actif={(crit.paye || 'tous') === v} disabled={cibleFigee}
                    onClick={() => setCrit({ paye: v })}>{l}</Chip>
                ))}
              </div>
            )}

            {!audience && c.population !== 'prospects' && colonnes.has('categorie') && (etat.categories || []).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {(etat.categories || []).map((k) => (
                  <Chip key={k.slug} actif={(crit.categories || []).includes(k.slug)} disabled={cibleFigee}
                    onClick={() => basculer('categories', k.slug)}>{k.libelle}</Chip>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap pt-1">
              {colonnes.has('code_postal') && (
                <input value={crit.departement || ''} disabled={cibleFigee} maxLength={3} placeholder="Département"
                  onChange={(e) => setCrit({ departement: e.target.value })}
                  className="w-32 px-3 py-1.5 bg-baikal-bg border border-baikal-border rounded-md text-sm text-white placeholder:text-baikal-text/50 focus:outline-none focus:border-baikal-cyan" />
              )}
              <Case coche={crit.exclureDejaEcrits === true} disabled={cibleFigee}
                onChange={(v) => setCrit({ exclureDejaEcrits: v })}>
                Sauf ceux déjà écrits par une campagne
              </Case>
              {(apercu?.echantillon || []).length > 0 && (
                <button type="button" onClick={() => setVoirEchantillon((v) => !v)}
                  className="text-xs text-baikal-cyan hover:underline ml-auto">
                  {voirEchantillon ? 'Masquer' : 'Voir'} des exemples
                </button>
              )}
            </div>
            {voirEchantillon && (
              <ul className="text-xs text-baikal-text space-y-0.5 max-h-40 overflow-y-auto">
                {(apercu?.echantillon || []).map((d) => (
                  <li key={d.email} className="truncate">
                    {d.nom ? <span className="text-white/80">{d.nom} · </span> : null}{d.email}
                    {d.commune ? <span className="opacity-60"> · {d.commune}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Carte>

          {/* 2. Quoi */}
          <Carte numero={2} titre="Message" icone={PenLine}>
            <input value={c.objet} disabled={contenuFige} onChange={(e) => setC({ ...c, objet: e.target.value })}
              placeholder="Objet du mail" className={classeInput} />

            {ecriture && !contenuFige && (
              <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-violet-200">
                  <Sparkles className="w-3.5 h-3.5" />
                  {etapeUnique
                    ? <>Intention : <strong>{etapeUnique.intention}</strong> les {etapeUnique.libelle.toLowerCase()}s</>
                    : 'Rédaction assistée'}
                </div>
                <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2}
                  placeholder="En une ou deux phrases : ce que vous voulez dire, l'offre, le lien…"
                  className={`${classeInput} text-sm`} />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[['rediger', 'Rédiger'], ['court', 'Plus court'], ['chaleureux', 'Plus chaleureux'], ['reformuler', 'Reformuler']].map(([k, l]) => (
                    <button key={k} type="button" disabled={Boolean(redaction) || (k !== 'rediger' && !c.corps_html)}
                      onClick={() => rediger(k)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40
                        ${k === 'rediger' ? 'border-violet-400 text-violet-100 bg-violet-500/20 hover:bg-violet-500/30' : 'border-baikal-border text-baikal-text hover:text-white'}`}>
                      {redaction === k ? 'Rédaction…' : l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <EditeurTexte
              valeur={c.corps_html}
              version={versionCorps}
              onChange={(html) => setC((x) => ({ ...x, corps_html: html }))}
              variables={(etat.variables || []).filter((v) => v !== 'email')}
              disabled={contenuFige}
            />
          </Carte>

          {/* 3. Quand */}
          <Carte numero={3} titre="Envoi" icone={Clock}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                [false, 'Une fois', `Aux ${fmtNombre(total)} destinataires actuels, puis la campagne se termine.`],
                [true, 'En continu', 'Aux destinataires actuels, puis à chaque nouvel entrant de la cible.'],
              ].map(([v, titre, texte]) => (
                <button key={titre} type="button" disabled={cibleFigee}
                  onClick={() => setC({ ...c, continue: v })}
                  className={`text-left p-3 rounded-md border transition-colors disabled:cursor-default
                    ${Boolean(c.continue) === v ? 'border-baikal-cyan bg-baikal-cyan/10' : 'border-baikal-border hover:border-baikal-text/50'}`}>
                  <span className="block text-sm text-white font-medium">{titre}</span>
                  <span className="block text-xs text-baikal-text mt-0.5">{texte}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-baikal-text flex-wrap">
              <span>Au plus</span>
              <input type="number" min={1} value={c.plafond_jour ?? ''} disabled={contenuFige}
                placeholder={String(plafondSite)}
                onChange={(e) => setC({ ...c, plafond_jour: e.target.value ? Number(e.target.value) : null })}
                className="w-24 px-2 py-1 bg-baikal-bg border border-baikal-border rounded-md text-white tabular-nums focus:outline-none focus:border-baikal-cyan" />
              <span>envois par jour</span>
              <span className="opacity-60">(site : {fmtNombre(plafondSite)}/jour)</span>
              {!c.continue && total > 0 && <span className="opacity-60">→ environ {jours} jour{jours > 1 ? 's' : ''}</span>}
            </div>

            {ecriture && (
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-baikal-border/60">
                <input value={adresseTest} onChange={(e) => setAdresseTest(e.target.value)} placeholder="Adresse de test"
                  className={`${classeInput} flex-1 min-w-[200px]`} />
                <Bouton onClick={envoyerTest} disabled={occupe || !envoiPret || !c.objet.trim()}>
                  <Send className="w-4 h-4" />Tester
                </Bouton>
                {['brouillon', 'suspendue'].includes(c.statut) && (
                  <Bouton variante="primaire" onClick={lancer}
                    disabled={occupe || !envoiPret || (total === 0 && !c.continue) || !c.objet.trim()}
                    titre={!envoiPret ? 'Expéditeur, clé Resend ou relais du site manquant' : undefined}>
                    <Rocket className="w-4 h-4" />{c.statut === 'suspendue' ? 'Reprendre' : 'Lancer'}
                  </Bouton>
                )}
              </div>
            )}
          </Carte>
        </div>

        {/* Apercu */}
        <div className="xl:sticky xl:top-4 min-w-0">
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
            <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-baikal-border">
              <div className="text-xs text-baikal-text min-w-0 space-y-0.5">
                <div className="truncate"><span className="opacity-60">De</span> {etat.envoi?.expediteur || <Badge couleur="red">aucun expéditeur</Badge>}</div>
                <div className="truncate"><span className="opacity-60">Objet</span> <span className="text-white">{rendu?.objet || '—'}</span></div>
                {rendu?.destinataire && <div className="truncate opacity-60">Exemple pour {rendu.destinataire}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Chip actif={!mobile} onClick={() => setMobile(false)}><Monitor className="w-3.5 h-3.5" /></Chip>
                <Chip actif={mobile} onClick={() => setMobile(true)}><Smartphone className="w-3.5 h-3.5" /></Chip>
              </div>
            </div>
            <div className="flex justify-center bg-gray-100">
              <iframe title="Aperçu" sandbox="" srcDoc={rendu?.html || ''}
                style={{ width: mobile ? 375 : '100%', height: 640, border: 0, background: '#fff' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
