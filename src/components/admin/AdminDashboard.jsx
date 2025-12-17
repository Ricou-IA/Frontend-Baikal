/**
 * AdminDashboard.jsx - Baikal Console
 * ============================================================================
 * Dashboard d'administration avec statistiques et actions rapides.
 * 
 * Affiche :
 * - Cards cliquables : Users en attente, Total users, Orgs, Projets
 * - Répartition des utilisateurs par rôle (graphique)
 * - Actions rapides selon le contexte
 * 
 * Utilise :
 * - adminService.getDashboardCards()
 * - adminService.getUsersByRole()
 * 
 * @example
 * <AdminDashboard 
 *   isSuperAdmin={true} 
 *   onNavigate={(path) => navigate(path)} 
 * />
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { adminService } from '../../services';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Building2,
  FolderOpen,
  Shield,
  AlertCircle,
  Loader2,
  ChevronRight,
  TrendingUp,
  Clock,
  Plus,
  Mail,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Mapping des icônes par ID de card
 */
const ICON_MAP = {
  pending: UserPlus,
  total_users: Users,
  organizations: Building2,
  projects: FolderOpen,
};

/**
 * Mapping des icônes par rôle
 */
const ROLE_ICON_MAP = {
  super_admin: Shield,
  org_admin: Building2,
  team_leader: Users,
  user: Users,
};

// ============================================================================
// COMPOSANTS INTERNES
// ============================================================================

/**
 * Card de statistique cliquable
 */
