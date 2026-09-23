# Rapport d'évaluation RAG — baseline-v2.3.0-synth

> 2026-09-23T02:17:28.024Z — 60 questions — comparé à baseline-v2.2.0-synth
> Modèle de génération (surcharge) : config DB
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 75% | 100% (+0) | n/a | 0.917 | 2043ms | 3853ms | 0.00142 $ | 9161/81 | 0% | 0 |
| C2 | 6 | 83% (-17) | 80% | 83% (+0) | n/a | 0.722 | 2764ms | 1423329ms | 0.00145 $ (n=5) | 8875/202 | 0% | 1 |
| C3 | 10 | 100% (+0) | 90% | 70% (+0) | 100% | 0.85 | 4751ms | 17493ms | 0.00147 $ | 8928/216 | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 83% (+0) | n/a | 1 | 6235ms | 24667ms | 0.00282 $ | 19810/1436 | 0% | 0 |
| C5 | 8 | 88% (+0) | 57% | 63% (+0) | n/a | 0.813 | 3010ms | 5098ms | 0.00163 $ | 7869/164 | 25% | 0 |
| C6 | 10 | 100% (+0) | 90% | 100% (+0) | n/a | 1 | 2182ms | 3058ms | 0.00143 $ | 9208/79 | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% (+0) | n/a | n/a | 2119ms | 3282ms | 0.00168 $ | 8785/147 | 17% | 0 |
| C8 | 6 | 100% (+0) | 33% | 67% (+0) | n/a | 1 | 3111ms | 3715ms | 0.00138 $ | 8472/175 | 0% | 0 |
| GLOBAL | 60 | 96% (-2) | 74% | 83% (+0) | 100% | 0.901 | 2929ms | 12836ms | 0.00163 $ (n=59) | 9905/279 | 5% | 1 |

## Modèles utilisés

- gpt-4o-mini : 53
- gemini-2.5-flash-lite : 3
- gemini-2.5-flash : 3
- ? : 1

## Échecs

- **SC2-006** (C2, unknown, ?, 1423329ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — doc attendu non remonté ; faits manquants: primaire, 150 g, auto-lissant ; erreur: timeout 90000ms
- **SC3-006** (C3, chunks, gpt-4o-mini, 10767ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, gpt-4o-mini, 4293ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-010** (C3, chunks, gpt-4o-mini, 7674ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-006** (C4, gemini, gemini-2.5-flash-lite, 12836ms) « Résume le CCTP du lot étanchéité de l'EHPAD » — faits manquants: dalles sur plots
- **SC5-005** (C5, agentic, gemini-2.5-flash, 2838ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-007** (C5, chunks, gpt-4o-mini, 2433ms) « et qui vérifie que c'est respecté ? » — faits manquants: SEFAL, audit
- **SC5-008** (C5, chunks, gpt-4o-mini, 3066ms) « et si on le dépasse, le CCAP dit quoi ? » — faits manquants: 100
- **SC8-003** (C8, chunks, gpt-4o-mini, 1860ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, gpt-4o-mini, 1986ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
