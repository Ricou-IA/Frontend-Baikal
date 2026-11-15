/**
 * TesterMonSite.jsx - « Tester mon site », le parcours d'onboarding public
 * ============================================================================
 * Ceux à qui Baikal s'adresse travaillent toute la journée avec un agent et
 * des connecteurs (Eric, 15/11/2026). L'entrée du parcours est donc un
 * prompt, pas un formulaire technique :
 *
 *   1. le fondateur tape l'adresse de son site ;
 *   2. la page lui sert un prompt écrit pour ce site : son agent retrouve le
 *      bon projet, crée le rôle, écrit les vues, lance le test lui-même ;
 *   3. l'agent rend un lien — celui de cette page, qui attend le résultat et
 *      l'affiche dès qu'il arrive.
 *
 * Le jeton du lien est tiré ICI et mis dans le prompt : le test de l'agent
 * s'y range (baikal-test adopte un jeton bien formé encore inconnu).
 *
 * Routes : "/tester" et "/tester/r/:jeton" (lien privé gardé 30 jours).
 * Liée depuis la landing depuis le 15/11/2026 ; en `noindex` tant qu'Eric ne
 * l'a pas annoncée.
 *
 * Le chemin à la main reste, replié, pour qui n'a pas d'agent : un script à
 * exécuter, puis l'adresse de la base telle que l'hébergeur la donne — la page
 * y met le rôle baikal_reader et son mot de passe (_shared/recette/adresse.ts).
 *
 * Ce que la page garde, le temps de l'onglet seulement (sessionStorage) : le
 * site tapé, rangé sous son jeton, et le mot de passe du rôle du chemin à la
 * main. L'adresse de la base ne vit qu'en mémoire. Le mot de passe n'entre
 * jamais dans un prompt. Le prompt, le script du rôle, la lecture du site et
 * de l'adresse viennent de _shared/recette/ : une seule source, testée.
 *
 * Plan : docs/superpowers/plans/2026-11-15-tester-mon-site.md (lot 4).
 * ============================================================================
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ADRESSE_TEST, testSiteService } from '../../services/testSite.service';
import { fabriquerPromptAgent, scriptRole } from '../../../supabase/functions/_shared/recette/prompt.ts';
import { CONTRATS, MANIFESTES } from '../../../supabase/functions/_shared/recette/contrats.gen.ts';
import { lireSite } from '../../../supabase/functions/_shared/recette/site.ts';
import { preparerAdresse } from '../../../supabase/functions/_shared/recette/adresse.ts';

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

// 24 caractères sans ambiguïté (ni l, ni o, ni 0, ni 1) et sans signe : le mot
// de passe se colle tel quel dans une adresse de connexion. 32 symboles, donc
// 5 bits tirés uniformément par caractère.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function motDePasseAuHasard() {
  const octets = new Uint8Array(24);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => ALPHABET[o & 31]).join('');
}

// Le mot de passe du rôle vit le temps de l'onglet : un rechargement doit
// montrer celui que le prospect a déjà exécuté, pas un nouveau.
const CLE_MOT_DE_PASSE = 'baikal-tester-role';
function motDePasseDeLOnglet() {
  try {
    const garde = sessionStorage.getItem(CLE_MOT_DE_PASSE);
    if (garde && /^[a-z2-9]{24}$/.test(garde)) return garde;
    const neuf = motDePasseAuHasard();
    sessionStorage.setItem(CLE_MOT_DE_PASSE, neuf);
    return neuf;
  } catch {
    // Stockage refusé (navigation privée stricte) : il vivra en mémoire.
    return motDePasseAuHasard();
  }
}

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    // Contexte non sécurisé ou permission refusée : la sélection manuelle reste possible.
    return false;
  }
}

const jour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

const NATURES = {
  email: 'Email',
  statut: 'Statut',
  creation: 'Date de création',
  paiement: 'Date de paiement',
  montant: 'Montant',
  stripe: 'Stripe',
  origine: 'Origine',
  test: 'Marqueur de test',
  suppression: 'Suppression',
};

const NIVEAUX = {
  1: 'Ce qu\'il faut pour voir votre site dans Baikal : la liste de vos clients et vos mesures.',
  2: 'Le détail : les fiches, les catégories, les concordances entre vos vues.',
};

// ---------------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------------
const ETIQUETTE = 'font-mono text-[11px] tracking-[0.2em]';
const BOUTON_PLEIN =
  'inline-flex items-center justify-center px-6 py-3 rounded-md bg-baikal-cyan text-black font-mono text-sm ' +
  'font-semibold tracking-wide hover:bg-white transition-colors disabled:opacity-40 disabled:hover:bg-baikal-cyan';

function BoutonCopier({ texte, libelle = 'COPIER', grand = false }) {
  const [etat, setEtat] = useState('idle'); // idle | ok | echec
  const clic = async () => {
    setEtat((await copier(texte)) ? 'ok' : 'echec');
    setTimeout(() => setEtat('idle'), 2500);
  };
  return (
    <button
      type="button"
      onClick={clic}
      className={grand
        ? `shrink-0 ${BOUTON_PLEIN}`
        : 'shrink-0 px-3 py-1.5 rounded border border-baikal-cyan/60 text-baikal-cyan font-mono text-[11px] tracking-wider hover:bg-baikal-cyan hover:text-black transition-colors'}
    >
      {etat === 'ok' ? 'COPIÉ' : etat === 'echec' ? 'SÉLECTIONNEZ LE TEXTE' : libelle}
    </button>
  );
}

function BlocCode({ titre, texte, hauteur = 'max-h-80', pied }) {
  return (
    <div className="bg-[#070A10] border border-baikal-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-baikal-border">
        <span className={`${ETIQUETTE} text-baikal-text truncate`}>{titre}</span>
        <BoutonCopier texte={texte} />
      </div>
      <pre className={`overflow-auto ${hauteur} p-4 font-mono text-[12.5px] leading-relaxed text-baikal-text whitespace-pre`}>
        <code>{texte}</code>
      </pre>
      {pied && <div className="px-4 py-2.5 border-t border-baikal-border text-xs leading-relaxed">{pied}</div>}
    </div>
  );
}

function Etape({ n, titre, children, ancre }) {
  return (
    <section id={ancre} className="scroll-mt-24 border-t border-baikal-border/70 py-12 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-4 mb-6">
        <span className="font-serif text-4xl text-baikal-cyan/40 leading-none">{n}</span>
        <h2 className="font-serif text-white text-2xl sm:text-3xl leading-tight">{titre}</h2>
      </div>
      {children}
    </section>
  );
}

function Liste({ lignes, puce = '▸', couleur = 'text-baikal-cyan' }) {
  return (
    <ul className="space-y-2">
      {lignes.map((l) => (
        <li key={l} className="flex gap-3 leading-relaxed">
          <span className={`font-mono ${couleur} shrink-0`}>{puce}</span>
          <span className="text-white/90">{l}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Écran 3 : ce que Baikal voit dans la base
// ---------------------------------------------------------------------------
function Diagnostic({ d, tronque }) {
  const p = d.table_principale;
  const reperes = p ? d.reperes.filter((r) => r.schema === p.schema && r.table === p.nom) : [];
  return (
    <div className="space-y-8">
      <p className="leading-relaxed">
        {d.compte.tables} table{d.compte.tables > 1 ? 's' : ''}, {d.compte.vues} vue{d.compte.vues > 1 ? 's' : ''},{' '}
        {d.compte.colonnes} colonnes lues. La structure seule : aucune donnée n'a été lue.
        {tronque && ' Votre base est très grande : seule une partie de sa structure a été lue.'}
      </p>

      <div className="border border-baikal-border/70 rounded-md bg-baikal-surface/30 p-5">
        <div className={`${ETIQUETTE} text-baikal-cyan mb-3`}>OÙ VIVENT VOS CLIENTS</div>
        {p ? (
          <>
            <p className="text-white mb-4">
              La table <span className="font-mono text-baikal-cyan">{p.schema}.{p.nom}</span> porte l'acte
              commercial.
            </p>
            {reperes.length > 0 && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {reperes.map((r) => (
                  <div key={`${r.nature}-${r.colonne}`} className="flex justify-between gap-3 border-b border-baikal-border/40 pb-1.5">
                    <dt>{NATURES[r.nature] ?? r.nature}</dt>
                    <dd className="font-mono text-white text-right break-all">{r.colonne}</dd>
                  </div>
                ))}
              </dl>
            )}
            {d.funnel_propose?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm mb-2">Les étapes que Baikal lirait comme votre parcours :</div>
                <div className="flex flex-wrap gap-2">
                  {d.funnel_propose.map((e) => (
                    <span key={e} className="px-2.5 py-1 rounded border border-baikal-border font-mono text-xs text-white">{e}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-white">
            Aucune table ne porte un email ou une date de paiement : Baikal ne sait pas où vivent vos clients.
          </p>
        )}
      </div>

      <div>
        <div className={`${ETIQUETTE} text-baikal-cyan mb-3`}>VUES BAIKAL DÉJÀ PUBLIÉES</div>
        {d.vues_baikal.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {d.vues_baikal.map((v) => (
              <span key={`${v.schema}.${v.nom}`} className="px-2.5 py-1 rounded border border-baikal-cyan/40 bg-baikal-cyan/5 font-mono text-xs text-baikal-cyan">
                {v.nom}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-white/90">Aucune pour l'instant. C'est le travail de votre agent, à l'étape suivante.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className={`${ETIQUETTE} text-amber-400 mb-3`}>CE QUI MANQUE POUR LE NIVEAU 1</div>
          {d.manques.length > 0 ? (
            <Liste lignes={d.manques.map((m) => m.phrase)} couleur="text-amber-400" />
          ) : (
            <p className="text-white/90">Rien : les vues du niveau 1 sont publiées. Lancez le test.</p>
          )}
        </div>
        <div>
          <div className={`${ETIQUETTE} text-baikal-cyan mb-3`}>CE QUE LA CONSOLE POURRAIT AFFICHER</div>
          {d.affichable.length > 0 ? (
            <Liste lignes={d.affichable.map((a) => a.phrase)} />
          ) : (
            <p className="text-white/90">Rien de sûr tant que Baikal ne sait pas où vivent vos clients.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran 4 : le résultat, contrôle par contrôle
// ---------------------------------------------------------------------------
function Controle({ c }) {
  return (
    <li className="border border-baikal-border/70 rounded-md bg-baikal-surface/30 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h4 className="text-white font-medium leading-snug">{c.titre}</h4>
        <span className="font-mono text-[11px] text-baikal-text/70 break-all">
          {c.id}{c.ref ? ` · ${c.ref}` : ''}{c.lignes ? ` · ${c.lignes} ligne${c.lignes > 1 ? 's' : ''} en cause` : ''}
        </span>
      </div>
      {c.detail && <p className="text-sm leading-relaxed mb-3">{c.detail}</p>}
      {c.si_echec && (
        <p className="text-sm leading-relaxed mb-2">
          <span className="text-amber-400">Ce que vous verriez de faux : </span>
          <span className="text-white/90">{c.si_echec}</span>
        </p>
      )}
      {c.correction && (
        <p className="text-sm leading-relaxed">
          <span className="text-baikal-cyan">Correction : </span>
          <span className="text-white/90">{c.correction}</span>
        </p>
      )}
      {c.exemples?.length > 0 && (
        <pre className="mt-3 overflow-x-auto bg-[#070A10] border border-baikal-border rounded p-3 font-mono text-[11.5px] leading-relaxed text-baikal-text">
          {c.exemples.map((e) => JSON.stringify(e)).join('\n')}
        </pre>
      )}
    </li>
  );
}

function Niveau({ n, decompte, pret, controles }) {
  const duNiveau = controles.filter((c) => c.niveau === n);
  const aCorriger = duNiveau.filter((c) => c.bloquant && c.statut !== 'non_mesure');
  const nonMesures = duNiveau.filter((c) => c.statut === 'non_mesure');
  const conformes = duNiveau.filter((c) => c.statut === 'conforme');
  const optionnels = duNiveau.filter((c) => c.statut === 'absent' && !c.bloquant);
  return (
    <div>
      <div className={`rounded-md border p-5 mb-6 ${pret ? 'border-baikal-cyan/60 bg-baikal-cyan/5' : 'border-amber-400/40 bg-amber-400/5'}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className={`${ETIQUETTE} ${pret ? 'text-baikal-cyan' : 'text-amber-400'}`}>NIVEAU {n}</div>
          <div className={`font-mono text-sm font-semibold ${pret ? 'text-baikal-cyan' : 'text-amber-400'}`}>
            {pret ? 'PRÊT' : 'À REPRENDRE'}
          </div>
        </div>
        <p className="text-white text-lg mt-2">
          {decompte.conformes} contrôle{decompte.conformes > 1 ? 's' : ''} conforme{decompte.conformes > 1 ? 's' : ''} sur{' '}
          {decompte.conformes + decompte.bloquants}
          {aCorriger.length > 0 && <span className="text-amber-400"> · {aCorriger.length} à corriger</span>}
          {nonMesures.length > 0 && <span className="text-baikal-text"> · {nonMesures.length} non mesuré{nonMesures.length > 1 ? 's' : ''}</span>}
        </p>
        <p className="text-sm mt-1">{NIVEAUX[n]}</p>
      </div>

      {aCorriger.length > 0 && (
        <div className="mb-6">
          <div className={`${ETIQUETTE} text-amber-400 mb-3`}>À CORRIGER</div>
          <ul className="space-y-3">{aCorriger.map((c) => <Controle key={c.id} c={c} />)}</ul>
        </div>
      )}
      {nonMesures.length > 0 && (
        <div className="mb-6">
          <div className={`${ETIQUETTE} text-baikal-text mb-1`}>NON MESURÉS</div>
          <p className="text-sm mb-3">Un contrôle non mesuré n'est pas conforme : il faut le rejouer.</p>
          <ul className="space-y-3">{nonMesures.map((c) => <Controle key={c.id} c={c} />)}</ul>
        </div>
      )}
      {conformes.length > 0 && (
        <details className="mb-3 border border-baikal-border/70 rounded-md">
          <summary className="cursor-pointer px-5 py-3 font-mono text-xs tracking-wider text-baikal-cyan">
            {conformes.length} CONTRÔLE{conformes.length > 1 ? 'S' : ''} CONFORME{conformes.length > 1 ? 'S' : ''}
          </summary>
          <ul className="px-5 pb-4 space-y-1.5 text-sm">
            {conformes.map((c) => (
              <li key={c.id} className="flex gap-3"><span className="text-baikal-cyan font-mono">✓</span><span>{c.titre}</span></li>
            ))}
          </ul>
        </details>
      )}
      {optionnels.length > 0 && (
        <details className="border border-baikal-border/70 rounded-md">
          <summary className="cursor-pointer px-5 py-3 font-mono text-xs tracking-wider text-baikal-text">
            {optionnels.length} BLOC{optionnels.length > 1 ? 'S' : ''} OPTIONNEL{optionnels.length > 1 ? 'S' : ''} NON PUBLIÉ{optionnels.length > 1 ? 'S' : ''}
          </summary>
          <ul className="px-5 pb-4 space-y-1.5 text-sm">
            {optionnels.map((c) => (
              <li key={c.id}>
                {c.famille === 'forme' && c.vue ? <span className="font-mono">{c.vue}</span> : c.titre}
                {c.detail ? ` : ${c.detail}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// Le jeton du lien privé, tiré ici : la page le met dans le prompt, l'agent y
// range son test, et la page — qui l'attend — voit le résultat arriver.
function jetonAuHasard() {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

// Le site tapé vit le temps de l'onglet, rangé sous son jeton : un
// rechargement retrouve le prompt. Il ne part jamais vers Baikal.
const CLE_SITE = 'baikal-tester-site:';
function siteGarde(jeton) {
  try {
    const garde = JSON.parse(sessionStorage.getItem(CLE_SITE + jeton) ?? 'null');
    return garde?.url && garde?.domaine ? { url: garde.url, domaine: garde.domaine } : null;
  } catch {
    return null;
  }
}
function garderSite(jeton, site) {
  try {
    sessionStorage.setItem(CLE_SITE + jeton, JSON.stringify(site));
  } catch {
    // Stockage refusé : le prompt reste affiché tant que la page n'est pas rechargée.
  }
}

// La page surveille le lien une demi-heure, puis s'arrête d'elle-même.
const VEILLE_MS = 30 * 60_000;

export default function TesterMonSite() {
  const { jeton: jetonDuLien } = useParams();
  const [jeton, setJeton] = useState(jetonDuLien ?? null);
  const [site, setSite] = useState(() => (jetonDuLien ? siteGarde(jetonDuLien) : null));
  const [saisieSite, setSaisieSite] = useState('');
  const [erreurSite, setErreurSite] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [lienInconnu, setLienInconnu] = useState(false);
  const [veille, setVeille] = useState(false);
  const [relance, setRelance] = useState(0);
  // Le chemin à la main, pour qui n'a pas d'agent.
  const [motDePasse] = useState(motDePasseDeLOnglet);
  const [adresse, setAdresse] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // piège à robots
  const [etat, setEtat] = useState('idle'); // idle | diagnostic | test
  const [erreur, setErreur] = useState(null);
  const aUnResultat = useRef(false);
  const vueResultat = useRef(null);

  useEffect(() => {
    const precedent = document.title;
    document.title = 'Tester mon site · Baikal';
    // On arrive ici par un lien de la landing, parfois cliqué en bas de page :
    // sans cela, la page s'ouvrirait à la même hauteur de défilement.
    window.scrollTo(0, 0);
    // La page est liée depuis la landing mais pas encore annoncée : on la
    // tient hors des moteurs le temps qu'Eric la teste en production.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      document.title = precedent;
      meta.remove();
    };
  }, []);

  // La page attend le test de l'agent : elle relit le lien privé tant qu'elle
  // est à l'écran. Rien sous le jeton (404) veut dire « pas encore lancé ».
  useEffect(() => {
    if (!jeton) return undefined;
    let actif = true;
    let minuterie;
    const debut = Date.now();
    const relire = async () => {
      if (!actif) return;
      if (document.visibilityState === 'visible') {
        const { data, statut } = await testSiteService.resultat(jeton);
        if (!actif) return;
        if (data) {
          aUnResultat.current = true;
          setResultat(data);
          setLienInconnu(false);
        } else if (statut === 404) {
          setLienInconnu(true);
        }
      }
      if (Date.now() - debut > VEILLE_MS) {
        setVeille(true);
        return;
      }
      minuterie = setTimeout(relire, aUnResultat.current ? 15_000 : 6_000);
    };
    setVeille(false);
    relire();
    return () => {
      actif = false;
      clearTimeout(minuterie);
    };
  }, [jeton, relance]);

  const preparer = (e) => {
    e.preventDefault();
    const lu = lireSite(saisieSite);
    if (!lu.ok) {
      setErreurSite(lu.erreur);
      return;
    }
    const neuf = jetonAuHasard();
    const leSite = { url: lu.url, domaine: lu.domaine };
    garderSite(neuf, leSite);
    aUnResultat.current = false;
    setErreurSite(null);
    setResultat(null);
    setLienInconnu(false);
    setSite(leSite);
    setJeton(neuf);
    // L'adresse de la page devient le lien privé, sans la recharger.
    window.history.replaceState(null, '', `/tester/r/${neuf}`);
  };

  // --- Le chemin à la main -------------------------------------------------
  // L'adresse collée devient celle du rôle baikal_reader, ici, avant tout envoi.
  const prete = adresse.trim() ? preparerAdresse(adresse, motDePasse) : null;

  const lancer = async (action) => {
    if (etat !== 'idle' || !prete) return;
    if (!prete.ok) {
      setErreur(prete.erreur);
      return;
    }
    setEtat(action === 'tester' ? 'test' : 'diagnostic');
    setErreur(null);
    const { data, error } = await testSiteService[action]({
      connexion: prete.connexion,
      jeton: jeton ?? undefined,
      site_web: siteWeb,
    });
    setEtat('idle');
    if (error) {
      setErreur(error.message);
      return;
    }
    if (!data?.jeton) return; // réponse du piège à robots : rien à montrer
    aUnResultat.current = true;
    setResultat(data);
    setLienInconnu(false);
    if (data.jeton !== jeton) {
      setJeton(data.jeton);
      window.history.replaceState(null, '', `/tester/r/${data.jeton}`);
    }
    requestAnimationFrame(() => vueResultat.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const lienPrive = jeton ? `${window.location.origin}/tester/r/${jeton}` : null;
  const rapport = resultat?.rapport;
  // Le prompt d'entrée, écrit pour CE site ; à défaut (lien ouvert ailleurs),
  // celui que Baikal a tiré du dernier diagnostic.
  const prompt = site && jeton
    ? fabriquerPromptAgent({ site, jeton, urlApi: ADRESSE_TEST, urlResultat: lienPrive, manifestes: MANIFESTES, contrats: CONTRATS })
    : resultat?.prompt ?? null;
  const schema = resultat?.diagnostic?.schema_contrat ?? resultat?.diagnostic?.table_principale?.schema ?? 'public';
  // Seule la première partie du script s'exécute telle quelle : les droits sur
  // les vues et les tables viennent avec les vues.
  const role = scriptRole(schema, motDePasse).split('\n\n-- 2.')[0];
  const roleExistant = `alter role baikal_reader password '${motDePasse}';`;
  const occupe = etat === 'diagnostic' || etat === 'test';
  const aCorriger = rapport ? rapport.resume.niveau1.bloquants : 0;
  const demandeLeSite = !jeton || (lienInconnu && !site && !resultat);

  const champ =
    'w-full bg-baikal-bg border border-baikal-border rounded-md px-4 py-3 text-white font-mono text-sm ' +
    'placeholder:text-baikal-text/50 focus:border-baikal-cyan focus:outline-none focus:ring-1 focus:ring-baikal-cyan/40 transition-colors';

  // Où en est le parcours, en une phrase.
  let suivi = null;
  if (jeton && (site || resultat)) {
    if (rapport?.resume.niveau1_pret) {
      suivi = { ton: 'pret', titre: 'NIVEAU 1 PRÊT', texte: 'Votre site peut être branché à Baikal. Le détail est plus bas.' };
    } else if (rapport) {
      suivi = {
        ton: 'cours',
        titre: `TEST REÇU · ${aCorriger} POINT${aCorriger > 1 ? 'S' : ''} À REPRENDRE AU NIVEAU 1`,
        texte: site ? 'Votre agent corrige et relance ; cette page suit toute seule.' : 'Le détail est plus bas.',
      };
    } else if (resultat) {
      suivi = { ton: 'cours', titre: 'BASE LUE · TEST PAS ENCORE LANCÉ', texte: 'Baikal a lu la structure de la base. Le test viendra avec les vues.' };
    } else if (veille) {
      suivi = { ton: 'veille', titre: 'LA PAGE NE SURVEILLE PLUS', texte: 'Elle s\'est arrêtée au bout d\'une demi-heure.' };
    } else {
      suivi = {
        ton: 'attente',
        titre: 'EN ATTENTE DE VOTRE AGENT',
        texte: 'Cette page se met à jour toute seule dès que votre agent a lancé le test. Laissez-la ouverte.',
      };
    }
  }

  return (
    <div className="bg-baikal-bg min-h-screen text-baikal-text selection:bg-baikal-cyan selection:text-black">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0,240,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,1) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative z-10">
        <nav className="border-b border-baikal-border/70 backdrop-blur bg-baikal-bg/70 sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-md bg-baikal-cyan flex items-center justify-center font-mono font-bold text-black text-sm">B</span>
              <span className="font-mono font-semibold text-white tracking-[0.18em] text-sm">BAIKAL</span>
            </Link>
            <span className={`${ETIQUETTE} text-baikal-text`}>TESTER MON SITE</span>
          </div>
        </nav>

        <header className="max-w-3xl mx-auto px-5 sm:px-8 pt-14 pb-10">
          <div className={`${ETIQUETTE} text-baikal-cyan mb-5`}>SANS COMPTE · SANS EMAIL · VOTRE AGENT FAIT LE TRAVAIL</div>
          <h1 className="font-serif text-white text-4xl sm:text-5xl leading-[1.08] mb-6">
            Que verrait Baikal <span className="italic text-baikal-cyan">dans votre base ?</span>
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl">
            Tapez l'adresse de votre site. Baikal vous donne un prompt à coller dans votre agent : il
            retrouve votre projet, écrit ce qu'il faut, lance le test et vous rend un lien.
          </p>
        </header>

        <main className="max-w-3xl mx-auto px-5 sm:px-8 pb-24">
          {/* ------------------------------------------------- 1. Le site */}
          {demandeLeSite ? (
            <Etape n="01" titre="Quel site voulez-vous brancher ?">
              {lienInconnu && !site && (
                <p role="alert" className="mb-5 border border-amber-400/40 bg-amber-400/5 rounded-md px-4 py-3 text-amber-200 text-sm">
                  Ce lien a expiré ou n'existe pas. Repartez de l'adresse de votre site.
                </p>
              )}
              <form onSubmit={preparer} className="space-y-4" noValidate>
                <label className="block">
                  <span className={`block ${ETIQUETTE} text-baikal-text mb-2`}>L'ADRESSE DE VOTRE SITE</span>
                  <input
                    type="text"
                    inputMode="url"
                    value={saisieSite}
                    onChange={(e) => { setSaisieSite(e.target.value); setErreurSite(null); }}
                    placeholder="monsaas.fr"
                    autoComplete="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={champ}
                  />
                </label>
                {erreurSite && (
                  <p role="alert" className="border border-red-500/50 bg-red-900/20 rounded-md px-4 py-3 text-red-300 text-sm">
                    {erreurSite}
                  </p>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button type="submit" disabled={!saisieSite.trim()} className={BOUTON_PLEIN}>
                    PRÉPARER MON PROMPT
                  </button>
                  <p className="text-sm leading-relaxed">
                    Elle sert à écrire le prompt pour ce site-là. Baikal ne la visite pas et ne la garde pas.
                  </p>
                </div>
              </form>
            </Etape>
          ) : site ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-baikal-border/70 rounded-md px-4 py-3 mb-10">
              <div>
                <span className={`${ETIQUETTE} text-baikal-text mr-3`}>SITE</span>
                <span className="font-mono text-white break-all">{site.domaine}</span>
              </div>
              <a href="/tester" className="font-mono text-xs text-baikal-cyan hover:text-white transition-colors">
                CHANGER DE SITE
              </a>
            </div>
          ) : null}

          {/* ----------------------------------------------- 2. Le prompt */}
          {jeton && prompt && (
            <Etape n={site ? '02' : '01'} titre={site ? 'Collez ce prompt dans votre agent' : 'Reprenez avec votre agent'}>
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <BoutonCopier texte={prompt} libelle="COPIER LE PROMPT" grand />
                  <p className="text-sm leading-relaxed">
                    Claude Code, Cursor, ou l'agent que vous utilisez déjà, ouvert sur le code de{' '}
                    {site ? <span className="text-white">{site.domaine}</span> : 'votre site'}.
                  </p>
                </div>

                {site && (
                  <ol className="space-y-3">
                    {[
                      ['Il retrouve votre projet', 'Le bon dépôt et la bonne base, parmi ceux qu\'il a sous la main.'],
                      ['Il écrit ce qu\'il faut', 'Un rôle qui ne peut que lire, et deux vues. Il n\'ajoute que de la lecture et ne touche à rien d\'existant.'],
                      ['Il lance le test et vous rend un lien', 'D\'une traite, sans vous poser de questions. Le lien est celui de cette page : le résultat s\'y affiche tout seul.'],
                    ].map(([titre, texte], i) => (
                      <li key={titre} className="flex gap-4">
                        <span className="font-mono text-baikal-cyan shrink-0">{i + 1}</span>
                        <div>
                          <div className="text-white">{titre}</div>
                          <p className="text-sm leading-relaxed">{texte}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}

                {suivi && (
                  <div
                    className={`rounded-md border p-5 ${
                      suivi.ton === 'pret'
                        ? 'border-baikal-cyan/60 bg-baikal-cyan/5'
                        : suivi.ton === 'cours'
                          ? 'border-amber-400/40 bg-amber-400/5'
                          : 'border-baikal-border bg-baikal-surface/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {suivi.ton === 'attente' && (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-baikal-cyan opacity-60" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-baikal-cyan" />
                        </span>
                      )}
                      <span
                        className={`${ETIQUETTE} ${
                          suivi.ton === 'pret' || suivi.ton === 'attente' ? 'text-baikal-cyan' : suivi.ton === 'cours' ? 'text-amber-400' : 'text-baikal-text'
                        }`}
                      >
                        {suivi.titre}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed mt-2">{suivi.texte}</p>
                    {suivi.ton === 'veille' && (
                      <button
                        type="button"
                        onClick={() => setRelance((n) => n + 1)}
                        className="mt-3 px-3 py-1.5 rounded border border-baikal-cyan/60 text-baikal-cyan font-mono text-[11px] tracking-wider hover:bg-baikal-cyan hover:text-black transition-colors"
                      >
                        REPRENDRE LA SURVEILLANCE
                      </button>
                    )}
                  </div>
                )}

                <div className="border border-baikal-border/70 rounded-md p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`${ETIQUETTE} text-baikal-text mb-1`}>
                      VOTRE LIEN PRIVÉ{resultat?.expire_le ? ` · GARDÉ JUSQU'AU ${jour(resultat.expire_le).toUpperCase()}` : ' · GARDÉ 30 JOURS'}
                    </div>
                    <div className="font-mono text-xs text-white break-all">{lienPrive}</div>
                  </div>
                  <BoutonCopier texte={lienPrive} libelle="COPIER LE LIEN" />
                </div>

                <details className="border border-baikal-border/70 rounded-md">
                  <summary className="cursor-pointer px-5 py-3 font-mono text-xs tracking-wider text-baikal-text">
                    LIRE LE PROMPT · {Math.round(prompt.length / 1000)} 000 CARACTÈRES
                  </summary>
                  <pre className="overflow-auto max-h-96 px-5 pb-5 font-mono text-[12.5px] leading-relaxed text-baikal-text whitespace-pre">
                    <code>{prompt}</code>
                  </pre>
                </details>
              </div>
            </Etape>
          )}

          {/* ------------------------------------------- 3. Le diagnostic */}
          {resultat?.diagnostic && (
            <Etape n={site ? '03' : '02'} titre="Ce que Baikal voit dans votre base">
              <Diagnostic d={resultat.diagnostic} tronque={resultat.tronque} />
            </Etape>
          )}

          {/* --------------------------------------------- 4. Le résultat */}
          {rapport && (
            <div ref={vueResultat} className="scroll-mt-24">
              <Etape n={site ? '04' : '03'} titre="Le résultat du test">
                <div className="space-y-10">
                  <p className="text-sm">
                    {resultat.teste_le && <>Joué le {jour(resultat.teste_le)} · </>}
                    schéma <span className="font-mono text-white">{rapport.schema}</span> · lu sous le rôle{' '}
                    <span className="font-mono text-white">{rapport.utilisateur ?? 'inconnu'}</span>
                  </p>
                  <Niveau n={1} decompte={rapport.resume.niveau1} pret={rapport.resume.niveau1_pret} controles={rapport.controles} />
                  <Niveau n={2} decompte={rapport.resume.niveau2} pret={rapport.resume.niveau2_pret} controles={rapport.controles} />
                </div>
              </Etape>
            </div>
          )}

          {/* ---------------------------------------- Le chemin à la main */}
          <details className="mt-12 border border-baikal-border/70 rounded-md" id="connexion">
            <summary className="cursor-pointer px-5 py-4 text-white">
              Vous n'avez pas d'agent ? Faites-le à la main
            </summary>
            <div className="px-5 pb-6 space-y-6">
              <p className="leading-relaxed text-sm">
                Deux gestes : exécuter un script dans l'éditeur SQL de votre base, puis coller ici son adresse
                de connexion. Vous écrirez ensuite les vues vous-même, à partir du prompt.
              </p>

              <div className="space-y-4">
                <div className={`${ETIQUETTE} text-baikal-cyan`}>1 · LE RÔLE EN LECTURE SEULE</div>
                <BlocCode
                  titre="À EXÉCUTER DANS VOTRE BASE · sql"
                  texte={role}
                  hauteur="max-h-64"
                  pied={<>Le mot de passe est tiré au hasard dans votre navigateur ; la page le remettra dans votre adresse.</>}
                />
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
                  <span className="shrink-0">Le rôle existe déjà ? Exécutez seulement :</span>
                  <code className="flex-1 min-w-0 break-all bg-[#070A10] border border-baikal-border rounded px-3 py-2 font-mono text-xs text-baikal-text">
                    {roleExistant}
                  </code>
                  <BoutonCopier texte={roleExistant} />
                </div>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); lancer('diagnostiquer'); }}
                className="space-y-4 relative"
                noValidate
              >
                <div className={`${ETIQUETTE} text-baikal-cyan`}>2 · L'ADRESSE DE VOTRE BASE</div>
                <label className="block">
                  <span className="block text-sm mb-2">Telle que votre hébergeur la donne, sans y toucher.</span>
                  <input
                    type="text"
                    value={adresse}
                    onChange={(e) => { setAdresse(e.target.value); setErreur(null); }}
                    placeholder="postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={champ}
                  />
                </label>
                {/* Piège à robots : invisible pour un humain. */}
                <div className="absolute -left-[9999px] top-0" aria-hidden="true">
                  <label>
                    Site web
                    <input type="text" tabIndex={-1} autoComplete="off" value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} />
                  </label>
                </div>
                {prete?.ok && (
                  <div className="border border-baikal-cyan/30 bg-baikal-cyan/5 rounded-md px-4 py-3 text-sm leading-relaxed">
                    <div className={`${ETIQUETTE} text-baikal-cyan mb-1.5`}>BAIKAL SE CONNECTERA AVEC</div>
                    <div className="font-mono text-xs text-white break-all">{prete.apercu}</div>
                    {prete.remplace.motDePasse && (
                      <p className="mt-2">
                        {prete.remplace.utilisateur
                          ? 'La page a mis le rôle baikal_reader et le mot de passe du script.'
                          : 'La page a mis le mot de passe du script.'}{' '}
                        Rien d'autre de votre adresse n'est envoyé : ni votre utilisateur, ni son mot de passe.
                      </p>
                    )}
                    {prete.conseil && <p className="mt-2 text-amber-300">{prete.conseil}</p>}
                  </div>
                )}
                <ul className="text-sm leading-relaxed space-y-1.5">
                  <li>
                    Sur Supabase : bouton <span className="text-white">Connect</span> en haut du projet, puis{' '}
                    <span className="text-white">Session pooler</span>.
                  </li>
                  <li>Postgres uniquement, en connexion chiffrée. Le test ne fait que lire.</li>
                  <li>Baikal ne garde pas cette adresse : ni en base, ni dans ses journaux.</li>
                </ul>
                {erreur && (
                  <p role="alert" className="border border-red-500/50 bg-red-900/20 rounded-md px-4 py-3 text-red-300 text-sm">
                    {erreur}
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button type="submit" disabled={occupe || !prete} className={BOUTON_PLEIN}>
                    {etat === 'diagnostic' ? 'LECTURE DE LA STRUCTURE…' : 'LIRE MA BASE'}
                  </button>
                  <button
                    type="button"
                    onClick={() => lancer('tester')}
                    disabled={occupe || !prete}
                    className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-baikal-border text-white font-mono text-sm tracking-wide hover:border-baikal-cyan hover:text-baikal-cyan transition-colors disabled:opacity-40"
                  >
                    {etat === 'test' ? 'TEST EN COURS…' : rapport ? 'RELANCER LE TEST' : 'LANCER LE TEST'}
                  </button>
                </div>
              </form>
            </div>
          </details>
        </main>

        <footer className="border-t border-baikal-border/70">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-baikal-text">
            <div className="flex items-center gap-3">
              <span className="text-white tracking-[0.18em]">BAIKAL</span>
              <span className="text-baikal-text/50">·</span>
              <span>withbaikal.io</span>
            </div>
            <Link to="/" className="hover:text-white transition-colors">Ce qu'est Baikal</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
