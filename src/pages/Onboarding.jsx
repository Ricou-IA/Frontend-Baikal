/**
 * Onboarding.jsx - Baikal Console
 * ============================================================================
 * Page de qualification après inscription.
 * L'utilisateur choisit son rôle métier.
 * Redirige vers /admin après complétion.
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { completeOnboarding } from '../lib/supabaseClient';
import { 
  Briefcase, 
  Building2, 
  Loader2, 
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

// Configuration des rôles
const ROLES = [
  {
    id: 'provider',
    title: 'Je suis Expert',
    subtitle: 'Consultant, Auditeur, Avocat...',
    description: 'J\'utilise l\'IA pour augmenter ma productivité et servir mes clients.',
    icon: Briefcase,
    color: 'indigo',
    features: [
      'Créez votre base de connaissances',
      'Automatisez vos analyses',
      'Générez des rapports intelligents'
    ]
  },
  {
    id: 'client',
    title: 'Je suis Client',
    subtitle: 'Entreprise, PME, Organisation...',
    description: 'Je cherche à exploiter l\'IA pour améliorer mes processus internes.',
    icon: Building2,
    color: 'slate',
    features: [
      'Centralisez vos documents',
      'Posez des questions à votre data',
      'Collaborez avec votre équipe'
    ]
  }
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  
  // États
  const [selectedRole, setSelectedRole] = useState(null);
  const [bio, setBio] = useState('');
  const [step, setStep] = useState(1); // 1: Choix du rôle, 2: Bio optionnelle
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * Passer à l'étape suivante
   */
  const handleNext = () => {
    if (!selectedRole) {
      setError('Veuillez sélectionner un rôle pour continuer.');
      return;
    }
    setError('');
    setStep(2);
  };

  /**
   * Finaliser l'onboarding
   */
  const handleComplete = async () => {
    if (!selectedRole) return;

    setLoading(true);
    setError('');

    try {
      await completeOnboarding(selectedRole, bio || null);
      await refreshProfile();
      navigate('/admin'); // ← Changé de /dashboard vers /admin
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Passer la bio (optionnel)
   */
  const handleSkip = async () => {
    setBio('');
    await handleComplete();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            Bienvenue sur Baikal Console
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            {step === 1 ? 'Comment utiliserez-vous la plateforme ?' : 'Parlez-nous de vous'}
          </h1>
          <p className="text-slate-600 mt-2">
            {step === 1 
              ? 'Cette information nous aide à personnaliser votre expérience.'
              : 'Une courte description pour que les autres sachent qui vous êtes.'}
          </p>
        </div>

        {/* Indicateur de progression */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
          <div className={`w-12 h-1 rounded ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
          <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-300'}`} />
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Étape 1: Choix du rôle */}
        {step === 1 && (
          <>
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`
                      relative p-6 rounded-2xl border-2 text-left transition-all duration-200
                      ${isSelected 
                        ? 'border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-100' 
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                      }
                    `}
                  >
                    {/* Icône de sélection */}
                    {isSelected && (
                      <div className="absolute top-4 right-4">
                        <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                      </div>
                    )}

                    {/* Icône du rôle */}
                    <div className={`
                      w-14 h-14 rounded-xl flex items-center justify-center mb-4
                      ${isSelected ? 'bg-indigo-600' : 'bg-slate-100'}
                    `}>
                      <Icon className={`w-7 h-7 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                    </div>

                    {/* Contenu */}
                    <h3 className="text-xl font-semibold text-slate-900 mb-1">
                      {role.title}
                    </h3>
                    <p className="text-sm text-slate-500 mb-3">
                      {role.subtitle}
                    </p>
                    <p className="text-slate-600 mb-4">
                      {role.description}
                    </p>

                    {/* Features */}
                    <ul className="space-y-2">
                      {role.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm text-slate-600">
                          <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-500' : 'bg-slate-400'}`} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Bouton Continuer */}
            <div className="flex justify-center">
              <button
                onClick={handleNext}
                disabled={!selectedRole}
                className="inline-flex items-center px-8 py-3 text-lg font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continuer
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          </>
        )}

        {/* Étape 2: Bio optionnelle */}
        {step === 2 && (
          <div className="max-w-lg mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              {/* Rôle sélectionné */}
              <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg mb-6">
                {ROLES.find(r => r.id === selectedRole)?.icon && (
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                    {(() => {
                      const Icon = ROLES.find(r => r.id === selectedRole)?.icon;
                      return Icon ? <Icon className="w-5 h-5 text-white" /> : null;
                    })()}
                  </div>
                )}
                <div>
                  <p className="text-sm text-indigo-600 font-medium">Rôle sélectionné</p>
                  <p className="text-slate-900 font-semibold">
                    {ROLES.find(r => r.id === selectedRole)?.title}
                  </p>
                </div>
              </div>

              {/* Champ Bio */}
              <div className="mb-6">
                <label htmlFor="bio" className="block text-sm font-medium text-slate-700 mb-1">
                  Décrivez votre activité
                  <span className="text-slate-400 font-normal ml-1">(optionnel)</span>
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[120px] resize-none"
                  placeholder="Ex: Expert-comptable spécialisé dans les PME du secteur tech..."
                  maxLength={500}
                />
                <p className="text-sm text-slate-400 mt-1 text-right">
                  {bio.length}/500
                </p>
              </div>

              {/* Boutons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  disabled={loading}
                >
                  Retour
                </button>
                <button
                  onClick={handleSkip}
                  className="flex-1 px-4 py-2.5 border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
                  disabled={loading}
                >
                  Passer
                </button>
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      ...
                    </>
                  ) : (
                    <>
                      Terminer
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-slate-400 text-sm mt-8">
          Vous pourrez modifier ces informations plus tard dans les paramètres.
        </p>
      </div>
    </div>
  );
}
