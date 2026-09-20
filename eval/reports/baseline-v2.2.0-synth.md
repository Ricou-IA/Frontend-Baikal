# Rapport d'évaluation RAG — baseline-v2.2.0-synth

> 2026-09-20T22:56:42.489Z — 60 questions — comparé à baseline-v2.1.0-synth

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 75% | 100% (+0) | n/a | 0.917 | 1918ms | 2744ms | 0% | 0 |
| C2 | 6 | 100% (+0) | 83% | 83% (+0) | n/a | 0.889 | 2782ms | 3778ms | 0% | 0 |
| C3 | 10 | 100% (+0) | 90% | 70% (+0) | 100% | 0.85 | 2457ms | 5364ms | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 83% (+0) | n/a | 1 | 4682ms | 12090ms | 0% | 0 |
| C5 | 8 | 88% (+0) | 71% | 63% (+0) | n/a | 0.875 | 2984ms | 4732ms | 25% | 0 |
| C6 | 10 | 100% (+0) | 90% | 100% (+0) | n/a | 1 | 1684ms | 1967ms | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% (+0) | n/a | n/a | 2052ms | 3009ms | 17% | 0 |
| C8 | 6 | 100% (+0) | 33% | 67% (+0) | n/a | 1 | 2341ms | 3844ms | 0% | 0 |
| GLOBAL | 60 | 98% (+0) | 77% | 83% (+0) | 100% | 0.929 | 2406ms | 5364ms | 5% | 0 |

## Échecs

- **SC2-006** (C2, chunks, 2946ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-006** (C3, chunks, 2810ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, 2810ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-010** (C3, chunks, 2440ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-006** (C4, gemini, 8741ms) « Résume le CCTP du lot étanchéité de l'EHPAD » — faits manquants: dalles sur plots
- **SC5-005** (C5, agentic, 2549ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-007** (C5, chunks, 2682ms) « et qui vérifie que c'est respecté ? » — faits manquants: SEFAL, audit
- **SC5-008** (C5, chunks, 3239ms) « et si on le dépasse, le CCAP dit quoi ? » — faits manquants: 100
- **SC8-003** (C8, chunks, 1796ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, 1556ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
