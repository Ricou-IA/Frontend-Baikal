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
// CONTENU (sous le provider du layout)
// ============================================================================

function AdminContenu({ tab, effectiveOrgId }) {
    const navigate = useNavigate();
    const { isOrgAdmin, isSuperAdmin } = useAuth();
    const { currentApp } = useApp();

    // Hook pour la gestion de l'organisation
    const { error, refresh, loading } = useOrganization(effectiveOrgId);

    // Site sans module dedie : carte du site.
    if (currentApp !== 'arpet') {
        return <CarteSite />;
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
