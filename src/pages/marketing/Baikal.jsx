/**
 * Baikal.jsx - Landing publique de Baikal (withbaikal.io)
 * ============================================================================
 * Positionnement décidé le 07/09/2026 : le back-office des fondateurs qui
 * vibecodent un SaaS (Supabase + Stripe + Vercel + Resend). On ne vend pas
 * « un admin panel » mais le portefeuille de sites, le contrat plutôt que le
 * schéma, la jointure base + Stripe + Search Console, et l'onboarding par
 * l'agent du client. Aucun prix affiché : Eric n'en a pas fixé.
 *
 * Route : "/" (App.jsx). Le formulaire dépose dans admin.demandes via l'EF
 * baikal-demande (sans session, honeypot `site_web`).
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { demandesService } from '../../services/demandes.service';

// ---------------------------------------------------------------------------
// Contenu
// ---------------------------------------------------------------------------
const MODULES = [
  {
    code: 'CLIENTS',
    titre: 'Clients',
    texte:
      "Chaque client lu comme un événement commercial : inscription, paiement, abonnement, " +
      "avec son funnel, son origine et sa fiche. Lu en direct dans votre base, jamais copié.",
  },
  {
    code: 'FINANCES',
    titre: 'Finances',
    texte:
      "Les ventes rapprochées de vos dossiers, vos charges, et avec Stripe les frais réels et les " +
      "remboursements. Une archive quotidienne qui retrouve les ventes que votre base comptait pour zéro.",
  },
  {
    code: 'SEO',
    titre: 'SEO',
    texte:
      "Google et Bing dans un seul tableau, semaine par semaine. Positions, pages clés, " +
      "autorité face aux concurrents, et un audit relu que vous pouvez lancer vous-même.",
  },
  {
    code: 'RAPPORTS',
    titre: 'Rapports',
    texte:
      "Un PDF mensuel prêt pour un associé ou un partenaire : ventes, compte de partage, " +
      "lecture SEO, évolutions du logiciel tirées de vos commits. Archivé, versionné.",
  },
];

const ETAPES = [
  {
    n: '01',
    titre: 'Votre site publie une vue',
    texte:
      "Une vue SQL nommée baikal_dossiers, avec des colonnes convenues. Pas de colonne abonnement ? " +
      "Le module n'en parle pas. Pas de vue ? Le module n'existe pas. Rien ne casse.",
  },
  {
    n: '02',
    titre: 'Un rôle en lecture seule',
    texte:
      "Baikal lit votre base avec un rôle Postgres qui ne peut rien écrire, et Stripe avec une clé " +
      "restreinte. Les actions qui modifient passent par une route de votre backend, avec votre secret.",
  },
  {
    n: '03',
    titre: 'Votre agent fait le travail',
    texte:
      "Le contrat d'intégration est un prompt. Vous le collez dans Cursor ou Claude Code, l'agent " +
      "écrit la vue, le rôle et les policies. Vous relisez, vous appliquez.",
  },
];

const PAS = [
  "Un générateur d'écrans CRUD à partir de votre schéma. Supabase Studio le fait déjà.",
  "Un outil qui écrit dans votre base. Baikal lit, et relaie vos actions à vos fonctions.",
  "Un tableau de bord Stripe de plus. Les ventes n'ont de sens que rapprochées de vos dossiers.",
];

const CONTRAT = `create view public.baikal_dossiers as
select
  d.id,
  d.email,
  d.created_at        as cree_le,
  d.paid_at           as paye_le,        -- client payant = paye_le renseigné
  d.amount_cents / 100.0 as montant_ttc,
  d.plan              as offre,
  d.funnel_step       as etape,          -- vos étapes, déclarées à Baikal
  d.is_test           as est_test,
  d.attribution                          -- figée à la capture, jamais réécrite
from public.orders d
where d.deleted_at is null;

grant select on public.baikal_dossiers to baikal_reader;`;

// Même liste que PILES dans l'EF baikal-demande.
const PILES = [
  ['postgres_stripe', 'Postgres + Stripe'],
  ['postgres', 'Postgres, sans Stripe'],
  ['autre_base', 'Autre base (MySQL, Mongo…)'],
];

// ---------------------------------------------------------------------------
// Aperçu console (illustration, données fictives)
// ---------------------------------------------------------------------------
function ApercuConsole() {
  const lignes = [
    ['monsaas.fr', '38', '1 214 €', '+4'],
    ['app-devis.io', '12', '311 €', '+1'],
    ['carnet-rge.fr', '4', '96 €', '—'],
  ];
  return (
    <div
      className="relative bg-baikal-surface/80 backdrop-blur border border-baikal-border rounded-md overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,240,255,0.25)] animate-fadeInUp"
      style={{ animationDelay: '320ms', opacity: 0 }}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-baikal-border">
        <span className="font-mono text-[11px] tracking-[0.2em] text-baikal-cyan">PORTEFEUILLE · SEPTEMBRE</span>
        <span className="font-mono text-[11px] text-baikal-text">aperçu</span>
      </div>
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-baikal-text/70 text-[10px] uppercase tracking-wider">
            <th className="text-left px-4 py-2 font-normal">Site</th>
            <th className="text-right px-4 py-2 font-normal">Payés</th>
            <th className="text-right px-4 py-2 font-normal">CA TTC</th>
            <th className="text-right px-4 py-2 font-normal">Pos.</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(([site, payes, ca, pos]) => (
            <tr key={site} className="border-t border-baikal-border/60">
              <td className="px-4 py-2.5 text-white">{site}</td>
              <td className="px-4 py-2.5 text-right text-baikal-text">{payes}</td>
              <td className="px-4 py-2.5 text-right text-white">{ca}</td>
              <td className={`px-4 py-2.5 text-right ${pos.startsWith('+') ? 'text-baikal-cyan' : 'text-baikal-text'}`}>{pos}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-baikal-border text-[11px] font-mono text-baikal-text flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="text-baikal-cyan">●</span> lu en direct dans 3 bases</span>
        <span>stripe · rapproché</span>
        <span>gsc · j-3</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulaire de demande
// ---------------------------------------------------------------------------
function origineDepuisNavigateur() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const utm = ['utm_source', 'utm_medium', 'utm_campaign']
    .map((k) => (params.get(k) ? `${k}=${params.get(k)}` : null))
    .filter(Boolean)
    .join('&');
  const ref = document.referrer || '';
  return [ref, utm].filter(Boolean).join(' | ') || null;
}

function FormulaireDemande() {
  const [email, setEmail] = useState('');
  const [site, setSite] = useState('');
  const [pile, setPile] = useState('postgres_stripe');
  const [message, setMessage] = useState('');
  const [siteWeb, setSiteWeb] = useState(''); // honeypot
  const [etat, setEtat] = useState('idle'); // idle | envoi | ok | erreur
  const [erreur, setErreur] = useState(null);
  const origine = useMemo(origineDepuisNavigateur, []);

  const envoyer = async (e) => {
    e.preventDefault();
    if (etat === 'envoi') return;
    setEtat('envoi');
    setErreur(null);
    const { error } = await demandesService.deposer({
      email, site, pile, message, origine, site_web: siteWeb,
    });
    if (error) {
      setErreur(error.message);
      setEtat('erreur');
      return;
    }
    setEtat('ok');
  };

  if (etat === 'ok') {
    return (
      <div className="border border-baikal-cyan/60 bg-baikal-cyan/5 rounded-md p-8">
        <div className="font-mono text-[11px] tracking-[0.2em] text-baikal-cyan mb-3">DEMANDE REÇUE</div>
        <p className="text-white text-lg leading-relaxed">
          Merci. On vous écrit à <span className="font-mono">{email}</span> pour regarder votre site
          ensemble et voir ce qu'il faut publier.
        </p>
      </div>
    );
  }

  const champ =
    'w-full bg-baikal-bg border border-baikal-border rounded-md px-4 py-3 text-white placeholder:text-baikal-text/50 ' +
    'focus:border-baikal-cyan focus:outline-none focus:ring-1 focus:ring-baikal-cyan/40 transition-colors';

  return (
    <form onSubmit={envoyer} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block font-mono text-[11px] tracking-[0.2em] text-baikal-text mb-2">EMAIL</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@votre-saas.fr"
            className={champ}
          />
        </label>
        <label className="block">
          <span className="block font-mono text-[11px] tracking-[0.2em] text-baikal-text mb-2">VOTRE SAAS</span>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="https://…"
            className={champ}
          />
        </label>
      </div>
      <label className="block">
        <span className="block font-mono text-[11px] tracking-[0.2em] text-baikal-text mb-2">VOTRE PILE</span>
        <div className="flex flex-wrap gap-2">
          {PILES.map(([v, l]) => (
            <button
              type="button"
              key={v}
              onClick={() => setPile(v)}
              className={`px-3 py-2 rounded-md border font-mono text-xs transition-colors ${
                pile === v
                  ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
                  : 'border-baikal-border text-baikal-text hover:border-baikal-text'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </label>
      <label className="block">
        <span className="block font-mono text-[11px] tracking-[0.2em] text-baikal-text mb-2">
          CE QUI VOUS MANQUE AUJOURD'HUI <span className="text-baikal-text/50">(facultatif)</span>
        </span>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Je ne sais pas combien de clients ont vraiment payé ce mois-ci…"
          className={champ}
        />
      </label>
      {/* Honeypot : invisible pour un humain, rempli par les robots. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden="true">
        <label>
          Site web
          <input type="text" tabIndex={-1} autoComplete="off" value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} />
        </label>
      </div>
      {erreur && <p className="text-red-400 text-sm font-mono">{erreur}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={etat === 'envoi' || !email.includes('@')}
          className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-baikal-cyan text-black font-mono text-sm font-semibold tracking-wide hover:bg-white transition-colors disabled:opacity-40 disabled:hover:bg-baikal-cyan"
        >
          {etat === 'envoi' ? 'ENVOI…' : 'DEMANDER UN ACCÈS'}
        </button>
        <p className="text-xs text-baikal-text leading-relaxed">
          Accès anticipé : on branche votre site à la main, avec vous. Tarif par site, communiqué
          aux premiers utilisateurs. Votre adresse ne sert qu'à vous répondre.
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Baikal() {
  useEffect(() => {
    const precedent = document.title;
    document.title = 'Baikal · Le back-office de vos SaaS';
    return () => { document.title = precedent; };
  }, []);

  const apparition = (ms) => ({ animationDelay: `${ms}ms`, opacity: 0 });

  return (
    <div className="bg-baikal-bg min-h-screen text-baikal-text selection:bg-baikal-cyan selection:text-black">
      {/* Fond : grille technique + halo cyan, fixes derrière tout */}
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
        <div
          className="absolute -top-40 right-[-10%] w-[700px] h-[700px] rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.7) 0%, rgba(0,240,255,0) 65%)' }}
        />
      </div>

      <div className="relative z-10">
        {/* ------------------------------------------------------------ NAV */}
        <nav className="border-b border-baikal-border/70 backdrop-blur bg-baikal-bg/70 sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
            <a href="#haut" className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-md bg-baikal-cyan flex items-center justify-center font-mono font-bold text-black text-sm">B</span>
              <span className="font-mono font-semibold text-white tracking-[0.18em] text-sm">BAIKAL</span>
            </a>
            <div className="flex items-center gap-6">
              <a href="#branchement" className="hidden sm:inline font-mono text-xs tracking-wider text-baikal-text hover:text-white transition-colors">
                COMMENT ÇA SE BRANCHE
              </a>
              <a href="#demande" className="hidden sm:inline font-mono text-xs tracking-wider text-baikal-text hover:text-white transition-colors">
                DEMANDER UN ACCÈS
              </a>
              <Link
                to="/login"
                className="px-4 py-2 font-mono text-xs tracking-wider border border-baikal-cyan text-baikal-cyan rounded-md hover:bg-baikal-cyan hover:text-black transition-colors"
              >
                CONSOLE
              </Link>
            </div>
          </div>
        </nav>

        {/* ----------------------------------------------------------- HERO */}
        <section id="haut" className="max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            <div className="lg:col-span-7">
              <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-6 animate-fadeInUp" style={apparition(0)}>
                BACK-OFFICE · POSTGRES · STRIPE · SEARCH CONSOLE
              </div>
              <h1
                className="font-serif text-white text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4.4rem] mb-8 animate-fadeInUp"
                style={apparition(80)}
              >
                Vos SaaS ont des clients.
                <br />
                <span className="italic text-baikal-cyan">Vous n'avez pas de back-office.</span>
              </h1>
              <p className="text-lg sm:text-xl leading-relaxed max-w-xl mb-10 animate-fadeInUp" style={apparition(160)}>
                Baikal lit vos bases Postgres, où qu'elles soient, vos ventes Stripe et votre Search
                Console, et vous rend une console : clients, finances, SEO, rapports. Pour tous vos
                sites. Sans une ligne d'admin à écrire.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 animate-fadeInUp" style={apparition(240)}>
                <a
                  href="#demande"
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-md bg-baikal-cyan text-black font-mono text-sm font-semibold tracking-wide hover:bg-white transition-colors"
                >
                  DEMANDER UN ACCÈS
                </a>
                <a
                  href="#branchement"
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-md border border-baikal-border text-white font-mono text-sm tracking-wide hover:border-baikal-cyan hover:text-baikal-cyan transition-colors"
                >
                  COMMENT ÇA SE BRANCHE →
                </a>
              </div>
            </div>
            <div className="lg:col-span-5">
              <ApercuConsole />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- CONSTAT */}
        <section className="border-y border-baikal-border/70 bg-baikal-surface/40">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              ['SEMAINE 1', 'Le front est en ligne. Cursor, Lovable ou Claude Code ont fait le travail.'],
              ['SEMAINE 2', 'Postgres tient la base, Stripe encaisse. Première vente.'],
              ['SEMAINE 3', "Combien de clients ont payé ? D'où viennent-ils ? Vous ouvrez trois onglets et une requête SQL."],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-3">{k}</div>
                <p className="text-white/90 leading-relaxed">{v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- MODULES */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
          <div className="max-w-2xl mb-14">
            <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-4">CE QUE VOUS VOYEZ</div>
            <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight">
              Quatre modules, lus dans vos données, pas dans une copie.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-baikal-border/70 border border-baikal-border/70 rounded-md overflow-hidden">
            {MODULES.map((m, i) => (
              <div key={m.code} className="bg-baikal-bg p-8 hover:bg-baikal-surface/60 transition-colors group">
                <div className="flex items-baseline justify-between mb-5">
                  <span className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan">{String(i + 1).padStart(2, '0')}_{m.code}</span>
                  <span className="font-mono text-[11px] text-baikal-text/50 group-hover:text-baikal-cyan transition-colors">→</span>
                </div>
                <h3 className="font-serif text-white text-2xl mb-3">{m.titre}</h3>
                <p className="leading-relaxed">{m.texte}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-xs text-baikal-text/70">
            Et autour : utilisateurs et droits par module, prospects, campagnes partenaires.
          </p>
        </section>

        {/* --------------------------------------------------- PORTEFEUILLE */}
        <section className="border-y border-baikal-border/70">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5">
              <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-4">UN PORTEFEUILLE, PAS UN SITE</div>
              <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight mb-6">
                Vous avez lancé trois produits cette année. Ils vivent dans trois bases différentes.
              </h2>
              <p className="leading-relaxed">
                Tout le marché fait « une app, un admin ». Baikal fait « N sites, une console ». Chaque
                site garde sa base, ses secrets et son hébergement : Supabase, Neon, un serveur à vous,
                peu importe tant que c'est Postgres. Vous changez de site en haut à gauche, les mêmes
                modules s'ouvrent, avec le vocabulaire de ce site-là.
              </p>
            </div>
            <div className="lg:col-span-7 lg:pl-8">
              <ul className="space-y-4">
                {[
                  ['Un compte, des portes', "Le compte est unique. On lui ouvre un site, un module, en lecture ou en écriture. Un associé voit les finances de son produit et rien d'autre."],
                  ['Chaque site déclare ses capacités', "Pas de vue abonnement ? Pas d'onglet abonnement. Baikal ne montre que ce que le site publie, et ne tombe jamais en erreur sur ce qu'il n'a pas."],
                  ['Les actions restent chez vous', "Renvoyer un email, relancer une extraction, créditer un compte : Baikal appelle une route de votre backend, avec votre secret. Il n'écrit jamais lui-même."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-4 border border-baikal-border/70 rounded-md p-5 bg-baikal-surface/30">
                    <span className="font-mono text-baikal-cyan mt-1">▸</span>
                    <div>
                      <div className="text-white font-medium mb-1">{t}</div>
                      <p className="text-sm leading-relaxed">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- BRANCHEMENT */}
        <section id="branchement" className="max-w-6xl mx-auto px-5 sm:px-8 py-24 scroll-mt-20">
          <div className="max-w-2xl mb-14">
            <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-4">COMMENT ÇA SE BRANCHE</div>
            <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight">
              Un contrat, pas une intégration. Votre agent l'exécute.
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <ol className="lg:col-span-5 space-y-8">
              {ETAPES.map((e) => (
                <li key={e.n} className="flex gap-5">
                  <span className="font-serif text-4xl text-baikal-cyan/40 leading-none w-12 shrink-0">{e.n}</span>
                  <div>
                    <h3 className="text-white text-lg font-medium mb-2">{e.titre}</h3>
                    <p className="leading-relaxed text-sm">{e.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="lg:col-span-7">
              <div className="bg-[#070A10] border border-baikal-border rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-baikal-border">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-baikal-text">CONTRAT · baikal_dossiers (extrait)</span>
                  <span className="font-mono text-[11px] text-baikal-cyan">sql</span>
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-baikal-text">
                  <code>{CONTRAT}</code>
                </pre>
              </div>
              <div className="mt-4 border border-baikal-cyan/30 bg-baikal-cyan/5 rounded-md p-5">
                <div className="font-mono text-[11px] tracking-[0.2em] text-baikal-cyan mb-2">À COLLER DANS VOTRE AGENT</div>
                <p className="text-sm leading-relaxed text-white/90">
                  « Publie une vue <span className="font-mono">baikal_dossiers</span> selon le contrat Baikal,
                  crée le rôle <span className="font-mono">baikal_reader</span> en lecture seule avec ses policies,
                  et donne-moi le DSN à transmettre. » Le contrat complet vous est remis avec l'accès.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- CE QUE PAS */}
        <section className="border-y border-baikal-border/70 bg-baikal-surface/40">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-4">CE QUE BAIKAL N'EST PAS</div>
              <h2 className="font-serif text-white text-3xl leading-tight">Autant le dire tout de suite.</h2>
            </div>
            <ul className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              {PAS.map((p) => (
                <li key={p} className="border-l border-baikal-border pl-5">
                  <span className="font-mono text-red-400/80 text-xs block mb-2">NON</span>
                  <p className="text-sm leading-relaxed text-white/90">{p}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------- EN USAGE */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-4">EN USAGE</div>
              <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight mb-6">
                Construit pour nos propres SaaS, avec de l'argent réel dedans.
              </h2>
              <p className="leading-relaxed mb-4">
                Baikal est le back-office quotidien des produits de Confer : Pack Vendeur, Autorisation
                Voirie, MonsieurDPE, et une dizaine d'autres sites en portefeuille. Il sert chaque mois à
                produire le compte de partage d'un partenariat SEO, ligne à ligne, à partir des ventes Stripe
                rapprochées des dossiers.
              </p>
              <p className="leading-relaxed text-sm text-baikal-text/80">
                Nous l'ouvrons maintenant à quelques fondateurs, en accès anticipé, pour vérifier qu'il
                s'applique à d'autres sites que les nôtres. C'est un outil jeune : on le branche avec vous.
              </p>
            </div>
            <div className="lg:col-span-5">
              <div className="grid grid-cols-2 gap-px bg-baikal-border/70 border border-baikal-border/70 rounded-md overflow-hidden font-mono">
                {[
                  ['3', 'bases Postgres lues'],
                  ['1', 'compte Stripe rapproché'],
                  ['J-3', 'fenêtre Search Console'],
                  ['0', 'écriture dans vos bases'],
                ].map(([v, l]) => (
                  <div key={l} className="bg-baikal-bg p-6">
                    <div className="text-3xl text-white mb-1">{v}</div>
                    <div className="text-[11px] tracking-wider text-baikal-text uppercase">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ DEMANDE */}
        <section id="demande" className="border-t border-baikal-border/70 scroll-mt-20">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-24 grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5">
              <div className="font-mono text-[11px] tracking-[0.25em] text-baikal-cyan mb-4">DEMANDER UN ACCÈS</div>
              <h2 className="font-serif text-white text-3xl sm:text-4xl leading-tight mb-6">
                Dites-nous où vit votre SaaS. On regarde ensemble.
              </h2>
              <p className="leading-relaxed text-sm">
                Vous recevez une réponse humaine, le contrat d'intégration à donner à votre agent, et un
                accès à la console une fois la vue publiée. Il faut une base Postgres ; Stripe ne sert
                qu'au module Finances. Si votre pile ne colle pas, on vous le dit.
              </p>
            </div>
            <div className="lg:col-span-7 relative">
              <FormulaireDemande />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- FOOTER */}
        <footer className="border-t border-baikal-border/70">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-baikal-text">
            <div className="flex items-center gap-3">
              <span className="text-white tracking-[0.18em]">BAIKAL</span>
              <span className="text-baikal-text/50">·</span>
              <span>withbaikal.io</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/confer" className="hover:text-white transition-colors">Une marque Confer</Link>
              <Link to="/login" className="hover:text-baikal-cyan transition-colors">Accès console</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
