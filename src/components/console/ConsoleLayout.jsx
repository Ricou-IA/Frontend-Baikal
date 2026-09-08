/**
 * ConsoleLayout.jsx - Baikal Console
 * ============================================================================
 * Layout commun de la console multi-sites : header sticky BAIKAL_CONSOLE,
 * colonne de gauche listant les sites (AppProvider monte ici, une seule
 * fois), navigation contextuelle (modules du site + modules transverses).
 *
 * Usage : <ConsoleLayout actif="seo">…contenu…</ConsoleLayout>
 * `actif` ∈ dashboard|knowledge|prompts|indexation|clients|prospects|finances|rapports|seo|partenariats|users|sites
 *         ou, pour l'etage Baikal (/baikal), baikal-comptes|baikal-acces|baikal-superadmins|baikal-registre|baikal-metiers
 * `badges` optionnel : { knowledge: 3 } affiche un badge sur l'onglet.
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, BookOpen, MessageSquareCode, Database, FolderOpen,
    TrendingUp, Mail, Users, Globe, Shield, Settings, LogOut, Euro, Target, FileText,
    KeyRound, ListChecks, Tags, UserCog, Inbox } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AppProvider, useApp } from '../../contexts/AppContext';
import SiteSidebar, { SiteBarre } from './SiteSidebar';
import NouvelleVersion from './NouvelleVersion';
import { BoutonSite, FeuilleSites, BarreBasse, PRINCIPAUX_SITE, PRINCIPAUX_BAIKAL } from './NavMobile';
import { ProfileSwitcher } from '../admin';
import supabase from '../../lib/supabaseClient';

// Modules propres au site selectionne (ARPET est le seul a en avoir).
const MODULES_SITE = {
    arpet: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, route: '/admin' },
        { id: 'knowledge', label: 'Connaissances', icon: BookOpen, route: '/admin?tab=knowledge' },
        { id: 'prompts', label: 'Prompts', icon: MessageSquareCode, route: '/admin?tab=prompts', superAdmin: true },
        { id: 'indexation', label: 'Indexation', icon: Database, route: '/admin?tab=indexation', superAdmin: true },
    ],
};

// Modules transverses, quel que soit le site.
const MODULES_TRANSVERSES = [
    { id: 'clients', label: 'Clients', icon: FolderOpen, route: '/clients' },
    { id: 'prospects', label: 'Prospects', icon: Target, route: '/prospect' },
    { id: 'finances', label: 'Finances', icon: Euro, route: '/finances' },
    { id: 'rapports', label: 'Rapports', icon: FileText, route: '/rapports' },
    { id: 'seo', label: 'SEO', icon: TrendingUp, route: '/seo' },
    { id: 'partenariats', label: 'Partenariats', icon: Mail, route: '/partenariats' },
    { id: 'users', label: 'Utilisateurs', icon: Users, route: '/admin/users' },
    { id: 'sites', label: 'Paramétrage', icon: Globe, route: '/sites', superAdmin: true },
];

// Etage Baikal (super_admin) : ce qui n'appartient a aucun site.
const MODULES_BAIKAL = [
    { id: 'baikal-comptes', label: 'Comptes', icon: Users, route: '/baikal?tab=comptes' },
    { id: 'baikal-acces', label: 'Accès par site', icon: KeyRound, route: '/baikal?tab=acces' },
    { id: 'baikal-superadmins', label: 'Super admins', icon: UserCog, route: '/baikal?tab=superadmins' },
    { id: 'baikal-registre', label: 'Registre des sites', icon: ListChecks, route: '/baikal?tab=registre' },
    { id: 'baikal-metiers', label: 'Métiers', icon: Tags, route: '/baikal?tab=metiers' },
    { id: 'baikal-demandes', label: 'Demandes', icon: Inbox, route: '/baikal?tab=demandes' },
];

// Page d'arrivee quand on quitte l'etage Baikal pour un site.
function routeAccueilSite(appId) {
    return appId === 'arpet' ? '/admin' : '/clients';
}

function Onglet({ tab, actif, badge, onClick }) {
    const Icon = tab.icon;
    const isActive = actif === tab.id;
    return (
        <button
            onClick={onClick}
            data-actif={isActive ? 'true' : undefined}
            className={`relative shrink-0 flex items-center gap-2 px-3 sm:px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive
                    ? 'border-baikal-cyan text-baikal-cyan'
                    : 'border-transparent text-baikal-text hover:text-white hover:border-baikal-border'}`}
        >
            <Icon className="w-4 h-4" />
            {tab.label}
            {badge ? (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-md font-mono">
                    {badge}
                </span>
            ) : null}
        </button>
    );
}

function LayoutInterne({ actif, badges = {}, children }) {
    const navigate = useNavigate();
    const { profile, isSuperAdmin, isOrgAdmin, sitesAdmin, niveauModule, isImpersonating, signOut } = useAuth();
    const { currentApp, setCurrentApp, availableApps } = useApp();
    // Etage Baikal : la page /baikal passe actif="baikal-<onglet>".
    const estBaikal = typeof actif === 'string' && actif.startsWith('baikal');

    // Sites visibles dans le selecteur : super_admin -> tous ; sinon les
    // sites delegues (admin.droits_sites) + le site de sa propre org.
    const appOrg = profile?.app_id || 'arpet';
    const sitesVisibles = isSuperAdmin
        ? availableApps
        : availableApps.filter((a) =>
            sitesAdmin.includes(a.id) || (isOrgAdmin && a.id === appOrg));

    // Mobile : la barre d'onglets défile ; on amène l'onglet actif dans le
    // champ de vision à chaque changement (sinon il peut être hors écran).
    const navRef = useRef(null);
    useEffect(() => {
        const el = navRef.current?.querySelector('[data-actif="true"]');
        el?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }, [actif]);

    // Tableaux en cartes sous md (index.css) : chaque cellule reçoit en
    // data-label le texte de son en-tête, pour que la carte lise
    // « libellé : valeur ». Rejoué à chaque changement du DOM de la page.
    const mainRef = useRef(null);
    useEffect(() => {
        const racine = mainRef.current;
        if (!racine) return undefined;
        const etiqueter = () => {
            racine.querySelectorAll('table:not(.tableau-large)').forEach((table) => {
                const entetes = [...(table.tHead?.rows?.[0]?.cells || [])].map((th) => th.innerText.trim());
                if (entetes.length === 0) return;
                for (const corps of table.tBodies) {
                    for (const ligne of corps.rows) {
                        let i = 0;
                        for (const cellule of ligne.cells) {
                            const libelle = cellule.colSpan > 1 ? '' : entetes[i];
                            if (libelle) cellule.dataset.label = libelle;
                            else delete cellule.dataset.label;
                            i += cellule.colSpan || 1;
                        }
                    }
                }
            });
        };
        etiqueter();
        const observateur = new MutationObserver(etiqueter);
        observateur.observe(racine, { childList: true, subtree: true });
        return () => observateur.disconnect();
    }, []);

    // Si le site courant n'est pas visible, basculer sur le premier autorise.
    useEffect(() => {
        if (sitesVisibles.length > 0 && !sitesVisibles.some((a) => a.id === currentApp)) {
            setCurrentApp(sitesVisibles[0].id);
        }
    }, [sitesVisibles, currentApp, setCurrentApp]);

    // Modules du site : membres d'une org du site, delegues du site, super.
    const peutModulesSite = isSuperAdmin
        || sitesAdmin.includes(currentApp)
        || (isOrgAdmin && appOrg === currentApp);
    const modulesSite = (peutModulesSite ? (MODULES_SITE[currentApp] || []) : [])
        .filter((t) => !t.superAdmin || isSuperAdmin);

    // Modules transverses : droit delegue sur le site courant (ou super), et
    // module ouvert (lecture ou ecriture) dans la grille d'acces. Un module
    // ferme disparait du menu ; l'EF le refuse de toute facon.
    // L'appartenance a une org ne donne jamais les transverses.
    const peutTransverses = isSuperAdmin || sitesAdmin.includes(currentApp);
    const transverses = peutTransverses
        ? MODULES_TRANSVERSES.filter((t) => !t.superAdmin || isSuperAdmin)
            .filter((t) => t.superAdmin || niveauModule(currentApp, t.id) !== null)
        : [];

    // Navigation téléphone (sous md) : feuille des sites et feuille « Plus ».
    const [feuilleSites, setFeuilleSites] = useState(false);
    const [feuillePlus, setFeuillePlus] = useState(false);
    useEffect(() => { setFeuilleSites(false); setFeuillePlus(false); }, [actif, currentApp]);

    const ordrePrincipaux = estBaikal ? PRINCIPAUX_BAIKAL : PRINCIPAUX_SITE;
    const tousTransverses = estBaikal ? MODULES_BAIKAL : transverses;
    const principaux = ordrePrincipaux
        .map((id) => tousTransverses.find((t) => t.id === id))
        .filter(Boolean);
    const secondaires = [
        { titre: estBaikal ? 'Étage Baikal' : 'Modules', modules: tousTransverses.filter((t) => !ordrePrincipaux.includes(t.id)) },
        { titre: 'Propres au site', modules: estBaikal ? [] : modulesSite },
    ];
    const siteCourant = availableApps.find((a) => a.id === currentApp);
    const libelleSite = estBaikal ? 'Baikal' : (siteCourant?.name || 'Site');

    // Selection d'un site depuis l'etage Baikal : on quitte /baikal.
    const choisirSite = (appId) => {
        setCurrentApp(appId);
        if (estBaikal) navigate(routeAccueilSite(appId));
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-baikal-bg">
            <NouvelleVersion />
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
                <div className="px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Bloc identite, cale sur la largeur de la colonne des sites */}
                        <div className="flex items-center gap-3 min-w-0 shrink xl:w-64 xl:pr-6">
                            <div className="w-9 h-9 bg-baikal-cyan rounded-md flex items-center justify-center shrink-0">
                                <Shield className="w-5 h-5 text-black" />
                            </div>
                            <h1 className="text-lg font-mono font-bold text-white hidden md:block">
                                BAIKAL_CONSOLE
                            </h1>
                        </div>
                        <BoutonSite libelle={libelleSite} ouvert={feuilleSites} onToggle={() => setFeuilleSites((o) => !o)} />
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            {isSuperAdmin && !isImpersonating && !estBaikal && <span className="hidden md:block"><ProfileSwitcher /></span>}
                            {isImpersonating && (
                                <div className="px-3 py-1.5 bg-amber-900/20 text-amber-300 border border-amber-500/50 rounded-md text-sm font-mono">
                                    👤 {profile?.full_name || profile?.email}
                                </div>
                            )}
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan rounded-md text-sm font-mono">
                                <Shield className="w-4 h-4" />
                                {isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN'}
                            </div>
                            <button
                                onClick={() => navigate('/settings')}
                                className="hidden md:block p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleSignOut}
                                className="hidden md:block p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Entre md et xl, la liste des sites se replie en une rangee defilante.
                Sous md, elle devient le bouton de site de l'en-tete (NavMobile). */}
            <div className="hidden md:block">
                <SiteBarre sites={sitesVisibles} actif={currentApp} onSelect={choisirSite}
                    baikal={isSuperAdmin} baikalActif={estBaikal} onBaikal={() => navigate('/baikal')} />
            </div>
            <FeuilleSites ouverte={feuilleSites} onFermer={() => setFeuilleSites(false)}
                sites={sitesVisibles} actif={currentApp} onSelect={choisirSite}
                baikal={isSuperAdmin} baikalActif={estBaikal} onBaikal={() => navigate('/baikal')} />

            <div className="flex items-start">
                <SiteSidebar sites={sitesVisibles} actif={currentApp} onSelect={choisirSite}
                    baikal={isSuperAdmin} baikalActif={estBaikal} onBaikal={() => navigate('/baikal')} />

                <div className="flex-1 min-w-0">
                    <div className="hidden md:block bg-baikal-surface border-b border-baikal-border">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                            <nav ref={navRef} className="flex gap-1 -mb-px overflow-x-auto items-center">
                                {estBaikal && (
                                    <span className="flex items-center gap-1.5 pr-3 mr-1 text-xs font-mono uppercase tracking-wider text-baikal-cyan border-r border-baikal-border">
                                        <Shield className="w-3.5 h-3.5" /> Baikal
                                    </span>
                                )}
                                {!estBaikal && modulesSite.map((tab) => (
                                    <Onglet key={tab.id} tab={tab} actif={actif}
                                        badge={badges[tab.id]}
                                        onClick={() => navigate(tab.route)} />
                                ))}
                                {!estBaikal && modulesSite.length > 0 && (
                                    <span className="mx-2 h-6 w-px bg-baikal-border" aria-hidden="true" />
                                )}
                                {(estBaikal ? MODULES_BAIKAL : transverses).map((tab) => (
                                    <Onglet key={tab.id} tab={tab} actif={actif}
                                        badge={badges[tab.id]}
                                        onClick={() => navigate(tab.route)} />
                                ))}
                            </nav>
                        </div>
                    </div>

                    <main ref={mainRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
                        <p className="md:hidden mb-3 text-[11px] font-mono uppercase tracking-wider text-baikal-cyan truncate">
                            {libelleSite}
                            {isImpersonating && <span className="ml-2 text-amber-300 normal-case tracking-normal">· vu comme {profile?.email}</span>}
                        </p>
                        {children}
                    </main>
                </div>
            </div>

            <BarreBasse principaux={principaux} secondaires={secondaires} actif={actif} badges={badges}
                onNavigate={(route) => navigate(route)}
                plusOuvert={feuillePlus} onTogglePlus={() => setFeuillePlus((o) => !o)}
                onSettings={() => navigate('/settings')} onSignOut={handleSignOut} />
        </div>
    );
}

export default function ConsoleLayout({ actif, badges, children }) {
    return (
        <AppProvider supabaseClient={supabase} defaultApp="arpet">
            <LayoutInterne actif={actif} badges={badges}>
                {children}
            </LayoutInterne>
        </AppProvider>
    );
}
