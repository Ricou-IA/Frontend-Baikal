# Rapport d'évaluation RAG — baseline-v2.0.0

> 2026-09-13T15:59:05.098Z — 35 questions

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | MRR | p50 | p95 | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% | n/a | 75% | 0.69 | 2826ms | 12629ms | 13% | 0 |
| C2 | 5 | 100% | n/a | 100% | 0.867 | 3897ms | 4380ms | 0% | 0 |
| C3 | 4 | 75% | n/a | 75% | 0.458 | 4098ms | 5027ms | 0% | 0 |
| C4 | 4 | 100% | n/a | 25% | 1 | 5190ms | 35696ms | 0% | 0 |
| C5 | 4 | 75% | n/a | 50% | 0.75 | 4979ms | 19087ms | 75% | 0 |
| C6 | 3 | 67% | n/a | 67% | 0.444 | 2858ms | 3746ms | 0% | 0 |
| C7 | 4 | n/a | n/a | 100% | n/a | 3661ms | 6469ms | 75% | 0 |
| C8 | 3 | 100% | n/a | 67% | 0.833 | 2181ms | 4246ms | 0% | 0 |
| GLOBAL | 35 | 90% | n/a | 71% | 0.728 | 4098ms | 19087ms | 20% | 0 |

## Échecs

- **C1-005** (C1, chunks, 2666ms) « L'architecte m'indique que le terrain de pétanque est à la Résidence Saint Jean, c'est exa » — faits manquants: Dunant
- **C1-006** (C1, chunks, 2262ms) « L'architecte me parle de pas japonais mais je ne sais pas de quoi il parle, c'est où ? » — faits manquants: Ecoles
- **C3-001** (C3, chunks, 3408ms) « Est-ce qu'il y a des incohérences entre le mémoire technique et le CCTP ? » — doc attendu non remonté ; faits manquants: désamiantage
- **C4-001** (C4, gemini, 35696ms) « Synthétise-moi le CCTP sur 20 lignes » — faits manquants: réhabilitation énergétique
- **C4-002** (C4, chunks, 5190ms) « Résume-moi le mémoire technique » — faits manquants: OPH 31
- **C4-004** (C4, chunks, 2273ms) « Résume le CCAG » — faits manquants: marchés publics, 30 mars 2021
- **C5-002** (C5, chunks, 2734ms) « dans le ccap ? » — faits manquants: variation des prix
- **C5-003** (C5, agentic, 6388ms) « Sors-moi l'article correspondant » — doc attendu non remonté ; faits manquants: 11.2
- **C6-003** (C6, chunks, 2765ms) « Que disent les pièces du marché sur les articles L. 8221-3 à L. 8221-5 ? » — doc attendu non remonté ; faits manquants: travail dissimulé
- **C8-001** (C8, chunks, 2181ms) « Que dit l'article 2.3.9 du CCTP ? » — faits manquants: terrain de pétanque, terrassement
