// ============================================================================
// baikal-retrieval - Auth : identité du jeton et décision d'accès (Sprint 2, T2)
// ============================================================================
// L'EF tourne en service_role : jusqu'à la v2.1.0, user_id / org_id / project_id
// venaient du corps de la requête et n'étaient jamais confrontés au jeton — la clé
// anon publique suffisait pour lire les documents de n'importe quel projet.
// Désormais : jeton service_role → corps de confiance (harnais d'éval, appels
// internes) ; jeton utilisateur → user_id = sub, appartenance vérifiée par
// rag.resolve_access (même prédicat que la RLS de core.projects) ; clé anon,
// jeton absent ou invalide → 401.
//
// Reconnaissance du caller service_role / anon : DEUX voies, pour couvrir les deux
// formats de clés Supabase qui coexistent. (1) Égalité stricte avec la valeur injectée
// par la plateforme (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) — couvre le nouveau
// format de clés API. (2) Repli sur la claim `role` du JWT (jwtRole) — nécessaire pour
// les clés legacy (JWT) que les clients et le harnais d'éval envoient encore, alors que
// les valeurs désormais injectées par la plateforme ont changé de format et ne
// correspondent plus jamais à ces jetons legacy. La voie (2) ne vérifie PAS la
// signature du JWT : elle s'appuie sur la gateway Supabase (verify_jwt = true, ancré
// dans supabase/config.toml) qui a déjà vérifié la signature avant que la requête
// n'atteigne la fonction. Cette fonction ne doit donc JAMAIS être déployée avec
// --no-verify-jwt, sous peine de faire de jwtRole un contrôle d'accès non vérifié.
// ============================================================================

import type { Supabase } from "./types.ts"

export type Caller =
  | { kind: 'service' }
  | { kind: 'user'; userId: string }
  | { kind: 'anonymous'; reason: 'missing_token' | 'anon_key' | 'invalid_token' }

export interface AccessDecision {
  allowed: boolean
  effectiveOrgId: string | null
  /** Couche applicative du profil (revue finale) : elle pinne l'app_id d'un utilisateur ordinaire. */
  effectiveAppId: string
  isSuperAdmin: boolean
  reason: string
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

/**
 * Lit la claim `role` d'un JWT SANS vérifier sa signature — voir l'en-tête de ce
 * fichier : la signature est déjà vérifiée par la gateway Supabase (verify_jwt = true)
 * avant que la requête n'atteigne cette fonction. Utilisée pour reconnaître les jetons
 * service_role / anon au format legacy, quand la comparaison stricte avec la clé
 * injectée ne suffit plus (nouveau format de clés API).
 * Renvoie `null` pour tout jeton mal formé (pas exactement 3 segments, payload non
 * base64/JSON valide) ou dépourvu d'une claim `role` de type string.
 */
export function jwtRole(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
    const payload = JSON.parse(json)
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/**
 * `getUserId` valide le jeton auprès de GoTrue (supabase.auth.getUser) ; il est injecté
 * pour rester testable sans réseau. Toute erreur de validation vaut jeton invalide.
 */
export async function resolveCaller(
  token: string | null,
  env: { serviceRoleKey: string; anonKey: string },
  getUserId: (jwt: string) => Promise<{ id: string } | null>,
): Promise<Caller> {
  if (!token) return { kind: 'anonymous', reason: 'missing_token' }
  if (token === env.serviceRoleKey) return { kind: 'service' }
  if (token === env.anonKey) return { kind: 'anonymous', reason: 'anon_key' }
  const role = jwtRole(token)
  if (role === 'service_role') return { kind: 'service' }
  if (role === 'anon') return { kind: 'anonymous', reason: 'anon_key' }
  try {
    const user = await getUserId(token)
    if (!user?.id) return { kind: 'anonymous', reason: 'invalid_token' }
    return { kind: 'user', userId: user.id }
  } catch (err) {
    console.warn('[auth] validation du jeton impossible :', err instanceof Error ? err.message : err)
    return { kind: 'anonymous', reason: 'invalid_token' }
  }
}

export async function getUserIdFromJwt(supabase: Supabase, jwt: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data?.user) return null
  return { id: data.user.id }
}

export async function resolveAccess(
  supabase: Supabase,
  userId: string,
  projectId: string | undefined,
  orgId: string | undefined,
): Promise<AccessDecision> {
  const { data, error } = await supabase.schema('rag').rpc('resolve_access', {
    p_user_id: userId,
    p_project_id: projectId || null,
    p_org_id: orgId || null,
  })
  if (error) throw new Error(`Access check error: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: row?.allowed === true,
    effectiveOrgId: (row?.effective_org_id as string | null) ?? null,
    effectiveAppId: (row?.effective_app_id as string | null) ?? 'arpet',
    isSuperAdmin: row?.is_super_admin === true,
    reason: (row?.reason as string) ?? 'unknown',
  }
}
