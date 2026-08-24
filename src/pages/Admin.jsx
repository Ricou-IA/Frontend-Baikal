/**
 * Admin.jsx - Baikal Console
 * ============================================================================
 * Console d'administration : modules du site selectionne.
 *
 * L'enrobage (header, selecteur de site global, navigation) vit dans
 * ConsoleLayout. L'onglet actif est pilote par l'URL (/admin?tab=…) :
 * - dashboard (defaut), knowledge, prompts (super_admin), indexation (super_admin)
 * Ces modules n'existent que pour ARPET ; pour un autre site selectionne,
 * la page affiche la carte du site (registre config.apps).
 *
 * Acces :
 * - super_admin : tout voir, toutes les orgs, toutes les couches
 * - org_admin : sa propre org, couche org uniquement
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { useOrganization } from '../hooks/useOrganization';
import { documentsService } from '../services/documents.service';
import { siteStatsService } from '../services/siteStats.service';
import ConsoleLayout from '../components/console/ConsoleLayout';
import {
    AdminDashboard,
    IndexationSettings,
} from '../components/admin';
import Prompts from './Prompts';
import IngestionContent from './IngestionContent';
import { AlertCircle, Loader2 } from 'lucide-react';

// ============================================================================
// CARTE SITE (site selectionne sans module dedie)
// ============================================================================

function CarteSite() {
    const { getActiveApp } = useApp();
    const app = getActiveApp();
    if (!app) return null;
    return (
        <div className="max-w-xl mx-auto bg-baikal-surface border border-baikal-border rounded-lg p-6 space-y-3">
            <h2 className="text-xl font-semibold text-white">{app.name}</h2>
            {app.description && <p className="text-baikal-text">{app.description}</p>}
            <dl className="text-sm text-baikal-text space-y-1 font-mono">
                {app.domaine && (
                    <div>
                        <dt className="inline text-baikal-cyan">domaine </dt>
                        <dd className="inline">{app.domaine}</dd>
                    </div>
                )}
                {app.db_schema && (
                    <div>
                        <dt className="inline text-baikal-cyan">schema </dt>
                        <dd className="inline">{app.db_schema}</dd>
                    </div>
                )}
                <div>
                    <dt className="inline text-baikal-cyan">hebergement </dt>
                    <dd className="inline">{app.heberge_dedie ? 'base dediee' : 'base partagee'}</dd>
                </div>
            </dl>
            <p className="text-sm text-baikal-text">
                Pas de module dedie pour ce site. Modules transverses : SEO,
                Partenariats, Utilisateurs.
            </p>
        </div>
    );
}

// ============================================================================
// VUE D'ENSEMBLE DU SITE (KPIs via admin-site-stats, super_admin)
// ============================================================================

function fmtValeur(kpi) {
    if (kpi.format === 'eur') {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
        }).format(kpi.valeur || 0);
    }
    return new Intl.NumberFormat('fr-FR').format(kpi.valeur || 0);
}

function VueSite({ appId }) {
    const [stats, setStats] = useState(null);
    const [erreur, setErreur] = useState(null);
    const [chargement, setChargement] = useState(true);

    useEffect(() => {
        let actif = true;
        setChargement(true);
        setErreur(null);
        setStats(null);
        siteStatsService.getOverview(appId).then(({ data, error }) => {
            if (!actif) return;
            if (error) setErreur(error.message);
            setStats(data);
            setChargement(false);
        });
        return () => { actif = false; };
    }, [appId]);

    if (chargement) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
            </div>
        );
    }
    if (erreur) {
        return (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="font-mono">{erreur}</p>
            </div>
        );
    }
    if (!stats) return null;

    if (stats.mode === 'generique') {
        return (
            <div className="bg-baikal-surface border border-baikal-border rounded-lg p-6">
                <h3 className="text-sm font-mono text-baikal-text mb-3">
                    TABLES DU SITE (volumes estimes)
                </h3>
                <table className="w-full text-sm text-baikal-text">
                    <tbody>
                        {stats.tables.map((t) => (
                            <tr key={t.table} className="border-t border-baikal-border">
                                <td className="py-1.5 font-mono">{t.table}</td>
                                <td className="py-1.5 text-right">{new Intl.NumberFormat('fr-FR').format(t.lignes_estimees)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.kpis.map((kpi) => (
                    <div key={kpi.cle} className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
                        <p className="text-xs font-mono text-baikal-text uppercase">{kpi.libelle}</p>
                        <p className="text-2xl font-semibold text-white mt-1">{fmtValeur(kpi)}</p>
                    </div>
                ))}
            </div>
            {stats.dernieres?.lignes?.length > 0 && (
                <div className="bg-baikal-surface border border-baikal-border rounded-lg p-6 overflow-x-auto">
                    <h3 className="text-sm font-mono text-baikal-text mb-3 uppercase">
                        {stats.dernieres.titre}
                    </h3>
                    <table className="w-full text-sm text-baikal-text">
                        <thead>
                            <tr className="text-left text-xs font-mono uppercase">
                                {stats.dernieres.colonnes.map((c) => (
                                    <th key={c.cle} className="py-1.5 pr-4">{c.libelle}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {stats.dernieres.lignes.map((l, i) => (
                                <tr key={i} className="border-t border-baikal-border">
                                    {stats.dernieres.colonnes.map((c) => (
                                        <td key={c.cle} className="py-1.5 pr-4">
                                            {c.cle === 'montant'
                                                ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(l[c.cle] || 0)
                                                : String(l[c.cle] ?? '')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// CONTENU (sous le provider du layout)
// ============================================================================

function AdminContenu({ tab, effectiveOrgId }) {
    const navigate = useNavigate();
    const { isOrgAdmin, isSuperAdmin } = useAuth();
    const { currentApp } = useApp();

    // Hook pour la gestion de l'organisation
    const { error, refresh, loading } = useOrganization(effectiveOrgId);

    // Site sans module dedie : vue d'ensemble (super_admin) + carte du site.
    if (currentApp !== 'arpet') {
        return (
            <div className="space-y-8">
                {isSuperAdmin && <VueSite appId={currentApp} />}
                <CarteSite />
            </div>
        );
    }

    return (
        <>
            {/* Erreur globale */}
            {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-md flex items-center gap-3 text-red-300">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-mono">{error}</p>
                    <button
                        onClick={refresh}
                        className="ml-auto text-sm font-medium hover:underline font-mono"
                    >
                        RÉESSAYER
                    </button>
                </div>
            )}

            {/* Loader */}
            {loading && !['dashboard', 'prompts', 'indexation'].includes(tab) && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin" />
                </div>
            )}

            {/* Onglet Dashboard */}
            {tab === 'dashboard' && (
                <AdminDashboard
                    isSuperAdmin={isSuperAdmin}
                    isOrgAdmin={isOrgAdmin}
                    orgId={effectiveOrgId}
                    onNavigate={(route) => navigate(route)}
                />
            )}

            {/* Onglet Connaissances */}
            {tab === 'knowledge' && (
                <IngestionContent
                    orgId={effectiveOrgId}
                    isSuperAdmin={isSuperAdmin}
                />
            )}

            {/* Onglet Prompts (super_admin uniquement) */}
            {tab === 'prompts' && isSuperAdmin && (
                <Prompts embedded={true} />
            )}

            {/* Onglet Indexation (super_admin uniquement) */}
            {tab === 'indexation' && isSuperAdmin && (
                <IndexationSettings />
            )}
        </>
    );
}

// ============================================================================
// PAGE ADMIN PRINCIPALE
// ============================================================================

export default function Admin() {
    const { profile } = useAuth();
    const [searchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'dashboard';

    const [effectiveOrgId, setEffectiveOrgId] = useState(profile?.org_id || null);
    const [pendingCount, setPendingCount] = useState(0);

    // Charger le compteur de documents en attente
    useEffect(() => {
        async function loadPendingCount() {
            if (!effectiveOrgId) return;
            try {
                const { count } = await documentsService.getPendingCount(effectiveOrgId);
                setPendingCount(count || 0);
            } catch (err) {
                console.error('Error loading pending count:', err);
            }
        }
        loadPendingCount();
    }, [effectiveOrgId]);

    // Mise à jour de l'org_id effectif
    useEffect(() => {
        if (profile?.org_id) {
            setEffectiveOrgId(profile.org_id);
        }
    }, [profile?.org_id]);

    return (
        <ConsoleLayout actif={tab} badges={{ knowledge: pendingCount || undefined }}>
            <AdminContenu tab={tab} effectiveOrgId={effectiveOrgId} />
        </ConsoleLayout>
    );
}
