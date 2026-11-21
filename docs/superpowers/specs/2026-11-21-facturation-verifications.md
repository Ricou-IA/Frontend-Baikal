# Facturation Stripe → Pennylane : vérifications du lot 0

Date : 21/11/2026. Plan : `docs/superpowers/plans/2026-11-21-facturation-stripe-pennylane.md`.

Tout a été fait en lecture seule : dépôt, base de Baikal (requêtes `--read-only`), comptes Stripe de
Confer, plan comptable et factures de Pennylane, documentation publique de l'API Pennylane v2.
Rien n'a été écrit nulle part. Ce dépôt est public : ce rapport ne porte ni montant, ni nom, ni
identifiant de compte.

## 1. Ce qui contredit le plan

| # | Constat | Conséquence |
|---|---|---|
| 1 | **Stripe émet déjà des factures pour les achats de crédits des pros** du site Pré-état daté : factures payées, numérotées par Stripe, avec TVA calculée par Stripe Tax, nom et adresse complets. Le plan dit « Stripe n'émet pas de facture » et « Stripe Tax n'est pas utilisé ». | Le lot 5 tel qu'écrit produirait une seconde facture pour la même vente. À trancher par Eric avant le lot 5. |
| 2 | **MonsieurDPE encaisse déjà sur son propre compte Stripe**, avec sa contribution Climate. Le plan dit que ses produits sont encore logés dans le compte Pré-état daté. | Le compte Pré-état daté n'est peut-être plus « partagé ». La règle de repli du § 9.1 reste utile, mais le cas à tester en premier est « un compte, un site ». |
| 3 | **Conseil Solaire n'a pas de ligne au registre** `config.apps` et son compte Stripe n'a aucun mouvement. | Rien à capturer ni à facturer. À sortir du plan tant que le site ne vend pas. |
| 4 | **Pennylane range les encaissements Stripe sur un seul compte client** (« Clients - Stripe »), pas sur un compte par site. | La question 2 du § 14 est à reformuler : le lettrage se fait contre ce compte unique. |

## 2. La capture aujourd'hui

- **Poste et GitHub** : identiques, arbre de travail propre.
- **Clé lue** : une seule. `ADMIN_STRIPE_KEY` n'est pas posé ; la capture retombe sur `STRIPE_SECRET_KEY`.
  D'après le contenu de l'archive, c'est le compte Pré-état daté (déduction, la valeur du secret n'est pas lisible).
- **Cron** : `admin-finance-capture` tourne toutes les quatre heures, pas une fois par jour.
- **Ventes absentes de `admin.ventes`** :
  - Autorisation Voirie : plus rien depuis que le site a son propre compte Stripe (septembre), alors que ce compte encaisse ;
  - MonsieurDPE : aucune ligne, jamais, alors que son compte a encaissé.
- **Mapping** (`admin.stripe_mapping`) : des produits pour pack-vendeur, un libellé pour voirie, rien pour monsieurdpe.
- **Contrôle croisé** : sur octobre 2026, pour Pré-état daté, ventes de l'archive moins frais de l'archive
  = ligne « Encaissements Stripe agrégés » de Pennylane, au centime.

### Piège à traiter au lot 1

