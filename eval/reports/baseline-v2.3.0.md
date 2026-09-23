# Rapport d'évaluation RAG — baseline-v2.3.0

> 2026-09-23T00:39:17.370Z — 35 questions — comparé à baseline-v2.2.0
> Modèle de génération (surcharge) : config DB
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 83% | 88% (+0) | n/a | 0.821 | 2510ms | 5773ms | 0.00175 $ | 7342/162 | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 80% (+0) | n/a | 1 | 5219ms | 5666ms | 0.00142 $ | 8057/351 | 0% | 0 |
| C3 | 4 | 75% (+0) | 0% | 100% (+0) | 75% | 0.625 | 6449ms | 8362ms | 0.00156 $ | 8498/483 | 0% | 0 |
| C4 | 4 | 100% (+0) | n/a | 75% (-25) | n/a | 0.875 | 9297ms | 13253ms | 0.00375 $ | 32544/568 | 0% | 0 |
| C5 | 4 | 75% (+0) | 50% | 50% (+0) | n/a | 0.75 | 3354ms | 5642ms | 0.00182 $ | 5553/334 | 50% | 0 |
| C6 | 3 | 100% (+0) | n/a | 100% (+0) | n/a | 0.733 | 4716ms | 4956ms | 0.00187 $ | 7322/356 | 33% | 0 |
| C7 | 4 | n/a | n/a | 100% (+25) | n/a | n/a | 1745ms | 6432ms | 0.00267 $ | 7428/331 | 75% | 0 |
| C8 | 3 | 100% (+0) | 33% | 33% (-34) | n/a | 0.733 | 3747ms | 3961ms | 0.00215 $ | 8164/313 | 33% | 0 |
| GLOBAL | 35 | 93% (+0) | 62% | 80% (-3) | 75% | 0.805 | 4240ms | 12646ms | 0.00207 $ | 10331/341 | 29% | 0 |

## Modèles utilisés

- gpt-4o-mini : 23
- gemini-2.5-flash : 10
- gemini-2.5-flash-lite : 2

## Échecs

- **C1-002** (C1, chunks, gpt-4o-mini, 2997ms) « Quel est le délai global des travaux ? » — faits manquants: 9 mois
- **C2-001** (C2, chunks, gpt-4o-mini, 2801ms) « Quelles sont les prestations du lot VRD ? » — faits manquants: cheminement, réseaux
- **C3-004** (C3, chunks, gpt-4o-mini, 2032ms) « Peux-tu me donner les limites de prestations des autres lots avec le gros-œuvre ? » — doc attendu non remonté ; documents manquants: au moins un document attendu (source_docs_all) absent du top-k
- **C4-004** (C4, chunks, gpt-4o-mini, 7001ms) « Résume le CCAG » — faits manquants: 30 mars 2021
- **C5-002** (C5, chunks, gpt-4o-mini, 3354ms) « dans le ccap ? » — faits manquants: variation des prix
- **C5-003** (C5, agentic, gemini-2.5-flash, 5642ms) « Sors-moi l'article correspondant » — doc attendu non remonté ; faits manquants: 11.2
- **C8-002** (C8, agentic, gemini-2.5-flash, 3747ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
- **C8-003** (C8, chunks, gpt-4o-mini, 1983ms) « Que contient l'annexe 2 de la charte chantier vert ? » — faits manquants: Communication Parties Prenantes | parties prenantes
