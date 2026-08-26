// admin-finance — archive financiere multi-sites (spec 2026-08-25).
//
// Actions :
//   capture          { jour?, rattrapage? }   → cron uniquement (X-Cron-Secret)
//   synthese         { appId }                → 7 jours / mois / annee en cours
//   serie            { appId, mois }          → serie mensuelle CA / couts / resultat
//   ventes           { appId, debut, fin }    → lignes de vente de la periode
//   charges          { appId }                → charges recurrentes
//   charge-creer     { appId, ... }
//   charge-supprimer { id }
//
// La page ne lit QUE l'archive : aucun appel Stripe en lecture d'ecran.
// Droits par site appliques partout, comme admin-seo.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { captureJour, capturePeriode } from "./capture.ts";
import { enrichirSite, sitesAvecVue } from "./enrichissement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id, x-cron-secret",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function arrondi(n: number): number {
  return Number(n.toFixed(2));
}

function debutMois(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function joursEntre(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

// Prorata journalier d'une charge mensuelle : 12 mois / 365 jours. Une charge
// de 30 EUR/mois ne creuse donc pas un trou le 1er, elle coute 0,99 EUR/jour.
function chargesSurPeriode(charges: any[], debut: Date, fin: Date): number {
  let total = 0;
  for (const c of charges) {
    const cDebut = new Date(`${c.debut}T00:00:00Z`);
    const cFin = c.fin ? new Date(`${c.fin}T00:00:00Z`) : null;
    const d = cDebut > debut ? cDebut : debut;
    const f = cFin && cFin < fin ? cFin : fin;
    if (f < d) continue;
    total += (Number(c.montant_mensuel_eur) * 12 / 365) * joursEntre(d, f);
  }
  return arrondi(total);
}

function agregerVentes(ventes: any[]) {
  const t = {
    ventes: ventes.length,
    ca_ttc: 0,
    ca_ht: 0,
    frais_stripe: 0,
    remboursements: 0,
  };
  for (const v of ventes) {
    t.ca_ttc += Number(v.montant_ttc);
    t.ca_ht += Number(v.montant_ht);
    t.frais_stripe += Number(v.frais_stripe_eur);
    t.remboursements += Number(v.montant_rembourse);
  }
  t.ca_ttc = arrondi(t.ca_ttc);
  t.ca_ht = arrondi(t.ca_ht);
  t.frais_stripe = arrondi(t.frais_stripe);
  t.remboursements = arrondi(t.remboursements);
  return t;
}

async function fenetre(admin: any, appId: string, debut: Date, fin: Date, charges: any[]) {
  const [{ data: ventes }, { data: jours }] = await Promise.all([
    admin.schema("admin").from("ventes_enrichies")
      .select("montant_ttc, montant_ht, frais_stripe_eur, montant_rembourse, canal, perimetre")
      // Les ventes que la vue du site ignore sont des tests : hors agregats.
      .eq("app_id", appId).eq("exclue", false)
      .gte("paid_at", debut.toISOString()).lte("paid_at", fin.toISOString()),
    admin.schema("admin").from("finance_jours")
      .select("jour, cout_ia_eur, ads_eur, complet")
      .eq("app_id", appId)
      .gte("jour", debut.toISOString().slice(0, 10))
      .lte("jour", fin.toISOString().slice(0, 10)),
  ]);

  const t = agregerVentes(ventes ?? []);
  const parCanal: Record<string, { ventes: number; ca_ttc: number }> = {};
  for (const v of ventes ?? []) {
    const c = String(v.canal ?? "unattributed");
    const cur = parCanal[c] ?? { ventes: 0, ca_ttc: 0 };
    cur.ventes += 1;
    cur.ca_ttc = arrondi(cur.ca_ttc + Number(v.montant_ttc));
    parCanal[c] = cur;
  }
  let coutIa = 0;
  let ads: number | null = null;
  const incomplets: string[] = [];
  for (const j of jours ?? []) {
    coutIa += Number(j.cout_ia_eur);
    if (j.ads_eur !== null) ads = arrondi((ads ?? 0) + Number(j.ads_eur));
    if (!j.complet) incomplets.push(j.jour);
  }
  const chargesFixes = chargesSurPeriode(charges, debut, fin);

  return {
    ...t,
    cout_ia: arrondi(coutIa),
    ads,
    charges_fixes: chargesFixes,
    resultat: arrondi(
      t.ca_ht - t.frais_stripe - t.remboursements - coutIa - chargesFixes - (ads ?? 0),
    ),
    complet: incomplets.length === 0,
    jours_incomplets: incomplets,
    par_canal: parCanal,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ data: null, error: "POST attendu" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // --- Chemin cron : jamais un JWT utilisateur, uniquement le secret partage.
    if (action === "capture") {
      // Un seul secret de cron pour toute la console : celui du SEO existe deja
      // des deux cotes (Vault + secrets EF). ADMIN_FINANCE_CRON_SECRET reste
      // accepte si on veut un jour separer les deux.
      const attendu = Deno.env.get("ADMIN_FINANCE_CRON_SECRET") ??
        Deno.env.get("ADMIN_SEO_CRON_SECRET");
      if (!attendu || req.headers.get("x-cron-secret") !== attendu) {
        return json({ data: null, error: "Secret de cron invalide" }, 401);
      }
      // Reprise d'historique : une periode d'un coup plutot que jour par jour.
      if (body.debut && body.fin) {
        const r = await capturePeriode(
          admin,
          new Date(`${body.debut}T00:00:00Z`),
          new Date(`${body.fin}T23:59:59Z`),
        );
        return json({ data: r, error: null });
      }
      const rattrapage = Number(body.rattrapage ?? 0);
      const base = body.jour ? new Date(`${body.jour}T00:00:00Z`) : new Date();
      const resultats = [];
      if (body.jour && rattrapage === 0) {
        // Une journee precise, a la demande.
        resultats.push({ jour: body.jour, ...(await captureJour(admin, base)) });
      } else {
        // Fenetre de rattrapage : UNE passe pour toute la periode. Boucler jour
        // par jour rouvrait une connexion distante par jour et par site, et la
        // fonction depassait sa limite de ressources (statut 546).
        const depuisJour = new Date(base.getTime() - rattrapage * 86_400_000);
        resultats.push({
          periode: `${depuisJour.toISOString().slice(0, 10)} → ${base.toISOString().slice(0, 10)}`,
          ...(await capturePeriode(admin, depuisJour, base)),
        });
      }
      // L'attribution suit dans la meme passe : une vente capturee sans son
      // origine resterait « sans origine » jusqu'au lendemain, ce qui se lirait
      // comme une baisse de l'organique.
      const enrichis = [];
      const depuis = new Date(base.getTime() - rattrapage * 86_400_000);
      for (const appId of sitesAvecVue()) {
        enrichis.push({ appId, ...(await enrichirSite(admin, appId, depuis, base)) });
      }
      return json({ data: { jours: resultats, attribution: enrichis }, error: null });
    }

    // Enrichissement par la vue du site : meme porte que la capture (cron).
    if (action === "enrichir") {
      const attendu = Deno.env.get("ADMIN_FINANCE_CRON_SECRET") ??
        Deno.env.get("ADMIN_SEO_CRON_SECRET");
      if (!attendu || req.headers.get("x-cron-secret") !== attendu) {
        return json({ data: null, error: "Secret de cron invalide" }, 401);
      }
      const r = await enrichirSite(
        admin,
        String(body.appId ?? ""),
        new Date(`${body.debut ?? "2026-01-01"}T00:00:00Z`),
        new Date(`${body.fin ?? "2030-01-01"}T23:59:59Z`),
      );
      return json({ data: r, error: null });
    }

    // --- Chemin utilisateur : droits par site.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const autorises = await sitesAutorises(caller);
    const appId = String(body.appId ?? "");
    if (action !== "charge-supprimer") exigerSite(autorises, appId);

    // Rafraichissement a la demande : meme travail que le cron, mais sur une
    // fenetre courte et declenche par un humain qui a les droits sur le site.
    // Sans lui, une vente du soir n'apparait qu'au passage du lendemain.
    if (action === "rafraichir") {
      const maintenant = new Date();
      const capture = await capturePeriode(
        admin,
        new Date(maintenant.getTime() - 2 * 86_400_000),
        maintenant,
      );
      const attribution = [];
      for (const site of sitesAvecVue()) {
        attribution.push({
          appId: site,
          ...(await enrichirSite(admin, site, new Date(maintenant.getTime() - 2 * 86_400_000), maintenant)),
        });
      }
      return json({ data: { capture, attribution }, error: null });
    }

    if (action === "synthese") {
      const maintenant = new Date();
      const { data: charges } = await admin.schema("admin").from("charges_recurrentes")
        .select("montant_mensuel_eur, debut, fin").eq("app_id", appId);
      const { data: app } = await admin.schema("config").from("apps")
        .select("tva_taux").eq("id", appId).maybeSingle();

      const sept = new Date(maintenant.getTime() - 6 * 86_400_000);
      const mois = debutMois(maintenant);
      const annee = new Date(Date.UTC(maintenant.getUTCFullYear(), 0, 1));

      const [f7, fMois, fAnnee] = await Promise.all([
        fenetre(admin, appId, sept, maintenant, charges ?? []),
        fenetre(admin, appId, mois, maintenant, charges ?? []),
        fenetre(admin, appId, annee, maintenant, charges ?? []),
      ]);

      return json({
        data: {
          fenetres: { "7j": f7, mois: fMois, annee: fAnnee },
          devise: "EUR",
          tva_taux: Number(app?.tva_taux ?? 0.2),
        },
        error: null,
      });
    }

    if (action === "serie") {
      const nbMois = Math.min(Number(body.mois ?? 12), 36);
      const maintenant = new Date();
      const { data: charges } = await admin.schema("admin").from("charges_recurrentes")
        .select("montant_mensuel_eur, debut, fin").eq("app_id", appId);

      const lignes = [];
      for (let i = nbMois - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - i, 1));
        const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));
        const r = await fenetre(admin, appId, d, f > maintenant ? maintenant : f, charges ?? []);
        lignes.push({ mois: d.toISOString().slice(0, 7), ...r });
      }
      return json({ data: { lignes: lignes }, error: null });
    }

    if (action === "ventes") {
      const debut = new Date(String(body.debut));
      const fin = new Date(String(body.fin));
      const { data, error } = await admin.schema("admin").from("ventes_enrichies")
        .select("*").eq("app_id", appId).eq("exclue", false)
        .gte("paid_at", debut.toISOString()).lte("paid_at", fin.toISOString())
        .order("paid_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return json({ data: { lignes: data ?? [] }, error: null });
    }

    if (action === "partenariat") {
      const { data: contrats } = await admin.schema("admin").from("partenariats")
        .select("*").eq("app_id", appId).order("debut");
      if (!contrats || contrats.length === 0) {
        return json({ data: { contrat: null, lignes: [] }, error: null });
      }
      const contrat = contrats[0];
      // Les surcharges simulent une autre lecture SANS toucher au contrat :
      // c'est ce qui doit eclairer l'arbitrage des definitions de l'article 1.
      // Wrapper public SECURITY DEFINER (convention du depot), plutot que de
      // dependre de l'exposition des fonctions du schema admin par PostgREST.
      const { data, error } = await admin.rpc("admin_partenariat_serie", {
        p_partenariat: contrat.id,
        p_assiette: body.assiette ?? null,
        p_prix_unitaire: body.prixUnitaire ?? null,
      });
      if (error) throw new Error(error.message);
      return json({
        data: {
          contrat,
          simulation: {
            assiette: body.assiette ?? contrat.assiette,
            prix_unitaire: body.prixUnitaire ?? contrat.prix_unitaire,
          },
          lignes: data ?? [],
        },
        error: null,
      });
    }

    if (action === "charges") {
      const { data, error } = await admin.schema("admin").from("charges_recurrentes")
        .select("*").eq("app_id", appId).order("debut", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ data: { lignes: data ?? [] }, error: null });
    }

    if (action === "charge-creer") {
      const { data, error } = await admin.schema("admin").from("charges_recurrentes")
        .insert({
          app_id: appId,
          libelle: String(body.libelle ?? "").slice(0, 120),
          categorie: String(body.categorie ?? "autre"),
          montant_mensuel_eur: Number(body.montant ?? 0),
          debut: String(body.debut),
          fin: body.fin ? String(body.fin) : null,
        }).select().single();
      if (error) throw new Error(error.message);
      return json({ data, error: null });
    }

    if (action === "charge-supprimer") {
      const { data: charge } = await admin.schema("admin").from("charges_recurrentes")
        .select("app_id").eq("id", String(body.id)).maybeSingle();
      if (!charge) return json({ data: null, error: "Charge introuvable" }, 404);
      exigerSite(autorises, charge.app_id);
      const { error } = await admin.schema("admin").from("charges_recurrentes")
        .delete().eq("id", String(body.id));
      if (error) throw new Error(error.message);
      return json({ data: { supprime: true }, error: null });
    }

    return json({ data: null, error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    console.error("[admin-finance]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  }
});
