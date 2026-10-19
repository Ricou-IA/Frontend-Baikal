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
  compterCandidats, entonnoir, estPopulation, mailsIncomplets, normaliserCriteres, normaliserRelances, POPULATIONS,
  type Population,
  requeteCandidats,
} from "../_shared/mailing/segment.ts";
import { redigerMail } from "../_shared/mailing/redaction.ts";
import {
  chargerConfigMailing, cleResend, compteursCampagnes, ecritureConfiguree, envoyesDepuis, expediteur,
  populationsDisponibles, schemaMailing,
} from "../_shared/mailing/site.ts";
import { debutJourLocal, envoyerResend, PLAFOND_JOUR_DEFAUT } from "../_shared/mailing/envoi.ts";
import { ErreurMessage, fabriquerMessage } from "../_shared/mailing/message.ts";
import { nettoyerCorps, VARIABLES } from "../_shared/mailing/rendu.ts";

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

// « rediger » appelle un modele payant : ecriture, comme tout ce qui coute.
const ECRITURE = ["enregistrer", "test", "lancer", "suspendre", "supprimer", "rediger"];

// Plafond par jour d'une campagne continue : entier positif ou null.
function plafond(x: unknown): number | null {
  const n = Number(x);
  return x === null || x === undefined || x === "" || !Number.isInteger(n) || n <= 0 ? null : n;
}
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
            // L'entonnoir commun quand le site publie baikal_audience ; les
            // populations du lot 1 restent en repli pour les autres sites.
            population_defaut: populations.audience ? "audience" : Object.keys(populations)[0] ?? null,
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

      case "entonnoir": {
        if (!populations.audience) return json({ data: { disponible: false }, error: null });
        const lignes = await entonnoir(sql, optionsSegment("audience", body.criteres));
        return json({ data: { disponible: true, lignes }, error: null });
      }

      case "rediger": {
        const crit = normaliserCriteres(body.criteres);
        const r = await redigerMail({
          site: site.name,
          domaine: site.domaine,
          // Une seule etape ciblee = une intention claire ; plusieurs = l'auteur la dit dans son brief.
          etape: crit.etapes.length === 1 ? crit.etapes[0] : null,
          profils: Array.isArray(body.profilsLibelles) ? body.profilsLibelles.map(String).slice(0, 10) : [],
          brief: String(body.brief ?? "").slice(0, 2000),
          consigne: String(body.consigne ?? "rediger"),
          objet: String(body.objet ?? ""),
          corps: nettoyerCorps(String(body.corps_html ?? "")),
          rang: Math.max(1, Math.min(6, Number(body.rang) || 1)),
          delaiJours: Math.max(0, Number(body.delaiJours) || 0),
          precedent: body.precedent && typeof body.precedent === "object"
            ? {
              objet: String((body.precedent as Record<string, unknown>).objet ?? ""),
              corps: nettoyerCorps(String((body.precedent as Record<string, unknown>).corps_html ?? "")),
            }
            : null,
        });
        return json({ data: r, error: null });
      }

      case "stats": {
        const jours = [7, 30, 90].includes(Number(body.jours)) ? Number(body.jours) : 30;
        const depuis = new Date(debutJourLocal(site.fuseau || "Europe/Paris").getTime() - (jours - 1) * 86_400_000);
        const depuisJour = depuis.toISOString().slice(0, 10);
        // Mails du site (vue agregee baikal_mail_stats, contrat mail-stats-v1).
        let siteLignes: Record<string, unknown>[] = [];
        let statsDispo = false;
        for (const s of [site.db_schema, "public"].filter((x): x is string => Boolean(x))) {
          const [r] = await sql`SELECT to_regclass(${s + ".baikal_mail_stats"}) IS NOT NULL AS ok`;
          if (!r.ok) continue;
          statsDispo = true;
          siteLignes = await sql`
            SELECT coalesce(groupe, 'Autres') AS groupe, type, coalesce(max(libelle), type) AS libelle,
                   sum(envois)::int AS envois, sum(delivres)::int AS delivres, sum(ouverts)::int AS ouverts,
                   sum(cliques)::int AS cliques, sum(rebonds)::int AS rebonds,
                   sum(desinscrits)::int AS desinscrits, sum(plaintes)::int AS plaintes,
                   (max(jour) FILTER (WHERE envois > 0))::text AS dernier
            FROM ${sql(s)}.baikal_mail_stats
            WHERE jour >= ${depuisJour}::date
            GROUP BY 1, 2
            HAVING sum(envois) > 0
            ORDER BY 1, sum(envois) DESC`;
          break;
        }
        // Campagnes Baikal, lues dans le journal du module (jamais dans la vue
        // du site : elles y seraient comptees deux fois).
        const baikal = await sql`
          SELECT campagne_id::text AS id, touche,
                 count(envoye_le)::int AS envois, count(delivre_le)::int AS delivres,
                 count(ouvert_le)::int AS ouverts, count(clique_le)::int AS cliques,
                 count(rebond_le)::int AS rebonds, count(desinscrit_le)::int AS desinscrits,
                 count(plainte_le)::int AS plaintes, max(envoye_le)::date::text AS dernier
          FROM ${sql(schema)}.mail_envoi
          WHERE envoye_le >= ${depuis.toISOString()}::timestamptz
          GROUP BY campagne_id, touche
          ORDER BY campagne_id, touche`;
        const ids = [...new Set(baikal.map((b: { id: string }) => b.id))];
        const noms = ids.length
          ? (await campagnes.select("id, nom, relances").in("id", ids)).data ?? []
          : [];
        const campDe = new Map(noms.map((n: { id: string; nom: string; relances: unknown[] }) => [n.id, n]));
        const lignes = [
          ...baikal.map((b: Record<string, unknown>) => {
            const camp = campDe.get(String(b.id));
            const sequence = (camp?.relances?.length ?? 0) > 0;
            const t = Number(b.touche);
            return {
              groupe: "Campagnes Baikal",
              type: `baikal:${b.id}:${t}`,
              libelle: `${camp?.nom ?? "Campagne"}${sequence ? (t === 1 ? " — mail 1" : ` — relance ${t - 1}`) : ""}`,
              ...b,
            };
          }),
          ...siteLignes,
        ];
        return json({ data: { jours, depuis: depuisJour, stats_site: statsDispo, lignes }, error: null });
      }

      case "enregistrer": {
        const c = body.campagne ?? {};
        if (!estPopulation(c.population)) return json({ data: null, error: "population inconnue" }, 400);
        const champs = {
          nom: String(c.nom ?? "").trim() || "Sans titre",
          population: c.population,
          criteres: normaliserCriteres(c.criteres),
          objet: String(c.objet ?? ""),
          // Toujours nettoye : ce qui est enregistre est ce qui part.
          corps_html: nettoyerCorps(String(c.corps_html ?? "")),
          continue: c.continue === true || normaliserRelances(c.relances).length > 0,
          plafond_jour: plafond(c.plafond_jour),
          relances: normaliserRelances(c.relances)
            .map((x) => ({ ...x, corps_html: nettoyerCorps(x.corps_html) })),
          jours_ouvres: c.jours_ouvres === true,
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
            : {
              objet: champs.objet, corps_html: champs.corps_html, nom: champs.nom,
              plafond_jour: champs.plafond_jour, jours_ouvres: champs.jours_ouvres,
              // Une sequence partie garde son nombre de mails (les journaux s'y
              // referent) ; leur contenu et leur delai restent corrigeables.
              relances: champs.relances.length === (actuelle.relances?.length ?? 0)
                ? champs.relances : actuelle.relances,
              maj_le: champs.maj_le,
            };
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
        const incomplets = mailsIncomplets(c);
        if (incomplets.length > 0) {
          return json({ data: null, error: `Objet et texte requis : ${incomplets.join(", ")}` }, 400);
        }
        if (!Deno.env.get("ADMIN_UNSUBSCRIBE_SECRET")) {
          return json({ data: null, error: "Secret ADMIN_UNSUBSCRIBE_SECRET absent : aucun envoi possible" }, 400);
        }
        const restants = await compterCandidats(sql, optionsSegment(c.population, c.criteres, c.id));
        // Une campagne continue peut partir a vide : elle attend les entrants.
        if (restants === 0 && c.statut === "brouillon" && !c.continue) {
          return json({ data: null, error: "Aucun destinataire ne correspond à ce ciblage" }, 400);
        }
        const { data, error } = await campagnes.update({
          statut: "en_cours", motif: null, attente_jusqu_au: null, maj_le: new Date().toISOString(),
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
          SELECT email, touche, population, destinataire_id, statut, erreur, rebond_type,
                 envoye_le, delivre_le, ouvert_le, clique_le, rebond_le, plainte_le, desinscrit_le,
                 nb_ouvertures, nb_clics, count(*) OVER() AS total_lignes
          FROM ${sql(schema)}.mail_envoi
          WHERE campagne_id = ${c.id}::uuid
            ${statut ? sql`AND statut = ${statut}` : sql``}
          ORDER BY coalesce(envoye_le, reserve_le) DESC, email
          LIMIT ${parPage} OFFSET ${(page - 1) * parPage}`;
        const [compteurs] = Object.values(await compteursCampagnes(sql, schema, [c.id]));
        const parMail = await sql`
          SELECT touche, count(envoye_le)::int AS envoyes, count(delivre_le)::int AS delivres,
                 count(ouvert_le)::int AS ouverts, count(clique_le)::int AS cliques,
                 count(rebond_le)::int AS rebonds, count(desinscrit_le)::int AS desinscrits,
                 count(*) FILTER (WHERE statut = 'reserve')::int AS en_attente
          FROM ${sql(schema)}.mail_envoi WHERE campagne_id = ${c.id}::uuid
          GROUP BY touche ORDER BY touche`;
        const restants = c.statut === "terminee"
          ? 0
          : (populations[c.population as Population]
            ? await compterCandidats(sql, optionsSegment(c.population, c.criteres, c.id))
            : null);
        return json({
          data: {
            campagne: c,
            compteurs: compteurs ?? null,
            par_mail: parMail,
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
