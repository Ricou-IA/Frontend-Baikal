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
