/**
 * PromptForm.jsx - Baikal Console
 * ============================================================================
 * Formulaire de création et édition de prompts système.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Slider, SliderWithInput, WeightSlider } from '../components/ui/Slider';
import { Card, CardContent } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import promptsService from '../services/prompts.service';
import {
  canAccessPrompts,
  AGENT_TYPE_OPTIONS,
  LLM_MODEL_OPTIONS,
  DEFAULT_PARAMETERS,
  PARAMETER_LIMITS,
  PROMPT_CONFIG,
  PROMPT_MESSAGES,
  validatePrompt,
  getPromptLengthStatus,
} from '../config/prompts';

// ============================================================================
// COMPOSANT SECTION REPLIABLE
// ============================================================================

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-slate-500" />}
          <span className="font-medium text-slate-700">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {isOpen && <div className="p-4 border-t border-slate-200">{children}</div>}
    </div>
  );
}

// ============================================================================
// COMPOSANT INDICATEUR DE TAILLE DU PROMPT
// ============================================================================

function PromptLengthIndicator({ length }) {
  const status = getPromptLengthStatus(length);
  const percentage = Math.min((length / PROMPT_CONFIG.idealLength) * 100, 100);

  const colors = {
    ideal: { bar: 'bg-green-500', text: 'text-green-600' },
    warning: { bar: 'bg-amber-500', text: 'text-amber-600' },
    error: { bar: 'bg-red-500', text: 'text-red-600' },
  };

  const color = colors[status.status];

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-500">
          {length.toLocaleString()} / {PROMPT_CONFIG.idealLength.toLocaleString()} caractères
        </span>
        <span className={color.text}>
          {status.status === 'ideal' && '✓'} {status.message}
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color.bar} transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// FORMULAIRE PRINCIPAL
// ============================================================================

function PromptForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { success, error: showError } = useToast();

  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    agent_type: '',
    vertical_id: '',
    org_id: '',
    system_prompt: '',
    is_active: true,
    parameters: { ...DEFAULT_PARAMETERS },
  });

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [verticals, setVerticals] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  const hasAccess = canAccessPrompts(profile);

  useEffect(() => {
    if (hasAccess) loadInitialData();
  }, [hasAccess, id]);

  useEffect(() => {
    if (formData.vertical_id) {
      loadOrganizations(formData.vertical_id);
    } else {
      setOrganizations([]);
      setFormData((prev) => ({ ...prev, org_id: '' }));
    }
  }, [formData.vertical_id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const { data: verticalsData } = await promptsService.getVerticals();
      setVerticals(verticalsData || []);

      if (isEditing) {
        const { data: promptData, error: promptError } = await promptsService.getPromptById(id);
        if (promptError) throw promptError;

        if (promptData) {
          setFormData({
            name: promptData.name || '',
            description: promptData.description || '',
            agent_type: promptData.agent_type || '',
            vertical_id: promptData.vertical_id || '',
            org_id: promptData.org_id || '',
            system_prompt: promptData.system_prompt || '',
            is_active: promptData.is_active ?? true,
            parameters: { ...DEFAULT_PARAMETERS, ...promptData.parameters },
          });

          if (promptData.vertical_id) {
            await loadOrganizations(promptData.vertical_id);
          }
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      showError('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizations = async (verticalId) => {
    const { data } = await promptsService.getOrganizations(verticalId);
    setOrganizations(data || []);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const handleParameterChange = (param, value) => {
    setFormData((prev) => ({
      ...prev,
      parameters: { ...prev.parameters, [param]: value },
    }));
  };

  const handleVectorWeightChange = (vectorWeight) => {
    const fulltextWeight = Math.round((1 - vectorWeight) * 100) / 100;
    setFormData((prev) => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        vector_weight: vectorWeight,
        fulltext_weight: fulltextWeight,
      },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validation = validatePrompt(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      showError('Veuillez corriger les erreurs');
      return;
    }

    const { exists } = await promptsService.checkPromptExists(
      formData.agent_type,
      formData.vertical_id || null,
      formData.org_id || null,
      isEditing ? id : null
    );

    if (exists) {
      showError(PROMPT_MESSAGES.duplicateError);
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        agent_type: formData.agent_type,
        vertical_id: formData.vertical_id || null,
        org_id: formData.org_id || null,
        system_prompt: formData.system_prompt,
        is_active: formData.is_active,
        parameters: formData.parameters,
      };

      const result = isEditing
        ? await promptsService.updatePrompt(id, dataToSave)
        : await promptsService.createPrompt(dataToSave);

      if (result.error) throw result.error;

      success(isEditing ? PROMPT_MESSAGES.updated : PROMPT_MESSAGES.created);
      navigate('/admin/prompts');
    } catch (err) {
      console.error('Error saving:', err);
      showError(isEditing ? PROMPT_MESSAGES.updateError : PROMPT_MESSAGES.createError);
    } finally {
      setSaving(false);
    }
  };

  // Accès refusé
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Accès refusé</h2>
            <Button variant="primary" className="mt-6" onClick={() => navigate('/admin')}>
              Retour à l'administration
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Chargement
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const verticalOptions = [
    { value: '', label: 'Aucune (défaut global)' },
    ...verticals.map((v) => ({ value: v.id, label: v.name })),
  ];

  const organizationOptions = [
    { value: '', label: 'Aucune (défaut verticale)' },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              leftIcon={<ArrowLeft className="w-4 h-4" />} 
              onClick={() => navigate('/admin/prompts')}
            >
              Retour
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditing ? 'Modifier le prompt' : 'Nouveau prompt'}
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Informations générales */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Informations générales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nom du prompt"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  error={errors.name}
                  placeholder="Ex: Bibliothécaire BTP Standard"
                  required
                />
                <Select
                  label="Type d'agent"
                  value={formData.agent_type}
                  onChange={(e) => handleChange('agent_type', e.target.value)}
                  options={AGENT_TYPE_OPTIONS}
                  placeholder="Sélectionner un type"
                  error={errors.agent_type}
                  required
                />
                <Select
                  label="Verticale"
                  value={formData.vertical_id}
                  onChange={(e) => handleChange('vertical_id', e.target.value)}
                  options={verticalOptions}
                  helperText="Laissez vide pour un prompt global"
                />
                <Select
                  label="Organisation"
                  value={formData.org_id}
                  onChange={(e) => handleChange('org_id', e.target.value)}
                  options={organizationOptions}
                  disabled={!formData.vertical_id}
                  helperText={!formData.vertical_id ? 'Sélectionnez d\'abord une verticale' : ''}
                />
                <div className="md:col-span-2">
                  <Textarea
                    label="Description"
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Description optionnelle..."
                    rows={2}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => handleChange('is_active', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-slate-700">Prompt actif</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prompt système */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Prompt système</h2>
              <Textarea
                value={formData.system_prompt}
                onChange={(e) => handleChange('system_prompt', e.target.value)}
                error={errors.system_prompt}
                placeholder="Tu es un assistant expert qui..."
                rows={15}
                className="font-mono text-sm"
              />
              <PromptLengthIndicator length={formData.system_prompt.length} />
            </CardContent>
          </Card>

          {/* Paramètres LLM */}
          <CollapsibleSection title="Paramètres LLM" icon={Sparkles} defaultOpen={false}>
            <div className="space-y-6">
              {/* Modèle */}
              <Select
                label="Modèle"
                value={formData.parameters.model || DEFAULT_PARAMETERS.model}
                onChange={(e) => handleParameterChange('model', e.target.value)}
                options={LLM_MODEL_OPTIONS}
              />

              {/* Tokens max */}
              <SliderWithInput
                label={PARAMETER_LIMITS.max_tokens.label}
                value={formData.parameters.max_tokens ?? DEFAULT_PARAMETERS.max_tokens}
                onChange={(value) => handleParameterChange('max_tokens', value)}
                min={PARAMETER_LIMITS.max_tokens.min}
                max={PARAMETER_LIMITS.max_tokens.max}
                step={PARAMETER_LIMITS.max_tokens.step}
                helperText={PARAMETER_LIMITS.max_tokens.description}
              />

              {/* Température */}
              <Slider
                label={PARAMETER_LIMITS.temperature.label}
                value={formData.parameters.temperature ?? DEFAULT_PARAMETERS.temperature}
                onChange={(value) => handleParameterChange('temperature', value)}
                min={PARAMETER_LIMITS.temperature.min}
                max={PARAMETER_LIMITS.temperature.max}
                step={PARAMETER_LIMITS.temperature.step}
                helperText={PARAMETER_LIMITS.temperature.description}
              />

              <hr className="border-slate-200" />

              {/* Poids de recherche */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-4">Poids de recherche</h3>
                <WeightSlider
                  value={formData.parameters.vector_weight ?? DEFAULT_PARAMETERS.vector_weight}
                  onChange={handleVectorWeightChange}
                  step={PARAMETER_LIMITS.vector_weight.step}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4 pt-4">
            <Button type="button" variant="secondary" onClick={() => navigate('/admin/prompts')}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" leftIcon={<Save className="w-4 h-4" />} loading={saving}>
              {isEditing ? 'Enregistrer' : 'Créer le prompt'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default PromptForm;
