// Connecteur d'acces aux donnees des sites du registre config.apps.
// Lecture SEULE, quel que soit l'hebergement :
//  - produit sur base dediee  -> DSN baikal_reader lu dans le secret nomme
//    par db_ro_secret_ref (pooler, role lecture seule cote serveur) ;
//  - produit de la base partagee -> SUPABASE_DB_URL, avec lecture seule
//    forcee au niveau de la connexion.
// Les ecritures passent par les clients service_role explicites (local) ou,
// plus tard, par les Edge Functions du projet cible (dedie).
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Site {
  id: string;
  name: string;
  is_active: boolean;
  domaine: string | null;
  db_schema: string | null;
  db_ro_secret_ref: string | null;
  env_url: string | null;
  env_secret_ref: string | null;
  env_anon_key: string | null;
  env_dossiers_fn: string | null;
}

export class ErreurSite extends Error {}

export async function chargerSite(
  admin: SupabaseClient,
  appId: string,
): Promise<Site> {
  const { data, error } = await admin.schema("config").from("apps")
    .select(
      "id, name, is_active, domaine, db_schema, db_ro_secret_ref, env_url, env_secret_ref, env_anon_key, env_dossiers_fn",
    )
    .eq("id", appId).maybeSingle();
  if (error) throw new ErreurSite(`Lecture du registre impossible: ${error.message}`);
  if (!data) throw new ErreurSite(`Site inconnu: ${appId}`);
  return data as Site;
}

export function lecteurSite(site: Site) {
  let dsn: string;
  if (site.db_ro_secret_ref) {
    const valeur = Deno.env.get(site.db_ro_secret_ref);
    if (!valeur) {
      throw new ErreurSite(
        `Secret ${site.db_ro_secret_ref} absent des Edge Function Secrets`,
      );
    }
    dsn = valeur;
  } else {
    const locale = Deno.env.get("SUPABASE_DB_URL");
    if (!locale) throw new ErreurSite("SUPABASE_DB_URL absent de l'environnement");
    dsn = locale;
  }
  // max 1 connexion, ouverte paresseusement ; l'appelant fait sql.end() en fin
  // de requete. prepare:false = compatible pooler en mode transaction.
  return postgres(dsn, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 2,
    connection: { default_transaction_read_only: "on" },
  });
}
