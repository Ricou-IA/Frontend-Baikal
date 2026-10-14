// admin-mailing-worker : envoie les campagnes en cours, un lot par campagne
// et par passage. Appele chaque minute par pg_cron (X-Cron-Secret = ADMIN_SEO_CRON_SECRET), seulement
// quand une campagne est en cours.
//
// Pour chaque campagne :
//  1. verrou : un seul worker a la fois sur une campagne (dernier_lot_le) ;
//  2. coupe-circuit sur le journal du site (rebonds definitifs, plaintes) ;
//  3. quota du jour du SITE (toutes campagnes, fuseau du site) ;
//  4. candidats (segment.ts, meme WHERE que le compteur de la console) ;
//  5. reserver chez le site -> envoyer -> marquer chez le site ;
//  6. plus aucun candidat ni envoi en attente -> terminee.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chargerSite, lecteurSite, type Site } from "../_shared/sites.ts";
import { normaliserCriteres, type Population, relireDestinataires, requeteCandidats } from "../_shared/mailing/segment.ts";
import {
  chargerConfigMailing, cleResend, compteursCampagnes, ecrivain, envoyesDepuis, expediteur,
  populationsDisponibles, schemaMailing,
} from "../_shared/mailing/site.ts";
import { debutJourLocal, envoyerResend, evaluerDisjoncteur, tailleLot } from "../_shared/mailing/envoi.ts";
import { fabriquerMessage } from "../_shared/mailing/message.ts";

