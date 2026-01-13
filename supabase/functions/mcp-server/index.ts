// =============================================================================
// BAIKAL MCP Server - Edge Function
// =============================================================================
// Serveur MCP pour connecter Claude.ai à la base de données Supabase
// Outils : list_schemas, list_tables, describe_table, execute_sql, etc.
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPTransport } from "@hono/mcp"
import { Hono } from "hono"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Clé API pour authentifier les requêtes MCP (à définir dans les secrets)
const MCP_API_KEY = Deno.env.get("MCP_API_KEY") || "baikal-mcp-secret-key"

// Schémas autorisés (sécurité)
const ALLOWED_SCHEMAS = ["core", "rag", "config", "legifrance", "public"]

// Mots-clés SQL interdits (sécurité read-only)
const FORBIDDEN_SQL_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE",
  "GRANT", "REVOKE", "EXECUTE", "CALL", "DO", "COPY", "VACUUM"
]

// =============================================================================
// HELPERS
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mcp-api-key",
}

function createSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
}

function isReadOnlySQL(sql: string): boolean {
  const upperSQL = sql.toUpperCase().trim()
  
  // Doit commencer par SELECT ou WITH (pour les CTEs)
  if (!upperSQL.startsWith("SELECT") && !upperSQL.startsWith("WITH")) {
    return false
  }
  
  // Vérifier les mots-clés interdits
  for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
    // Chercher le mot-clé comme mot entier
    const regex = new RegExp(`\\b${keyword}\\b`, "i")
    if (regex.test(sql)) {
      return false
    }
  }
  
  return true
}

function validateSchema(schema: string): boolean {
  return ALLOWED_SCHEMAS.includes(schema.toLowerCase())
}

// =============================================================================
// HONO APP + MCP SERVER
// =============================================================================

const app = new Hono()

// Middleware CORS
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }
  await next()
})

// Middleware Auth (vérifier API Key)
app.use("*", async (c, next) => {
  // Skip pour OPTIONS
  if (c.req.method === "OPTIONS") {
    return await next()
  }
  
  const apiKey = c.req.header("x-mcp-api-key") || c.req.header("authorization")?.replace("Bearer ", "")
  
  if (apiKey !== MCP_API_KEY) {
    return c.json({ error: "Unauthorized - Invalid API Key" }, 401)
  }
  
  await next()
})

// Créer le serveur MCP
const server = new McpServer({
  name: "baikal-mcp",
  version: "1.0.0",
})

// =============================================================================
// TOOL: list_schemas
// =============================================================================

server.registerTool(
  "list_schemas",
  {
    title: "List Database Schemas",
    description: "Liste tous les schémas de la base de données BAIKAL (core, rag, config, legifrance)",
    inputSchema: {},
  },
  async () => {
    const supabase = createSupabaseAdmin()
    
    const { data, error } = await supabase.rpc("", {}).then(() => null).catch(() => null)
    
    // Query directe pour lister les schémas
    const { data: schemas, error: schemaError } = await supabase
      .from("information_schema.schemata")
      .select("schema_name")
    
    // Fallback: retourner les schémas connus
    const knownSchemas = [
      { name: "core", description: "Données métier (profiles, organizations, projects, members)" },
      { name: "rag", description: "RAG (documents, conversations, messages, citations)" },
      { name: "config", description: "Configuration (apps, concepts, categories, prompts)" },
      { name: "legifrance", description: "Données juridiques (codes, articles)" },
      { name: "public", description: "Schéma public par défaut" },
    ]
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          schemas: knownSchemas,
          note: "Schémas principaux de l'architecture BAIKAL"
        }, null, 2)
      }]
    }
  }
)

// =============================================================================
// TOOL: list_tables
// =============================================================================

