# Baikal — module Financier : archive des ventes, coûts, résultat et partenariat

**Date :** 2026-08-25
**Statut :** design validé en séance avec Eric (stockage et contrat de données actés).
Trois définitions contractuelles restent en attente (§ 11).
**Références :** handoff Pack Vendeur `2026-08-25-attribution-ventes-baikal-handoff.md`,
spec `2026-08-25-hub-baikal-seo-v2-design.md` (modèle d'archive), contrat de
partenariat IA MEDIA article 7.

## 1. Objectif

Donner à chaque site de la console un suivi financier exploitable : combien il
encaisse, ce qu'il coûte, ce qu'il rapporte, et d'où viennent ses ventes. Le
module remplace le bloc financier du `/admin` de Pré-état-daté, qui disparaît
avec les autres `/admin` locaux — Baikal devient le back-office unique.

Trois manques du bloc actuel sont explicitement au périmètre : l'historique et
la tendance (aujourd'hui trois colonnes figées sans profondeur), la ventilation
par offre et par canal, et les charges fixes récurrentes (le « résultat » actuel
ne déduit que l'IA et Stripe).

**Hors périmètre :** la vue portefeuille multi-sites (arbitrée « par site
uniquement »), et toute modification de `pv_seo_attribution_monthly` côté Pack
Vendeur — base contractuelle dont la correction relève d'un avenant.

## 2. Décisions actées

| Décision | Raison |
|---|---|
| Archive **au grain de la vente**, capturée quotidiennement | Un agrégat mensuel ne s'ouvre pas : ni vérification ligne à ligne, ni arbitrage d'assiette, ni exploration. Et il interdit de rejouer la cascade quand la taxonomie bougera (`chatgpt.com`, `perplexity.ai`). |
| Attribution **figée à la capture, jamais réécrite** | La purge RGPD efface `referrer` et `gclid` à 90 jours — délibérément, ce sont les deux champs qui peuvent porter un identifiant ; les `utm_*`, `landing_page` et `acquisition_channel` sont épargnés par liste blanche. Mesuré côté PV : 216 dossiers organiques ou referral basculent en « direct » si on recalcule l'origine après purge. |
| **Le CA n'est jamais stocké en agrégat** | Il se somme toujours depuis les ventes archivées. Stocker un total à côté du détail crée deux vérités qui divergent. |
| **Le montant fait foi côté Stripe**, la vue du site sert à qualifier (offre, attribution) | Deux ventes de Pack Vendeur ont un `amount_paid` nul en base et sortent à 0 € dans la vue. Prendre le montant dans Stripe supprime le cas sans le traiter à part. |
| L'argent vient de **Stripe** | Voirie n'a aucun montant en base (`demandes` ne porte qu'un `stripe_session_id`) : Stripe est la seule source possible. Et lister les `balance_transactions` par période supprime le plafond de lookups qui sous-estime les frais côté PV. |
| Le coût IA vient des tables **`*_ai_logs`** des sites | `pv_ai_logs` et `voirie.ai_logs` portent tous deux un `cost_usd` figé à l'insertion : la convention est déjà commune. |
| Cron quotidien à **04h30** | Le cron SEO tourne à 04h15, on ne les croise pas. |

## 3. Architecture

```
cron 04h30
   └─ EF admin-finance (mode capture)
        ├─ Stripe (compte Confer)  ── balance_transactions + checkout sessions
        ├─ vue de chaque site        ── ventes, offre, attribution figée
        ├─ <site>.ai_logs            ── coût IA du jour
        └─ Google Ads (si configuré) ── dépense du jour
             └─ écrit admin.ventes (grain vente) + admin.finance_jours (coûts)

page /finances  ──  EF admin-finance (mode lecture)  ──  lit l'archive
       └─ bouton « rafraîchir » : recapture la journée en cours
```

La page ne lit **jamais** Stripe ni les bases des sites : elle lit l'archive.
C'est ce qui rend l'affichage instantané et l'historique stable.

## 4. Modèle de données

### 4.1 `admin.ventes` — mémoire primaire

Une ligne par vente. Colonnes **figées** à la première capture :

| Colonne | Type | Note |
|---|---|---|
| `app_id`, `vente_id` | text | clé, multi-sites |
| `created_at`, `paid_at` | timestamptz | le funnel se compte en `created_at`, la comptabilité en `paid_at` — jamais mélangés |
| `montant_ttc`, `montant_ht`, `devise` | numeric, text | `0` autorisé (coupon 100 %) |
| `offre`, `perimetre` | text | slug produit, `b2c`/`b2b` |
| `attribution` | jsonb | copie brute de la colonne du site : `channel`, `referrer_domaine`, `a_gclid`, `utm_*`, `landing_page`, `porte_entree` |
| `capture` | text | `live` / `backfill` / `backfill_partiel` — distingue « aucune origine mesurée » de « origine effacée par la purge » |
| `capture_le` | timestamptz | traçabilité |

Colonnes **rafraîchies** tant que la vente a moins de 30 jours, figées ensuite :
`montant_ttc`, `montant_ht`, `stripe_payment_intent_id`, `frais_stripe_eur`,
`rembourse_le`, `montant_rembourse` — toutes lues dans Stripe, aucune n'existe
en base côté site.

**Une exception à l'immuabilité de l'attribution**, assumée : `a_gclid` peut
passer de `false` à `true` après la création, le gclid n'étant pas toujours
connu au premier contact (Pack Vendeur l'écrit parfois au moment de la Checkout
Session). Baikal le rafraîchit donc dans la même fenêtre de 30 jours, et
**uniquement dans ce sens** : jamais `true → false`. Tous les autres champs
d'attribution restent écrits une fois.

Le bucket de canal n'est **pas** stocké : il est dérivé (§ 6).

### 4.2 `admin.finance_jours` — ce qui n'est pas par vente

Une ligne par site et par jour : `cout_ia_usd`, `cout_ia_eur`, `taux_usd`
(le taux appliqué ce jour-là, pour que le passé reste explicable), `ads_eur`,
`complet` (booléen), `manques` (text[]), `calcule_le`.

`complet = false` quand une source a échoué — Ads injoignable, base d'un site
indisponible. Une journée incomplète n'est jamais affichée comme complète.

### 4.3 `admin.charges_recurrentes`

`app_id`, `libelle`, `categorie`, `montant_mensuel_eur`, `debut`, `fin`
(nullable). Saisie dans la page. Réparties **au prorata journalier** dans le
résultat, pour qu'une charge mensuelle ne creuse pas un trou le 1er.

### 4.4 `admin.partenariat_mensuel` — lot 3

Voir § 8. Table figée, avec report d'un mois sur l'autre.

### 4.5 `config.apps`

Deux colonnes : `tva_taux` (défaut `0.20`) et `stripe_secret_ref` (nom du secret
portant la clé restreinte en lecture — jamais la clé elle-même, conformément à
la règle du registre).

## 5. Sources et adaptateurs

Un adaptateur par site, dans le prolongement de `admin-site-stats/stats-sites.ts`.
Un site sans adaptateur n'a pas de module Financier — il n'est pas approximé.

| Source | Ce qu'elle donne | Comment |
|---|---|---|
| Stripe | CA encaissé, frais réels, remboursements | `balance_transactions` listées par période **et** `checkout/sessions` avec `line_items`, jointes sur `payment_intent`. Nombre d'appels constant quel que soit le volume. |
| Vue du site | vente, offre, périmètre, attribution figée | lecture `baikal_reader`, fenêtre glissante sur `paid_at`. Pack Vendeur : `public.pv_ventes_baikal`, livrée le 25/08 (44 ventes, `offre` constante `'pre-etat-date'`, B2C uniquement — la vente B2B est l'achat de crédits, pas le dossier) |
| `<site>.ai_logs` | coût IA du jour | somme de `cost_usd`, jamais recalculée |
| Google Ads | dépense du jour | si config OAuth présente, sinon `ads_eur` nul et `complet = false` |

**Séparation des sites.** Le compte Stripe « Confer »
(`acct_1T5ESoQLEPjlJTgr`) est partagé par Pack Vendeur, Voirie et bientôt
MonsieurDPE. Deux chemins, dans cet ordre :

1. `metadata.application` sur le PaymentIntent, quand les sites l'auront posée ;
2. **en attendant**, rapprochement par `stripe_payment_intent_id` avec la vue de
   chaque site — c'est la vue qui dit à quel site appartient la vente.

Le chemin 2 fonctionne dès aujourd'hui et reste le filet de sécurité ensuite.
Un encaissement qu'aucun site ne réclame est archivé en `app_id = 'inconnu'`
et signalé : c'est un symptôme, pas un cas à ignorer silencieusement.

## 6. Cascade d'attribution — dérivée, jamais stockée

Fonction SQL `admin.canal_vente(attribution jsonb) → text`, premier match
gagnant :

| Bucket | Règle |
|---|---|
| `paid` | `a_gclid` vrai **ou** `utm_medium ∈ (cpc, ppc, paid*, display)` |
| `campaign` | `utm_source` renseigné |
| `organic` | `referrer_domaine` est un moteur de recherche |
| `referral` | `referrer_domaine` renseigné, autre site |
| `unattributed` | aucun signal, **et les clés sont présentes** |
| `indetermine` | `referrer_domaine` et `a_gclid` **absents du JSONB** : la purge est passée avant la capture |

Pack Vendeur omet volontairement les clés qu'il ne connaît plus, au lieu de les
poser à `false` ou `''`. Une clé absente ne signifie donc pas « pas de gclid »
mais « on ne sait plus » — la cascade doit lire l'absence, pas la valeur. Une
vente purgée conserve en revanche `channel`, les `utm_*` et `porte_entree`, qui
suffisent souvent à la classer en `campaign` : `indetermine` ne s'applique qu'aux
ventes qu'aucun signal survivant ne permet de trancher.

Deux règles d'affichage, non négociables :

- **`unattributed` est une catégorie, pas un reste.** 32 % des ventes n'ont
  aucune origine, et 15 des 19 concernées sont sur ordinateur — profil
  « découvert sur mobile, acheté au bureau ». Jamais réparti au prorata dans un
  camembert : ce serait inventer une donnée.
- Une vente `indetermine` est comptée **à part**, jamais dans `unattributed` :
  son origine n'est pas absente, elle est perdue. Le critère est la présence des
  clés, pas la valeur de `capture` — un dossier purgé dont l'`utm_source` a
  survécu est parfaitement classable.

Le niveau « source » expose le `referrer_domaine` tel quel, avec une famille
`ia` prévue dès maintenant (`chatgpt.com`, `perplexity.ai`, …) pour ne pas les
noyer dans `referral`.

## 7. La page `/finances`

Calée sur le site de la colonne de gauche, droits identiques à `/seo`
(super_admin et admins délégués du site).

1. **Synthèse** — les trois colonnes existantes (7 jours, mois en cours, année
   en cours) : CA TTC, CA HT, frais Stripe, coût IA, Ads, charges fixes,
   résultat. Enrichies d'une comparaison au mois précédent et au même mois de
   l'an passé. Un bandeau signale toute journée incomplète de la période.
2. **Tendance** — graphe mensuel CA / coûts / résultat sur douze mois.
3. **Ventilation** — par offre et par canal, en ventes **et** en CA (deux
   compteurs, jamais un seul : un coupon à 100 % est une vente à 0 €).
4. **Charges récurrentes** — tableau éditable.
5. **Ventes** — la liste des ventes de la période, ouvrable ligne à ligne, avec
   son origine et son état de capture. C'est ce qui rend le module exploratoire
   et le calcul du partenariat auditable.

Bouton « rafraîchir » : recapture la journée en cours sans attendre le cron.

## 8. Partenariat SEO — lot 3

Formule de l'article 7, par mois civil :

```
Ventes Partageables    = Ventes du mois − 15
CA Partageable         = Ventes Partageables × prix unitaire HT encaissé
Coûts imputables       = Coûts Directs du mois × (Ventes Partageables / Ventes du mois)
Résultat Partageable   = CA Partageable − Coûts imputables
Quote-part             = Résultat Partageable × 50 %
```

Trois conséquences pour l'implémentation :

- **Franchise, pas déclencheur** : les quinze premières ventes reviennent
  intégralement à CONFER.
- **Seuil mensuel, ni cumulable ni reportable** : un mois à quinze ventes ou
  moins ne crée aucun report de ventes.
- **Le solde négatif, lui, est reporté** jusqu'à apurement. Le partenariat a
  donc une mémoire : `admin.partenariat_mensuel` est figée après validation,
  avec `report_entrant` et `report_sortant`. Un recalcul rétroactif changerait
  l'ardoise — il est interdit une fois le mois figé.

Le calcul doit être **justifiable poste par poste** : chaque charge admise en
Coûts Directs réduit la part du partenaire.

Démarrage août 2026. Sur les chiffres mesurés (juillet 14/10/14 et août au 24 :
9/7/9 selon l'assiette), le seuil de quinze n'est atteint aucun mois : premier
versement possible en septembre au plus tôt.

## 9. Erreurs et complétude

Trois modes d'échec, tous rendus visibles plutôt que masqués :

| Situation | Comportement |
|---|---|
| Une source échoue à la capture | `complet = false` + `manques`, bandeau dans l'UI, nouvelle tentative au cron suivant |
| Aucune donnée sur la période | état vide explicite, distinct d'une erreur (règle déjà appliquée dans `/seo`) |
| Encaissement Stripe non réclamé | archivé en `app_id = 'inconnu'`, signalé |

## 10. Lots de livraison

| Lot | Contenu | Dépend de |
|---|---|---|
| 1 | Archive Stripe, `finance_jours`, charges récurrentes, page `/finances` (synthèse, tendance, charges) | rien |
| 2 | Attribution : vue Pack Vendeur, ventilation offre et canal, cascade, liste des ventes | vue PV + backfill |
| 3 | Partenariat : table mensuelle figée, franchise, prorata, report | définitions de l'article 1 |

Le lot 1 est autonome et livre déjà un dashboard utilisable.

## 11. Points ouverts — décision d'Eric

1. **Article 1 du contrat** : définition de « Ventes du mois » (quelle assiette :
   toutes, hors Ads, organique seul ? l'écart mesuré est de 40 %), de « prix
   unitaire HT encaissé » (catalogue, moyenne encaissée, ou somme réelle des
   ventes 16 et suivantes — 10 % d'écart) et de « Coûts Directs » (l'IA et
   Stripe sûrement ; les Ads, l'hébergement, les charges fixes ?).
2. **Rétention** : ce modèle fait de Baikal un conservatoire au-delà de la purge
   de 90 jours des sites. L'archive ne contient aucune donnée nominative, mais
   `vente_id` reste un pseudonyme : la durée de conservation doit être écrite.
3. **`origine_declaree`** (question « comment nous avez-vous connu » au Step 6) :
   le déclaratif prime-t-il sur l'observé, ou vivent-ils en deux dimensions ?
   Recommandation : deux dimensions.
4. **Taux USD→EUR** figé à 0,92 et **Google Ads** non branché : non retenus comme
   prioritaires, tracés ici pour mémoire.
