// meeting-transcribe/vocabulary.ts — Custom vocabulary builder V3
// Construit un vocabulaire dynamique depuis les données projet pour Gladia

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { VocabularyItem } from "./types.ts";

const MAX_VOCABULARY_ITEMS = 500;

/**
 * Construit le custom vocabulary Gladia à partir des données projet.
 * Sources :
 *  - rag.documents : termes techniques, bâtiments, concepts CCTP
 *  - Participants fournis par le frontend (participants_hint)
 */
export async function buildCustomVocabulary(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  orgId: string,
  participantsHint?: string,
): Promise<VocabularyItem[]> {
  const terms = new Set<string>();

  // 1. Noms de participants (depuis le hint fourni par le frontend)
  if (participantsHint) {
    const separatorRegex = /[,;\n]+/;
    for (const raw of participantsHint.split(separatorRegex)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      // "M. Martin (OPC)" → extraire "M. Martin" et "OPC"
      const match = trimmed.match(/^(.+?)\s*\((.+)\)$/);
      if (match) {
        addTerm(terms, match[1].trim());
        addTerm(terms, match[2].trim());
      } else {
        addTerm(terms, trimmed);
      }
    }
  }

  // 2. Termes projet depuis rag.documents (titres, métadonnées)
  try {
    const { data: docs } = await supabase
      .from("documents")
      .select("metadata")
      .eq("metadata->>project_id", projectId)
      .eq("metadata->>org_id", orgId)
      .limit(200);

    if (docs) {
      for (const doc of docs) {
        const meta = doc.metadata;
        if (!meta) continue;
        if (meta.document_title) addTerm(terms, meta.document_title);
        if (meta.category_slug) addTerm(terms, meta.category_slug.replace(/-/g, " "));
        // Lots techniques
        if (Array.isArray(meta.qui_lots)) {
          for (const lot of meta.qui_lots) addTerm(terms, lot);
        }
      }
    }
  } catch (e) {
    console.warn("[vocabulary] Error fetching rag.documents:", e);
  }

  // 3. Termes BTP courants (vocabulaire fixe ARPET)
  const btp_terms = [
    "chantier", "maîtrise d'ouvrage", "maîtrise d'oeuvre",
    "OPC", "BET", "CCTP", "DTU", "DPGF",
    "gros oeuvre", "second oeuvre", "VRD",
    "étanchéité", "menuiseries", "plomberie",
    "CVC", "électricité", "courants faibles",
    "fondations", "dalle", "plancher",
    "cloisons", "faux-plafond", "ravalement",
    "lot", "sous-traitant", "titulaire",
    "réception", "levée de réserves", "PV",
    "avenant", "OS", "ordre de service",
    "constat", "non-conformité", "réserve",
    "planning", "retard", "pénalités",
    "situation de travaux", "décompte", "DGD",
    "CSPS", "SPS", "PPSPS", "PGC",
    "AOR", "DET", "EXE", "PRO", "APD", "APS",
    "permis de construire", "DOE", "DIUO",
  ];

  for (const t of btp_terms) addTerm(terms, t);

  // 4. Limiter et formater
  const items: VocabularyItem[] = [];
  for (const term of terms) {
    if (items.length >= MAX_VOCABULARY_ITEMS) break;
    items.push({ value: term, intensity: 0.5, language: "fr" });
  }

  console.log(`[vocabulary] Built ${items.length} vocabulary items for project ${projectId}`);
  return items;
}

/** Ajoute un terme au Set s'il est pertinent (>= 2 chars, pas un nombre seul) */
function addTerm(terms: Set<string>, raw: string): void {
  const t = raw.trim();
  if (t.length < 2) return;
  if (/^\d+$/.test(t)) return; // ignorer les nombres seuls
  terms.add(t);
}