server.registerTool(
  "list_tables",
  {
    title: "List Tables in Schema",
    description: "Liste toutes les tables d'un schéma donné",
    inputSchema: {
      schema_name: z.string().describe("Nom du schéma (core, rag, config, legifrance, public)")
    },
  },
  async ({ schema_name }) => {
    if (!validateSchema(schema_name)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Schéma '${schema_name}' non autorisé. Schémas valides: ${ALLOWED_SCHEMAS.join(", ")}` })
        }]
      }
    }
    
    const supabase = createSupabaseAdmin()
    
    const query = `
      SELECT 
        table_name,
        table_type,
        (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = '${schema_name}'
      ORDER BY table_name
    `
    
    const { data, error } = await supabase.rpc("exec_sql", { query_text: query })
    
    if (error) {
      // Fallback: utiliser une requête SQL directe
      const { data: tables, error: tablesError } = await supabase
        .schema(schema_name as any)
        .from("_tables")
        .select("*")
        .limit(0)
      
      // Retourner les tables connues du schéma
      const knownTables: Record<string, string[]> = {
        core: ["profiles", "organizations", "projects", "project_members", "organization_members"],
        rag: ["documents", "document_tables", "conversations", "messages", "citations", "source_files"],
        config: ["apps", "concepts", "document_categories", "agent_prompts"],
        legifrance: ["codes", "code_domains", "articles", "sync_jobs"],
        public: []
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            schema: schema_name,
            tables: knownTables[schema_name] || [],
            note: "Liste basée sur l'architecture documentée"
          }, null, 2)
        }]
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ schema: schema_name, tables: data }, null, 2)
      }]
    }
  }
)

// =============================================================================
// TOOL: describe_table
// =============================================================================

server.registerTool(
  "describe_table",
  {
    title: "Describe Table Structure",
    description: "Décrit la structure d'une table (colonnes, types, contraintes)",
    inputSchema: {
      schema_name: z.string().describe("Nom du schéma"),
      table_name: z.string().describe("Nom de la table")
    },
  },
  async ({ schema_name, table_name }) => {
    if (!validateSchema(schema_name)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Schéma '${schema_name}' non autorisé` })
        }]
      }
    }
    
    const supabase = createSupabaseAdmin()
    
    const query = `
      SELECT 
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = '${schema_name}' AND table_name = '${table_name}'
      ORDER BY ordinal_position
    `
    
    const { data, error } = await supabase.rpc("exec_sql", { query_text: query })
    
    if (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ 
            error: "Impossible de décrire la table",
            suggestion: "Vérifiez que la table existe dans le schéma spécifié"
          })
        }]
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          schema: schema_name,
          table: table_name,
          columns: data
        }, null, 2)
      }]
    }
  }
)

// =============================================================================
// TOOL: execute_sql (READ-ONLY)
// =============================================================================

server.registerTool(
  "execute_sql",
  {
    title: "Execute SQL Query (Read-Only)",
    description: "Exécute une requête SQL SELECT (lecture seule). Les INSERT/UPDATE/DELETE sont bloqués.",
    inputSchema: {
      query: z.string().describe("Requête SQL SELECT à exécuter"),
      limit: z.number().optional().describe("Limite de résultats (défaut: 100, max: 1000)")
    },
  },
  async ({ query, limit = 100 }) => {
    // Validation sécurité
    if (!isReadOnlySQL(query)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Requête non autorisée",
            reason: "Seules les requêtes SELECT sont autorisées (mode read-only)",
            forbidden_keywords: FORBIDDEN_SQL_KEYWORDS
          })
        }]
      }
    }
    
    // Ajouter LIMIT si pas présent
    const upperQuery = query.toUpperCase()
    let finalQuery = query.trim()
    if (!upperQuery.includes("LIMIT")) {
      finalQuery = `${finalQuery.replace(/;$/, "")} LIMIT ${Math.min(limit, 1000)}`
    }
    
    const supabase = createSupabaseAdmin()
    
    try {
      // Utiliser une fonction RPC pour exécuter le SQL
      const { data, error } = await supabase.rpc("exec_sql", { query_text: finalQuery })
      
      if (error) {
        // Fallback: essayer via postgREST direct (ne marchera pas pour SQL arbitraire)
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error.message,
              hint: "La fonction exec_sql n'existe peut-être pas. Voir les instructions de setup."
            })
          }]
        }
      }
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            query: finalQuery,
            row_count: Array.isArray(data) ? data.length : 0,
            data: data
          }, null, 2)
        }]
      }
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: String(err) })
        }]
      }
    }
  }
)

// =============================================================================
// TOOL: get_table_stats
// =============================================================================

