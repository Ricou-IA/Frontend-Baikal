import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import OpenAI from "https://esm.sh/openai@4.28.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const { query, vertical_id, match_threshold = 0.5, match_count = 5 } = await req.json();

        if (!query) throw new Error("La requête est vide");

        // 1. Init
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const openai = new OpenAI({
            apiKey: Deno.env.get('OPENAI_API_KEY'),
        });

        // 2. Embedding de la question (OpenAI)
        // Note: On force 768 dimensions pour rester compatible avec la table créée précédemment
        // Si votre table est en 1536, retirez "dimensions: 768"
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query,
            dimensions: 768
        });
        const embedding = embeddingResponse.data[0].embedding;

        // 3. Recherche Vectorielle
        const { data: documents, error: searchError } = await supabaseClient.rpc('match_documents', {
            query_embedding: embedding,
            match_threshold: match_threshold,
            match_count: match_count,
            filter_vertical: vertical_id || 'audit'
        });

        if (searchError) throw searchError;

        // 4. Contexte
        const contextText = documents?.map((d: any) => d.content).join("\n---\n") || "Aucun document pertinent.";

        // 5. Génération Réponse (GPT-4o-mini)
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `Tu es un expert assistant pour la verticale : ${vertical_id}. Utilise ce contexte pour répondre : ${contextText}` },
                { role: "user", content: query }
            ],
            temperature: 0.3,
        });

        const response = completion.choices[0].message.content;

        return new Response(
            JSON.stringify({ answer: response, sources: documents }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});