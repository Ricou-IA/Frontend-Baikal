# Facturation des ventes Stripe dans Pennylane, depuis Baikal

Cahier des charges pour Claude Code. Dépôt : `Ricou-IA/Frontend-Baikal`.

Rapport du lot 0 : `docs/superpowers/specs/2026-11-21-facturation-verifications.md`. Il corrige
plusieurs constats de ce document ; en cas de désaccord, c'est lui qui est à jour.

**Ce dépôt est public.** Ce document ne contient ni nom de client, ni identifiant de compte, ni montant réel. Garde cette règle dans tout ce que tu écris ici (code, tests, docs). Les relevés réels vont dans les dossiers ignorés par git prévus par le `CLAUDE.md`.

## 1. Objectif et contexte

Confer encaisse par Stripe les ventes de quatre sites : Pré-état daté, MonsieurDPE, Autorisation Voirie, Conseil Solaire. Stripe verse le net sur le compte bancaire de Confer. Pennylane (comptabilité de Confer) reçoit les flux d'argent, mais la facturation ne suit pas :

- les ventes arrivent sur un compte client (411) et presque aucune n'atteint un compte de produits (classe 7) ;
- les frais Stripe ne sont pas comptabilisés ;
- quand un client demande une facture, Eric la crée à la main dans Pennylane.

Baikal doit devenir l'endroit où cela se règle :

1. un bouton « Facturer » sur une vente, qui émet la facture définitive dans Pennylane et l'envoie au client ;
2. une routine mensuelle qui contrôle le mois Stripe de chaque site et passe les ventes dans le bon compte de produits.

### Ce qui existe déjà (lu sur GitHub le 21/11/2026, à revérifier sur le poste)

- `supabase/functions/_shared/stripe.ts` : `listerTransactions` (balance_transactions) et `listerSessions` (checkout sessions), paginés par période.
- `supabase/functions/_shared/finance-mapping.ts` : `resoudreSite` range une vente dans un site (metadata `application`, puis product, price, libellé). Table `admin.stripe_mapping`.
- `supabase/functions/admin-finance/` : capture quotidienne dans `admin.ventes` (une ligne par payment_intent : TTC, HT, frais, remboursement, offre, périmètre), vue `admin.ventes_enrichies`, actions `synthese`, `serie`, `ventes`, `rafraichir`. `config.apps.tva_taux` porte le taux par site.
- La capture lit **une seule clé Stripe** (`ADMIN_STRIPE_KEY`, sinon `STRIPE_SECRET_KEY`) et son commentaire dit « le compte Stripe est partagé par tous les produits ». Or Confer a aujourd'hui **un compte Stripe par site** (quatre comptes, plus celui de Mayer Énergie qui appartient à une autre société et reste hors champ). Les produits MonsieurDPE sont encore logés dans le compte Pré-état daté, avec la metadata `application: dpe`.
- La capture ne garde ni les versements, ni les frais hors transaction (`stripe_fee`), ni la contribution Stripe Climate.

### Le modèle à reprendre : Majord'home

Majord'home (`Ricou-IA/majordhome`, `docs/MODULE_PENNYLANE.md` et section « Module Pennylane » de son `CLAUDE.md`) facture déjà dans Pennylane pour Mayer Énergie. Reprends ses règles, pas son code tel quel :

- facture créée par `POST /customer_invoices`, lignes libres, jamais d'articles Pennylane ;
- compte de vente paramétré **par numéro** ; Pennylane tient un compte par couple (numéro, taux de TVA) : il faut choisir la déclinaison du taux de la ligne (`resolveLedgerAccountId`) ;
- idempotence : la correspondance vente → facture est relue **avant** tout POST ; un second clic ne recrée rien ;
- le filtre `filter[number][start_with]` sur les comptes renvoie 400 : paginer et filtrer localement ;
- les messages d'erreur de Pennylane remontent jusqu'à l'écran.

## 2. Décisions prises (ne pas les rediscuter)

