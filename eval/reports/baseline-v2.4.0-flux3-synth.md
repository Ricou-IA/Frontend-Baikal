# Rapport d'évaluation RAG — s4b-v2.4.0-flux3-synth

> 2026-09-27T08:10:14.568Z — 60 questions — comparé à baseline-v2.4.0-synth
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 75% | 100% (+0) | n/a | 0.917 | 2701ms | 8464ms | 0.00144 $ | 9236/85 | 0% | 0 |
| C2 | 6 | 100% (+0) | 83% | 83% (+0) | n/a | 0.889 | 2996ms | 3697ms | 0.00142 $ | 8661/204 | 0% | 0 |
| C3 | 10 | 100% (+0) | 90% | 40% (-30) | 100% | 0.85 | 3188ms | 4111ms | 0.00146 $ | 8934/202 | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 67% (-16) | n/a | 1 | 4866ms | 49705ms | 0.00287 $ | 20167/1487 | 0% | 0 |
| C5 | 8 | 75% (-13) | 33% | 88% (+25) | n/a | 0.75 | 3201ms | 6700ms | 0.00178 $ | 7931/248 | 25% | 0 |
| C6 | 10 | 100% (+0) | 90% | 100% (+0) | n/a | 1 | 1652ms | 2244ms | 0.00143 $ | 9226/72 | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% (+0) | n/a | n/a | 2033ms | 3321ms | 0.00167 $ | 8937/141 | 17% | 0 |
| C8 | 6 | 100% (+0) | 33% | 67% (+0) | n/a | 1 | 2772ms | 3138ms | 0.00141 $ | 8742/168 | 0% | 0 |
| GLOBAL | 60 | 96% (-2) | 72% | 80% (-3) | 100% | 0.91 | 2791ms | 8464ms | 0.00165 $ | 9966/290 | 5% | 0 |

## Modèles utilisés

- gpt-4o-mini : 54
- gemini-2.5-flash-lite : 3
- gemini-2.5-flash : 3

## Échecs

- **SC2-006** (C2, chunks, gpt-4o-mini, 2637ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-004** (C3, chunks, gpt-4o-mini, 2191ms) « Sur CMP, pour la tranche optionnelle de fermeture des passerelles entre les ailes A et B,  » — faits manquants: va-et-vient, 33.1
- **SC3-005** (C3, chunks, gpt-4o-mini, 3188ms) « Sur Citroën, qu'est-ce que le CCAG impose sur les réunions de chantier, et qu'est-ce que l » — faits manquants: PPSPS
- **SC3-006** (C3, chunks, gpt-4o-mini, 2750ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, gpt-4o-mini, 4111ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-009** (C3, chunks, gpt-4o-mini, 3605ms) « Sur Bessières, si on dépasse les 9 mois annoncés dans le mémoire, le CCAP prévoit quoi com » — faits manquants: 100, 150
- **SC3-010** (C3, chunks, gpt-4o-mini, 2398ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-001** (C4, chunks, gpt-4o-mini, 2672ms) « Fais-moi un résumé de la charte chantier vert en une dizaine de lignes » — faits manquants: déchets
- **SC4-006** (C4, gemini, gemini-2.5-flash-lite, 32632ms) « Résume le CCTP du lot étanchéité de l'EHPAD » — faits manquants: dalles sur plots
- **SC5-005** (C5, agentic, gemini-2.5-flash, 2791ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-006** (C5, agentic, gemini-2.5-flash, 6700ms) « et si on n'y va pas ? » — doc attendu non remonté
- **SC8-003** (C8, chunks, gpt-4o-mini, 3055ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, gpt-4o-mini, 2138ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
