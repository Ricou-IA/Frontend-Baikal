# Rapport d'évaluation RAG — s4c-v2.4.0-bessieres

> 2026-09-27T09:35:19.486Z — 35 questions — comparé à s4b-v2.4.0-flux3
> Surcharges du banc : aucune (config DB)
> Motifs de refus : v3 (v2 : fenêtre 160 caractères ; v3 : formulations nouvelles — C7 non strictement comparable à v2.2.0)

## Synthèse par classe

| Classe | n | Recall doc | Page OK | Critères | Tous docs (C3) | MRR | p50 | p95 | Coût moyen | Tokens in/out | Agentique | Erreurs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | 8 | 100% (+0) | 100% | 88% (-12) | n/a | 0.786 | 2744ms | 10910ms | 0.00217 $ | 9151/171 | 38% | 0 |
| C2 | 5 | 100% (+0) | 100% | 100% (+0) | n/a | 0.833 | 4038ms | 4742ms | 0.00157 $ | 8995/367 | 0% | 0 |
| C3 | 4 | 100% (+0) | 100% | 100% (+0) | 100% | 0.75 | 6570ms | 12300ms | 0.00167 $ | 9138/505 | 0% | 0 |
| C4 | 4 | 100% (+0) | n/a | 100% (+25) | n/a | 1 | 12088ms | 13910ms | 0.00489 $ | 44390/799 | 0% | 0 |
| C5 | 4 | 100% (+25) | 100% | 100% (+25) | n/a | 1 | 3011ms | 3585ms | 0.00139 $ | 8739/131 | 0% | 0 |
| C6 | 3 | 67% (-33) | n/a | 100% (+0) | n/a | 0.667 | 3709ms | 4114ms | 0.00217 $ | 8773/353 | 33% | 0 |
| C7 | 4 | n/a | n/a | 75% (-25) | n/a | n/a | 1632ms | 7207ms | 0.00252 $ | 7211/277 | 75% | 0 |
| C8 | 3 | 100% (+0) | 0% | 33% (+0) | n/a | 0.722 | 2545ms | 3908ms | 0.00121 $ | 7172/224 | 0% | 0 |
| GLOBAL | 35 | 97% (+0) | 79% | 89% (+0) | 100% | 0.828 | 3585ms | 13021ms | 0.00221 $ | 12684/336 | 20% | 0 |

## Modèles utilisés

- gpt-4o-mini : 25
- gemini-2.5-flash : 7
- gemini-2.5-flash-lite : 3

## Échecs

- **C1-006** (C1, agentic, gemini-2.5-flash, 3849ms) « L'architecte me parle de pas japonais mais je ne sais pas de quoi il parle, c'est où ? » — faits manquants: Ecoles
- **C6-002** (C6, chunks, gpt-4o-mini, 3071ms) « Dans le document marché, est-il fait référence à la norme NFP03-001 ? » — doc attendu non remonté
- **C7-003** (C7, agentic, gemini-2.5-flash, 7207ms) « Quel est le coefficient de transmission thermique des menuiseries extérieures et quelles s » — critères non remplis
- **C8-002** (C8, chunks, gpt-4o-mini, 1850ms) « Quelles informations sont dans l'article 2 Définitions ? » — faits manquants: acheteur
- **C8-003** (C8, chunks, gpt-4o-mini, 2545ms) « Que contient l'annexe 2 de la charte chantier vert ? » — faits manquants: Communication Parties Prenantes | parties prenantes
