// Canal d'administration inter-projets : Baikal appelle une Edge Function
// d'administration du site (pv-admin-dossiers chez PED pour le canal
// dossiers, baikal-admin chez Majord'home pour le canal admin).
// L'anon key PUBLIQUE du site passe le gateway verify_jwt ; l'autorisation
// reelle est le secret partage X-Baikal-Key, verifie cote site.
// Un site porte un seul secret (env_secret_ref) et une seule anon key ; seul
// le NOM de la fonction change d'un canal a l'autre (env_dossiers_fn,
// env_admin_fn...), d'ou le parametre `fn`.
import type { Site } from "./sites.ts";

export class ErreurRelais extends Error {
  constructor(
    message: string,
    // Code que Baikal renvoie a la console : 502 quand le site a repondu en
    // erreur, 504 quand il n'a pas repondu du tout, rien (donc 500) quand
    // c'est le canal lui-meme qui est mal configure.
    readonly statutSortie?: number,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export interface CibleRelais {
  url: string;
  headers: Record<string, string>;
}

export function relaisConfigure(site: Site, fn: string | null): boolean {
  return Boolean(site.env_url && fn && site.env_secret_ref && site.env_anon_key);
}

export function preparerRelais(site: Site, fn: string | null): CibleRelais | null {
  if (!relaisConfigure(site, fn)) return null;
  const cle = Deno.env.get(site.env_secret_ref!);
  if (!cle) {
    throw new ErreurRelais(
      `Secret ${site.env_secret_ref} absent des Edge Function Secrets`,
    );
  }
  return {
    url: `${site.env_url!.replace(/\/+$/, "")}/functions/v1/${fn}`,
    headers: {
      "Content-Type": "application/json",
      "apikey": site.env_anon_key!,
      "Authorization": `Bearer ${site.env_anon_key}`,
      "X-Baikal-Key": cle,
    },
  };
}

// Un seul point d'appel du relais : toutes les actions inter-projets passent
// ici. Renvoie la charge JSON du site ou leve une ErreurRelais. La reponse
// REELLE du site en erreur est jointe sous `detail` ({statut_site, corps}) :
// c'est la que vit le motif (unknown_module, org_not_found...).
export async function appelerRelais(
  site: Site,
  fn: string | null,
  corps: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<unknown> {
  const cible = preparerRelais(site, fn);
  if (!cible) throw new ErreurRelais("Site sans canal d'administration configure");
  let reponse: Response;
  try {
    reponse = await fetch(cible.url, {
      method: "POST",
      headers: cible.headers,
      body: JSON.stringify(corps),
      // Deno n'impose aucun delai a fetch : sans ce signal, un site injoignable
      // ferait pendre l'appel jusqu'au delai de l'Edge Function.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new ErreurRelais(
        `Site ${site.id}: pas de reponse en ${Math.round(timeoutMs / 1000)}s`,
        504,
      );
    }
    throw e;
  }
  const texte = await reponse.text();
  let charge: unknown;
  try {
    charge = JSON.parse(texte);
  } catch {
    charge = { brut: texte.slice(0, 500) };
  }
  if (!reponse.ok) {
    throw new ErreurRelais(
      `Site ${site.id}: HTTP ${reponse.status}`,
      502,
      { statut_site: reponse.status, corps: charge },
    );
  }
  return charge;
}