| Sujet | Décision d'Eric |
|---|---|
| Qui facture | Pennylane, série de numéros existante de Confer. Stripe n'émet pas de facture. |
| Où | Tout dans Baikal : bouton et routine. Pas de workflow n8n. |
| Facture à la demande | Définitive directement, envoyée au client par e-mail dans le même geste. |
| Ventes aux particuliers | Une pièce de ventes par site et par mois. Facture individuelle seulement à la demande. |
| Comptes de produits | Un compte 706xx par site, saisi dans le registre du site. |
| Produits | Simples : une ligne par vente, libellé du produit, TVA 20 %. |
| TVA | Taux unique saisi dans le registre (`tva_taux`). Stripe Tax n'est pas utilisé. |
| Stripe Climate | Conservé sur MonsieurDPE, comptabilisé à part des frais. |
| Contrôle | Un écart ou un mouvement non classé arrête la routine et alerte. Aucune écriture approximative. |

### Décisions comptables d'Eric (21 et 22/11/2026)

Eric est expert-comptable : ces réponses closent les questions 2, 3 et 4 du § 14 et priment sur
toute formulation contraire plus bas dans ce document.

| Sujet | Décision |
|---|---|
| Lot 5 | Abandonné. Stripe continue de facturer les achats de crédits des pros. |
| Conseil Solaire | Hors plan tant que le site ne vend pas. |
| Comptes de produits | Un compte par site, créé dans Pennylane et saisi au registre. Le numéro ne s'écrit jamais dans ce dépôt. |
| TVA collectée | 20 % sur tous les sites. |
| Compte client | Un compte « Clients particuliers » par site : il reçoit les encaissements du compte Stripe du site. Le compte de virements internes Stripe ne sert qu'aux versements vers la banque. |
| Facture à la demande | Datée du jour de l'émission, avec la mention de la date et de la référence du paiement. |
| Arrondi | Décision révisée le 22/11/2026 après essai : la facture se calcule comme Pennylane, en une ligne. HT = arrondi(encaissé / 1,2) ; TVA = arrondi(HT × 20 %) ; TTC = HT + TVA. Pour certains prix le TTC facturé dépasse l'encaissé d'un centime : l'écart est accepté, affiché avant l'émission, et reste sur le compte du client. Une facture en deux lignes retombait juste (essai concluant) mais n'a pas été retenue. |
| Désignation | Le nom du produit saisi au registre du site, suivi du libellé du dossier quand le site en publie un (l'adresse du bien). Modifiable dans la fenêtre. |
| Vente gratuite par coupon | Une vente au prix public, remisée à 100 %. Jamais une vente à zéro sans prix. |
| Facture après la clôture du mois | Ligne négative « ventes facturées individuellement » dans la pièce du mois suivant. |
| Pièce du mois | Une **facture** par site au client « Clients particuliers » du site, datée du dernier jour du mois. Pas une écriture au journal. |
| Remboursements | En négatif sur le compte de produits du site. |
| Frais Stripe | Compte de frais bancaires (627), écriture passée par Baikal, autoliquidation intracommunautaire à 20 %. |
| Stripe Climate | Compte 6238, même régime de TVA que les frais. |
| Ventes passées | De mars à octobre 2026 : rattrapées sur novembre 2026, dans ce plan (lot 4), et non plus dans un chantier séparé. |

### Options écartées

- Facture émise par Stripe à chaque paiement (coût par facture, deux séries de numéros, modification des quatre sites).
- Mode « hub » de Majord'home (numérotation et PDF maison) : il imposerait de stocker le nom et l'adresse des clients dans Baikal.
- Affectation d'une vente à un site par son montant : interdit par `finance-mapping.ts`, deux produits ont le même prix.

## 3. Ce qu'Eric verra, lot par lot

| Lot | Ce qu'il voit à la fin |
|---|---|
| 0. Vérifications | Un rapport d'une page : ce qui marche, ce qui manque, les réponses aux questions ouvertes. Aucun changement. |
| 1. Un compte Stripe par site | Dans Finances, chaque site affiche ses propres ventes. Dans Paramétrage, un champ « Compte de produits » par site. |
| 2. Bouton « Facturer » | Sur une vente de la page Finances, un bouton. Il saisit le nom et l'adresse, valide, et le numéro de facture remplace le bouton. Le client reçoit le PDF. |
| 3. Contrôle du mois | Dans Finances, un bloc « Comptabilité du mois » : ventes, remboursements, frais, Climate, versements, et le résultat du contrôle. Rien n'est écrit dans Pennylane. |
| 4. Écriture mensuelle | Le 3 du mois, la pièce de ventes est dans Pennylane sur le bon compte, et Eric reçoit un mail récapitulatif avec les liens des factures de frais Stripe. |
| 5. Ventes aux pros | Un achat de crédits par un pro est facturé sans intervention, si le lot 0 montre que Stripe porte son nom et son adresse. |

### Maquette du lot 2 (page Finances, liste des ventes)

```
Date        Produit                 TTC      Origine     Facture
12/11       Pack Vendeur            24,99 €  Organique   [ Facturer ]
09/11       Pré-état daté 5 crédits 99,00 €  Direct      F-2026-xxxx  ✓ envoyée
```

Fenêtre « Facturer » :

```
Facturer la vente du 12/11 · Pack Vendeur · 24,99 € TTC

Nom ou raison sociale   [ repris de Stripe, modifiable ]
Adresse                 [ à saisir                     ]
Code postal / Ville     [        ] [                   ]
E-mail d'envoi          [ repris de Stripe, modifiable ]

HT 20,83 €   TVA 4,16 €   TTC 24,99 €   Compte 706xx

La facture sera définitive et envoyée au client.
                              [ Annuler ]  [ Émettre et envoyer ]
```

## 4. Règles de travail d'Eric

- Demande l'accord avant de modifier quoi que ce soit. Montre ce que tu prévois, attends la réponse.
- Fichiers complets, jamais d'extraits, quand Eric doit copier-coller. Édition ciblée quand tu écris dans le dépôt, pour ne pas écraser une autre session.
- Commandes de terminal en PowerShell.
- Jamais de push, de migration en production ni de déploiement sans accord explicite. Jamais de force-push.
- `git fetch` avant tout push, `git status --short` avant de commiter, `git commit --only`, commits atomiques en français.
- Vérifie avant d'affirmer. Aucun chiffre affiché sans sa source. Échoue fort plutôt que de masquer une erreur.
- Eric n'est pas développeur : à la fin de chaque lot, montre le résultat à l'écran, pas la liste des fichiers.

## 5. Outils, MCP et skills

- MCP Supabase : lecture seule par défaut sur le projet Baikal. Toute écriture ou migration demande l'accord d'Eric.
- MCP Stripe : lecture des comptes de Confer. Le compte Mayer Énergie est hors champ.
- MCP Pennylane : **lecture seule**. Il sert à lire le plan comptable, les journaux et les factures existantes. Les écritures passent par l'API publique avec le jeton de Confer.
- MCP GitHub, Vercel : lecture.
- Skills à charger : `supabase-migrations-edge` avant toute migration ou Edge Function ; `paiement-emails-pieges` avant de toucher à Stripe ; `socle-projet` avant tout commit ; `recette-navigateur` pour la recette de chaque lot ; `ecriture-humaine-fr` pour les libellés d'écran et le mail récapitulatif.

## 6. Stack et conventions

Lis d'abord `CLAUDE.md`, `PRODUCT.md` et `docs/contrats/README.md`. Ils priment sur ce document. Points qui mordent ici :

- Edge Functions Deno/TypeScript, front React JSX, thème sombre `baikal-*`.
- Tout ce qui décide d'un nombre est dans un module **pur et testé** (comme `capture.ts`, `mesures.ts`). Les composants ne calculent rien.
- Droits : `exigerSite` et `exigerModule(droits, appId, 'finances', …)`. Consulter = lecture. Émettre une facture, lancer la routine = écriture.
- Les secrets vivent dans les secrets des Edge Functions. Le registre ne porte que leur **nom**.
- Aucune donnée nominative dans le schéma `admin`.
- Migrations : jamais `db push` (voir le gotcha du `CLAUDE.md`).
- Majord'home sert de référence en lecture. Ne modifie rien dans son dépôt.

## 7. Modèle de données

Noms proposés, à ajuster à ce que tu trouves dans le dépôt.

**`config.apps`** (registre), colonnes ajoutées :

| Colonne | Rôle |
|---|---|
| `stripe_key_ref` | Nom du secret qui porte la clé Stripe restreinte en lecture du compte du site. NULL = clé commune actuelle. |
| `compte_produit` | Numéro du compte de produits du site dans Pennylane (706xx). NULL = facturation fermée pour ce site, bouton absent. |

La vue `public.apps` n'expose jamais `stripe_key_ref`.

**`admin.factures`** : la correspondance vente → facture. Aucun nom, aucune adresse.

| Colonne | Rôle |
|---|---|
| `id` | uuid |
| `app_id` | site |
| `stripe_payment_intent_id` | vente facturée, **unique** |
| `statut` | `en_cours`, `emise`, `erreur` |
| `pennylane_invoice_id`, `numero`, `date_facture` | retour de Pennylane |
| `montant_ttc`, `montant_ht` | montants facturés |
| `envoyee_le`, `erreur` | suivi de l'envoi et dernier message d'erreur |
| `cree_par`, `cree_le` | auteur (id du compte) et date |

**`admin.compta_mois`** : une ligne par site et par mois.

| Colonne | Rôle |
|---|---|
| `app_id`, `mois` | **unique** |
| `ventes_ttc`, `ventes_ht`, `tva` | ventes du mois |
| `remboursements`, `frais`, `climat`, `versements` | autres mouvements |
| `factures_individuelles_ttc` | ventes déjà facturées une à une, retirées de la pièce |
| `ecart`, `non_classes` | résultat du contrôle |
| `statut` | `controle_ok`, `ecart`, `ecrit`, `erreur` |
| `pennylane_ref`, `detail` (jsonb), `calcule_le` | trace |

RLS forcée sans policy sur les deux tables, accès `service_role` uniquement, `REVOKE ... FROM PUBLIC`, comme les autres tables `admin`.

Secret nouveau : `ADMIN_PENNYLANE_TOKEN` (jeton d'API de Confer, périmètres à fixer au lot 0, le minimum nécessaire).

## 8. Migrations prévues

Une migration par lot, nommée à la date du jour où tu l'écris :

- lot 1 : `registre_stripe_par_site_et_compte_produit`
- lot 2 : `admin_factures`
- lot 3 : `admin_compta_mois`
- lot 4 : entrée `cron.job` versionnée pour la routine (une Edge Function décrite comme un cron sans `cron.job` ne tourne jamais)

Chaque migration est montrée à Eric avant d'être appliquée.

## 9. Spécifications fonctionnelles

### 9.1 Un compte Stripe par site (lot 1)

- La capture parcourt les sites actifs qui ont une clé Stripe. Pour un compte donné, `resoudreSite` continue de décider du site de chaque vente : c'est ce qui range les produits MonsieurDPE logés dans le compte Pré-état daté.
- Règle de repli à ajouter : une vente lue dans le compte Stripe d'un site, que le mapping ne résout pas, appartient à ce site **seulement si ce compte ne sert qu'un site**. Dans le compte partagé, elle reste « inconnue » et se signale dans `manques`.
- Une vente ne doit jamais être archivée deux fois ni changer de site sans raison : écris un test qui rejoue la capture.
- Paramétrage du site : champ « Compte de produits », contrôlé contre le plan comptable de Pennylane (le compte doit exister, avec sa déclinaison TVA 20 %).

### 9.2 Bouton « Facturer » (lot 2)

Parcours :

1. Le bouton apparaît sur une vente payée, non remboursée en totalité, d'un site qui a un `compte_produit`, pour un compte qui a le droit `finances` en écriture.
2. À l'ouverture, Baikal lit en direct dans Stripe le nom et l'e-mail du payeur. Rien n'est stocké.
3. Eric complète l'adresse et valide.
4. Edge Function (nouvelle action ou nouvelle fonction, à ton choix motivé) :
   - relit `admin.factures` pour ce payment_intent. `emise` : renvoie la facture existante. `en_cours` depuis moins de deux minutes : refuse. Sinon pose `en_cours` ;
   - cherche le client dans Pennylane par e-mail, le crée s'il manque ;
   - crée la facture **définitive** : une ligne, libellé du produit, compte de produits du site, TVA 20 %, date du jour, `external_reference` = payment_intent, mention de la date et de la référence du paiement ;
   - marque la facture comme payée si l'API le permet (question ouverte) ;
   - envoie la facture par e-mail (`send_by_email`) ;
   - écrit `emise`, le numéro et la date.
5. L'écran affiche le numéro. Un échec dit ce qui est fait et ce qui ne l'est pas (facture créée mais non envoyée, par exemple) et propose de rejouer l'étape manquante seulement.

Règles :

- Montants : TTC = montant encaissé. HT = arrondi(TTC / 1,2). TVA = TTC − HT. La facture doit sortir **exactement** au TTC encaissé (voir la question ouverte sur le centime).
- Une vente = une facture. Corriger une facture = un avoir, fait dans Pennylane. Pas d'avoir depuis Baikal dans ce plan.
- Vente remboursée en partie : bouton désactivé avec la raison.
- Le module de calcul et de construction du corps de la requête est pur et testé.

### 9.3 Contrôle du mois (lot 3)

Pour chaque compte Stripe et chaque mois clos, à partir de **toutes** les balance_transactions du mois :

- classer chaque mouvement : vente, remboursement, frais de transaction, frais hors transaction, contribution Climate, versement, autre ;
- ne suppose pas les noms de types : relève ceux que Stripe renvoie réellement au lot 0 ;
- un type inconnu rend le mois `ecart` et se liste dans `non_classes` ;
- contrôle au centime : ventes − remboursements − frais − Climate − versements = somme des nets des mouvements du mois ;
- répartir les ventes par site avec `resoudreSite` ;
- écrire `admin.compta_mois`. Aucune écriture Pennylane.

Écran : dans Finances, bloc « Comptabilité du mois » avec les totaux, le statut en couleur + icône + texte, et la liste des mouvements non classés. Un bouton « Recalculer » (écriture).

### 9.4 Écriture mensuelle (lot 4)

Le 3 du mois, pour chaque site dont le mois est `controle_ok` :

- pièce de ventes du mois sur le compte de produits du site : total des ventes aux particuliers, **moins** les ventes facturées individuellement ;
- une vente facturée après la clôture de son mois est retirée de la pièce du mois suivant par une ligne négative « ventes facturées individuellement », avec la référence de la facture ;
- remboursements en négatif ;
- frais et Climate : selon la réponse aux questions ouvertes. À défaut d'écriture par API, le mail récapitulatif donne le montant exact des frais par compte et les liens vers les factures de frais dans le tableau de bord Stripe, qu'Eric dépose dans Pennylane ;
- idempotence : un mois `ecrit` n'est jamais réécrit. Rejouer ne crée rien ;
- un mois en `ecart` n'écrit rien et déclenche un mail d'alerte ;
- mail récapitulatif à Eric : totaux par site, anomalies, liens. Aucune donnée nominative.

Première exécution réelle sur un seul site et un seul mois, choisis avec Eric, après un passage à blanc qui montre ce qui serait écrit.

### 9.5 Ventes aux pros (lot 5, conditionnel)

Si le lot 0 montre que Stripe porte le nom et l'adresse complets pour les achats de crédits des pros (`perimetre = b2b`) : la capture quotidienne émet la facture par la même chaîne que le bouton, sans saisie. Sinon ce lot est abandonné et les pros passent par le bouton.

## 10. Les lots, dans l'ordre

Un lot à la fois. Avant d'écrire un fichier, montre ce qui est prévu et attends l'accord. À la fin du lot : résultat à l'écran, contrôles, résumé fait / reste / décisions, puis arrêt.

**Lot 0. Vérifications, lecture seule.**
- Comparer le poste et GitHub (le dépôt local peut être en avance).
- Dire quels comptes Stripe la capture lit aujourd'hui et quelles ventes manquent dans `admin.ventes`.
- Relever les types de balance_transactions réellement présents sur les quatre comptes.
- Lire la documentation de l'API Pennylane v2 et répondre aux questions ouvertes du § 14.
- Vérifier avec le jeton, par des appels GET uniquement, les périmètres accordés.
- Livrable : `docs/superpowers/specs/2026-11-xx-facturation-verifications.md`, sans donnée réelle.
- Validation : Eric lit le rapport et tranche les questions.

**Lot 1. Un compte Stripe par site et compte de produits.** Validation : les ventes de chaque site, sur un mois choisi, égalent le tableau de bord Stripe.

**Lot 2. Bouton « Facturer ».** Validation : une facture réelle émise sur une vente choisie par Eric, visible dans Pennylane sur le bon compte, reçue par e-mail.

**Lot 3. Contrôle du mois.** Validation : le mois d'octobre 2026 des quatre comptes sort `controle_ok`, ou chaque écart est expliqué.

**Lot 4. Écriture mensuelle et cron.** Validation : passage à blanc relu par Eric, puis un site, un mois.

**Lot 5. Ventes aux pros.** Seulement si le lot 0 l'autorise.

## 11. Hors de ce plan

- Le rattrapage des ventes de mars à octobre 2026 et la régularisation de TVA éventuelle : chantier séparé, après avis de l'expert-comptable.
- Le déplacement des produits MonsieurDPE vers leur propre compte Stripe (modification des clés du site DPE).
- Les avoirs depuis Baikal.
- Le téléchargement automatique des PDF de frais Stripe (Stripe ne les fournit ni par API ni par e-mail).
- L'ouverture de cette fonction aux futurs clients de Baikal (un jeton Pennylane par compte).
- Tout changement dans les quatre sites et dans Majord'home.

## 12. Ce qui demande l'accord explicite d'Eric

- Toute migration, tout déploiement d'Edge Function, tout push.
- La pose ou la modification d'un secret (jeton Pennylane, clés Stripe).
- **Tout appel d'écriture vers Pennylane**, y compris un brouillon de test. Une facture définitive consomme un numéro et ne se supprime pas.
- La création d'un `cron.job`.
- Toute modification d'une ligne du registre `config.apps`.

## 13. Contrôles avant chaque commit et recette

Avant chaque commit : tests Deno des modules touchés, lint, build du front, relecture de `git diff` pour vérifier qu'aucune donnée réelle n'entre dans le dépôt public.

Recette par lot, au format du skill `recette-navigateur` : ce qu'Eric fait dans son navigateur, ce qu'il doit voir, et le contrôle en SQL lecture seule qui le confirme. Pour le lot 2, la recette inclut le double clic (une seule facture) et l'échec d'envoi (facture créée, envoi rejouable).

Fin de chaque lot : propose la mise à jour du `CLAUDE.md` dans `.claude/proposed-updates.md`.

## 14. Questions ouvertes

Vérifié le 21/11/2026 dans la documentation publique de Pennylane : `POST /customer_invoices` crée un brouillon ou une facture définitive ; `PUT /customer_invoices/{id}/finalize` et l'envoi par e-mail d'une facture définitive existent ; périmètre `customer_invoices:all`.

Non vérifié, à traiter au lot 0 :

1. **Le centime.** Les factures saisies à la main sortent à un TTC supérieur d'un centime au montant encaissé : un HT arrondi à deux décimales, multiplié par 1,2, ne retombe pas sur le TTC. L'API accepte-t-elle un prix unitaire HT à plus de deux décimales, ou un montant TTC imposé ? Sans solution, propose une alternative à Eric avant d'émettre quoi que ce soit.
2. **Facture payée.** Peut-on marquer la facture comme réglée par l'API, ou la rapprocher de l'encaissement Stripe ? Pennylane enregistre aujourd'hui les encaissements Stripe sur un compte client par site : la facture doit pouvoir se lettrer avec.
3. **Pièce de ventes mensuelle.** Écriture comptable par l'API (journal de ventes) ou facture définitive à un client générique « Clients particuliers » du site ? L'écriture comptable est plus juste si l'API la permet. À faire valider par l'expert-comptable.
4. **Frais Stripe et Climate.** Peut-on passer l'écriture par l'API sans pièce jointe ? Comptes pressentis : 627 pour les frais, 6238 pour Climate, à confirmer par l'expert-comptable, ainsi que la TVA sur les frais (facture émise depuis l'Irlande).
5. **Nom et adresse dans Stripe.** Que portent les paiements de chaque site (billing_details, customer) ? Cela décide du lot 5 et du pré-remplissage de la fenêtre.
6. **Clés Stripe.** Les comptes MonsieurDPE, Autorisation Voirie et Conseil Solaire ont-ils une clé restreinte en lecture posée dans les secrets de Baikal ?
7. **Chemin local du dépôt** et état d'avance par rapport à GitHub.
