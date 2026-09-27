# Rapport d'évaluation RAG — s4b-v2.4.0-flux3

> 2026-09-27T08:03:44.985Z — 35 questions — comparé à baseline-v2.4.0
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 100% | 100% (+12) | n/a | 0.798 | 3190ms | 9465ms | 0.00196 $ | 8432/169 | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 100% (+0) | n/a | 0.84 | 4438ms | 4815ms | 0.00154 $ | 8912/346 | 0% | 0 |
| C3 | 4 | 100% (+0) | 100% | 100% (+0) | 100% | 0.75 | 5251ms | 7603ms | 0.00169 $ | 9332/486 | 0% | 0 |
| C4 | 4 | 100% (+0) | n/a | 75% (+0) | n/a | 1 | 14551ms | 43012ms | 0.00481 $ | 44390/586 | 0% | 0 |
| C5 | 4 | 75% (-25) | 100% | 75% (+25) | n/a | 0.75 | 3064ms | 4804ms | 0.00173 $ | 6353/238 | 50% | 0 |
| C6 | 3 | 100% (+0) | n/a | 100% (+0) | n/a | 0.733 | 6162ms | 6318ms | 0.00217 $ | 8695/370 | 33% | 0 |
| C7 | 4 | n/a | n/a | 100% (+0) | n/a | n/a | 1698ms | 11404ms | 0.00099 $ | 4721/141 | 50% | 0 |
| C8 | 3 | 100% (+0) | 0% | 33% (+0) | n/a | 0.722 | 2841ms | 3770ms | 0.00139 $ | 8413/216 | 0% | 0 |
| GLOBAL | 35 | 97% (-3) | 77% | 89% (+6) | 100% | 0.805 | 4113ms | 21774ms | 0.00203 $ | 12072/304 | 23% | 0 |

## Modèles utilisés

- gpt-4o-mini : 24
- gemini-2.5-flash : 8
- gemini-2.5-flash-lite : 3

## Échecs

- **C4-004** (C4, gemini, gemini-2.5-flash-lite, 21774ms) « Résume le CCAG » — faits manquants: 30 mars 2021
- **C5-003** (C5, agentic, gemini-2.5-flash, 4804ms) « Sors-moi l'article correspondant » — doc attendu non remonté ; faits manquants: 11.2
- **C8-002** (C8, chunks, gpt-4o-mini, 2005ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
- **C8-003** (C8, chunks, gpt-4o-mini, 2841ms) « Que contient l'annexe 2 de la charte chantier vert ? » — faits manquants: Communication Parties Prenantes | parties prenantes
