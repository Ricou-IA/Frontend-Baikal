// admin-rapport — rapport au partenaire SEO du site, sur une periode bornee
// (spec docs/superpowers/specs/2026-09-06-rapport-mensuel-ia-media-design.md).
//
// Actions (JWT utilisateur, droits par site) :
//   preparer    { appId, debut, fin }   → faits figes (Annexe 2, ventes, SEO, lecture SEO,
//                                         highlights) + commits + textes proposes
//   rediger     { appId, debut, fin, ebauche, highlights } → commentaire propose
//   enregistrer { appId, debut, fin, contenu, ebauche, evolutions, lecture_seo, commentaire, pdf_base64 }
//                                       → depose le PDF (bucket rapports), archive la ligne
//   liste       { appId }               → rapports archives, URL signee 1 h
//   chantiers   { appId }               → chantiers SEO du site
//   chantier-creer / chantier-modifier / chantier-supprimer
//
// Le PDF est fabrique dans le navigateur ; l'EF ne fait que l'archiver.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ErreurAcces, exigerSite, sitesAutorises } from "../_shared/droits.ts";
import { construireFaits } from "./faits.ts";
import { commitsDuMois } from "./github.ts";
import { libellePeriode, validerPeriode } from "./periode.ts";
import { redigerCommentaire, redigerEvolutions, redigerLectureSeo } from "./redaction.ts";

const BUCKET = "rapports";
const VERDICTS = ["gagne", "en_progres", "rate", "sans_objet"];

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

function texteOuNull(v: unknown, max = 300): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
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
    // Les actions par identifiant verifient le site de la ligne, pas le body.
    const parId = ["chantier-modifier", "chantier-supprimer"];
    if (!parId.includes(action)) exigerSite(autorises, appId);

    if (action === "preparer") {
      const periode = validerPeriode(body.debut, body.fin);
      const faits = await construireFaits(admin, appId, periode);
      const libelle = libellePeriode(periode);

      // Evolutions du logiciel : commits de la periode si le depot et le
      // jeton existent ; sinon la section manque et la page le dit.
      let commits: { date: string; sujet: string }[] = [];
      let evolutions = "";
      const token = Deno.env.get("ADMIN_GITHUB_TOKEN");
      if (!faits.site.repo_github) {
        faits.sources_manquantes.push("Dépôt GitHub non renseigné dans /sites : pas d'évolutions du logiciel");
      } else if (!token) {
        faits.sources_manquantes.push("Secret ADMIN_GITHUB_TOKEN absent : pas d'évolutions du logiciel");
      } else {
        try {
          commits = await commitsDuMois(faits.site.repo_github, token, periode.debut, periode.fin);
          if (commits.length === 0) {
            faits.sources_manquantes.push("Aucun commit sur la période dans le dépôt");
          } else {
            evolutions = await redigerEvolutions(commits, libelle);
          }
        } catch (e) {
          faits.sources_manquantes.push(`Évolutions du logiciel indisponibles : ${(e as Error).message}`);
        }
      }

      // Lecture SEO redigee : proposition depuis les chiffres calcules, relue
      // par Eric dans son champ.
      let lectureSeo = "";
      if (faits.lecture_seo) {
        try {
          lectureSeo = await redigerLectureSeo(faits.lecture_seo, faits.highlights, libelle);
        } catch (e) {
          faits.sources_manquantes.push(`Rédaction de la lecture SEO indisponible : ${(e as Error).message}`);
        }
      }

      return json({
        data: { contenu: faits, commits, evolutions_proposees: evolutions, lecture_seo_proposee: lectureSeo },
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
        const p = { debut: String(r.debut).slice(0, 10), fin: String(r.fin).slice(0, 10) };
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

    // --- Chantiers SEO : ce qui a ete fait, sur quelle cible, quel verdict.
    if (action === "chantiers") {
      const { data, error } = await admin.schema("admin").from("seo_chantiers")
        .select("*").eq("app_id", appId).order("date", { ascending: false });
      if (error) throw new Error(error.message);
      return json({ data: { lignes: data ?? [] }, error: null });
    }

    if (action === "chantier-creer") {
      const libelle = texteOuNull(body.libelle, 200);
      const date = texteOuNull(body.date, 10);
      if (!libelle || !date) return json({ data: null, error: "Date et libellé requis" }, 400);
      const verdict = texteOuNull(body.verdict, 20);
      if (verdict && !VERDICTS.includes(verdict)) return json({ data: null, error: "Verdict inconnu" }, 400);
      const { data, error } = await admin.schema("admin").from("seo_chantiers").insert({
        app_id: appId,
        date,
        libelle,
        cible: texteOuNull(body.cible, 200),
        hypothese: texteOuNull(body.hypothese, 500),
        mesure_prevue_le: texteOuNull(body.mesure_prevue_le, 10),
        verdict,
      }).select().single();
      if (error) throw new Error(error.message);
      return json({ data, error: null });
    }

    if (action === "chantier-modifier" || action === "chantier-supprimer") {
      const { data: ligne } = await admin.schema("admin").from("seo_chantiers")
        .select("app_id").eq("id", String(body.id)).maybeSingle();
      if (!ligne) return json({ data: null, error: "Chantier introuvable" }, 404);
      exigerSite(autorises, ligne.app_id);
      if (action === "chantier-supprimer") {
        const { error } = await admin.schema("admin").from("seo_chantiers").delete().eq("id", String(body.id));
        if (error) throw new Error(error.message);
        return json({ data: { supprime: true }, error: null });
      }
      const patch: Record<string, unknown> = {};
      if (body.libelle !== undefined) patch.libelle = texteOuNull(body.libelle, 200);
      if (body.date !== undefined) patch.date = texteOuNull(body.date, 10);
      if (body.cible !== undefined) patch.cible = texteOuNull(body.cible, 200);
      if (body.hypothese !== undefined) patch.hypothese = texteOuNull(body.hypothese, 500);
      if (body.mesure_prevue_le !== undefined) patch.mesure_prevue_le = texteOuNull(body.mesure_prevue_le, 10);
      if (body.verdict !== undefined) {
        const v = texteOuNull(body.verdict, 20);
        if (v && !VERDICTS.includes(v)) return json({ data: null, error: "Verdict inconnu" }, 400);
        patch.verdict = v;
      }
      const { data, error } = await admin.schema("admin").from("seo_chantiers")
        .update(patch).eq("id", String(body.id)).select().single();
      if (error) throw new Error(error.message);
      return json({ data, error: null });
    }

    return json({ data: null, error: `Action inconnue: ${action}` }, 400);
  } catch (e) {
    if (e instanceof ErreurAcces) return json({ data: null, error: e.message }, 403);
    console.error("[admin-rapport]", e);
    return json({ data: null, error: (e as Error).message }, 500);
  }
});
