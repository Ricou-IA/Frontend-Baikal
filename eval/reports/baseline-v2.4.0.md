# Rapport d'évaluation RAG — baseline-v2.4.0

> 2026-09-24T12:35:51.052Z — 35 questions — comparé à baseline-v2.3.0
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 83% | 88% (+0) | n/a | 0.821 | 4068ms | 6531ms | 0.00183 $ | 7554/194 | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 100% (+20) | n/a | 0.8 | 5356ms | 7010ms | 0.00149 $ | 8627/323 | 0% | 0 |
| C3 | 4 | 100% (+25) | 100% | 100% (+0) | 75% | 0.875 | 7281ms | 9652ms | 0.00233 $ | 8323/695 | 25% | 0 |
| C4 | 4 | 100% (+0) | n/a | 75% (+0) | n/a | 0.875 | 9474ms | 11746ms | 0.00438 $ | 39108/815 | 0% | 0 |
| C5 | 4 | 100% (+25) | 100% | 50% (+0) | n/a | 0.833 | 3249ms | 3583ms | 0.00169 $ | 8472/147 | 25% | 0 |
| C6 | 3 | 100% (+0) | n/a | 100% (+0) | n/a | 0.833 | 4542ms | 6046ms | 0.002 $ | 7867/356 | 33% | 0 |
| C7 | 4 | n/a | n/a | 100% (+0) | n/a | n/a | 1858ms | 3375ms | 0.00137 $ | 4350/181 | 75% | 0 |
| C8 | 3 | 100% (+0) | 0% | 33% (+0) | n/a | 0.722 | 3804ms | 3977ms | 0.00141 $ | 8540/217 | 0% | 0 |
| GLOBAL | 35 | 100% (+7) | 71% | 83% (+3) | 75% | 0.825 | 4370ms | 11047ms | 0.00204 $ | 11251/349 | 26% | 0 |

## Modèles utilisés

- gpt-4o-mini : 23
- gemini-2.5-flash : 9
- gemini-2.5-flash-lite : 3

## Échecs

- **C1-005** (C1, chunks, gpt-4o-mini, 4068ms) « L'architecte m'indique que le terrain de pétanque est à la Résidence Saint Jean, c'est exa » — faits manquants: Dunant
- **C3-004** (C3, agentic, gemini-2.5-flash, 6904ms) « Peux-tu me donner les limites de prestations des autres lots avec le gros-œuvre ? » — documents manquants: au moins un document attendu (source_docs_all) absent du top-k
- **C4-001** (C4, gemini, gemini-2.5-flash-lite, 11047ms) « Synthétise-moi le CCTP sur 20 lignes » — faits manquants: réhabilitation énergétique | rénovation énergétique
- **C5-002** (C5, chunks, gpt-4o-mini, 3242ms) « dans le ccap ? » — faits manquants: variation des prix
- **C5-003** (C5, chunks, gpt-4o-mini, 3249ms) « Sors-moi l'article correspondant » — faits manquants: 11.2
- **C8-002** (C8, chunks, gpt-4o-mini, 1864ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
- **C8-003** (C8, chunks, gpt-4o-mini, 3977ms) « Que contient l'annexe 2 de la charte chantier vert ? » — faits manquants: Communication Parties Prenantes | parties prenantes
