// Synchronisation des diagnostiqueurs certifies d'un site vers admin.prospects.
//
// Remplace la fonction SQL admin.sync_diagnostiqueurs (migration
// 20260825010000), qui lisait <db_schema>.diag_certifie DANS la base de Baikal.
// Un site sur base dediee (MonsieurDPE depuis sa migration de novembre 2026)
// ne se lit pas en SQL depuis ici : la lecture passe par lecteurSite, comme
// toutes les lectures de site, et l'ecriture reste dans admin.prospects.
//
// Meme mapping, memes compteurs que la fonction SQL : email normalise,
// dedoublonnage par email (le premier par nom_affiche, nom, prenom), aucun
// email deja present reecrit (desinscrit compris).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { lecteurSite, type Site } from "./sites.ts";

export interface LigneDiag {
  email: string | null;
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  nom_affiche: string | null;
  code_postal: string | null;
  commune: string | null;
}

export interface ProspectDiag {
  app_id: string;
  type: "diagnostiqueur";
  email: string;
  nom: string | null;
  prenom: string | null;
  entreprise: string | null;
  telephone: string | null;
  code_postal: string | null;
  source: "diag_certifie";
  donnees: { commune: string | null };
}

// Ordre ASC de Postgres : les nulls en dernier.
function comparer(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

export function prospectsDepuisDiag(appId: string, lignes: LigneDiag[]): ProspectDiag[] {
  const valides = lignes
    .filter((l) => l.email !== null)
    // trim() de Postgres ne retire que les espaces : String.prototype.trim
    // retirerait aussi l'espace insecable et creerait un second prospect.
    .map((l) => ({ ...l, email: (l.email as string).replace(/^ +| +$/g, "").toLowerCase() }))
    .filter((l) => l.email.includes("@"))
    .sort((a, b) =>
      comparer(a.email, b.email) || comparer(a.nom_affiche, b.nom_affiche) ||
      comparer(a.nom, b.nom) || comparer(a.prenom, b.prenom)
    );
  const vus = new Set<string>();
  const prospects: ProspectDiag[] = [];
  for (const l of valides) {
    if (vus.has(l.email)) continue;
    vus.add(l.email);
    prospects.push({
      app_id: appId,
      type: "diagnostiqueur",
      email: l.email,
      nom: l.nom,
      prenom: l.prenom,
      entreprise: l.nom_affiche,
      telephone: l.telephone,
      code_postal: l.code_postal,
      source: "diag_certifie",
      donnees: { commune: l.commune },
    });
  }
  return prospects;
}

export class ErreurSync extends Error {}

// Une lecture vide n'est jamais un site sans diagnostiqueur : c'est une RLS
// sans policy pour baikal_reader, qui sert une table vide sans erreur
// (CLAUDE.md de MonsieurDPE, §8). La fonction SQL levait sur une table absente ;
// la synchro TS leve sur une table muette.
export function exigerLignes(appId: string, lignes: LigneDiag[]): void {
  if (lignes.length === 0) {
    throw new ErreurSync(
      `Synchro ${appId} : aucune ligne lue dans diag_certifie / diag_site (droits de baikal_reader ?)`,
    );
  }
}

export async function synchroniserDiagnostiqueurs(
  admin: SupabaseClient,
  site: Site,
): Promise<{ lus: number; avecEmail: number; inseres: number; doublons: number }> {
  if (!site.db_schema) {
    throw new ErreurSync(`Site ${site.id} sans base configuree (db_schema)`);
  }
  const sql = lecteurSite(site);
  let lignes: LigneDiag[];
  try {
    const schema = sql(site.db_schema);
    lignes = await sql<LigneDiag[]>`
      select c.email, c.nom, c.prenom, c.telephone,
             s.nom_affiche, s.code_postal, s.commune
      from ${schema}.diag_certifie c
      join ${schema}.diag_site s on s.slug = c.slug
      where c.email is not null`;
  } finally {
    await sql.end();
  }
  exigerLignes(site.id, lignes);
  const prospects = prospectsDepuisDiag(site.id, lignes);
  let inseres = 0;
  // Par lots : un upsert de plusieurs milliers de lignes depasse la taille de
  // requete de PostgREST. La synchro n'est donc plus atomique comme la
  // fonction SQL : un lot en echec laisse les precedents ecrits, et la relance
  // suivante ne compte comme inseres que les lignes restantes. Sans effet sur
  // les donnees (ignoreDuplicates), seuls les compteurs de cette passe mentent.
  for (let i = 0; i < prospects.length; i += 500) {
    const { data, error } = await admin.schema("admin").from("prospects")
      .upsert(prospects.slice(i, i + 500), { onConflict: "app_id,email", ignoreDuplicates: true })
      .select("id");
    if (error) throw new ErreurSync(`Ecriture des prospects impossible: ${error.message}`);
    inseres += data?.length ?? 0;
  }
  console.log(
    `[sync-diagnostiqueurs] app=${site.id} lus=${lignes.length} avec_email=${prospects.length} inseres=${inseres}`,
  );
  return {
    lus: lignes.length,
    avecEmail: prospects.length,
    inseres,
    doublons: prospects.length - inseres,
  };
}
