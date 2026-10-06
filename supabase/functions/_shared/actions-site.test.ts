import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chargerManifeste, preparerActionSite } from "./actions-site.ts";
import type { Site } from "./sites.ts";

const site: Site = {
  id: "pack-vendeur",
  name: "PED",
  is_active: true,
  domaine: null,
  db_schema: "pack_vendeur",
  fuseau: "Europe/Paris",
  db_ro_secret_ref: null,
  env_url: "https://x.supabase.co",
  env_secret_ref: "CLE_TEST",
  env_anon_key: "anon",
  env_dossiers_fn: "pv-admin-dossiers",
  env_prospects_fn: null,
  env_admin_fn: "pv-admin-pros",
};
const manifeste = [
  {
    id: "adjust-credits",
    libelle: "Créditer",
    icone: "coins",
    variante: "neutre" as const,
    superAdmin: true,
    confirmation: null,
    parametres: [{ id: "credits", type: "nombre", libelle: "Crédits", options: [], min: -100, max: 100, defaut: "1" }],
  },
  {
    id: "reactiver",
    libelle: "Réactiver",
    icone: "check",
    variante: "neutre" as const,
    superAdmin: false,
    confirmation: null,
    parametres: [],
  },
];

Deno.test("chargerManifeste: canal non configuré → liste vide sans erreur", async () => {
  const r = await chargerManifeste({ ...site, env_admin_fn: null }, null, "compte_id", "abc");
  assertEquals(r, { actions: [], erreur: null });
});

Deno.test("chargerManifeste: poste {action:'manifeste', <cle>:id} et normalise la réponse", async () => {
  let recu: Record<string, unknown> | null = null;
  const faux = (_s: Site, _fn: string | null, corps: Record<string, unknown>) => {
    recu = corps;
    return Promise.resolve({ actions: [{ id: "reactiver", libelle: "Réactiver" }] });
  };
  const r = await chargerManifeste(site, site.env_admin_fn, "compte_id", "abc", faux);
  assertEquals(recu, { action: "manifeste", compte_id: "abc" });
  assertEquals(r.actions.map((a) => a.id), ["reactiver"]);
});

Deno.test("chargerManifeste: un relais en panne rend l'erreur, pas une exception", async () => {
  const faux = () => Promise.reject(new Error("HTTP 502"));
  const r = await chargerManifeste(site, site.env_admin_fn, "compte_id", "abc", faux);
  assertEquals(r, { actions: [], erreur: "HTTP 502" });
});

Deno.test("preparerActionSite: action absente du manifeste → 400", () => {
  const r = preparerActionSite(manifeste, "supprimer", {}, true);
  assertEquals(r, { ok: false, statut: 400, erreur: "Action site inconnue: supprimer" });
});

Deno.test("preparerActionSite: super_admin exigé → 403", () => {
  const r = preparerActionSite(manifeste, "adjust-credits", { credits: 2 }, false);
  assertEquals(r, { ok: false, statut: 403, erreur: "Action reservee au super_admin" });
});

Deno.test("preparerActionSite: ne relaie que les paramètres déclarés", () => {
  const r = preparerActionSite(manifeste, "adjust-credits", { credits: 2, pirate: 1 }, true);
  assertEquals(r, { ok: true, corps: { action: "adjust-credits", credits: 2 } });
});
