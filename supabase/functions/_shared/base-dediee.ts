// Garde-fou « base dédiée » (spec 2026-11-20-contrat-membres-design.md, lot 0).
// Un site qui a sa propre base s'authentifie chez lui : un compte créé ou
// modifié dans l'authentification de Baikal pour ce site n'existe pas là où le
// membre se connecte. Tant que le contrat Membres n'est pas branché, Baikal
// refuse ces écritures au lieu de répondre « créé ».
// La décision vit en SQL (core.app_sur_base_dediee, core.compte_sur_base_dediee),
// partagée avec les RPC ; ce module ne fait que la demander.

export const CODE_BASE_DEDIEE = "site_base_dediee";
export const MESSAGE_BASE_DEDIEE =
  "Ce site gère ses comptes sur sa propre base : un compte créé ou modifié ici " +
  "ne s'y connecterait pas. Passer par l'écran Équipe du site en attendant le contrat Membres.";

// Actions d'admin-comptes qui écrivent dans l'authentification.
export const ACTIONS_ECRITURE_COMPTE: ReadonlySet<string> = new Set([
  "create",
  "set-password",
  "recovery-link",
  "rename",
  "set-email",
  "ban",
]);

type ReponseRpc = { data: unknown; error: { message: string } | null };
export interface ClientRpc {
  schema(nom: string): {
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<ReponseRpc>;
  };
}

// Une lecture en échec lève : on ne laisse pas passer une écriture faute
// d'avoir pu vérifier.
async function demander(
  admin: ClientRpc,
  fn: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await admin.schema("core").rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data === true;
}

export function appSurBaseDediee(admin: ClientRpc, appId: string | null | undefined): Promise<boolean> {
  if (!appId) return Promise.resolve(false);
  return demander(admin, "app_sur_base_dediee", { p_app_id: appId });
}

export function compteSurBaseDediee(admin: ClientRpc, userId: string): Promise<boolean> {
  return demander(admin, "compte_sur_base_dediee", { p_user_id: userId });
}
