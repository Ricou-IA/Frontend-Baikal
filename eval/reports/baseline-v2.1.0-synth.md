# Rapport d'évaluation RAG — baseline-v2.1.0-synth

> 2026-09-15T12:09:31.898Z — 60 questions — comparé à baseline-v2.0.0-synth

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | MRR | p50 | p95 | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 63% | 100% (+12) | 0.917 | 2883ms | 6662ms | 0% | 0 |
| C2 | 6 | 100% (+0) | 83% | 83% (+50) | 0.889 | 2770ms | 3886ms | 0% | 0 |
| C3 | 10 | 100% (+0) | 90% | 70% (+40) | 1 | 2993ms | 3994ms | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 83% (+33) | 1 | 3808ms | 4134ms | 0% | 0 |
| C5 | 8 | 88% (+0) | 57% | 63% (+13) | 0.729 | 4066ms | 9183ms | 50% | 0 |
| C6 | 10 | 100% (+0) | 90% | 100% (+20) | 1 | 1964ms | 2900ms | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% (+0) | n/a | 2047ms | 4102ms | 17% | 0 |
| C8 | 6 | 100% (+17) | 0% | 67% (+67) | 0.917 | 2676ms | 5917ms | 0% | 0 |
| GLOBAL | 60 | 98% (+2) | 70% | 83% (+28) | 0.926 | 2900ms | 5917ms | 8% | 0 |

## Échecs

- **SC2-006** (C2, chunks, 2770ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-006** (C3, chunks, 2040ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: gros, polystyr
- **SC3-007** (C3, chunks, 3355ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-010** (C3, chunks, 3364ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-006** (C4, chunks, 4134ms) « Résume le CCTP du lot étanchéité de l'EHPAD » — faits manquants: dalles sur plots, végétalis
- **SC5-005** (C5, agentic, 3877ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-007** (C5, chunks, 3195ms) « et qui vérifie que c'est respecté ? » — faits manquants: SEFAL, audit
- **SC5-008** (C5, chunks, 3565ms) « et si on le dépasse, le CCAP dit quoi ? » — faits manquants: 100
- **SC8-003** (C8, chunks, 2015ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, 1864ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
