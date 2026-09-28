# Rapport d'évaluation RAG — s5-v2.5.1-g38-synth

> 2026-09-27T22:15:19.065Z — 60 questions — comparé à s4c-v2.4.0-bessieres-synth
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 75% | 100% (+0) | n/a | 0.917 | 2161ms | 23865ms | 0.00829 $ | 9935/223 | 0% | 0 |
| C2 | 6 | 100% (+0) | 83% | 83% (+0) | n/a | 0.889 | 2444ms | 5240ms | 0.0091 $ | 9467/534 | 0% | 0 |
| C3 | 10 | 100% (+0) | 90% | 40% (+0) | 100% | 0.85 | 3323ms | 3887ms | 0.00896 $ | 9611/467 | 0% | 0 |
| C4 | 6 | 100% (+0) | n/a | 83% (-17) | n/a | 1 | 4955ms | 22360ms | 0.03351 $ | 36140/1708 | 0% | 0 |
| C5 | 8 | 100% (+25) | 63% | 100% (+37) | n/a | 0.938 | 3212ms | 10292ms | 0.00806 $ | 9527/243 | 13% | 0 |
| C6 | 10 | 100% (+0) | 100% | 100% (+10) | n/a | 1 | 2021ms | 3856ms | 0.00824 $ | 9811/234 | 0% | 0 |
| C7 | 6 | n/a | n/a | 83% (-17) | n/a | n/a | 2874ms | 7160ms | 0.01214 $ | 13998/437 | 17% | 0 |
| C8 | 6 | 100% (+0) | 33% | 67% (+0) | n/a | 1 | 2505ms | 3528ms | 0.00849 $ | 9514/361 | 0% | 0 |
| GLOBAL | 60 | 100% (+4) | 77% | 82% (+4) | 100% | 0.938 | 3029ms | 12260ms | 0.01137 $ | 12744/483 | 3% | 0 |

## Modèles utilisés

- gemini-3.8-flash : 60

## Échecs

- **SC2-006** (C2, chunks, gemini-3.8-flash, 3418ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-004** (C3, chunks, gemini-3.8-flash, 3783ms) « Sur CMP, pour la tranche optionnelle de fermeture des passerelles entre les ailes A et B,  » — faits manquants: va-et-vient
- **SC3-005** (C3, chunks, gemini-3.8-flash, 3625ms) « Sur Citroën, qu'est-ce que le CCAG impose sur les réunions de chantier, et qu'est-ce que l » — faits manquants: PPSPS
- **SC3-006** (C3, chunks, gemini-3.8-flash, 3409ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, gemini-3.8-flash, 3238ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois
- **SC3-009** (C3, chunks, gemini-3.8-flash, 2648ms) « Sur Bessières, si on dépasse les 9 mois annoncés dans le mémoire, le CCAP prévoit quoi com » — faits manquants: 100, 150
- **SC3-010** (C3, chunks, gemini-3.8-flash, 3323ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-006** (C4, gemini, gemini-3.8-flash, 16396ms) « Résume le CCTP du lot étanchéité de l'EHPAD » — faits manquants: dalles sur plots
- **SC7-001** (C7, agentic, gemini-3.8-flash, 7160ms) « Combien d'ascenseurs sont prévus sur Golf Park et pour quelle charge ? » — critères non remplis
- **SC8-003** (C8, chunks, gemini-3.8-flash, 3029ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-006** (C8, chunks, gemini-3.8-flash, 2505ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