server.registerTool(
  "get_table_stats",
  {
    title: "Get Table Statistics",
    description: "Obtient les statistiques d'une table (nombre de lignes, taille estimée)",
    inputSchema: {
      schema_name: z.string().describe("Nom du schéma"),
      table_name: z.string().describe("Nom de la table")
    },
  },
  async ({ schema_name, table_name }) => {
    if (!validateSchema(schema_name)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Schéma '${schema_name}' non autorisé` })
        }]
      }
    }
    
    const supabase = createSupabaseAdmin()
    
    const query = `
      SELECT 
        schemaname,
        relname as table_name,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as total_size
      FROM pg_stat_user_tables
      WHERE schemaname = '${schema_name}' AND relname = '${table_name}'
    `
    
    const { data, error } = await supabase.rpc("exec_sql", { query_text: query })
    
    if (error || !data || data.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            schema: schema_name,
            table: table_name,
            error: "Statistiques non disponibles",
            suggestion: "La table n'existe peut-être pas ou n'a pas encore de statistiques"
          })
        }]
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          schema: schema_name,
          table: table_name,
          stats: data[0]
        }, null, 2)
      }]
    }
  }
)

// =============================================================================
// TOOL: list_policies
// =============================================================================

server.registerTool(
  "list_policies",
  {
    title: "List RLS Policies",
    description: "Liste les policies Row Level Security d'une table ou d'un schéma",
    inputSchema: {
      schema_name: z.string().describe("Nom du schéma"),
      table_name: z.string().optional().describe("Nom de la table (optionnel, toutes si omis)")
    },
  },
  async ({ schema_name, table_name }) => {
    if (!validateSchema(schema_name)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Schéma '${schema_name}' non autorisé` })
        }]
      }
    }
    
    const supabase = createSupabaseAdmin()
    
    let query = `
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual as using_expression,
        with_check
      FROM pg_policies
      WHERE schemaname = '${schema_name}'
    `
    
    if (table_name) {
      query += ` AND tablename = '${table_name}'`
    }
    
    query += " ORDER BY tablename, policyname"
    
    const { data, error } = await supabase.rpc("exec_sql", { query_text: query })
    
    if (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: error.message })
        }]
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          schema: schema_name,
          table: table_name || "(all tables)",
          policy_count: Array.isArray(data) ? data.length : 0,
          policies: data
        }, null, 2)
      }]
    }
  }
)

// =============================================================================
// TOOL: list_indexes
// =============================================================================

server.registerTool(
  "list_indexes",
  {
    title: "List Table Indexes",
    description: "Liste les index d'une table",
    inputSchema: {
      schema_name: z.string().describe("Nom du schéma"),
      table_name: z.string().describe("Nom de la table")
    },
  },
  async ({ schema_name, table_name }) => {
    if (!validateSchema(schema_name)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Schéma '${schema_name}' non autorisé` })
        }]
      }
    }
    
    const supabase = createSupabaseAdmin()
    
    const query = `
      SELECT
        indexname,
        indexdef,
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname))) as index_size
      FROM pg_indexes
      WHERE schemaname = '${schema_name}' AND tablename = '${table_name}'
      ORDER BY indexname
    `
    
    const { data, error } = await supabase.rpc("exec_sql", { query_text: query })
    
    if (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: error.message })
        }]
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          schema: schema_name,
          table: table_name,
          index_count: Array.isArray(data) ? data.length : 0,
          indexes: data
        }, null, 2)
      }]
    }
  }
)

// =============================================================================
// TOOL: check_foreign_keys
// =============================================================================

server.registerTool(
  "check_foreign_keys",
  {
    title: "Check Foreign Keys",
    description: "Liste les clés étrangères d'une table",
    inputSchema: {
      schema_name: z.string().describe("Nom du schéma"),
      table_name: z.string().describe("Nom de la table")
    },
  },
  async ({ schema_name, table_name }) => {
    if (!validateSchema(schema_name)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Schéma '${schema_name}' non autorisé` })
        }]
      }
    }
    
    const supabase = createSupabaseAdmin()
    
    const query = `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema AS foreign_schema,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = '${schema_name}'
        AND tc.table_name = '${table_name}'
    `
    
    const { data, error } = await supabase.rpc("exec_sql", { query_text: query })
    
    if (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: error.message })
        }]
      }
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          schema: schema_name,
          table: table_name,
          foreign_key_count: Array.isArray(data) ? data.length : 0,
          foreign_keys: data
        }, null, 2)
      }]
    }
  }
)

// =============================================================================
// ROUTE MCP
// =============================================================================

app.all("/mcp-server", async (c) => {
  const transport = new StreamableHTTPTransport()
  await server.connect(transport)
  const response = await transport.handleRequest(c)
  
  // Ajouter headers CORS à la réponse
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value)
  })
  
  return new Response(response.body, {
    status: response.status,
    headers
  })
})

// Route de santé
app.get("/mcp-server/health", (c) => {
  return c.json({
    status: "ok",
    server: "baikal-mcp",
    version: "1.0.0",
    tools: [
      "list_schemas",
      "list_tables", 
      "describe_table",
      "execute_sql",
      "get_table_stats",
      "list_policies",
      "list_indexes",
      "check_foreign_keys"
    ]
  })
})

// =============================================================================
// SERVE
// =============================================================================

Deno.serve(app.fetch)
