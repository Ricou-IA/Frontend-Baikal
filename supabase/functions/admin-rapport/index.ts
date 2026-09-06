// admin-rapport — rapport au partenaire SEO du site et audit SEO, sur une
// periode bornee (spec docs/superpowers/specs/2026-09-06-rapport-mensuel-ia-media-design.md).
//
// Actions (JWT utilisateur, droits par site) :
//   preparer    { appId, debut, fin }   → faits figes (Annexe 2, ventes, SEO, lecture SEO,
//                                         highlights) + commits + textes proposes. Reprend le
//                                         dernier audit SEO enregistre sur la meme periode.
//   rediger     { appId, debut, fin, ebauche, highlights } → commentaire propose
//   enregistrer { appId, debut, fin, contenu, ebauche, evolutions, lecture_seo, commentaire, pdf_base64 }
//                                       → depose le PDF (bucket rapports), archive la ligne
//   liste       { appId }               → rapports archives, URL signee 1 h
//   audit       { appId, debut, fin }   → lecture SEO calculee + texte propose
//   audit-enregistrer { appId, debut, fin, contenu, texte } → archive l'audit relu
//   audits      { appId }               → audits archives
//   audit-lire  { id }                  → un audit complet
//
// Le PDF est fabrique dans le navigateur ; l'EF ne fait que l'archiver.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { construireFaits } from "./faits.ts";
import { type Commit, commitsDuMois } from "./github.ts";
import { libellePeriode, type Periode, validerPeriode } from "./periode.ts";
import { redigerCommentaire, redigerEvolutions, redigerLectureSeo } from "./redaction.ts";

const BUCKET = "rapports";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-id",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function joursAvant(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

// Commits du depot du site sur une fenetre : source des « evolutions du
// logiciel » (periode) et des chantiers SEO (90 jours). Jamais une erreur :
// une source absente est signalee dans `manquantes`.
async function commitsSite(
  repo: string | null,
  debut: string,
  fin: string,
  manquantes: string[],
  libelle: string,
): Promise<Commit[]> {
  const token = Deno.env.get("ADMIN_GITHUB_TOKEN");
  if (!repo) {
    manquantes.push(`Dépôt GitHub non renseigné dans /sites : pas ${libelle}`);
    return [];
  }
  if (!token) {
    manquantes.push(`Secret ADMIN_GITHUB_TOKEN absent : pas ${libelle}`);
    return [];
  }
  try {
    return await commitsDuMois(repo, token, debut, fin);
  } catch (e) {
    manquantes.push(`Commits indisponibles (${libelle}) : ${(e as Error).message}`);
    return [];
  }
}