Les paiements MonsieurDPE portent la metadata `application: dpe`. `resoudreSite` rend cette valeur
telle quelle comme `app_id`, or le site s'appelle `monsieurdpe` au registre (`dpe` est son
`db_schema`). `admin.ventes.app_id` a une clé étrangère vers `config.apps` : l'upsert du lot entier
échouerait dès la première vente DPE lue. Il faut traduire le marqueur comme le fait
`core.resoudre_app` (par l'id ou par `db_schema`), dans un module pur et testé.

## 3. Types de mouvements Stripe relevés

Relevé par sondage (mois d'octobre et filtres par type), pas sur l'historique complet.

| `type` | `reporting_category` | Classe du contrôle | Comptes où il apparaît |
|---|---|---|---|
| `charge` | `charge` | vente | Pré-état daté, Voirie, MonsieurDPE |
| `payment` | `charge` | vente | Pré-état daté, Voirie |
| `refund` | `refund` | remboursement | Pré-état daté |
| `payment_refund` | `refund` | remboursement | Pré-état daté |
| `payout` | `payout` | versement | Pré-état daté, Voirie, MonsieurDPE |
| `stripe_fee` | `fee` | frais hors transaction (libellés « Automatic Taxes », « Post Payment Invoices ») | Pré-état daté |
| `contribution` | `contribution` | Stripe Climate | MonsieurDPE |

- Les frais de transaction ne sont pas un mouvement : ils sont dans le champ `fee` de la vente.
- Aucun `adjustment` (litige) à ce jour. Le contrôle doit le traiter comme « non classé » tant
  qu'aucune règle ne le range.
- `source` est `null` sur `stripe_fee` et `contribution` : pas de payment_intent, ces mouvements
  appartiennent au compte, pas à une vente.
- Les versements sont mensuels sur Pré-état daté.

## 4. Pennylane aujourd'hui

- Comptabilité d'engagement, TVA mensuelle.
- Chaque compte Stripe de Confer est branché comme un **compte bancaire** dans Pennylane. Il ne
  reçoit que deux lignes par mois : « Encaissements Stripe agrégés » (net de frais) et « Virements
  Stripe vers compte principal ».
- Comptes de produits : un compte 706xx existe pour Pré-état daté, avec sa déclinaison TVA 20 %.
  **Aucun pour MonsieurDPE ni pour Autorisation Voirie** : à créer dans Pennylane.
- Un compte « Frais Stripe » (sous-compte de 627) et le compte 6238 existent déjà.
- Les factures faites à la main pour des particuliers sortent un centime au-dessus du montant
  encaissé (HT arrondi à deux décimales, puis TVA).

## 5. Réponses aux questions ouvertes

Source : documentation publique de l'API Pennylane v2 (pennylane.readme.io), lue le 21/11/2026.
**Rien n'a été appelé** : ce sont des lectures, pas des comportements observés.

### 1. Le centime

- `raw_currency_unit_price` (prix unitaire HT d'une ligne) accepte **jusqu'à 6 décimales**.
- Aucun montant TTC ne peut être imposé à la création : les totaux n'existent que dans la réponse.
- La règle d'arrondi de la TVA n'est pas documentée.
- Piste : envoyer HT = TTC / 1,2 à 6 décimales. Pour le prix courant du Pré-état daté, la division
  tombe juste à trois décimales, donc le TTC recalculé est exact. Pour un prix dont la division ne
  tombe pas juste, le résultat dépend de l'arrondi de Pennylane.
- Majord'home fait déjà ainsi (HT à 10 décimales) et note un écart possible d'un centime.
- **À confirmer par un brouillon de test avant toute facture définitive**, avec l'accord d'Eric. Le
  module pur doit refuser d'émettre si le TTC rendu par Pennylane diffère du TTC encaissé.

### 2. Facture payée

- `PUT /customer_invoices/{id}/mark_as_paid` existe. Il ne fait aucun rapprochement, et son effet
  comptable n'est pas documenté.
- `POST /customer_invoices/{id}/matched_transactions` rattache une facture définitive à une
  transaction bancaire ; une transaction peut couvrir plusieurs factures. Ici la seule transaction
  disponible est la ligne agrégée du mois, nette de frais.
- `transaction_reference` à la création (`banking_provider: stripe`, `payment_id` ou `charge_id`)
  vise le rapprochement automatique. À tester : rien ne dit qu'il fonctionne quand Pennylane ne
  reçoit que des lignes agrégées.
- Lettrage par l'API : `POST /ledger_entry_lines/letter` (chemin à confirmer).
- **À faire valider par l'expert-comptable** : la facture débite le compte du client, l'encaissement
  crédite le compte « Clients - Stripe ». Il faut décider comment les deux se soldent.

### 3. Pièce de ventes mensuelle

- `POST /ledger_entries` existe : `date`, `label`, `journal_id`, lignes débit / crédit équilibrées
  par `ledger_account_id`. Périmètre `ledger_entries:all`.
- **Pas d'idempotence côté Pennylane** : renvoyer le même corps crée un doublon. La garde est
  `admin.compta_mois` (un mois `ecrit` n'est jamais réécrit), posée avant l'appel.
- L'écriture mensuelle s'aligne naturellement sur la ligne bancaire agrégée du mois : ventes TTC
  moins frais = encaissement net.
- L'écriture comptable est donc possible. Le choix entre écriture et facture à un client générique
  reste à valider par l'expert-comptable.

### 4. Frais Stripe et Climate

- La pièce jointe n'est pas obligatoire sur `POST /ledger_entries`.
- Les comptes existent déjà dans le plan comptable (voir § 4).
- Comptes, TVA sur les frais (facture émise depuis l'Irlande) : à confirmer par l'expert-comptable.

### 5. Nom et adresse dans Stripe

- Particuliers, sur les trois comptes actifs : `billing_details` porte le nom, l'e-mail et le pays.
  **Jamais l'adresse.** La fenêtre « Facturer » doit la demander.
- Pas d'objet `customer` sur les paiements de Pré-état daté et de Voirie ; un `customer` sur ceux de MonsieurDPE.
- Pros (achats de crédits) : nom et adresse complets, portés par la facture Stripe (voir § 1).

### 6. Clés Stripe

- Voirie et MonsieurDPE ont une clé Stripe dans les secrets du projet, posée pour le site lui-même :
  c'est la clé complète, pas une clé restreinte en lecture. Baikal ne doit pas s'en servir.
- Rien pour Conseil Solaire.
- À poser par Eric : une clé restreinte en lecture par compte (balance_transactions, charges,
  checkout sessions, payouts).

### 7. Dépôt

`C:\Dev\Frontend-Baikal`, identique à GitHub.

## 6. Autres points d'API utiles aux lots suivants

- **Envoi par e-mail** : `POST /customer_invoices/{id}/send_by_email`, facture définitive seulement.
  Le PDF met jusqu'à quelques minutes à être généré et l'API répond 409 d'ici là. « Émettre et
  envoyer » demande donc une relance, et l'état « créée, non envoyée » est un état normal.
- L'expéditeur est l'adresse de facturation de Pennylane ; ni copie ni objet personnalisable.
- Envoyer par e-mail une facture éligible à la facturation électronique empêche ensuite sa
  transmission par la plateforme agréée : à garder en tête pour les ventes aux pros.
- **Client** : `POST /individual_customers` exige prénom, nom et adresse de facturation complète ;
  `POST /company_customers` exige la raison sociale et l'adresse. Recherche par e-mail :
  `GET /customers` avec le filtre `emails` / `in`.
- **Comptes** : un même numéro existe sous plusieurs identifiants, un par taux de TVA. Le filtre
  `number` / `start_with` est documenté, mais Majord'home l'a vu répondre 400 : paginer et filtrer
  localement en repli.
- **Journal** : la création de facture n'a aucun champ journal ; l'écriture d'une facture ne se
  modifie pas par l'API (constat de Majord'home).
- **Débit** : 25 requêtes par 5 secondes et par jeton. Pagination par curseur.
- **Périmètres** : `GET /me` rend les périmètres du jeton. Minimum pressenti :
  `customer_invoices:all`, `customers:all`, `ledger_accounts:readonly`, puis `journals:readonly` et
  `ledger_entries:all` pour le lot 4.

## 7. Ce qui n'a pas été vérifié

- Les périmètres du jeton Pennylane : `ADMIN_PENNYLANE_TOKEN` n'est pas posé. Un jeton Pennylane
  plus ancien existe dans les secrets du projet, société inconnue.
- Le comportement réel de l'API Pennylane (arrondi, rapprochement Stripe, effet de `mark_as_paid`).
- L'égalité entre l'archive et le tableau de bord Stripe, mois par mois : c'est la validation du lot 1.
- L'inventaire complet des types de mouvements sur tout l'historique.

## 8. À trancher par Eric

1. **Pros** : garder la facture Stripe et abandonner le lot 5, ou couper la facturation Stripe côté
   site (hors de ce plan) pour passer par Pennylane. Recommandation : garder Stripe, abandonner le lot 5.
2. **Comptes de produits** : créer dans Pennylane un compte 706xx pour MonsieurDPE et un pour
   Autorisation Voirie, avec leur déclinaison TVA 20 %.
3. **Conseil Solaire** : le sortir du plan tant qu'il n'est ni au registre ni en vente.
4. **Secrets** : poser le jeton Pennylane de Confer et une clé Stripe restreinte en lecture pour
   Voirie et pour MonsieurDPE.
5. **Expert-comptable** : questions 2, 3 et 4 du § 5.
