import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { bearerToken, resolveCaller, resolveAccess, jwtRole } from "./auth.ts"
import type { Supabase } from "./types.ts"

const ENV = { serviceRoleKey: 'service-secret', anonKey: 'anon-public' }
const userLookup = (users: Record<string, string>) => async (jwt: string) => users[jwt] ? { id: users[jwt] } : null

// Stub minimal de Supabase : seul `.schema(...).rpc(...)` est exercé par resolveAccess.
// `captured` récupère les arguments du dernier appel RPC pour vérifier ce qui est envoyé à la base.
type RpcArgs = Record<string, unknown>
type RpcResponse = { data: unknown; error: { message: string } | null }

function stubSupabase(response: RpcResponse) {
  const captured: { args: RpcArgs | null } = { args: null }
  const supabase = {
    schema: (_name: string) => ({
      rpc: async (_fn: string, args: RpcArgs) => {
        captured.args = args
        return response
      },
    }),
  } as unknown as Supabase
  return { supabase, captured }
}

Deno.test("bearerToken lit l'en-tête Authorization, insensible à la casse", () => {
  assertEquals(bearerToken(new Request('http://x', { headers: { Authorization: 'Bearer abc.def' } })), 'abc.def')
  assertEquals(bearerToken(new Request('http://x', { headers: { authorization: 'bearer abc' } })), 'abc')
  assertEquals(bearerToken(new Request('http://x')), null)
  assertEquals(bearerToken(new Request('http://x', { headers: { Authorization: 'Basic abc' } })), null)
})

Deno.test("clé service_role → service, corps de requête de confiance", async () => {
  assertEquals(await resolveCaller('service-secret', ENV, userLookup({})), { kind: 'service' })
})

Deno.test("clé anon ou jeton absent → anonymous (401)", async () => {
  assertEquals(await resolveCaller('anon-public', ENV, userLookup({})), { kind: 'anonymous', reason: 'anon_key' })
  assertEquals(await resolveCaller(null, ENV, userLookup({})), { kind: 'anonymous', reason: 'missing_token' })
})

Deno.test("jeton utilisateur valide → user avec le sub ; invalide → anonymous", async () => {
  const lookup = userLookup({ 'jwt-eric': 'u-eric' })
  assertEquals(await resolveCaller('jwt-eric', ENV, lookup), { kind: 'user', userId: 'u-eric' })
  assertEquals(await resolveCaller('jwt-forge', ENV, lookup), { kind: 'anonymous', reason: 'invalid_token' })
})

Deno.test("un getUser qui lève ne fait pas tomber la requête : anonymous", async () => {
  const boom = async () => { throw new Error('auth down') }
  assertEquals(await resolveCaller('jwt-x', ENV, boom), { kind: 'anonymous', reason: 'invalid_token' })
})

Deno.test("resolveAccess : ligne autorisée renvoyée en tableau → decision transmise telle quelle", async () => {
  const { supabase, captured } = stubSupabase({
    data: [{ allowed: true, effective_org_id: 'org-1', effective_app_id: 'arpet', is_super_admin: false, reason: 'project_member' }],
    error: null,
  })
  const result = await resolveAccess(supabase, 'u-1', 'proj-1', undefined)
  assertEquals(result, { allowed: true, effectiveOrgId: 'org-1', effectiveAppId: 'arpet', isSuperAdmin: false, reason: 'project_member' })
  assertEquals(captured.args, { p_user_id: 'u-1', p_project_id: 'proj-1', p_org_id: null })
})

Deno.test("resolveAccess : ligne refusée renvoyée en objet direct (pas un tableau) → allowed false", async () => {
  const { supabase } = stubSupabase({
    data: { allowed: false, effective_org_id: null, effective_app_id: 'arpet', is_super_admin: false, reason: 'not_project_member' },
    error: null,
  })
  const result = await resolveAccess(supabase, 'u-1', 'proj-1', undefined)
  assertEquals(result, { allowed: false, effectiveOrgId: null, effectiveAppId: 'arpet', isSuperAdmin: false, reason: 'not_project_member' })
})

Deno.test("resolveAccess : super admin sur un projet d'une autre organisation → autorisé et signalé", async () => {
  const { supabase } = stubSupabase({
    data: [{ allowed: true, effective_org_id: 'org-autre', effective_app_id: 'arpet', is_super_admin: true, reason: 'project_member' }],
    error: null,
  })
  const result = await resolveAccess(supabase, 'u-super', 'proj-autre', undefined)
  assertEquals(result, { allowed: true, effectiveOrgId: 'org-autre', effectiveAppId: 'arpet', isSuperAdmin: true, reason: 'project_member' })
})

