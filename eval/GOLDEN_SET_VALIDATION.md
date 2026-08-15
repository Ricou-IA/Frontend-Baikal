# Golden Set RAG ARPET — Tableau de validation (proposition du 2026-06-12)

> Source : 319 messages utilisateur réels (rag.messages, jan→avr 2026) sur 4 projets.
> **35 entrées, 100 % issues de conversations réelles** (0 synthétique — toutes les classes, y compris C5/C7/C8, existent dans l'historique).
> Fichier machine : `eval/golden-set.json` (v1 du 2026-08-15, exécutable par run-eval.ts ; la proposition d'origine est conservée dans golden-set.proposed.json)

## Couverture

**Par classe**

| Classe | Libellé | Entrées |
|---|---|---|
| C1 | Fait précis dans un chunk | 8 |
| C2 | Info éclatée dans un document | 5 |
| C3 | Croisement 2+ documents | 4 |
| C4 | Synthèse large | 4 |
| C5 | Suivi avec référence implicite | 4 |
| C6 | Mention norme/code | 3 |
| C7 | Hors corpus (refus attendu) | 4 |
| C8 | Citation exacte/verbatim | 3 |

**Par projet**

| Projet | Entrées | Corpus actuel |
|---|---|---|
| bessieres | 20 | CCTP TCE (172p), PGC (48p), Mémoire Technique (35p), CCAP (22p), Acte d'Engagement, RICT + couche app (CCAG, NFP03-001) |
| golfpark | 7 | CCTP GOLF PARK (76p), CCAP Travaux (42p), Charte Chantier Vert + annexes, Acte d'Engagement |
| ehpad | 7 | 2139_CCAP (54p), 2 PV de chantier, 6 CCTP de lots (02, 03, 05, 07, 08, 12) |
| bessieres_old | 1 | ⚠️ quasi vide : 4 chunks restants |

**Statuts (maj 2026-08-15)** : ✅ prêt ×32 · ⚠️ décision Eric ×3 (C3-001 proposition faite, C3-002, C3-004) · 🆕 synthétique ×0

## Points à arbitrer — mise à jour du 2026-08-15 (vérifications faites en base de production)

1. ~~bessieres_old (C1-008)~~ **RÉSOLU** : les 4 chunks restants sont exactement les transcripts de réunion de janvier (dont le 29/01 « Réunion de coordination des lots techniques »). L'entrée est jouable telle quelle.
2. ~~Matching des faits~~ **RÉSOLU (2026-08-15)** : `normalize()` de `run-eval.ts` gère désormais casse, accents, espaces (y compris insécables), tirets et apostrophes typographiques — « NF P 03‑001 » ≡ « NFP03-001 », « 09 71 10 39 60 » ≡ « 0971103960 ». Les points sont conservés (« 11.2 » ne matche pas « 112 »). Vérifié par tests unitaires + `deno check`.
3. ~~Numéros de pages CCTP TCE~~ **RÉSOLU** : après ré-ingestion (345 chunks), pétanque = page 56 (§2.3.9) et pas japonais = page 57 (§2.3.11) — les attendus historiques tiennent. Au passage, le statut menteur du fichier (`pending` / 0 chunks depuis février) a été corrigé en base : `completed` / 345.
4. **C3-001 / C3-004 — décision Eric** : pour C3-001, proposition étayée dans le JSON (le désamiantage est traité au CCTP §2.2, pages 3 et 50, mais n'apparaît dans aucun des 171 chunks du Mémoire Technique → l'« incohérence » de référence = une omission du MT) ; confirmer puis passer `a_valider` à false. C3-004 (limites de prestations gros-œuvre) reste entièrement à définir.
5. ~~C7-003 (golfpark)~~ **RÉSOLU** : 0 occurrence de coefficient thermique / Uw / menuiseries / acoustique façade dans les 142 chunks du CCTP GOLF PARK — `must_refuse: true` confirmé.
6. **C7-004 (ehpad) — sentinelle anti-hallucination** : inchangée, ne pas l'assouplir.
7. ~~C5-002~~ **RÉSOLU** : le CCAP Bessières contient bien « 7.2 - Modalités de variation des prix » (page 9) — attendu figé, l'échec d'époque était un faux négatif de retrieval. Réserve : le chunk 31/107 étiqueté §7.2 commence par « Le délai d'exécution est de 12 mois » — frontière de chunking à surveiller.

Compléments du 2026-08-15 : C5-004 a reçu un attendu minimal (citer des références DTU d'autres lots, pas de refus), à durcir après le premier run. L'historique post-avril ne contient que 6 messages (tests) : le set couvre 100 % de l'usage réel à ce jour. Extensions possibles plus tard : projet **CMP** (7 questions réelles de mars 2026, dont « qui doit réaliser les joints acryliques ? » — excellent cas de limites de prestations inter-lots) et projet **Citroen** (CR de réunions n°40/41).

## Tableau de validation

| ID | Classe | Projet | Question | Attendu (doc p.X + faits) | Statut |
|---|---|---|---|---|---|
| C1-001 | C1 | bessieres | Où se trouve le terrain de pétanque ? | CCTP TCE p.56 — « Dunant », « espaces publics » | ✅ pré-rempli |
| C1-002 | C1 | bessieres | Quel est le délai global des travaux ? | Mémoire Technique p.19 — « 9 mois » | ✅ pré-rempli |
| C1-003 | C1 | bessieres | Quel est le numéro de la CARSAT ? | PGC p.8 — « 09 71 10 39 60 » | ✅ pré-rempli |
| C1-004 | C1 | golfpark | Quelle est la zone climatique du projet ? | CCTP GOLF PARK p.7 — « H1 » | ✅ pré-rempli |
| C1-005 | C1 | bessieres | L'architecte m'indique que le terrain de pétanque est à la Résidence Saint Jean, c'est exact ? | CCTP TCE p.56 — doit contredire et citer « Dunant » (anti-complaisance) | ✅ pré-rempli |
| C1-006 | C1 | bessieres | L'architecte me parle de pas japonais… c'est où ? | CCTP TCE p.57 §2.3.11 — « Dunant » ET « Les Ecoles » | ✅ pré-rempli |
| C1-007 | C1 | ehpad | Qui doit le nettoyage extérieur (pièces marché) ? | 2139_CCAP — « entrepreneur » (ayant mis en œuvre l'installation) | ✅ pré-rempli |
| C1-008 | C1 | bessieres_old | Quel est le sujet de la dernière réunion de chantier ? | « coordination des lots techniques » — vérifié : les 4 chunks restants sont les transcripts, jouable | ✅ résolu 15/08 |
| C2-001 | C2 | bessieres | Quelles sont les prestations du lot VRD ? | CCTP TCE §2.3 — « cheminement », « réseaux » | ✅ pré-rempli |
| C2-002 | C2 | bessieres | Résume les prescriptions acoustiques du projet | CCTP TCE — « bruit » (NRA, limites réglementaires) | ✅ pré-rempli |
| C2-003 | C2 | bessieres | Quelles sont les pénalités de retard prévues au marché ? | CCAG art.19 — plafond « 10 % » du montant HT | ✅ pré-rempli |
| C2-004 | C2 | golfpark | Comment sont traitées les centrales de traitement d'air ? | CCTP GOLF PARK — CTA « thermique » / « hygiénique » | ✅ pré-rempli |
| C2-005 | C2 | ehpad | Articles du CCAP traitant réception, livraison, MADA ? | 2139_CCAP p.29 — « 11.1 », « réception » (+11.2 OPR, 11.3 mise à disposition) | ✅ pré-rempli |
| C3-001 | C3 | bessieres | Incohérences entre le mémoire technique et le CCTP ? | Proposition 15/08 : désamiantage au CCTP §2.2, absent du Mémoire Technique (omission) — à confirmer | ⚠️ décision Eric |
| C3-002 | C3 | golfpark | Délais de pénalité du CCAP vs obligations charte chantier vert ? | CCAP Travaux × Charte — « 5 mois » à confirmer + volet comparatif | ⚠️ à valider |
| C3-003 | C3 | ehpad | Résumé des obligations de chacun pour les phases OPL et OPR (tous documents) | 2139_CCAP p.29 — « OPR » (art. 11.2) | ✅ pré-rempli |
| C3-004 | C3 | bessieres | Limites de prestations des autres lots avec le gros-œuvre ? | CCTP TCE (+CCAP) — réponses historiques instables, référence à définir | ⚠️ décision Eric |
| C4-001 | C4 | bessieres | Synthétise-moi le CCTP sur 20 lignes | CCTP TCE — « réhabilitation énergétique », « 7 résidences » | ✅ pré-rempli |
| C4-002 | C4 | bessieres | Résume-moi le mémoire technique | Mémoire Technique — « OPH 31 », « site occupé » | ✅ pré-rempli |
| C4-003 | C4 | golfpark | Prépare une synthèse du CCTP GTB | CCTP GOLF PARK — « GTB », « Toulouse » (54 000 m², zone H1) | ✅ pré-rempli |
| C4-004 | C4 | bessieres | Résume le CCAG | CCAG (couche app) — « marchés publics », « 30 mars 2021 » | ✅ pré-rempli |
| C5-001 | C5 | bessieres | « Quelle est la localisation ? » (après : l'architecte me parle du terrain de pétanque) | CCTP TCE p.56 — « Dunant » (résolution du référent implicite) | ✅ pré-rempli |
| C5-002 | C5 | bessieres | « dans le ccap ? » (après : le marché est actualisable ou révisable ?) | CCAP p.9 §7.2 « Modalités de variation des prix » — vérifié en base | ✅ résolu 15/08 |
| C5-003 | C5 | ehpad | « Sors-moi l'article correspondant » (après : mention d'OPR/OPL dans les CR ?) | 2139_CCAP p.29 — « 11.2 » (article OPR) | ✅ pré-rempli |
| C5-004 | C5 | bessieres | « et les autres lots ? » (après : articles référençant les DTU dans le CCTP) | CCTP TCE — attendu minimal posé (citer des DTU, pas de refus), à durcir après run 1 | ✅ résolu 15/08 |
| C6-001 | C6 | bessieres | Quels sont les DTU prévus dans le CCTP pour le lot plomberie ? | CCTP TCE — « DTU 65.3 », « DTU 65.4 » | ✅ pré-rempli |
| C6-002 | C6 | ehpad | Le document marché fait-il référence à la norme NFP03-001 ? | 2139_CCAP — « 03-001 » (le CCAG du marché = NF P 03-001) | ✅ pré-rempli |
| C6-003 | C6 | bessieres | Que disent les pièces du marché sur les articles L. 8221-3 à L. 8221-5 ? | CCAP — « travail dissimulé » | ✅ pré-rempli |
| C7-001 | C7 | bessieres | Quels sont les matériaux utilisés sur la Lune ? | Refus propre (« pas trouvé »), zéro invention | ✅ pré-rempli |
| C7-002 | C7 | golfpark | Quelle est la recette de la quiche lorraine ? | Refus propre + recadrage métier, zéro invention | ✅ pré-rempli |
| C7-003 | C7 | golfpark | Coefficient thermique des menuiseries ext. + exigences acoustiques façade ? | Refus confirmé : 0 occurrence dans les 142 chunks du CCTP GOLF PARK | ✅ résolu 15/08 |
| C7-004 | C7 | ehpad | Dans le CCTP du gros œuvre, aborde-t-on le nettoyage extérieur ? | Refus obligatoire : aucun CCTP gros œuvre dans le corpus EHPAD (l'historique a halluciné) | ✅ pré-rempli |
| C8-001 | C8 | bessieres | Que dit l'article 2.3.9 du CCTP ? | CCTP TCE p.56 — verbatim « terrain de pétanque », « terrassement » | ✅ pré-rempli |
| C8-002 | C8 | ehpad | Quelles informations sont dans l'article 2 Définitions ? | CCAG p.4 — définitions verbatim (« acheteur ») | ✅ pré-rempli |
| C8-003 | C8 | golfpark | Que contient l'annexe 2 de la charte chantier vert ? | CHARTE CHANTIER VERT p.7 — intitulé exact « Communication Parties Prenantes » | ✅ pré-rempli |

## Notes de lecture

- **Origine** : chaque entrée du JSON porte la date de la conversation source et, le cas échéant, l'historique des échecs/réussites observés.
- Les questions quasi identiques ont été dédupliquées (la localisation pétanque représentait à elle seule ~80 messages, « Résume le CCAG » ~25) ; les messages de test (« bonjour », « Comment t'appelles-tu ? ») ont été écartés.
- Les entrées C2-003, C4-004 et C8-002 ciblent les documents de la **couche app** (CCAG 527 chunks, NFP03-001 544 chunks) : elles valident aussi le dual-scope project/app.
- Aucun DTU n'est ingéré dans la couche app à ce jour : pas d'entrée cross-ref DTU possible (à ajouter au golden set après ingestion du DTU 25.41).
