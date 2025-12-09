// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  PROCESS-AUDIO - Transcription et analyse de réunions audio                  ║
// ║  Edge Function Supabase                                                      ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Version: 2.0.0 - Migration schémas                                          ║
// ║  - Storage: project-recordings → user-workspace                              ║
// ║  - Table: meetings → sources.meetings                                        ║
// ║  - target_verticals → target_apps                                            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Gestion du "Pre-flight" CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log("🚀 START PROCESS-AUDIO [v2.0.0 - Migration Schemas]");

        // 1. Initialisation & Vérification des Clés
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');

        if (!openaiApiKey) {
            throw new Error('Clé API OpenAI manquante (OPENAI_API_KEY)');
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const openai = new OpenAI({ apiKey: openaiApiKey });

        // 2. Vérification de l'Authentification
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Token d\'authentification manquant');

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
            authHeader.replace('Bearer ', '')
        );

        if (userError || !user) throw new Error('Utilisateur invalide ou session expirée');

        // 3. Récupération du fichier Audio (Compatible avec votre Front)
        const formData = await req.formData();

        // FIX : On accepte 'audio' OU 'file' car votre Frontend envoie 'file'
        const audioFile = formData.get('audio') || formData.get('file');
        const title = formData.get('title') as string || 'Réunion Audio';

        // MIGRATION: target_verticals → target_apps (avec rétro-compatibilité)
        let targetApps = ['default'];
        try {
            const rawApps = formData.get('target_apps') || formData.get('target_verticals');
            if (rawApps) targetApps = JSON.parse(rawApps as string);
        } catch (e) {
            console.warn("Info: Pas de tags apps valides, utilisation de default");
        }

        // Vérification stricte
        if (!audioFile || !(audioFile instanceof File) || audioFile.size === 0) {
            console.error("❌ Fichier manquant. Clés reçues:", Array.from(formData.keys()));
            throw new Error(`Fichier audio manquant ou vide.`);
        }

        console.log(`🎤 Traitement audio: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)`);

        // 4. Upload vers Supabase Storage (Archivage)
        // MIGRATION: project-recordings → user-workspace
        const fileExt = audioFile.name.split('.').pop() || 'webm';
        const filePath = `recordings/${user.id}/${Date.now()}_meeting.${fileExt}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('user-workspace')  // MIGRATION: nouveau bucket
            .upload(filePath, audioFile, {
                contentType: audioFile.type,
                upsert: false
            });

        if (uploadError) {
            console.error('Erreur Storage:', uploadError);
            // On continue même si l'upload échoue (optionnel)
        }

        // 5. Transcription avec OpenAI Whisper
        console.log("👂 Envoi à Whisper...");
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: "fr", // Optimisation pour le français
            response_format: "json"
        });

        const transcriptText = transcription.text;
        console.log("✅ Transcription OK.");

        // 6. Analyse et Résumé avec GPT-4o
        console.log("🧠 Envoi à GPT-4o...");
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es un secrétaire de séance expert en Audit et BTP.
          Analyse cette transcription de réunion.
          
          TÂCHES :
          1. Fais un résumé structuré (Contexte, Décisions, Points bloquants).
          2. Extrais une liste d'actions claires.

          FORMAT DE RÉPONSE (JSON STRICT) :
          {
            "summary": "Résumé complet formaté en Markdown...",
            "action_items": ["Action 1 - Responsable", "Action 2 - Responsable"]
          }`
                },
                { role: "user", content: transcriptText }
            ],
            response_format: { type: "json_object" } // Force le mode JSON
        });

        const jsonContent = completion.choices[0].message.content;
        const jsonResponse = JSON.parse(jsonContent || "{}");

        // 7. Sauvegarde du résultat en Base de Données
        // MIGRATION: meetings → sources.meetings
        const { data: meeting, error: dbError } = await supabaseAdmin
            .schema('sources')  // MIGRATION: nouveau schéma
            .from('meetings')
            .insert({
                user_id: user.id,
                title: title,
                audio_url: filePath,
                summary: jsonResponse.summary || "Résumé non disponible",
                transcript: transcriptText,
                action_items: jsonResponse.action_items || [],
                processed: true,
                model_used: 'openai-whisper-gpt4o'
            })
            .select()
            .single();

        if (dbError) {
            console.error('Erreur DB:', dbError);
            throw new Error("Erreur lors de l'enregistrement en base de données.");
        }

        // 8. Envoi vers n8n (Vectorisation) - Fire and Forget (Safe)
        if (n8nWebhookUrl) {
            console.log("🚀 Envoi vers n8n...");
            // MIGRATION: target_verticals → target_apps
            const ragPayload = {
                content: `RÉSUMÉ : ${title}\n\n${jsonResponse.summary}\n\nTRANSCRIPT :\n${transcriptText}`,
                metadata: {
                    source: 'meeting_audio',
                    meeting_id: meeting.id,
                    date: new Date().toISOString(),
                    title: title,
                    type: 'audio_transcript'
                },
                target_apps: targetApps  // MIGRATION: nouveau nom
            };

            // On n'attend pas la réponse pour ne pas ralentir le client
            fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ragPayload)
            }).catch(e => console.error("Erreur appel n8n:", e));
        }

        // 9. Réponse finale
        return new Response(
            JSON.stringify({ success: true, meeting }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('❌ Erreur Fatale:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
