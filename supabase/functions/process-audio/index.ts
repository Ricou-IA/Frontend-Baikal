import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // 1. Gestion CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log("🚀 START PROCESS-AUDIO [VERSION FINALE]");

        // 2. Init & Clés
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
        const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');

        if (!openaiApiKey) throw new Error('Clé API OpenAI manquante');

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const openai = new OpenAI({ apiKey: openaiApiKey });

        // 3. Auth
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Token manquant');
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
        if (userError || !user) throw new Error('Utilisateur invalide');

        // 4. Réception Fichier (Flexible: audio ou file)
        const formData = await req.formData();
        const audioFile = formData.get('audio') || formData.get('file');
        const title = formData.get('title') as string || 'Réunion Audio';

        // Gestion Tags Verticaux
        let targetVerticals = ['default'];
        try {
            const raw = formData.get('target_verticals');
            if (raw) targetVerticals = JSON.parse(raw as string);
        } catch (e) { }

        // Validation Fichier
        if (!audioFile || !(audioFile instanceof File) || audioFile.size === 0) {
            throw new Error(`Fichier audio manquant ou vide.`);
        }

        console.log(`🎤 Traitement: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)} MB)`);

        // 5. Upload Storage (Backup)
        const fileExt = audioFile.name.split('.').pop() || 'webm';
        const filePath = `${user.id}/${Date.now()}_meeting.${fileExt}`;

        // On ne bloque pas si le storage échoue (optionnel)
        await supabaseAdmin.storage
            .from('project-recordings')
            .upload(filePath, audioFile, { contentType: audioFile.type, upsert: false })
            .catch(err => console.error("Warn: Storage upload failed", err));

        // 6. Transcription (Whisper)
        console.log("👂 Whisper...");
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: "fr",
            response_format: "json"
        });
        const transcriptText = transcription.text;

        // 7. Analyse (GPT-4o)
        console.log("🧠 GPT-4o...");
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "Tu es un expert. Réponds JSON : { \"summary\": \"Markdown...\", \"action_items\": [] }"
                },
                { role: "user", content: transcriptText }
            ],
            response_format: { type: "json_object" }
        });

        const jsonResponse = JSON.parse(completion.choices[0].message.content || "{}");

        // 8. Sauvegarde DB
        console.log("💾 Sauvegarde...");
        const { data: meeting, error: dbError } = await supabaseAdmin
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

        if (dbError) throw dbError;

        // 9. Envoi n8n (Vectorisation)
        if (n8nWebhookUrl) {
            fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `RÉSUMÉ : ${title}\n\n${jsonResponse.summary}\n\nTRANSCRIPT :\n${transcriptText}`,
                    metadata: { source: 'meeting_audio', meeting_id: meeting.id, title },
                    target_verticals: targetVerticals
                })
            }).catch(e => console.error("Erreur n8n:", e));
        }

        return new Response(JSON.stringify({ success: true, meeting }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("❌ Erreur:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
