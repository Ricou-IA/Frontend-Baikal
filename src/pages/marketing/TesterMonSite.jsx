/**
 * TesterMonSite.jsx - « Tester mon site », le parcours d'onboarding public
 * ============================================================================
 * Un fondateur dont le SaaS tourne sur Postgres découvre, sans compte ni
 * email, ce que Baikal peut suivre chez lui, ce qui manque, et comment le
 * corriger avec son agent de code. Il relance le test jusqu'à zéro échec.
 *
 * Routes : "/tester" et "/tester/r/:jeton" (lien privé gardé 30 jours).
 * Liée depuis la landing depuis le 15/11/2026 (décision d'Eric, qui la teste
 * en production). Elle reste en `noindex` tant qu'il ne l'a pas annoncée.
 *
 * Ce que la page garde : rien. La connexion vit dans la mémoire de l'onglet,
 * le mot de passe du rôle est tiré au hasard ICI et ne part jamais seul vers
 * Baikal. Il n'entre PAS dans le prompt : le prompt interdit à l'agent
 * d'écrire ce mot de passe dans le dépôt, il ne doit donc pas le recevoir.
 * Le script du rôle vient du même fichier que celui du prompt
 * (_shared/recette/prompt.ts) : une seule source, pas de recopie.
 *
 * Plan : docs/superpowers/plans/2026-11-15-tester-mon-site.md (lot 4).
 * ============================================================================
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { testSiteService } from '../../services/testSite.service';
import { scriptRole } from '../../../supabase/functions/_shared/recette/prompt.ts';

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

function BoutonCopier({ texte, libelle = 'COPIER' }) {
  const [etat, setEtat] = useState('idle'); // idle | ok | echec
  const clic = async () => {
    setEtat((await copier(texte)) ? 'ok' : 'echec');
    setTimeout(() => setEtat('idle'), 2500);
  };
  return (
    <button
      type="button"
      onClick={clic}
      className="shrink-0 px-3 py-1.5 rounded border border-baikal-cyan/60 text-baikal-cyan font-mono text-[11px] tracking-wider hover:bg-baikal-cyan hover:text-black transition-colors"
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
export default function TesterMonSite() {
  const { jeton: jetonDuLien } = useParams();
  const [porte, setPorte] = useState(null); // null | 'postgres'
  const [motDePasse, setMotDePasse] = useState(null); // tiré à l'ouverture de la porte
  const [connexion, setConnexion] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // piège à robots
  const [etat, setEtat] = useState(jetonDuLien ? 'lien' : 'idle'); // idle | lien | diagnostic | test
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null);
  const vueDiagnostic = useRef(null);
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

  // Le lien privé rouvre le dernier résultat.
  useEffect(() => {
    if (!jetonDuLien) return undefined;
    let actif = true;
    testSiteService.resultat(jetonDuLien).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message);
      else setResultat(data);
      setEtat('idle');
    });
    return () => { actif = false; };
  }, [jetonDuLien]);

  const ouvrirPorte = () => {
    setPorte('postgres');
    setMotDePasse((m) => m ?? motDePasseAuHasard());
  };

  const lancer = async (action) => {
    if (etat !== 'idle' || !connexion.trim()) return;
    setEtat(action === 'tester' ? 'test' : 'diagnostic');
    setErreur(null);
    const { data, error } = await testSiteService[action]({
      connexion: connexion.trim(),
      jeton: resultat?.jeton,
      site_web: siteWeb,
    });
    setEtat('idle');
    if (error) {
      setErreur(error.message);
      return;
    }
    if (!data?.jeton) return; // réponse du piège à robots : rien à montrer
    setResultat(data);
    // L'adresse devient le lien privé, sans recharger la page : la connexion
    // saisie reste en mémoire pour relancer le test.
    window.history.replaceState(null, '', `/tester/r/${data.jeton}`);
    requestAnimationFrame(() => {
      (action === 'tester' ? vueResultat : vueDiagnostic).current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const schema = resultat?.diagnostic?.schema_contrat ?? resultat?.diagnostic?.table_principale?.schema ?? 'public';
  // Seule la première partie du script s'exécute telle quelle : les droits sur
  // les vues et les tables viennent avec les vues, dans le prompt.
  const role = motDePasse ? scriptRole(schema, motDePasse).split('\n\n-- 2.')[0] : '';
  const prompt = resultat?.prompt;
  const lienPrive = resultat?.jeton ? `${window.location.origin}/tester/r/${resultat.jeton}` : null;
  const occupe = etat === 'diagnostic' || etat === 'test';
  const rapport = resultat?.rapport;

  const champ =
    'w-full bg-baikal-bg border border-baikal-border rounded-md px-4 py-3 text-white font-mono text-sm ' +
    'placeholder:text-baikal-text/50 focus:border-baikal-cyan focus:outline-none focus:ring-1 focus:ring-baikal-cyan/40 transition-colors';

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
          <div className={`${ETIQUETTE} text-baikal-cyan mb-5`}>SANS COMPTE · SANS EMAIL · LECTURE SEULE</div>
          <h1 className="font-serif text-white text-4xl sm:text-5xl leading-[1.08] mb-6">
            Que verrait Baikal <span className="italic text-baikal-cyan">dans votre base ?</span>
          </h1>
          <p className="text-lg leading-relaxed max-w-2xl">
            Donnez à Baikal un accès en lecture à votre Postgres. Il vous dit ce qu'il peut suivre chez vous,
            ce qui manque, et vous remet le prompt à donner à votre agent pour le corriger. Vous relancez le
            test jusqu'à zéro échec.
          </p>
        </header>

        <main className="max-w-3xl mx-auto px-5 sm:px-8 pb-24">
          {etat === 'lien' && <p className="font-mono text-sm text-baikal-cyan py-8">OUVERTURE DE VOTRE DERNIER RÉSULTAT…</p>}

          {/* ------------------------------------------------ 1. La porte */}
          <Etape n="01" titre="Par quelle porte entrez-vous ?">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="rounded-md border border-baikal-border/60 p-5 opacity-60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">Connecter Supabase</span>
                  <span className={`${ETIQUETTE} text-baikal-text`}>BIENTÔT</span>
                </div>
                <p className="text-sm leading-relaxed">
                  Un clic, sans rien copier. En attendant, une base Supabase passe par l'autre porte.
                </p>
              </div>
              <button
                type="button"
                onClick={ouvrirPorte}
                aria-expanded={porte === 'postgres'}
                className={`text-left rounded-md border p-5 transition-colors ${
                  porte === 'postgres' ? 'border-baikal-cyan bg-baikal-cyan/5' : 'border-baikal-border hover:border-baikal-cyan'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">Autre Postgres</span>
                  <span className="font-mono text-baikal-cyan">{porte === 'postgres' ? '▾' : '▸'}</span>
                </div>
                <p className="text-sm leading-relaxed">
                  Neon, un serveur à vous, Supabase aussi : une adresse de connexion suffit.
                </p>
              </button>
            </div>

            {porte === 'postgres' && (
              <div className="space-y-4">
                <p className="leading-relaxed">
                  Baikal ne crée jamais de rôle chez vous. Exécutez ce script vous-même, dans l'éditeur SQL
                  de votre base : il crée <span className="font-mono text-white">baikal_reader</span>, un
                  rôle qui ne peut que lire. Le mot de passe vient d'être tiré au hasard dans votre
                  navigateur : Baikal ne le connaît pas, et votre agent n'a pas à le connaître.
                </p>
                <BlocCode
                  titre="LE RÔLE EN LECTURE SEULE · sql"
                  texte={role}
                  hauteur="max-h-64"
                  pied={
                    <>
                      Les droits sur vos vues et vos tables viendront avec les vues : ils sont dans le prompt
                      de l'étape 4.
                    </>
                  }
                />
              </div>
            )}
          </Etape>

          {/* -------------------------------------------- 2. La connexion */}
          <Etape n="02" titre="Votre adresse de connexion" ancre="connexion">
            <form
              onSubmit={(e) => { e.preventDefault(); lancer('diagnostiquer'); }}
              className="space-y-4 relative"
              noValidate
            >
              <label className="block">
                <span className={`block ${ETIQUETTE} text-baikal-text mb-2`}>CONNEXION POSTGRES</span>
                <input
                  type="text"
                  value={connexion}
                  onChange={(e) => setConnexion(e.target.value)}
                  placeholder="postgresql://baikal_reader:motdepasse@hôte:5432/base"
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
              <ul className="text-sm leading-relaxed space-y-1.5">
                <li>Postgres uniquement, en connexion chiffrée. Le test ne fait que lire.</li>
                <li>Baikal ne garde pas cette adresse : ni en base, ni dans ses journaux.</li>
                <li>
                  Sur Supabase, prenez l'adresse « Session pooler » : l'utilisateur s'y écrit{' '}
                  <span className="font-mono text-white">baikal_reader.référence-du-projet</span>.
                </li>
              </ul>
              {erreur && (
                <p role="alert" className="border border-red-500/50 bg-red-900/20 rounded-md px-4 py-3 text-red-300 text-sm">
                  {erreur}
                </p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                <button type="submit" disabled={occupe || !connexion.trim()} className={BOUTON_PLEIN}>
                  {etat === 'diagnostic' ? 'LECTURE DE LA STRUCTURE…' : resultat ? 'REFAIRE LE DIAGNOSTIC' : 'LANCER LE DIAGNOSTIC'}
                </button>
                {resultat && !connexion.trim() && (
                  <p className="text-sm">Recollez votre adresse pour relancer : Baikal ne l'a pas gardée.</p>
                )}
              </div>
            </form>
          </Etape>

          {/* ------------------------------------------- 3. Le diagnostic */}
          {resultat?.diagnostic && (
            <div ref={vueDiagnostic} className="scroll-mt-24">
              <Etape n="03" titre="Ce que Baikal voit dans votre base">
                <Diagnostic d={resultat.diagnostic} tronque={resultat.tronque} />
              </Etape>
            </div>
          )}

          {/* ------------------------------------- 4. Le prompt et le test */}
          {resultat?.diagnostic && (
            <Etape n="04" titre="Donnez le prompt à votre agent, puis testez">
              <div className="space-y-6">
                <p className="leading-relaxed">
                  Collez ce prompt dans Cursor, Claude Code ou l'agent que vous utilisez. Il contient le
                  contrat, ce que Baikal a vu chez vous{rapport ? ' et le dernier résultat du test' : ''}. Votre
                  agent écrit les vues et les droits ; vous relisez, vous appliquez, vous relancez.
                </p>
                {prompt && (
                  <BlocCode
                    titre={`LE PROMPT · ${Math.round(prompt.length / 1000)} 000 caractères`}
                    texte={prompt}
                    hauteur="max-h-72"
                  />
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button
                    type="button"
                    onClick={() => lancer('tester')}
                    disabled={occupe || !connexion.trim()}
                    className={BOUTON_PLEIN}
                  >
                    {etat === 'test' ? 'TEST EN COURS…' : rapport ? 'RELANCER LE TEST' : 'LANCER LE TEST'}
                  </button>
                  <p className="text-sm leading-relaxed">
                    {etat === 'test'
                      ? 'Jusqu\'à une minute : chaque contrôle est une lecture dans votre base.'
                      : !connexion.trim()
                        ? <>Recollez votre adresse à l'<a href="#connexion" className="text-baikal-cyan underline">étape 2</a> pour lancer le test.</>
                        : 'Le test lit vos vues, contrôle par contrôle.'}
                  </p>
                </div>

                {lienPrive && (
                  <div className="border border-baikal-border/70 rounded-md p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`${ETIQUETTE} text-baikal-text mb-1`}>
                        VOTRE LIEN PRIVÉ · GARDÉ JUSQU'AU {jour(resultat.expire_le).toUpperCase()}
                      </div>
                      <div className="font-mono text-xs text-white break-all">{lienPrive}</div>
                    </div>
                    <BoutonCopier texte={lienPrive} libelle="COPIER LE LIEN" />
                  </div>
                )}

                {rapport && (
                  <div ref={vueResultat} className="scroll-mt-24 space-y-10 pt-4">
                    <div>
                      <h3 className="font-serif text-white text-2xl mb-1">Le résultat du test</h3>
                      <p className="text-sm">
                        {resultat.teste_le && <>Joué le {jour(resultat.teste_le)} · </>}
                        schéma <span className="font-mono text-white">{rapport.schema}</span> · lu sous le rôle{' '}
                        <span className="font-mono text-white">{rapport.utilisateur ?? 'inconnu'}</span>
                      </p>
                    </div>
                    <Niveau n={1} decompte={rapport.resume.niveau1} pret={rapport.resume.niveau1_pret} controles={rapport.controles} />
                    <Niveau n={2} decompte={rapport.resume.niveau2} pret={rapport.resume.niveau2_pret} controles={rapport.controles} />
                  </div>
                )}
              </div>
            </Etape>
          )}
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
