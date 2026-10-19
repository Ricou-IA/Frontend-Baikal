/**
 * EditeurCampagne - Mailing
 * ============================================================================
 * Composer une campagne en trois cartes, l'apercu fidele a droite :
 *  1. Qui   — l'entonnoir commun (etape x profil) quand le site publie
 *             baikal_audience ; sinon les populations du lot 1 (repli).
 *  2. Quoi  — redaction assistee par IA (intention = etape ciblee ; l'IA
 *             propose aussi trois objets, l'accroche qui fait ouvrir), objet,
 *             corps en traitement de texte (jamais de HTML visible).
 *  3. Quand — ponctuelle ou continue (plafond par jour), test, lancement.
 *
 * Le compteur vient de la MEME fonction que l'envoi (segment.ts) : le nombre
 * annonce est le nombre envoye. Une campagne partie ne change plus de cible ;
 * objet et corps restent corrigeables tant qu'elle n'est pas terminee.
 * ============================================================================
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Monitor, Rocket, Save, Send, Smartphone, Sparkles, Trash2, Users, PenLine, Clock,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { mailingService } from '../../../services/mailing.service';
import { Erreur } from '../etats';
import Entonnoir from './Entonnoir';
import EditeurTexte from './EditeurTexte';
import { Badge, BadgeCampagne, Bouton, Chip, ETAPES, fmtNombre, POPULATIONS } from './commun';

// Miroir de mailIncomplet (_shared/mailing/segment.ts) : le serveur refuse
// le lancement, la console le dit avant.
function mailIncomplet(m) {
  if (!String(m?.objet ?? '').trim()) return true;
  const texte = String(m?.corps_html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/^\s*bonjour\b/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return texte === '';
}

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

export default function EditeurCampagne({
  appId, etat, campagne: initiale, criteresInitiaux, nonRepris, ecriture, onFerme, onChange,
}) {
  const { user } = useAuth();
  const populations = Object.keys(etat.populations || {});
  const [c, setC] = useState(() => initiale ?? {
    nom: '',
    population: criteresInitiaux ? 'audience' : (etat.population_defaut || populations[0]),
    criteres: criteresInitiaux || {},
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
  // Les objets proposes par l'IA (trois angles) : le premier est applique,
  // les autres restent un clic plus loin.
  const [objets, setObjets] = useState([]);
  // Sequence (lot 3) : le mail affiche dans la carte Message. 0 = mail 1,
  // k = relance k ; les relances vivent dans c.relances.
  const [iMail, setIMail] = useState(0);
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
  const relances = c.relances || [];
  const mailDe = (i) => (i === 0
    ? { objet: c.objet, corps_html: c.corps_html, delai_jours: 0 }
    : relances[i - 1] || { objet: '', corps_html: '', delai_jours: 3 });
  const mailCourant = mailDe(iMail);
  const majMail = (patch) => setC((x) => {
    if (iMail === 0) return { ...x, ...patch };
    const rs = [...(x.relances || [])];
    rs[iMail - 1] = { ...rs[iMail - 1], ...patch };
    return { ...x, relances: rs };
  });
  const sequence = relances.length > 0;
  const incomplets = [
    ...(mailIncomplet(c) ? ['mail 1'] : []),
    ...relances.flatMap((r, k) => (mailIncomplet(r) ? [`relance ${k + 1}`] : [])),
  ];
  function ajouterRelance() {
    setC((x) => ({
      ...x,
      continue: true,
      relances: [...(x.relances || []), { delai_jours: 3, objet: '', corps_html: '<p>Bonjour {{nom|}},</p><p></p>' }],
    }));
    setIMail(relances.length + 1);
    setObjets([]);
  }
  function retirerRelance(i) {
    if (!window.confirm(`Retirer la relance ${i} ?`)) return;
    setC((x) => ({ ...x, relances: (x.relances || []).filter((_, k) => k !== i - 1) }));
    setIMail(0);
    setObjets([]);
  }
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
  const cleRendu = JSON.stringify([mailCourant.objet, mailCourant.corps_html, c.population, c.criteres]);
  useEffect(() => {
    let actif = true;
    const t = setTimeout(() => {
      mailingService.rendu(appId, {
        objet: mailCourant.objet, corps_html: mailCourant.corps_html, population: c.population, criteres: c.criteres,
      }).then(({ data }) => { if (actif && data) setRendu(data); });
    }, 600);
    return () => { actif = false; clearTimeout(t); };
  }, [appId, cleRendu]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rediger(consigne) {
    setRedaction(consigne); setErreur(null); setMessage(null);
    const { data, error } = await mailingService.rediger(appId, {
      consigne, brief, criteres: c.criteres, objet: mailCourant.objet, corps_html: mailCourant.corps_html,
      profilsLibelles: (crit.profils || []).map(libelleProfil),
      rang: iMail + 1, delaiJours: mailCourant.delai_jours,
      precedent: iMail > 0 ? mailDe(iMail - 1) : null,
    });
    setRedaction(null);
    if (error) { setErreur(error.message); return; }
    setObjets(data.objets || []);
    majMail({
      objet: data.objet || mailCourant.objet,
      corps_html: data.corps_html || mailCourant.corps_html,
    });
    // « objets » ne touche pas au corps : pas de relecture de l'editeur.
    if (data.corps_html) setVersionCorps((v) => v + 1);
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
      objet: mailCourant.objet, corps_html: mailCourant.corps_html, population: c.population, criteres: c.criteres,
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
            {criteresInitiaux && !c.id && (
              <p className="text-xs text-baikal-text bg-baikal-cyan/5 border border-baikal-cyan/30 rounded-md px-3 py-2">
                Ciblage repris de Prospects : étapes, profils et département.
                {(nonRepris || []).length > 0 && ` Non repris : ${nonRepris.join(', ')}.`}
                {' '}Les désinscrits sont écartés, et la presse aussi tant qu'elle n'est pas cochée.
              </p>
            )}
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
              <span className="ml-auto flex items-center gap-3">
                {(apercu?.echantillon || []).length > 0 && (
                  <button type="button" onClick={() => setVoirEchantillon((v) => !v)}
                    className="text-xs text-baikal-cyan hover:underline">
                    {voirEchantillon ? 'Masquer' : 'Voir'} des exemples
                  </button>
                )}
                {/* Prospects ne liste que des prospects : le lien n'existe que
                    si la cible ne vise que les etapes ou l'on prospecte. */}
                {audience && (crit.etapes || []).length > 0
                  && crit.etapes.every((e) => ['a_conquerir', 'lead'].includes(e)) && (
                  <Link to={`/prospect?${new URLSearchParams({
                    etapes: crit.etapes.join(','),
                    ...((crit.profils || []).length ? { profils: crit.profils.join(',') } : {}),
                    ...(crit.departement ? { dept: crit.departement } : {}),
                  })}`} className="text-xs text-baikal-cyan hover:underline">
                    Voir la liste
                  </Link>
                )}
              </span>
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
          <Carte numero={2} titre={sequence ? `Séquence de ${relances.length + 1} mails` : 'Message'} icone={PenLine}>
            {(sequence || (ecriture && c.statut === 'brouillon')) && (
              <div className="flex items-center gap-1 flex-wrap border-b border-baikal-border -mx-4 px-4 -mt-1 pb-2">
                {[0, ...relances.map((_, k) => k + 1)].map((i) => (
                  <span key={i} className={`flex items-center rounded-md transition-colors
                    ${iMail === i ? 'bg-baikal-cyan/15 text-baikal-cyan' : 'text-baikal-text hover:text-white'}`}>
                    <button type="button" onClick={() => { setIMail(i); setObjets([]); }}
                      className="px-3 py-1.5 text-xs font-medium flex items-center gap-1">
                      {i === 0 ? 'Mail 1' : `Relance ${i}`}
                      {i > 0 && <span className="opacity-60">J+{relances[i - 1]?.delai_jours ?? 0}</span>}
                      {sequence && mailIncomplet(mailDe(i)) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="À rédiger" />
                      )}
                    </button>
                    {i > 0 && ecriture && c.statut === 'brouillon' && (
                      <button type="button" onClick={() => retirerRelance(i)} title={`Retirer la relance ${i}`}
                        className="pr-2 -ml-1 text-xs opacity-50 hover:opacity-100 hover:text-red-300">×</button>
                    )}
                  </span>
                ))}
                {ecriture && c.statut === 'brouillon' && relances.length < 5 && (
                  <button type="button" onClick={ajouterRelance}
                    className="px-3 py-1.5 rounded-md text-xs text-baikal-text hover:text-baikal-cyan">
                    + Ajouter une relance
                  </button>
                )}
              </div>
            )}

            {iMail > 0 && (
              <div className="flex items-center gap-2 text-sm text-baikal-text flex-wrap">
                <span>Envoyée</span>
                <input type="number" min={0} max={90} value={mailCourant.delai_jours ?? 3} disabled={contenuFige}
                  onChange={(e) => majMail({ delai_jours: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
                  className="w-16 px-2 py-1 bg-baikal-bg border border-baikal-border rounded-md text-white tabular-nums focus:outline-none focus:border-baikal-cyan" />
                <span>jours après {iMail === 1 ? 'le mail 1' : `la relance ${iMail - 1}`}, à ceux qui sont toujours dans la cible.</span>
                {ecriture && c.statut === 'brouillon' && (
                  <button type="button" onClick={() => retirerRelance(iMail)}
                    className="ml-auto text-xs text-red-300 hover:underline">Retirer cette relance</button>
                )}
              </div>
            )}

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
                    <button key={k} type="button" disabled={Boolean(redaction) || (k !== 'rediger' && !mailCourant.corps_html)}
                      onClick={() => rediger(k)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40
                        ${k === 'rediger' ? 'border-violet-400 text-violet-100 bg-violet-500/20 hover:bg-violet-500/30' : 'border-baikal-border text-baikal-text hover:text-white'}`}>
                      {redaction === k ? 'Rédaction…' : l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* L'objet : c'est lui qui fait ouvrir. L'IA en propose trois. */}
            <div className="space-y-1.5">
              <div className="relative">
                <input value={mailCourant.objet} disabled={contenuFige} onChange={(e) => majMail({ objet: e.target.value })}
                  placeholder={iMail === 0 ? 'Objet du mail' : `Objet de la relance ${iMail}`} className={`${classeInput} pr-28`} />
                {ecriture && !contenuFige && (
                  <button type="button" onClick={() => rediger('objets')}
                    disabled={Boolean(redaction) || !mailCourant.corps_html}
                    title="Proposer trois objets pour ce mail"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-40">
                    <Sparkles className="w-3.5 h-3.5" />{redaction === 'objets' ? 'Recherche…' : 'Proposer'}
                  </button>
                )}
              </div>
              {objets.length > 1 && !contenuFige && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-baikal-text opacity-60">Autres accroches</span>
                  {objets.map((o) => (
                    <button key={o} type="button" onClick={() => majMail({ objet: o })}
                      className={`px-2 py-1 rounded-md text-xs border text-left transition-colors
                        ${mailCourant.objet === o ? 'border-violet-400 text-violet-100 bg-violet-500/15' : 'border-baikal-border text-baikal-text hover:text-white'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              <p className={`text-[11px] tabular-nums ${mailCourant.objet.length > 50 ? 'text-amber-400' : 'text-baikal-text opacity-50'}`}>
                {mailCourant.objet.length} caractères{mailCourant.objet.length > 50 ? ' — au-delà de 50, l\'objet est coupé sur mobile' : ''}
              </p>
            </div>

            <EditeurTexte
              key={iMail}
              valeur={mailCourant.corps_html}
              version={versionCorps}
              onChange={(html) => majMail({ corps_html: html })}
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
                <button key={titre} type="button" disabled={cibleFigee || (sequence && !v)}
                  title={sequence && !v ? 'Une séquence est toujours continue' : undefined}
                  onClick={() => setC({ ...c, continue: v })}
                  className={`text-left p-3 rounded-md border transition-colors disabled:cursor-default
                    ${Boolean(c.continue) === v ? 'border-baikal-cyan bg-baikal-cyan/10' : 'border-baikal-border hover:border-baikal-text/50'}`}>
                  <span className="block text-sm text-white font-medium">{titre}</span>
                  <span className="block text-xs text-baikal-text mt-0.5">
                    {sequence && !v
                      ? 'Indisponible avec des relances : une séquence reste ouverte pour servir les relances à leur échéance.'
                      : texte}
                  </span>
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
            <label className={`flex items-center gap-1.5 text-sm text-baikal-text select-none ${contenuFige ? 'opacity-50' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={c.jours_ouvres === true} disabled={contenuFige}
                onChange={(e) => setC({ ...c, jours_ouvres: e.target.checked })} className="accent-baikal-cyan" />
              Jours ouvrés seulement (du lundi au vendredi)
            </label>
            {sequence && (
              <p className="text-xs text-baikal-text opacity-70">
                Chaque personne de la cible reçoit le mail 1, puis les relances à leur échéance ; elle sort de la séquence
                dès qu'elle change d'étape, se désinscrit ou rebondit. Les relances passent avant les nouveaux entrants dans le plafond du jour.
              </p>
            )}

            {ecriture && (
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-baikal-border/60">
                <input value={adresseTest} onChange={(e) => setAdresseTest(e.target.value)} placeholder="Adresse de test"
                  className={`${classeInput} flex-1 min-w-[200px]`} />
                <Bouton onClick={envoyerTest} disabled={occupe || !envoiPret || !String(mailCourant.objet || '').trim()}>
                  <Send className="w-4 h-4" />Tester
                </Bouton>
                {['brouillon', 'suspendue'].includes(c.statut) && (
                  <Bouton variante="primaire" onClick={lancer}
                    disabled={occupe || !envoiPret || (total === 0 && !c.continue) || incomplets.length > 0}
                    titre={!envoiPret ? 'Expéditeur, clé Resend ou relais du site manquant' : undefined}>
                    <Rocket className="w-4 h-4" />{c.statut === 'suspendue' ? 'Reprendre' : 'Lancer'}
                  </Bouton>
                )}
                {['brouillon', 'suspendue'].includes(c.statut) && incomplets.length > 0 && (
                  <p className="w-full text-xs text-amber-300">
                    À rédiger avant de lancer : {incomplets.join(', ')} (objet et texte).
                  </p>
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
