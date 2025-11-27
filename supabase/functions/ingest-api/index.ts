import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { content, metadata, vertical_id } = await req.json()

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Initialize Gemini for embeddings
        const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY') ?? '')
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" })

        // Generate embedding
        const result = await model.embedContent(content)
        const embedding = result.embedding.values

        // Store in database
        const { data, error } = await supabase
            .from('documents')
            .insert({
                content,
                metadata,
                vertical_id,
                embedding
            })
            .select()
            .single()

        if (error) throw error

        return new Response(
            JSON.stringify({ success: true, data }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
        )
    }
})
