# Rapport d'évaluation RAG — baseline-v2.1.0

> 2026-09-15T12:04:02.893Z — 35 questions — comparé à baseline-v2.0.0

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | MRR | p50 | p95 | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 83% | 88% (+13) | 0.821 | 3338ms | 12635ms | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 60% (-40) | 0.9 | 4520ms | 5123ms | 0% | 0 |
| C3 | 4 | 75% (+0) | 0% | 75% (+0) | 0.5 | 4303ms | 6967ms | 0% | 0 |
| C4 | 4 | 100% (+0) | n/a | 50% (+25) | 0.875 | 4916ms | 15256ms | 0% | 0 |
| C5 | 4 | 100% (+25) | 67% | 50% (+0) | 0.875 | 2818ms | 4993ms | 25% | 0 |
| C6 | 3 | 100% (+33) | n/a | 67% (+0) | 0.75 | 6059ms | 6411ms | 33% | 0 |
| C7 | 4 | n/a | n/a | 100% (+0) | n/a | 3368ms | 10574ms | 75% | 0 |
| C8 | 3 | 100% (+0) | 67% | 33% (-34) | 0.733 | 3673ms | 7301ms | 33% | 0 |
| GLOBAL | 35 | 97% (+7) | 71% | 69% (-2) | 0.79 | 4270ms | 12635ms | 26% | 0 |

## Échecs

- **C1-002** (C1, chunks, 2747ms) « Quel est le délai global des travaux ? » — faits manquants: 9 mois
- **C2-001** (C2, chunks, 2197ms) « Quelles sont les prestations du lot VRD ? » — faits manquants: réseaux
- **C2-003** (C2, chunks, 4041ms) « Quelles sont les pénalités de retard prévues au marché ? » — faits manquants: 10 %
- **C3-001** (C3, chunks, 4303ms) « Est-ce qu'il y a des incohérences entre le mémoire technique et le CCTP ? » — faits manquants: désamiantage
- **C3-004** (C3, chunks, 2395ms) « Peux-tu me donner les limites de prestations des autres lots avec le gros-œuvre ? » — doc attendu non remonté
- **C4-001** (C4, gemini, 15256ms) « Synthétise-moi le CCTP sur 20 lignes » — faits manquants: réhabilitation énergétique, 7 résidences
- **C4-004** (C4, chunks, 2422ms) « Résume le CCAG » — faits manquants: marchés publics, 30 mars 2021
- **C5-002** (C5, chunks, 2687ms) « dans le ccap ? » — faits manquants: variation des prix
- **C5-003** (C5, chunks, 3277ms) « Sors-moi l'article correspondant » — faits manquants: 11.2
- **C6-003** (C6, agentic, 6411ms) « Que disent les pièces du marché sur les articles L. 8221-3 à L. 8221-5 ? » — faits manquants: travail dissimulé
- **C8-002** (C8, agentic, 7301ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
- **C8-003** (C8, chunks, 3673ms) « Que contient l'annexe 2 de la charte chantier vert ? » — faits manquants: Communication Parties Prenantes
