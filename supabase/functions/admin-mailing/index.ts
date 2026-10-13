// admin-mailing : les campagnes d'un site (spec 2026-10-13-baikal-mailing).
// Baikal garde la campagne (admin.mail_campagnes, rien de nominatif) ; le
// ciblage est lu en direct dans les vues du site, le journal d'envoi vit chez
// lui (module mailing-v1). L'envoi reel est fait par admin-mailing-worker.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, ErreurSite, lecteurSite } from "../_shared/sites.ts";
import { ErreurAcces, droitsModules, exigerModule, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { ErreurRelais } from "../_shared/relais.ts";
import {
  compterCandidats, estPopulation, normaliserCriteres, POPULATIONS, type Population, requeteCandidats,
} from "../_shared/mailing/segment.ts";
import {
  chargerConfigMailing, cleResend, compteursCampagnes, ecritureConfiguree, envoyesDepuis, expediteur,
  populationsDisponibles, schemaMailing,
} from "../_shared/mailing/site.ts";
import { debutJourLocal, envoyerResend, PLAFOND_JOUR_DEFAUT } from "../_shared/mailing/envoi.ts";
import { ErreurMessage, fabriquerMessage } from "../_shared/mailing/message.ts";
import { VARIABLES } from "../_shared/mailing/rendu.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-id",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ECRITURE = ["enregistrer", "test", "lancer", "suspendre", "supprimer"];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  let sql: ReturnType<typeof lecteurSite> | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ data: null, error: "Non authentifie" }, 401);
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ data: null, error: "Non authentifie" }, 401);

    const sites = await sitesAutorises(caller);
    if (sites.length === 0) return json({ data: null, error: "Acces refuse" }, 403);

    const body = await req.json();
    const { action, appId } = body;
    if (!appId) return json({ data: null, error: "appId requis" }, 400);
    exigerSite(sites, appId);
    const droits = await droitsModules(caller);
    exigerModule(droits, appId, "mailing", ECRITURE.includes(String(action)) ? "ecriture" : "lecture");

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const site = await chargerSite(admin, appId);
    const cfg = await chargerConfigMailing(admin, appId);
    const campagnes = admin.schema("admin").from("mail_campagnes");

    sql = lecteurSite(site);
    const schema = await schemaMailing(sql, site);
    if (!schema) {
      return json({ data: { disponible: false, raison: "module" }, error: null });
    }
    const populations = await populationsDisponibles(sql, schema);

    // Lit une campagne de CE site (jamais celle d'un autre par son id).
    async function campagne(id: unknown) {
      if (typeof id !== "string") throw new ErreurSite("campagneId requis");
      const { data, error } = await campagnes.select("*").eq("id", id).eq("app_id", appId).maybeSingle();
      if (error) throw error;
      if (!data) throw new ErreurSite("Campagne introuvable");
      return data;
    }

    function optionsSegment(population: Population, criteres: unknown, campagneId?: string) {
      const colonnes = populations[population];
      if (!colonnes) throw new ErreurSite(`Ce site n'expose pas la population ${POPULATIONS[population].libelle}`);
      return { schema: schema!, population, colonnes, criteres: normaliserCriteres(criteres), campagneId };
    }

    const from = expediteur(site, cfg);
    const resend = cleResend(cfg);

    switch (action) {
      case "etat": {
        const { data: liste, error } = await campagnes.select("*").eq("app_id", appId)
          .order("cree_le", { ascending: false }).limit(100);
        if (error) throw error;
        const compteurs = await compteursCampagnes(sql, schema, (liste ?? []).map((c) => c.id));
        const envoyesJour = await envoyesDepuis(sql, schema, debutJourLocal(site.fuseau || "Europe/Paris"));
        const { data: metiers } = await admin.schema("admin").from("metier")
          .select("slug, libelle, couleur, ordre").order("ordre");
        const { data: registre } = await admin.schema("config").from("apps")
          .select("categories_client").eq("id", appId).maybeSingle();
        return json({
          data: {
            disponible: true,
            populations: Object.fromEntries(
              Object.entries(populations).map(([p, col]) => [p, [...col!]]),
            ),
            campagnes: (liste ?? []).map((c) => ({ ...c, compteurs: compteurs[c.id] ?? null })),
            envoi: {
              expediteur: from,
              reply_to: cfg.reply_to,
              cle: resend.cle ? resend.source : null,
              ecriture: ecritureConfiguree(site, cfg),
              plafond_jour: cfg.mailing_plafond_jour ?? PLAFOND_JOUR_DEFAUT,
              envoyes_aujourdhui: envoyesJour,
            },
            metiers: metiers ?? [],
            categories: registre?.categories_client ?? [],
            variables: VARIABLES,
          },
          error: null,
        });
      }

      case "apercu": {
        if (!estPopulation(body.population)) return json({ data: null, error: "population inconnue" }, 400);
        const o = optionsSegment(body.population, body.criteres);
        const [total, echantillon] = await Promise.all([
          compterCandidats(sql, o),
          requeteCandidats(sql, o, 10),
        ]);
        return json({ data: { total, echantillon }, error: null });
      }

      case "enregistrer": {
        const c = body.campagne ?? {};
        if (!estPopulation(c.population)) return json({ data: null, error: "population inconnue" }, 400);
        const champs = {
          nom: String(c.nom ?? "").trim() || "Sans titre",
          population: c.population,
          criteres: normaliserCriteres(c.criteres),
          objet: String(c.objet ?? ""),
          corps_html: String(c.corps_html ?? ""),
          maj_le: new Date().toISOString(),
        };
        if (c.id) {
          const actuelle = await campagne(c.id);
          // Une campagne partie ne change plus de cible : ses compteurs
          // perdraient leur sens. Objet et corps restent corrigeables tant
          // qu'elle n'est pas terminee (le reste de la liste recevra la
          // version corrigee).
          if (actuelle.statut === "terminee") {
            return json({ data: null, error: "Campagne terminée : dupliquez-la pour la réutiliser" }, 400);
          }
          const maj = actuelle.statut === "brouillon"
            ? champs
            : { objet: champs.objet, corps_html: champs.corps_html, nom: champs.nom, maj_le: champs.maj_le };
          const { data, error } = await campagnes.update(maj).eq("id", c.id).select("*").single();
          if (error) throw error;
          return json({ data, error: null });
        }
        const { data, error } = await campagnes
          .insert({ ...champs, app_id: appId, cree_par: user.email ?? user.id })
          .select("*").single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "rendu": {
        // Apercu fidele : le message reel d'un destinataire de l'echantillon
        // (ou d'un destinataire fictif si la cible est vide).
        const contenu = { objet: String(body.objet ?? ""), corps_html: String(body.corps_html ?? "") };
        let dest = { email: "exemple@exemple.fr", nom: "Camille Martin", commune: "Toulouse" } as {
          email: string; nom: string | null; commune: string | null;
        };
        const pop: unknown = body.population;
        if (estPopulation(pop) && populations[pop]) {
          const [premier] = await requeteCandidats(sql, optionsSegment(pop, body.criteres), 1);
          if (premier) dest = premier;
        }
        const m = await fabriquerMessage({
          site, from: from ?? `${site.name} <non-configure@exemple.fr>`, replyTo: cfg.reply_to,
          contenu, destinataire: dest, campagneId: null, test: true,
        });
        return json({ data: { html: m.html, objet: m.subject.replace(/^\[TEST\] /, ""), destinataire: dest.email }, error: null });
      }

      case "test": {
        const vers = String(body.destinataire ?? user.email ?? "").trim().toLowerCase();
        if (!EMAIL.test(vers)) return json({ data: null, error: "Adresse de test invalide" }, 400);
        if (!from) return json({ data: null, error: "Aucun expéditeur : renseigner l'expéditeur du site dans Paramétrage" }, 400);
        if (!resend.cle) return json({ data: null, error: `Secret ${resend.source} absent des Edge Function Secrets` }, 400);
        const contenu = { objet: String(body.objet ?? ""), corps_html: String(body.corps_html ?? "") };
        if (!contenu.objet.trim() || !contenu.corps_html.trim()) {
          return json({ data: null, error: "Objet et corps requis" }, 400);
        }
        let dest = { email: vers, nom: null as string | null, commune: null as string | null };
        const pop: unknown = body.population;
        if (estPopulation(pop) && populations[pop]) {
          const [premier] = await requeteCandidats(sql, optionsSegment(pop, body.criteres), 1);
          // Les variables d'un vrai destinataire, envoyees a l'adresse de test.
          if (premier) dest = { ...premier, email: vers };
        }
        const m = await fabriquerMessage({
          site, from, replyTo: cfg.reply_to, contenu, destinataire: dest, campagneId: null, test: true,
        });
        const r = await envoyerResend(resend.cle, m);
        if (!r.ok) return json({ data: null, error: r.erreur }, 502);
        return json({ data: { envoye: vers, resend_id: r.id }, error: null });
      }

      case "lancer": {
        const c = await campagne(body.campagneId);
        if (!["brouillon", "suspendue"].includes(c.statut)) {
          return json({ data: null, error: `Campagne ${c.statut} : rien à lancer` }, 400);
        }
        if (!from) return json({ data: null, error: "Aucun expéditeur : renseigner l'expéditeur du site dans Paramétrage" }, 400);
        if (!resend.cle) return json({ data: null, error: `Secret ${resend.source} absent des Edge Function Secrets` }, 400);
        if (!ecritureConfiguree(site, cfg)) {
          return json({ data: null, error: "Site sur base dédiée sans relais mailing (env_mailing_fn)" }, 400);
        }
        if (!c.objet.trim() || !c.corps_html.trim()) return json({ data: null, error: "Objet et corps requis" }, 400);
        if (!Deno.env.get("ADMIN_UNSUBSCRIBE_SECRET")) {
          return json({ data: null, error: "Secret ADMIN_UNSUBSCRIBE_SECRET absent : aucun envoi possible" }, 400);
        }
        const restants = await compterCandidats(sql, optionsSegment(c.population, c.criteres, c.id));
        if (restants === 0 && c.statut === "brouillon") {
          return json({ data: null, error: "Aucun destinataire ne correspond à ce ciblage" }, 400);
        }
        const { data, error } = await campagnes.update({
          statut: "en_cours", motif: null, maj_le: new Date().toISOString(),
          lancee_le: c.lancee_le ?? new Date().toISOString(),
        }).eq("id", c.id).select("*").single();
        if (error) throw error;
        return json({ data: { ...data, restants }, error: null });
      }

      case "suspendre": {
        const c = await campagne(body.campagneId);
        if (c.statut !== "en_cours") return json({ data: null, error: "Campagne non en cours" }, 400);
        const { data, error } = await campagnes.update({
          statut: "suspendue", motif: `Suspendue par ${user.email ?? user.id}`, maj_le: new Date().toISOString(),
        }).eq("id", c.id).select("*").single();
        if (error) throw error;
        return json({ data, error: null });
      }

      case "supprimer": {
        const c = await campagne(body.campagneId);
        if (c.statut !== "brouillon") {
          return json({ data: null, error: "Seul un brouillon se supprime : une campagne partie reste au journal" }, 400);
        }
        const { error } = await campagnes.delete().eq("id", c.id);
        if (error) throw error;
        return json({ data: { supprimee: c.id }, error: null });
      }

      case "detail": {
        const c = await campagne(body.campagneId);
        const page = Math.max(1, Number(body.page) || 1);
        const parPage = 50;
        const statut = typeof body.statut === "string" && body.statut ? body.statut : null;
        const rows = await sql`
          SELECT email, population, destinataire_id, statut, erreur, rebond_type,
                 envoye_le, delivre_le, ouvert_le, clique_le, rebond_le, plainte_le, desinscrit_le,
                 nb_ouvertures, nb_clics, count(*) OVER() AS total_lignes
          FROM ${sql(schema)}.mail_envoi
          WHERE campagne_id = ${c.id}::uuid
            ${statut ? sql`AND statut = ${statut}` : sql``}
          ORDER BY coalesce(envoye_le, reserve_le) DESC, email
          LIMIT ${parPage} OFFSET ${(page - 1) * parPage}`;
        const [compteurs] = Object.values(await compteursCampagnes(sql, schema, [c.id]));
        const restants = c.statut === "terminee"
          ? 0
          : (populations[c.population as Population]
            ? await compterCandidats(sql, optionsSegment(c.population, c.criteres, c.id))
            : null);
        return json({
          data: {
            campagne: c,
            compteurs: compteurs ?? null,
            restants,
            lignes: rows.map(({ total_lignes: _t, ...r }: Record<string, unknown>) => r),
            total: rows.length ? Number(rows[0].total_lignes) : 0,
            page,
            parPage,
          },
          error: null,
        });
      }

      default:
        return json({ data: null, error: `Action inconnue: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    if (e instanceof ErreurSite || e instanceof ErreurMessage) return json({ data: null, error: e.message }, 400);
    if (e instanceof ErreurRelais) return json({ data: null, error: e.message, detail: e.detail ?? null }, e.statutSortie ?? 500);
    console.error("[admin-mailing]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  } finally {
    if (sql) await sql.end();
  }
});