function StatCard({ card, onClick }) {
  const Icon = ICON_MAP[card.id] || LayoutDashboard;
  const isHighPriority = card.priority === 'high';

  return (
    <button
      onClick={() => onClick(card.link)}
      className={`
        relative w-full text-left p-5 rounded-lg border transition-all duration-200
        bg-baikal-surface hover:bg-baikal-surface/80
        ${isHighPriority 
          ? 'border-amber-500/50 ring-1 ring-amber-500/20' 
          : 'border-baikal-border hover:border-baikal-border-light'
        }
        group
      `}
    >
      {/* Badge priorité haute */}
      {isHighPriority && (
        <span className="absolute -top-2 -right-2 flex h-5 w-5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-5 w-5 bg-amber-500 items-center justify-center">
            <span className="text-[10px] font-bold text-black">!</span>
          </span>
        </span>
      )}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${card.bgColor}`}>
            <Icon className={`w-5 h-5 ${card.textColor}`} />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-white">
              {adminService.formatNumber(card.value)}
            </p>
            <p className="text-sm text-baikal-text font-mono uppercase">
              {card.label}
            </p>
            {card.description && (
              <p className="text-xs text-baikal-text/70 font-sans mt-0.5">
                {card.description}
              </p>
            )}
          </div>
        </div>
        
        <ChevronRight className="w-5 h-5 text-baikal-text opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

/**
 * Barre de progression pour répartition par rôle
 */
function RoleBar({ role, total }) {
  const Icon = ROLE_ICON_MAP[role.role] || Users;
  const percentage = adminService.calculatePercentage(role.count, total);

  return (
    <div className="flex items-center gap-3">
      <div className={`p-1.5 rounded ${role.bgColor}`}>
        <Icon className={`w-4 h-4 ${role.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-mono text-white truncate">
            {role.label}
          </span>
          <span className="text-sm font-mono text-baikal-text ml-2">
            {role.count}
          </span>
        </div>
        <div className="h-2 bg-baikal-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${role.bgColor.replace('/10', '/40')}`}
            style={{ width: `${Math.max(percentage, 2)}%` }}
          />
        </div>
      </div>
      <span className="text-xs font-mono text-baikal-text w-10 text-right">
        {percentage}%
      </span>
    </div>
  );
}

/**
 * Bouton d'action rapide
 */
function QuickAction({ icon: Icon, label, description, onClick, variant = 'default' }) {
  const variants = {
    default: 'border-baikal-border hover:border-baikal-cyan/50 hover:bg-baikal-cyan/5',
    warning: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10',
    success: 'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/5',
  };

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200
        ${variants[variant]}
        group
      `}
    >
      <div className={`
        p-2 rounded-lg transition-colors
        ${variant === 'warning' ? 'bg-amber-500/20' : 'bg-baikal-surface'}
        group-hover:bg-baikal-cyan/20
      `}>
        <Icon className={`
          w-4 h-4 transition-colors
          ${variant === 'warning' ? 'text-amber-400' : 'text-baikal-text'}
          group-hover:text-baikal-cyan
        `} />
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-mono text-white">{label}</p>
        {description && (
          <p className="text-xs text-baikal-text font-sans">{description}</p>
        )}
      </div>
      <ArrowRight className="w-4 h-4 text-baikal-text opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/**
 * Section avec titre
 */
function Section({ title, icon: Icon, children, action }) {
  return (
    <div className="bg-baikal-surface rounded-lg border border-baikal-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono font-semibold text-white uppercase flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-baikal-cyan" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

/**
 * Dashboard d'administration
 * 
 * @param {Object} props
 * @param {boolean} props.isSuperAdmin - L'utilisateur est super_admin
 * @param {boolean} props.isOrgAdmin - L'utilisateur est org_admin
 * @param {string} props.orgId - ID de l'organisation (pour org_admin)
 * @param {Function} props.onNavigate - Callback de navigation
 */
export default function AdminDashboard({ 
  isSuperAdmin = false, 
  isOrgAdmin = false,
  orgId = null,
  onNavigate 
}) {
  // États
  const [cards, setCards] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Charger les données
  useEffect(() => {
    loadDashboardData();
  }, []);

  /**
   * Charge les données du dashboard
   */
  const loadDashboardData = async () => {
    try {
      setError(null);
      
      const [cardsResult, rolesResult] = await Promise.all([
        adminService.getDashboardCards(),
        adminService.getUsersByRole(),
      ]);

      if (cardsResult.error) throw cardsResult.error;
      if (rolesResult.error) throw rolesResult.error;

      setCards(cardsResult.data || []);
      setRoles(rolesResult.data || []);
    } catch (err) {
      console.error('[AdminDashboard] Error loading data:', err);
      setError(err.message || 'Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * Rafraîchir les données
   */
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
  };

  /**
   * Navigation vers une page
   */
  const handleNavigate = (path) => {
    if (onNavigate) {
      onNavigate(path);
    }
  };

  // Calculer le total des utilisateurs pour les pourcentages
  const totalUsers = roles.reduce((sum, r) => sum + r.count, 0);

  // Trouver le nombre de pending users
  const pendingCard = cards.find(c => c.id === 'pending');
  const hasPendingUsers = pendingCard && pendingCard.value > 0;

  // ============================================================================
  // RENDER - Loading
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-baikal-cyan animate-spin mx-auto mb-3" />
          <p className="text-sm text-baikal-text font-mono">CHARGEMENT_STATISTIQUES...</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER - Error
  // ============================================================================

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-mono font-semibold text-red-300">ERREUR_CHARGEMENT</h3>
            <p className="text-sm text-red-300/80 mt-1 font-sans">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-sm font-mono text-red-300 transition-colors"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER - Main
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-mono font-semibold text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-baikal-cyan" />
            TABLEAU_DE_BORD
          </h2>
          <p className="text-baikal-text text-sm mt-1 font-sans">
            Vue d'ensemble de l'administration
            {isSuperAdmin && ' • Mode Super Admin'}
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 text-baikal-text hover:text-white hover:bg-baikal-surface rounded-lg transition-colors disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alerte utilisateurs en attente */}
      {hasPendingUsers && isSuperAdmin && (
        <div className="bg-amber-900/20 border border-amber-500/50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-amber-300 font-mono">
                {pendingCard.value} UTILISATEUR{pendingCard.value > 1 ? 'S' : ''}_EN_ATTENTE
              </p>
              <p className="text-sm text-amber-400/80 font-sans">
                Des utilisateurs attendent d'être assignés à une organisation
              </p>
            </div>
          </div>
          <button
            onClick={() => handleNavigate('/admin/users?tab=pending')}
            className="px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors font-medium font-mono text-sm"
          >
            GÉRER
          </button>
        </div>
      )}

      {/* Cards statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <StatCard 
            key={card.id} 
            card={card} 
            onClick={handleNavigate} 
          />
        ))}
      </div>

      {/* Sections secondaires */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Répartition par rôle */}
        <Section 
          title="Répartition par rôle" 
          icon={TrendingUp}
        >
          {roles.length > 0 ? (
            <div className="space-y-4">
              {roles.map((role) => (
                <RoleBar 
                  key={role.role} 
                  role={role} 
                  total={totalUsers} 
                />
              ))}
            </div>
          ) : (
            <p className="text-baikal-text text-sm text-center py-4">
              Aucune donnée disponible
            </p>
          )}
        </Section>

        {/* Actions rapides */}
        <Section 
          title="Actions rapides" 
          icon={Plus}
        >
          <div className="space-y-3">
            {/* Action : Voir pending users (si super_admin et pending > 0) */}
            {isSuperAdmin && hasPendingUsers && (
              <QuickAction
                icon={UserPlus}
                label={`${pendingCard.value} utilisateur${pendingCard.value > 1 ? 's' : ''} en attente`}
                description="Assigner à une organisation"
                onClick={() => handleNavigate('/admin/users?tab=pending')}
                variant="warning"
              />
            )}

            {/* Action : Créer une invitation */}
            <QuickAction
              icon={Mail}
              label="Créer une invitation"
              description="Générer un code d'invitation"
              onClick={() => handleNavigate('/admin/invitations?action=create')}
            />

            {/* Action : Créer une organisation (super_admin) */}
            {isSuperAdmin && (
              <QuickAction
                icon={Building2}
                label="Nouvelle organisation"
                description="Créer une organisation"
                onClick={() => handleNavigate('/admin/organizations?action=create')}
              />
            )}

            {/* Action : Créer un projet */}
            <QuickAction
              icon={FolderOpen}
              label="Nouveau projet"
              description="Créer un projet"
              onClick={() => handleNavigate('/admin/projects?action=create')}
            />

            {/* Action : Gérer les utilisateurs */}
            <QuickAction
              icon={Users}
              label="Gérer les utilisateurs"
              description="Voir tous les membres"
              onClick={() => handleNavigate('/admin/users')}
            />
          </div>
        </Section>
      </div>

      {/* Footer info */}
      <div className="text-center text-xs text-baikal-text/50 font-mono pt-4">
        Données actualisées • Cliquez sur une card pour accéder à la section
      </div>
    </div>
  );
}
