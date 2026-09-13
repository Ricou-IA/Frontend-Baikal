# Rapport d'évaluation RAG — baseline-v2.0.0-synth

> 2026-09-13T19:55:58.152Z — 60 questions

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | MRR | p50 | p95 | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% | n/a | 88% | 0.781 | 2283ms | 10599ms | 0% | 0 |
| C2 | 6 | 100% | n/a | 33% | 0.806 | 2319ms | 3746ms | 0% | 0 |
| C3 | 10 | 100% | n/a | 30% | 0.85 | 2510ms | 3081ms | 0% | 0 |
| C4 | 6 | 100% | n/a | 50% | 0.833 | 3811ms | 5307ms | 0% | 0 |
| C5 | 8 | 88% | n/a | 50% | 0.563 | 3020ms | 9878ms | 50% | 0 |
| C6 | 10 | 100% | n/a | 80% | 0.9 | 1940ms | 3354ms | 0% | 0 |
| C7 | 6 | n/a | n/a | 100% | n/a | 1945ms | 2746ms | 0% | 0 |
| C8 | 6 | 83% | n/a | 0% | 0.667 | 1735ms | 5268ms | 0% | 0 |
| GLOBAL | 60 | 96% | n/a | 55% | 0.779 | 2319ms | 5714ms | 7% | 0 |

## Échecs

- **SC1-001** (C1, chunks, 10599ms) « Sur CMP, c'est quoi la retenue qu'ils nous prennent sur chaque situation ? » — faits manquants: garantie
- **SC2-001** (C2, chunks, 2319ms) « Une fois réceptionné sur CMP, on est engagés sur quelles garanties et pendant combien de t » — faits manquants: 2 ans, 10 ans
- **SC2-004** (C2, chunks, 1996ms) « Sur l'EHPAD, comment on est réglés chaque mois et à quelle date il faut envoyer la situati » — faits manquants: 25
- **SC2-005** (C2, chunks, 3746ms) « Qu'est-ce que la charte chantier vert nous impose sur les déchets ? » — faits manquants: 50 %
- **SC2-006** (C2, chunks, 2305ms) « Le sol en résine du lot peinture CMP, c'est quel système en couches et quelles consommatio » — faits manquants: auto-lissant
- **SC3-003** (C3, chunks, 1926ms) « Sur CMP, le déplacement du générateur d'azote qui est dans le MHT : ça tombe dans quelle r » — faits manquants: sous-sol
- **SC3-004** (C3, chunks, 2510ms) « Sur CMP, pour la tranche optionnelle de fermeture des passerelles entre les ailes A et B,  » — faits manquants: va-et-vient, 33.1
- **SC3-005** (C3, chunks, 2514ms) « Sur Citroën, qu'est-ce que le CCAG impose sur les réunions de chantier, et qu'est-ce que l » — faits manquants: PPSPS
- **SC3-006** (C3, chunks, 2454ms) « Sur Citroën, qui paie les bennes à gravats d'après le CCAG, et qu'est-ce que le CR 41 dema » — faits manquants: polystyr
- **SC3-007** (C3, chunks, 2365ms) « Sur l'EHPAD, l'étancheur réceptionne ses supports comment, et s'il y a des réserves à la r » — faits manquants: mois, sans réserve
- **SC3-008** (C3, chunks, 2615ms) « Sur Golf Park, la charte chantier vert doit être signée à quel moment, et l'acte d'engagem » — faits manquants: 1.3
- **SC3-010** (C3, chunks, 3081ms) « Sur l'EHPAD, quels DTU sont cités pour l'étanchéité d'un côté et pour la plâtrerie de l'au » — faits manquants: 25.41
- **SC4-001** (C4, chunks, 2493ms) « Fais-moi un résumé de la charte chantier vert en une dizaine de lignes » — faits manquants: SEFAL
- **SC4-002** (C4, chunks, 2653ms) « Résume-moi l'acte d'engagement de Golf Park » — faits manquants: PRIMOPIERRE
- **SC4-004** (C4, chunks, 4499ms) « Résume-moi le CCTP du lot 15 fluides spéciaux » — faits manquants: air comprimé
- **SC5-001** (C5, chunks, 3020ms) « et si le maître d'ouvrage paie en retard ? » — faits manquants: intérêts moratoires, 40
- **SC5-004** (C5, chunks, 1890ms) « et dans l'autre sens, si c'est le maître d'ouvrage qui paie en retard ? » — faits manquants: 40
- **SC5-005** (C5, agentic, 9878ms) « combien de jours de gel en janvier ? » — doc attendu non remonté ; faits manquants: 5 jours
- **SC5-008** (C5, chunks, 1983ms) « et si on le dépasse, le CCAP dit quoi ? » — faits manquants: 100
- **SC6-003** (C6, chunks, 2096ms) « Le primaire époxy du sol résine sur CMP, c'est quelle classification AFNOR ? » — faits manquants: 36-005
- **SC6-006** (C6, chunks, 1824ms) « Sur Bessières, pour les installations électriques basse tension, le CCTP renvoie à quelle  » — faits manquants: 15.100
- **SC8-001** (C8, chunks, 1267ms) « Que dit l'article 3.7 du CCAP CMP ? » — faits manquants: 30 jours, 40
- **SC8-002** (C8, gemini, 5268ms) « Cite-moi l'article 9.5 du CCAP de CMP » — doc attendu non remonté ; faits manquants: parfait achèvement, 10 ans
- **SC8-003** (C8, chunks, 1842ms) « Qu'est-ce qu'il y a dans le 3.6 du CCTP du lot 06 ? » — faits manquants: volets roulants, SOMFY
- **SC8-004** (C8, chunks, 1663ms) « Reprends-moi le texte de l'article 3.3 du CCAG Citroën » — faits manquants: prorata, gros
- **SC8-005** (C8, chunks, 1819ms) « Que dit l'article 8.2 du CCAP de l'EHPAD ? » — faits manquants: 1/500
- **SC8-006** (C8, chunks, 1735ms) « Que dit le point 5.4 de la charte chantier vert ? » — faits manquants: 50 %, valoris
