# Rapport d'évaluation RAG — s5-v2.5.1-g38

> 2026-09-27T22:08:53.878Z — 35 questions — comparé à s4c-v2.4.0-bessieres
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 83% | 100% (+12) | n/a | 0.786 | 2304ms | 5124ms | 0.01071 $ | 13170/223 | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 80% (-20) | n/a | 0.833 | 4897ms | 5265ms | 0.01036 $ | 9633/837 | 0% | 0 |
| C3 | 4 | 100% (+0) | 100% | 75% (-25) | 100% | 0.75 | 5023ms | 8760ms | 0.01142 $ | 9693/1106 | 0% | 0 |
| C4 | 4 | 100% (+0) | n/a | 100% (+0) | n/a | 1 | 20486ms | 23569ms | 0.07388 $ | 83361/3031 | 0% | 0 |
| C5 | 4 | 100% (+0) | 100% | 100% (+0) | n/a | 0.875 | 3943ms | 4270ms | 0.00828 $ | 9094/390 | 25% | 0 |
| C6 | 3 | 67% (+0) | n/a | 100% (+0) | n/a | 0.667 | 7770ms | 10418ms | 0.01035 $ | 10031/755 | 33% | 0 |
| C7 | 4 | n/a | n/a | 50% (-25) | n/a | n/a | 2536ms | 8103ms | 0.01213 $ | 13588/518 | 75% | 0 |
| C8 | 3 | 100% (+0) | 0% | 67% (+34) | n/a | 0.722 | 4309ms | 11973ms | 0.00871 $ | 7756/773 | 0% | 0 |
| GLOBAL | 35 | 97% (+0) | 71% | 86% (-3) | 100% | 0.811 | 4353ms | 22108ms | 0.01765 $ | 19138/878 | 23% | 0 |

## Modèles utilisés

- gemini-3.8-flash : 35

## Échecs

- **C2-001** (C2, chunks, gemini-3.8-flash, 2614ms) « Quelles sont les prestations du lot VRD ? » — faits manquants: réseaux
- **C3-002** (C3, chunks, gemini-3.8-flash, 8760ms) « Quels sont les délais de pénalité prévus dans le CCAP et comment se comparent-ils aux obli » — faits manquants: 5 mois
- **C6-002** (C6, chunks, gemini-3.8-flash, 3273ms) « Dans le document marché, est-il fait référence à la norme NFP03-001 ? » — doc attendu non remonté
- **C7-003** (C7, agentic, gemini-3.8-flash, 8103ms) « Quel est le coefficient de transmission thermique des menuiseries extérieures et quelles s » — critères non remplis
- **C7-004** (C7, chunks, gemini-3.8-flash, 2536ms) « Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ? » — critères non remplis
- **C8-002** (C8, chunks, gemini-3.8-flash, 11973ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