async function repoDuSite(admin: any, appId: string): Promise<string | null> {
  const { data } = await admin.schema("config").from("apps").select("repo_github").eq("id", appId).maybeSingle();
  return data?.repo_github ?? null;
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

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const autorises = await sitesAutorises(caller);
    const appId = String(body.appId ?? "");
    const parId = ["audit-lire"];
    if (!parId.includes(action)) exigerSite(autorises, appId);

    // --- Audit SEO : la lecture calculee et son texte, sans le reste du rapport.
    if (action === "audit") {
      const periode = validerPeriode(body.debut, body.fin);
      const manquantes: string[] = [];
      const repo = await repoDuSite(admin, appId);
      const commitsSeo = await commitsSite(repo, joursAvant(periode.fin, 90), periode.fin, manquantes, "de chantiers déduits des commits");
      const faits = await construireFaits(admin, appId, periode, commitsSeo);
      faits.sources_manquantes.push(...manquantes);
      let texte = "";
      if (faits.lecture_seo) {
        try {
          texte = await redigerLectureSeo(faits.lecture_seo, faits.highlights, libellePeriode(periode));
        } catch (e) {
          faits.sources_manquantes.push(`Rédaction indisponible : ${(e as Error).message}`);
        }
      }
      return json({
        data: {
          periode,
          libelle_periode: faits.libelle_periode,
          mois_entier: faits.mois_entier,
          mois_couverts: faits.mois_couverts,
          lecture: faits.lecture_seo,
          highlights: faits.highlights,
          seo: faits.seo,
          texte_propose: texte,
          sources_manquantes: faits.sources_manquantes,
        },
        error: null,
      });
    }

    if (action === "audit-enregistrer") {
      const periode = validerPeriode(body.debut, body.fin);
      if (!body.contenu || typeof body.contenu !== "object") return json({ data: null, error: "Contenu manquant" }, 400);
      const { data: user } = await caller.auth.getUser();
      const { data, error } = await admin.schema("admin").from("seo_audits").insert({
        app_id: appId,
        debut: periode.debut,
        fin: periode.fin,
        contenu: body.contenu,
        texte: body.texte ? String(body.texte) : null,
        cree_par: user?.user?.id ?? null,
      }).select("id, cree_le").single();
      if (error) throw new Error(error.message);
      return json({ data, error: null });
    }

    if (action === "audits") {
      const { data, error } = await admin.schema("admin").from("seo_audits")
        .select("id, debut, fin, cree_le, texte")
        .eq("app_id", appId).order("cree_le", { ascending: false }).limit(40);
      if (error) throw new Error(error.message);
      const lignes = (data ?? []).map((a: any) => {
        const p: Periode = { debut: String(a.debut).slice(0, 10), fin: String(a.fin).slice(0, 10) };
        return { id: a.id, ...p, libelle: libellePeriode(p), cree_le: a.cree_le, extrait: String(a.texte ?? "").slice(0, 160) };
      });
      return json({ data: { lignes }, error: null });
    }

    if (action === "audit-lire") {
      const { data, error } = await admin.schema("admin").from("seo_audits")
        .select("*").eq("id", String(body.id)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return json({ data: null, error: "Audit introuvable" }, 404);
      exigerSite(autorises, data.app_id);
      const p: Periode = { debut: String(data.debut).slice(0, 10), fin: String(data.fin).slice(0, 10) };
      return json({ data: { ...data, ...p, libelle: libellePeriode(p) }, error: null });
    }

    if (action === "preparer") {
      const periode = validerPeriode(body.debut, body.fin);
      const libelle = libellePeriode(periode);
      const manquantes: string[] = [];
      const repo = await repoDuSite(admin, appId);
      const commits = await commitsSite(repo, periode.debut, periode.fin, manquantes, "d'évolutions du logiciel");
      const commitsSeo = await commitsSite(repo, joursAvant(periode.fin, 90), periode.fin, [], "");
      const faits = await construireFaits(admin, appId, periode, commitsSeo);
      faits.sources_manquantes.push(...manquantes);

      // Le dernier audit SEO enregistre sur la meme periode fait foi : c'est
      // ce qu'Eric a relu. Sinon, proposition calculee a la volee.
      const { data: audit } = await admin.schema("admin").from("seo_audits")
        .select("id, contenu, texte, cree_le")
        .eq("app_id", appId).eq("debut", periode.debut).eq("fin", periode.fin)
        .order("cree_le", { ascending: false }).limit(1).maybeSingle();
      let lectureSeo = "";
      if (audit) {
        // L'audit archive enveloppe la lecture : { lecture, highlights, seo, ... }.
        const contenuAudit = audit.contenu ?? {};
        if (contenuAudit.lecture && contenuAudit.lecture.trafic) faits.lecture_seo = contenuAudit.lecture;
        lectureSeo = audit.texte ?? "";
      } else if (faits.lecture_seo) {
        try {
          lectureSeo = await redigerLectureSeo(faits.lecture_seo, faits.highlights, libelle);
        } catch (e) {
          faits.sources_manquantes.push(`Rédaction de la lecture SEO indisponible : ${(e as Error).message}`);
        }
      }

      let evolutions = "";
      if (commits.length === 0 && repo && Deno.env.get("ADMIN_GITHUB_TOKEN")) {
        faits.sources_manquantes.push("Aucun commit sur la période dans le dépôt");
      } else if (commits.length > 0) {
        try {
          evolutions = await redigerEvolutions(commits, libelle);
        } catch (e) {
          faits.sources_manquantes.push(`Évolutions du logiciel indisponibles : ${(e as Error).message}`);
        }
      }

      return json({
        data: {
          contenu: faits,
          commits,
          evolutions_proposees: evolutions,
          lecture_seo_proposee: lectureSeo,
          audit_id: audit?.id ?? null,
          audit_le: audit?.cree_le ?? null,
        },
        error: null,
      });
    }

    if (action === "rediger") {
      const periode = validerPeriode(body.debut, body.fin);
      const ebauche = String(body.ebauche ?? "").trim();
      if (!ebauche) return json({ data: null, error: "Ébauche vide" }, 400);
      const highlights = Array.isArray(body.highlights) ? body.highlights.map(String) : [];
      const commentaire = await redigerCommentaire(ebauche, highlights, libellePeriode(periode));
      return json({ data: { commentaire }, error: null });
    }

    if (action === "enregistrer") {
      const periode = validerPeriode(body.debut, body.fin);
      const contenu = body.contenu;
      if (!contenu || typeof contenu !== "object") return json({ data: null, error: "Contenu manquant" }, 400);
      const b64 = String(body.pdf_base64 ?? "");
      if (b64.length < 100) return json({ data: null, error: "PDF manquant" }, 400);
      const octets = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      const { data: precedents } = await admin.schema("admin").from("rapports")
        .select("version").eq("app_id", appId).eq("debut", periode.debut).eq("fin", periode.fin)
        .order("version", { ascending: false }).limit(1);
      const version = (precedents?.[0]?.version ?? 0) + 1;
      const chemin = `${appId}/${periode.debut}_${periode.fin}-v${version}.pdf`;

      const { error: eUpload } = await admin.storage.from(BUCKET)
        .upload(chemin, octets, { contentType: "application/pdf", upsert: false });
      if (eUpload) throw new Error(`Dépôt du PDF impossible : ${eUpload.message}`);

      const { data: user } = await caller.auth.getUser();
      const { data, error } = await admin.schema("admin").from("rapports").insert({
        app_id: appId,
        debut: periode.debut,
        fin: periode.fin,
        version,
        partenariat_id: contenu?.partenariat?.contrat?.id ?? null,
        contenu,
        ebauche: body.ebauche ? String(body.ebauche) : null,
        evolutions: body.evolutions ? String(body.evolutions) : null,
        lecture_seo: body.lecture_seo ? String(body.lecture_seo) : null,
        commentaire: body.commentaire ? String(body.commentaire) : null,
        pdf_path: chemin,
        genere_par: user?.user?.id ?? null,
      }).select("id, version, pdf_path, genere_le").single();
      if (error) throw new Error(error.message);
      return json({ data, error: null });
    }

    if (action === "liste") {
      const { data, error } = await admin.schema("admin").from("rapports")
        .select("id, debut, fin, version, genere_le, pdf_path")
        .eq("app_id", appId)
        .order("fin", { ascending: false }).order("debut", { ascending: false })
        .order("version", { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      const lignes = [];
      for (const r of data ?? []) {
        const { data: signe } = await admin.storage.from(BUCKET).createSignedUrl(r.pdf_path, 3600);
        const p: Periode = { debut: String(r.debut).slice(0, 10), fin: String(r.fin).slice(0, 10) };
        lignes.push({
          id: r.id,
          ...p,
          libelle: libellePeriode(p),
          version: r.version,
          genere_le: r.genere_le,
          url: signe?.signedUrl ?? null,
        });
      }
      return json({ data: { lignes }, error: null });
    }

    return json({ data: null, error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    console.error("[admin-rapport]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  }
});
