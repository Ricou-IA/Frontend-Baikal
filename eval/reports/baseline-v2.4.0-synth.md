# Rapport d'évaluation RAG — baseline-v2.4.0-synth

> 2026-09-24T12:41:51.847Z — 60 questions — comparé à baseline-v2.3.0-synth
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 75% | 100% (+0) | n/a | 1 | 2145ms | 3922ms | 0.00142 $ | 9132/77 | 0% | 0 |
| C2 | 6 | 100% (+17) | 83% | 83% (+0) | n/a | 0.889 | 3025ms | 5247ms | 0.00146 $ | 8887/213 | 0% | 0 |
| C3 | 10 | 100% (+0) | 90% | 70% (+0) | 100% | 0.85 | 3492ms | 7963ms | 0.0015 $ | 8953/256 | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 83% (+0) | n/a | 1 | 5866ms | 16549ms | 0.00271 $ | 21810/678 | 0% | 0 |
| C5 | 8 | 88% (+0) | 43% | 63% (+0) | n/a | 0.813 | 3148ms | 5386ms | 0.00139 $ | 8009/161 | 13% | 0 |
| C6 | 10 | 100% (+0) | 90% | 100% (+0) | n/a | 1 | 2246ms | 4592ms | 0.00145 $ | 9352/71 | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% (+0) | n/a | n/a | 2707ms | 8909ms | 0.00155 $ | 8508/141 | 17% | 0 |
| C8 | 6 | 100% (+0) | 33% | 67% (+0) | n/a | 1 | 3122ms | 6454ms | 0.00142 $ | 8714/188 | 0% | 0 |
| GLOBAL | 60 | 98% (+2) | 72% | 83% (+0) | 100% | 0.932 | 3042ms | 7963ms | 0.00158 $ | 10128/208 | 3% | 0 |

## Modèles utilisés

- gpt-4o-mini : 55
- gemini-2.5-flash-lite : 3
- gemini-2.5-flash : 2

## Échecs

- **SC2-006** (C2, chunks, gpt-4o-mini, 5247ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-006** (C3, chunks, gpt-4o-mini, 2842ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, gpt-4o-mini, 4134ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-010** (C3, chunks, gpt-4o-mini, 3078ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-006** (C4, gemini, gemini-2.5-flash-lite, 9697ms) « Résume le CCTP du lot étanchéité de l'EHPAD » — faits manquants: dalles sur plots
- **SC5-005** (C5, agentic, gemini-2.5-flash, 3503ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-007** (C5, chunks, gpt-4o-mini, 2898ms) « et qui vérifie que c'est respecté ? » — faits manquants: SEFAL, audit
- **SC5-008** (C5, chunks, gpt-4o-mini, 3693ms) « et si on le dépasse, le CCAP dit quoi ? » — faits manquants: 100
- **SC8-003** (C8, chunks, gpt-4o-mini, 2073ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, gpt-4o-mini, 2141ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