Deno.test("resolveAccess : ligne sans effective_app_id → repli sur 'arpet'", async () => {
  const { supabase } = stubSupabase({
    data: [{ allowed: true, effective_org_id: 'org-1', reason: 'no_scope' }],
    error: null,
  })
  const result = await resolveAccess(supabase, 'u-1', undefined, undefined)
  assertEquals(result, { allowed: true, effectiveOrgId: 'org-1', effectiveAppId: 'arpet', isSuperAdmin: false, reason: 'no_scope' })
})

Deno.test("resolveAccess : data vide ou null (réponse malformée) → fail-closed", async () => {
  const empty = stubSupabase({ data: [], error: null })
  assertEquals(
    await resolveAccess(empty.supabase, 'u-1', undefined, undefined),
    { allowed: false, effectiveOrgId: null, effectiveAppId: 'arpet', isSuperAdmin: false, reason: 'unknown' },
  )

  const nul = stubSupabase({ data: null, error: null })
  assertEquals(
    await resolveAccess(nul.supabase, 'u-1', undefined, undefined),
    { allowed: false, effectiveOrgId: null, effectiveAppId: 'arpet', isSuperAdmin: false, reason: 'unknown' },
  )
})

Deno.test("resolveAccess : erreur RPC → lève avec le message d'origine", async () => {
  const { supabase } = stubSupabase({ data: null, error: { message: 'boom' } })
  await assertRejects(
    () => resolveAccess(supabase, 'u-1', undefined, undefined),
    Error,
    'boom',
  )
})

Deno.test("resolveAccess : project_id / org_id absents → transmis en null à la RPC (jamais undefined)", async () => {
  const { supabase, captured } = stubSupabase({ data: [], error: null })
  await resolveAccess(supabase, 'u-1', undefined, undefined)
  assertEquals(captured.args, { p_user_id: 'u-1', p_project_id: null, p_org_id: null })
})

// ----------------------------------------------------------------------------
// jwtRole / resolveCaller — reconnaissance par la claim JWT (clés legacy)
// ----------------------------------------------------------------------------
// En production, les valeurs injectées (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY)
// ne sont plus les JWT legacy envoyés par les clients/le harnais d'éval (nouveau format
// de clés). La gateway (verify_jwt = true, ancré dans supabase/config.toml) a déjà
// vérifié la signature avant que la requête n'atteigne la fonction : on peut donc faire
// confiance à la claim `role` du payload sans revérifier la signature ici.

function base64url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fakeJwt(payload: Record<string, unknown>): string {
  return 'eyJhbGciOiJIUzI1NiJ9.' + base64url(JSON.stringify(payload)) + '.sig'
}

Deno.test("jwtRole : lit la claim role d'un JWT bien formé", () => {
  assertEquals(jwtRole(fakeJwt({ role: 'service_role', ref: 'x' })), 'service_role')
})

Deno.test("jwtRole : jeton mal formé ou sans claim role exploitable → null", () => {
  assertEquals(jwtRole('not-a-jwt'), null)
  assertEquals(jwtRole('a.b.c'), null)
  assertEquals(jwtRole(fakeJwt({ sub: 'u1' })), null)
})

Deno.test("resolveCaller : rôle service_role dans la claim JWT → service, même jeton différent de l'env (clés legacy)", async () => {
  let calls = 0
  const lookup = async (_jwt: string) => { calls++; return null }
  const result = await resolveCaller(fakeJwt({ role: 'service_role', ref: 'x' }), ENV, lookup)
  assertEquals(result, { kind: 'service' })
  assertEquals(calls, 0, "le lookup ne doit pas être appelé quand la claim JWT tranche")
})

Deno.test("resolveCaller : rôle anon dans la claim JWT → anonymous (anon_key), même jeton différent de l'env", async () => {
  let calls = 0
  const lookup = async (_jwt: string) => { calls++; return null }
  const result = await resolveCaller(fakeJwt({ role: 'anon' }), ENV, lookup)
  assertEquals(result, { kind: 'anonymous', reason: 'anon_key' })
  assertEquals(calls, 0, "le lookup ne doit pas être appelé quand la claim JWT tranche")
})

Deno.test("resolveCaller : rôle authenticated dans la claim JWT → passe par le lookup (comportement existant préservé)", async () => {
  const token = fakeJwt({ role: 'authenticated', sub: 'u1' })
  const lookup = async (jwt: string) => jwt === token ? { id: 'u-x' } : null
  assertEquals(await resolveCaller(token, ENV, lookup), { kind: 'user', userId: 'u-x' })
})
