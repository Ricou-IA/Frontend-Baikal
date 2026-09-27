# Rapport d'évaluation RAG — s4c-v2.4.0-bessieres-synth

> 2026-09-27T09:40:30.877Z — 60 questions — comparé à s4b-v2.4.0-flux3-synth
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 75% | 100% (+0) | n/a | 0.917 | 1717ms | 2413ms | 0.00143 $ | 9236/80 | 0% | 0 |
| C2 | 6 | 100% (+0) | 83% | 83% (+0) | n/a | 0.889 | 2397ms | 3494ms | 0.00143 $ | 8693/208 | 0% | 0 |
| C3 | 10 | 100% (+0) | 90% | 40% (+0) | 100% | 0.85 | 2723ms | 4864ms | 0.00147 $ | 8934/209 | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 100% (+33) | n/a | 1 | 5296ms | 17144ms | 0.00283 $ | 20167/1370 | 0% | 0 |
| C5 | 8 | 75% (+0) | 33% | 63% (-25) | n/a | 0.75 | 2914ms | 4263ms | 0.00159 $ | 7713/185 | 25% | 0 |
| C6 | 10 | 100% (+0) | 100% | 90% (-10) | n/a | 1 | 1672ms | 3089ms | 0.00142 $ | 9105/88 | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% (+0) | n/a | n/a | 2198ms | 3990ms | 0.0016 $ | 8486/153 | 17% | 0 |
| C8 | 6 | 100% (+0) | 33% | 67% (+0) | n/a | 1 | 2672ms | 3184ms | 0.00142 $ | 8742/177 | 0% | 0 |
| GLOBAL | 60 | 96% (+0) | 74% | 78% (-2) | 100% | 0.91 | 2558ms | 5296ms | 0.00161 $ | 9875/276 | 5% | 0 |

## Modèles utilisés

- gpt-4o-mini : 54
- gemini-2.5-flash-lite : 3
- gemini-2.5-flash : 3

## Échecs

- **SC2-006** (C2, chunks, gpt-4o-mini, 2946ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-004** (C3, chunks, gpt-4o-mini, 3254ms) « Sur CMP, pour la tranche optionnelle de fermeture des passerelles entre les ailes A et B,  » — faits manquants: va-et-vient, 33.1
- **SC3-005** (C3, chunks, gpt-4o-mini, 3205ms) « Sur Citroën, qu'est-ce que le CCAG impose sur les réunions de chantier, et qu'est-ce que l » — faits manquants: semaine, PPSPS
- **SC3-006** (C3, chunks, gpt-4o-mini, 2593ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, gpt-4o-mini, 2723ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-009** (C3, chunks, gpt-4o-mini, 3144ms) « Sur Bessières, si on dépasse les 9 mois annoncés dans le mémoire, le CCAP prévoit quoi com » — faits manquants: 100, 150
- **SC3-010** (C3, chunks, gpt-4o-mini, 2140ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC5-005** (C5, agentic, gemini-2.5-flash, 2558ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-006** (C5, agentic, gemini-2.5-flash, 4263ms) « et si on n'y va pas ? » — doc attendu non remonté
- **SC5-007** (C5, chunks, gpt-4o-mini, 2582ms) « et qui vérifie que c'est respecté ? » — faits manquants: SEFAL, audit
- **SC5-008** (C5, chunks, gpt-4o-mini, 2648ms) « et si on le dépasse, le CCAP dit quoi ? » — faits manquants: 100
- **SC6-006** (C6, chunks, gpt-4o-mini, 3089ms) « Sur Bessières, pour les installations électriques basse tension, le CCTP renvoie à quelle  » — faits manquants: 1.2.4
- **SC8-003** (C8, chunks, gpt-4o-mini, 1918ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, gpt-4o-mini, 1859ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
