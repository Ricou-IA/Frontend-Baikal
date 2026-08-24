/**
 * ConsoleLayout.jsx - Baikal Console
 * ============================================================================
 * Layout commun de la console multi-sites : header sticky BAIKAL_CONSOLE,
 * selecteur de site global (AppProvider monte ici, une seule fois),
 * navigation contextuelle (modules du site + modules transverses).
 *
 * Usage : <ConsoleLayout actif="seo">…contenu…</ConsoleLayout>
 * `actif` ∈ dashboard|knowledge|prompts|indexation|seo|partenariats|users|sites
 * `badges` optionnel : { knowledge: 3 } affiche un badge sur l'onglet.
 * ============================================================================
 */
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, BookOpen, MessageSquareCode, Database,
    TrendingUp, Mail, Users, Globe, Shield, Settings, LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AppProvider, useApp } from '../../contexts/AppContext';
import AppSelector from '../AppSelector';
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
    { id: 'seo', label: 'SEO', icon: TrendingUp, route: '/seo' },
    { id: 'partenariats', label: 'Partenariats', icon: Mail, route: '/partenariats' },
    { id: 'users', label: 'Utilisateurs', icon: Users, route: '/admin/users' },
    { id: 'sites', label: 'Sites', icon: Globe, route: '/sites', superAdmin: true },
];

function Onglet({ tab, actif, badge, onClick }) {
    const Icon = tab.icon;
    const isActive = actif === tab.id;
    return (
        <button
            onClick={onClick}
            className={`relative flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
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
    const { profile, isSuperAdmin, isImpersonating, signOut } = useAuth();
    const { currentApp, setCurrentApp, availableApps } = useApp();

    const modulesSite = (MODULES_SITE[currentApp] || [])
        .filter((t) => !t.superAdmin || isSuperAdmin);
    const transverses = MODULES_TRANSVERSES
        .filter((t) => !t.superAdmin || isSuperAdmin);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-baikal-bg">
            <header className="bg-baikal-surface border-b border-baikal-border sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-baikal-cyan rounded-md flex items-center justify-center">
                                <Shield className="w-5 h-5 text-black" />
                            </div>
                            <h1 className="text-lg font-mono font-bold text-white hidden md:block">
                                BAIKAL_CONSOLE
                            </h1>
                            {/* Selecteur de site global */}
                            <AppSelector
                                currentApp={currentApp}
                                onAppChange={setCurrentApp}
                                apps={availableApps}
                                showLabel={false}
                                className="w-56"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            {isSuperAdmin && !isImpersonating && <ProfileSwitcher />}
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
                                className="p-2 text-baikal-text hover:text-baikal-cyan hover:bg-baikal-bg rounded-md transition-colors"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleSignOut}
                                className="p-2 text-baikal-text hover:text-red-400 hover:bg-red-900/20 rounded-md transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="bg-baikal-surface border-b border-baikal-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <nav className="flex gap-1 -mb-px overflow-x-auto items-center">
                        {modulesSite.map((tab) => (
                            <Onglet key={tab.id} tab={tab} actif={actif}
                                badge={badges[tab.id]}
                                onClick={() => navigate(tab.route)} />
                        ))}
                        {modulesSite.length > 0 && (
                            <span className="mx-2 h-6 w-px bg-baikal-border" aria-hidden="true" />
                        )}
                        {transverses.map((tab) => (
                            <Onglet key={tab.id} tab={tab} actif={actif}
                                badge={badges[tab.id]}
                                onClick={() => navigate(tab.route)} />
                        ))}
                    </nav>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
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
