/**
 * SUPABASE EDGE FUNCTION : sync-ademe
 * Ce service interroge l'API ADEME, enregistre dans majordhome et vectorise pour le RAG.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// L'API ADEME Open Data est publique : aucune clé API (Secret Key) n'est requise.
const ADEME_API_URL = "https://data.ademe.fr/api/records/1.0/search/";
const DATASET_ID = "dpe-v2-logements-existants";

interface AdemeData {
  n_dpe: string;
  classe_consommation_energie: string;
  classe_estimation_ges: string;
  consommation_energie_primaire: number;
  surface_habitable_logement: number;
  annee_construction: number;
  type_energie_chauffage: string;
  adresse_ban?: string;
  type_isolation_murs?: string;
  type_vitrage?: string;
  [key: string]: any;
}

const AdemeIngestionBridge = {
  /**
   * Interroge l'API Open Data de l'ADEME
   * Accès libre et gratuit.
   */
  async fetchFromAdeme(ademeNumber: string): Promise<AdemeData> {
    const params = new URLSearchParams({
      dataset: DATASET_ID,
      q: `n_dpe:"${ademeNumber}"`,
      rows: "1"
    });

    const response = await fetch(`${ADEME_API_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Majordhome-Sync-Service'
      }
    });

    if (!response.ok) {
      throw new Error(`L'API ADEME a renvoyé une erreur : ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.records || data.records.length === 0) {
      throw new Error("Aucun dossier DPE trouvé pour ce numéro de dossier.");
    }

    return data.records[0].fields;
  },

  /**
   * Mappe le JSON ADEME vers la table majordhome.dpe_data
   */
  mapToSql(ademeJson: AdemeData, projectId: string) {
    return {
      project_id: projectId,
      ademe_number: ademeJson.n_dpe,
      classe_energie: ademeJson.classe_consommation_energie,
      classe_ges: ademeJson.classe_estimation_ges,
      consommation_energie_primaire: ademeJson.consommation_energie_primaire,
      surface_habitable: ademeJson.surface_habitable_logement,
      annee_construction: ademeJson.annee_construction,
      type_chauffage: ademeJson.type_energie_chauffage,
      raw_payload: ademeJson,
      updated_at: new Date().toISOString()
    };
  },

  /**
   * Génère le récit narratif pour la recherche vectorielle (RAG)
   */
  generateNarrativeSummary(data: AdemeData): string {
    const clauses = [];
    clauses.push(`Fiche technique du logement situé au ${data.adresse_ban || 'l\'adresse enregistrée'}.`);
    clauses.push(`Il s'agit d'un bien construit en ${data.annee_construction}, d'une surface de ${data.surface_habitable_logement}m².`);
    clauses.push(`La performance énergétique est classée ${data.classe_consommation_energie} avec une consommation de ${data.consommation_energie_primaire} kWh/m²/an.`);
    clauses.push(`Le système de chauffage principal utilise le ${data.type_energie_chauffage}.`);
    
    if (data.type_isolation_murs) {
      clauses.push(`L'isolation des murs est : ${data.type_isolation_murs}.`);
    }
    
    if (data.type_vitrage) {
      clauses.push(`Le vitrage est composé de : ${data.type_vitrage}.`);
    }

    return clauses.join(' ');
  },

  /**
   * Orchestration de l'ingestion
   */
  async processIngestion(supabase: any, projectId: string, ademeNumber: string) {
    // 1. Récupération des données réelles depuis l'API ADEME
    const ademeJson = await this.fetchFromAdeme(ademeNumber);
    
    const sqlData = this.mapToSql(ademeJson, projectId);
    const narrativeSummary = this.generateNarrativeSummary(ademeJson);
    const finalSqlData = { ...sqlData, text_summary_for_rag: narrativeSummary };

    // 2. Insertion dans la table métier (majordhome)
    const { error: dbError } = await supabase
      .from('dpe_data')
      .insert(finalSqlData);

    if (dbError) throw new Error(`Erreur SQL: ${dbError.message}`);

    // 3. Insertion dans le schéma RAG (Layer Project)
    const { error: ragError } = await supabase
      .from('documents')
      .insert({
        content: narrativeSummary,
        target_apps: ['majordhome'],
        target_projects: [projectId],
        layer: 'project',
        metadata: { source: 'ADEME', type: 'DPE', ademe_number: ademeNumber }
      });

    if (ragError) throw new Error(`Erreur RAG: ${ragError.message}`);
    
    return { 
      success: true, 
      summary: narrativeSummary,
      data: {
        classe_energie: ademeJson.classe_consommation_energie,
        surface: ademeJson.surface_habitable_logement
      }
    };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId, ademeNumber } = await req.json();

    if (!projectId || !ademeNumber) {
      throw new Error("Paramètres projectId ou ademeNumber manquants.");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const result = await AdemeIngestionBridge.processIngestion(
      supabaseClient, 
      projectId, 
      ademeNumber
    );

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
})
