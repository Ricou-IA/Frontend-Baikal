# Rapport d'évaluation RAG — baseline-v2.2.0

> 2026-09-20T22:51:40.024Z — 35 questions — comparé à baseline-v2.1.0

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 83% | 88% (+0) | n/a | 0.821 | 1947ms | 4947ms | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 80% (+20) | n/a | 1 | 3839ms | 4352ms | 0% | 0 |
| C3 | 4 | 75% (+0) | 0% | 100% (+25) | 75% | 0.625 | 5062ms | 6155ms | 0% | 0 |
| C4 | 4 | 100% (+0) | n/a | 100% (+50) | n/a | 0.875 | 5364ms | 10824ms | 0% | 0 |
| C5 | 4 | 75% (-25) | 50% | 50% (+0) | n/a | 0.75 | 3856ms | 4559ms | 50% | 0 |
| C6 | 3 | 100% (+0) | n/a | 100% (+33) | n/a | 0.733 | 4022ms | 6537ms | 33% | 0 |
| C7 | 4 | n/a | n/a | 75% (-25) | n/a | n/a | 2984ms | 3962ms | 75% | 0 |
| C8 | 3 | 100% (+0) | 33% | 67% (+34) | n/a | 0.733 | 3857ms | 4343ms | 33% | 0 |
| GLOBAL | 35 | 93% (-4) | 62% | 83% (+14) | 75% | 0.805 | 3857ms | 9559ms | 29% | 0 |

## Échecs

- **C1-002** (C1, chunks, 1658ms) « Quel est le délai global des travaux ? » — faits manquants: 9 mois
- **C2-001** (C2, chunks, 1963ms) « Quelles sont les prestations du lot VRD ? » — faits manquants: cheminement, réseaux
- **C3-004** (C3, chunks, 2164ms) « Peux-tu me donner les limites de prestations des autres lots avec le gros-œuvre ? » — doc attendu non remonté ; documents manquants: au moins un document attendu (source_docs_all) absent du top-k
- **C5-002** (C5, chunks, 2434ms) « dans le ccap ? » — faits manquants: variation des prix
- **C5-003** (C5, agentic, 4371ms) « Sors-moi l'article correspondant » — doc attendu non remonté ; faits manquants: 11.2
- **C7-004** (C7, chunks, 2984ms) « Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ? » — critères non remplis
- **C8-002** (C8, agentic, 4343ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
