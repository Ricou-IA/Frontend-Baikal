import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { bearerToken, resolveCaller } from "./auth.ts"

const ENV = { serviceRoleKey: 'service-secret', anonKey: 'anon-public' }
const userLookup = (users: Record<string, string>) => async (jwt: string) => users[jwt] ? { id: users[jwt] } : null

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