const PAUSE_MS = 250; // Resend : 5 requetes/s par defaut, on reste a ~3/s.
const BUDGET_MS = 100_000; // sous le delai de l'Edge Function, marge pour marquer.

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  const secret = Deno.env.get("ADMIN_SEO_CRON_SECRET"); // secret commun des crons admin
  if (!secret || req.headers.get("X-Cron-Secret") !== secret) return json({ error: "Non autorise" }, 401);

  const debut = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const table = () => admin.schema("admin").from("mail_campagnes");

  const { data: enCours, error } = await table().select("*").eq("statut", "en_cours").order("lancee_le");
  if (error) return json({ error: error.message }, 500);

  const rapport: Record<string, unknown>[] = [];
  for (const c of enCours ?? []) {
    if (Date.now() - debut > BUDGET_MS) break;
    // Campagne continue sans nouvel entrant au dernier passage : elle ne
    // re-interroge la vue du site qu'a l'heure dite.
    if (c.attente_jusqu_au && new Date(c.attente_jusqu_au).getTime() > Date.now()) {
      rapport.push({ id: c.id, saute: "attente" });
      continue;
    }

    // 1. Verrou : prendre la campagne seulement si aucun passage recent.
    const seuil = new Date(Date.now() - 55_000).toISOString();
    const { data: pris } = await table()
      .update({ dernier_lot_le: new Date().toISOString() })
      .eq("id", c.id).eq("statut", "en_cours")
      .or(`dernier_lot_le.is.null,dernier_lot_le.lt.${seuil}`)
      .select("id");
    if (!pris?.length) { rapport.push({ id: c.id, saute: "verrou" }); continue; }

    const arreter = async (statut: "suspendue" | "terminee", motif: string | null) => {
      await table().update({
        statut, motif, maj_le: new Date().toISOString(),
        ...(statut === "terminee" ? { terminee_le: new Date().toISOString() } : {}),
      }).eq("id", c.id);
    };

    let sql: ReturnType<typeof lecteurSite> | null = null;
    try {
      const site: Site = await chargerSite(admin, c.app_id);
      const cfg = await chargerConfigMailing(admin, c.app_id);
      sql = lecteurSite(site, 20000);
      const schema = await schemaMailing(sql, site);
      if (!schema) { await arreter("suspendue", "Module mailing absent chez le site"); continue; }
      const populations = await populationsDisponibles(sql, schema);
      const colonnes = populations[c.population as Population];
      if (!colonnes) { await arreter("suspendue", `Vue de la population ${c.population} absente`); continue; }

      // 2. Coupe-circuit, sur ce que le journal du site a appris.
      const [cpt] = Object.values(await compteursCampagnes(sql, schema, [c.id]));
      const disj = evaluerDisjoncteur({
        envoyes: cpt?.envoyes ?? 0, rebondsDurs: cpt?.rebonds_durs ?? 0, plaintes: cpt?.plaintes ?? 0,
      });
      if (disj.coupe) { await arreter("suspendue", disj.motif); rapport.push({ id: c.id, coupe: disj.motif }); continue; }

      // 3. Quota du jour du site.
      // Quota du site (toutes campagnes) ET, s'il en a un, de la campagne.
      const minuit = debutJourLocal(site.fuseau || "Europe/Paris");
      const envoyesJour = await envoyesDepuis(sql, schema, minuit);
      let lot = tailleLot(cfg.mailing_plafond_jour, envoyesJour);
      if (c.plafond_jour) {
        const [r] = await sql`
          SELECT count(*)::int AS n FROM ${sql(schema)}.mail_envoi
          WHERE campagne_id = ${c.id}::uuid AND envoye_le >= ${minuit.toISOString()}::timestamptz`;
        lot = Math.min(lot, Math.max(0, c.plafond_jour - Number(r.n)));
      }
      if (lot === 0) { rapport.push({ id: c.id, saute: "plafond du jour atteint" }); continue; }

      const from = expediteur(site, cfg);
      const { cle, source } = cleResend(cfg);
      if (!from || !cle) {
        await arreter("suspendue", !from ? "Aucun expéditeur configuré" : `Secret ${source} absent`);
        continue;
      }

      // 4. Candidats : d'abord les reservations orphelines (un passage
      // interrompu entre reserver et marquer ; l'Idempotency-Key de Resend
      // empeche le double envoi), puis de nouvelles adresses.
      const orphelins = await sql`
        SELECT email, destinataire_id FROM ${sql(schema)}.mail_envoi
        WHERE campagne_id = ${c.id}::uuid AND statut = 'reserve'
          AND reserve_le < now() - interval '3 minutes'
        LIMIT ${lot}`;
      const nouveaux = orphelins.length < lot
        ? await requeteCandidats(sql, {
          schema, population: c.population, colonnes, criteres: normaliserCriteres(c.criteres), campagneId: c.id,
        }, lot - orphelins.length)
        : [];

      if (orphelins.length === 0 && nouveaux.length === 0) {
        const enAttente = cpt?.en_attente ?? 0;
        if (c.continue) {
          // Une campagne continue ne se termine jamais : elle attend les
          // nouveaux entrants de sa cible, une heure plus tard.
          await table().update({ attente_jusqu_au: new Date(Date.now() + 3600_000).toISOString() }).eq("id", c.id);
          rapport.push({ id: c.id, attente: "aucun nouvel entrant" });
          continue;
        }
        if (enAttente === 0) await arreter("terminee", null);
        rapport.push({ id: c.id, termine: enAttente === 0 });
        continue;
      }

      // 5. Reserver chez le site : seules les adresses reservees partent.
      const ecr = ecrivain(admin, site, cfg);
      const reserves = new Set(await ecr.reserver(c.id, nouveaux.map((n) => ({
        email: n.email, population: c.population, destinataire_id: n.destinataire_id,
      }))));
      // Les orphelins sont deja reserves : leurs variables sont relues dans la vue.
      const relus = await relireDestinataires(sql, schema, c.population, colonnes,
        orphelins.map((o: { email: string }) => o.email));
      const parEmail = new Map(relus.map((n) => [n.email, n]));
      const aEnvoyer = [
        ...orphelins.map((o: { email: string }) => parEmail.get(o.email) ?? { email: o.email, nom: null, commune: null }),
        ...nouveaux.filter((n) => reserves.has(n.email)),
      ];

      const marques: Record<string, unknown>[] = [];
      let fatale: string | null = null;
      for (const d of aEnvoyer) {
        if (Date.now() - debut > BUDGET_MS) break;
        const m = await fabriquerMessage({
          site, from, replyTo: cfg.reply_to, contenu: { objet: c.objet, corps_html: c.corps_html },
          destinataire: d, campagneId: c.id,
        });
        const r = await envoyerResend(cle, m);
        marques.push(r.ok ? { email: d.email, resend_id: r.id } : { email: d.email, erreur: r.erreur });
        if (r.fatale) { fatale = r.erreur ?? "Erreur Resend"; break; }
        await attendre(PAUSE_MS);
      }
      if (marques.length) await ecr.marquer(c.id, marques);
      if (fatale) await arreter("suspendue", `Envoi refusé par Resend : ${fatale}`);

      await table().update({ dernier_lot_le: new Date().toISOString() }).eq("id", c.id);
      rapport.push({
        id: c.id, envoyes: marques.filter((x) => x.resend_id).length,
        erreurs: marques.filter((x) => x.erreur).length, fatale,
      });
    } catch (e) {
      console.error("[admin-mailing-worker]", c.id, e);
      rapport.push({ id: c.id, erreur: (e as Error).message });
    } finally {
      if (sql) await sql.end();
    }
  }
  return json({ ok: true, campagnes: rapport, duree_ms: Date.now() - debut });
});
