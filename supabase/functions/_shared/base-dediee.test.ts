import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACTIONS_ECRITURE_COMPTE,
  appSurBaseDediee,
  type ClientRpc,
  compteSurBaseDediee,
} from "./base-dediee.ts";

function faux(reponse: { data: unknown; error: { message: string } | null }) {
  const appels: Array<{ schema: string; fn: string; args: Record<string, unknown> }> = [];
  const client: ClientRpc = {
    schema: (schema) => ({
      rpc: (fn, args) => {
        appels.push({ schema, fn, args });
        return Promise.resolve(reponse);
      },
    }),
  };
  return { client, appels };
}

Deno.test("sans site, rien à refuser et aucune lecture", async () => {
  const { client, appels } = faux({ data: true, error: null });
  assertEquals(await appSurBaseDediee(client, null), false);
  assertEquals(await appSurBaseDediee(client, ""), false);
  assertEquals(appels.length, 0);
});

Deno.test("la réponse de la base décide, lue dans core", async () => {
  const oui = faux({ data: true, error: null });
  assertEquals(await appSurBaseDediee(oui.client, "site-dedie"), true);
  assertEquals(oui.appels, [
    { schema: "core", fn: "app_sur_base_dediee", args: { p_app_id: "site-dedie" } },
  ]);
  const non = faux({ data: false, error: null });
  assertEquals(await appSurBaseDediee(non.client, "site-partage"), false);
});

Deno.test("un compte se vérifie par son identifiant", async () => {
  const { client, appels } = faux({ data: true, error: null });
  assertEquals(await compteSurBaseDediee(client, "u-1"), true);
  assertEquals(appels[0].fn, "compte_sur_base_dediee");
  assertEquals(appels[0].args, { p_user_id: "u-1" });
});

Deno.test("une réponse qui n'est pas un booléen vrai ne refuse pas", async () => {
  const { client } = faux({ data: null, error: null });
  assertEquals(await appSurBaseDediee(client, "inconnu"), false);
});

Deno.test("lecture en échec : on lève, on ne laisse pas passer", async () => {
  const { client } = faux({ data: null, error: { message: "permission denied" } });
  await assertRejects(() => appSurBaseDediee(client, "site"), Error, "permission denied");
  await assertRejects(() => compteSurBaseDediee(client, "u-1"), Error, "permission denied");
});

Deno.test("la liste et les sites restent lisibles, tout le reste écrit", () => {
  assertEquals(ACTIONS_ECRITURE_COMPTE.has("list"), false);
  assertEquals(ACTIONS_ECRITURE_COMPTE.has("sites"), false);
  for (const a of ["create", "set-password", "recovery-link", "rename", "set-email", "ban"]) {
    assertEquals(ACTIONS_ECRITURE_COMPTE.has(a), true);
  }
});
