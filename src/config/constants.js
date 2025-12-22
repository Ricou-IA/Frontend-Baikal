/**
 * Constants - Baikal Console
 * ============================================================================
 * Constantes de configuration pour l'application.
 * 
 * PHASE 2 (21/12/2025):
 * - Ajout constantes identité projet (MARKET_TYPES, PROJECT_TYPES)
 * - MAIN_TRADES conservé pour usage futur (non utilisé en Phase 2)
 * ============================================================================
 */

// ============================================
// IDENTITÉ PROJET - PHASE 2
// ============================================

/**
 * Types de marchés BTP
 */
export const MARKET_TYPES = Object.freeze({
    public: {
      value: 'public',
      label: 'Marché Public',
      description: 'Marché soumis au Code de la Commande Publique',
    },
    prive: {
      value: 'prive',
      label: 'Marché Privé',
      description: 'Marché de droit privé',
    },
  });
  
  export const MARKET_TYPE_OPTIONS = Object.values(MARKET_TYPES);
  
  /**
   * Types de projet BTP
   */
  export const PROJECT_TYPES = Object.freeze({
    entreprise_generale: {
      value: 'entreprise_generale',
      label: 'Entreprise Générale',
      description: 'Tous corps d\'état',
    },
    macro_lot: {
      value: 'macro_lot',
      label: 'Macro-Lot',
      description: 'Groupement de plusieurs lots',
    },
    gros_oeuvre: {
      value: 'gros_oeuvre',
      label: 'Gros-Œuvre',
      description: 'Structure, fondations, maçonnerie',
    },
    lots_techniques: {
      value: 'lots_techniques',
      label: 'Lots Techniques',
      description: 'CVC, électricité, plomberie, etc.',
    },
    lots_architecturaux: {
      value: 'lots_architecturaux',
      label: 'Lots Architecturaux',
      description: 'Menuiseries, revêtements, peinture, etc.',
    },
  });
  
  export const PROJECT_TYPE_OPTIONS = Object.values(PROJECT_TYPES);
  
  /**
   * Corps d'état principaux (NON UTILISÉ en Phase 2 - conservé pour usage futur)
   */
  export const MAIN_TRADES = Object.freeze({
    entreprise_generale: {
      value: 'entreprise_generale',
      label: 'Entreprise Générale',
    },
    macro_lot: {
      value: 'macro_lot',
      label: 'Macro-Lot',
    },
    gros_oeuvre: {
      value: 'gros_oeuvre',
      label: 'Gros-Œuvre',
    },
    lots_techniques: {
      value: 'lots_techniques',
      label: 'Lots Techniques',
    },
    lots_architecturaux: {
      value: 'lots_architecturaux',
      label: 'Lots Architecturaux',
    },
  });
  
  export const MAIN_TRADES_OPTIONS = Object.values(MAIN_TRADES);
  
  /**
   * Validation de l'identité projet (PHASE 2 - SANS main_trades)
   */
  export const validateProjectIdentity = (identity) => {
    const errors = {};
  
    if (!identity.market_type) {
      errors.market_type = 'Type de marché requis';
    } else if (!MARKET_TYPES[identity.market_type]) {
      errors.market_type = 'Type de marché invalide';
    }
  
    if (!identity.project_type) {
      errors.project_type = 'Type de projet requis';
    } else if (!PROJECT_TYPES[identity.project_type]) {
      errors.project_type = 'Type de projet invalide';
    }
  
    if (!identity.description || identity.description.trim().length === 0) {
      errors.description = 'Description requise';
    }
  
    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  };
  