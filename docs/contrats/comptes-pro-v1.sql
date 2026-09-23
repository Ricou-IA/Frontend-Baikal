-- ---------------------------------------------------------------------------
-- Contrat Comptes pro v1 — le chapitre Comptes pro de la console.
--
-- Contrat de FORME, comme mesures-v1 : le nom de la vue, ses colonnes et leurs
-- types sont figés, le corps appartient au site.
--
-- Deux populations, jamais mélangées. Le chapitre CLIENTS liste les dossiers,
-- c'est-à-dire l'acte commercial : baikal_dossiers. Le chapitre COMPTES PRO
-- liste les entreprises qui achètent au site : l'agence immobilière de
-- Pré-état-daté, le diagnostiqueur abonné de MonsieurDPE, l'installateur de
-- Conseil Solaire. Un compte pro vit dans le temps, un dossier est un
-- événement.
--
-- Les tuiles qui coiffent la liste ne sont PAS ici : elles viennent de
-- baikal_mesures avec chapitre = 'comptes_pro'. Une vue de liste ne porte pas
-- d'agrégat, sans quoi deux écrans finiront par annoncer deux nombres.
--
-- Installer chez un site : copier dans une migration du site, substituer
-- @SCHEMA@, écrire la projection, passer la recette du §3.
--
-- Spec : docs/superpowers/specs/2026-09-23-contrat-mesures-design.md
-- ---------------------------------------------------------------------------


-- ------ 1. La vue ------
--
-- NOYAU, obligatoire. Sans lui, pas de chapitre.
--
-- | compte_id      | text, non nul    | identifiant côté site            |
-- | raison_sociale | text, non nul    | ce qui s'affiche dans la liste   |
-- | email          | text, nullable   |                                  |
-- | cree_le        | timestamptz      | date d'ouverture du compte       |
-- | actif          | boolean, non nul | compte ouvert ou fermé           |
-- | est_test       | boolean, non nul | bascule « Exclure tests »        |
-- | supprime_le    | timestamptz null | bascule « Inclure supprimés »    |
--
-- BLOCS OPTIONNELS. La capacité se lit à la PRÉSENCE des colonnes : un bloc
-- absent de la vue n'est pas affiché, ce n'est jamais une erreur.
--
-- Chaque colonne d'un bloc est INDÉPENDAMMENT optionnelle. Le bloc est déclaré
-- par sa colonne pivot — `abo_statut` pour l'abonnement, `credits_stock` pour
-- les crédits, `ca_ttc` pour l'argent. Sans le pivot, pas de bloc ; avec lui,
-- Baikal affiche ce qui est là et rien d'autre.
--
-- Ce n'est pas du laxisme, c'est l'alignement sur le contrat voisin. Clients
-- n'a jamais exigé de bloc entier : dpe.baikal_dossiers publie quatre colonnes
-- abo_* sur cinq depuis le 02/09, sans `abo_montant_mensuel`, parce que le
-- montant d'un abonnement n'existe nulle part côté dpe — le catalogue de prix
-- vit chez Stripe. Exiger ici ce que Clients n'exige pas, sur LES MÊMES
-- colonnes, obligerait le site à recopier un tarif dans sa vue : une seconde
-- source de vérité pour un prix, qui divergera au premier changement, dans une
-- console où l'on passe la journée à empêcher deux écrans d'annoncer deux
-- nombres.
--
-- Crédits (Pré-état-daté, Conseil Solaire) :
-- | credits_stock      | int     | solde disponible                      |
-- | credits_achetes    | int     | cumul acheté                          |
-- | credits_consommes  | int     | cumul consommé                        |
--
-- Argent :
-- | ca_ttc             | numeric | cumul facturé au compte               |
-- | devise             | text    | 'EUR'                                 |
--
-- Abonnement (MonsieurDPE), même vocabulaire que baikal_dossiers :
-- | abo_statut             | text        | 'trialing', 'active', 'past_due'… |
-- | abo_plan               | text        | slug du plan                      |
-- | abo_montant_mensuel    | numeric     |                                   |
-- | abo_prochaine_echeance | timestamptz |                                   |
-- | abo_resilie_le         | timestamptz |                                   |
--
-- Divers :
-- | contact_nom        | text        | la personne, quand le site la tient |
-- | telephone          | text        |                                     |
-- | categorie          | text        | slug de config.apps.categories_client |
-- | derniere_activite_le | timestamptz | pour trier les comptes dormants   |
--
-- Deux règles valent ici comme ailleurs, et pour les mêmes raisons.
--
-- (a) LES TESTS ET LES SUPPRIMÉS SONT PORTÉS PAR LA VUE, pas redéfinis par
--     Baikal. La définition du test appartient au site, et c'est elle qui doit
--     valoir dans la liste ET dans les mesures : un compte écarté ici et
--     compté là serait la panne de Voirie à l'identique.
--
-- (b) UNE COLONNE QU'ON NE SAIT PAS REMPLIR EST ABSENTE, jamais présente et
--     nulle. Un `credits_stock` toujours nul se lit « ce compte n'a plus rien »
--     au lieu de « ce site ne vend pas de crédits ».
--
--     À ne pas confondre avec une colonne dont NULL est une réponse. Chez un
--     site qui ne supprime jamais un compte, `supprime_le` vaut null partout,
--     et c'est juste : null y signifie « pas supprimé », pas « on ne sait
--     pas ». Elle reste au noyau, et la bascule « Inclure supprimés » continue
--     de fonctionner.

create or replace view @SCHEMA@.baikal_comptes_pro as
select
  p.id::text                as compte_id,
  p.company_name            as raison_sociale,
  p.email                   as email,
  p.created_at              as cree_le,
  coalesce(p.is_active, true) as actif,
  coalesce(p.is_test, false)  as est_test,
  p.deleted_at              as supprime_le,
  -- Bloc crédits : retirer ces trois lignes chez un site qui n'en vend pas.
  coalesce(p.credits_balance, 0)   as credits_stock,
  coalesce(p.credits_purchased, 0) as credits_achetes,
  coalesce(p.credits_consumed, 0)  as credits_consommes,
  -- Bloc argent.
  coalesce(p.revenue_eur, 0)       as ca_ttc,
  'EUR'                            as devise
from @SCHEMA@.pro_accounts p;

comment on view @SCHEMA@.baikal_comptes_pro is
  'Contrat Comptes pro v1 lu par Baikal (admin-comptes-pro). Les entreprises '
  'qui achètent au site, une ligne par compte. Les agrégats ne sont PAS ici : '
  'ils viennent de baikal_mesures, chapitre comptes_pro.';


-- ------ 2. Ce que Baikal fait de cette vue ------
--
-- Une liste : recherche sur la raison sociale et le courriel, tri sur les
-- colonnes présentes, bascules « Exclure tests » et « Inclure supprimés »,
-- pagination. Les tuiles du chapitre la coiffent.
--
-- Baikal n'ÉCRIT jamais dans cette vue, et n'écrit jamais dans les tables du
-- site. Créditer un compte, le suspendre ou le fermer passe par l'EF
-- d'administration du site (config.apps.env_dossiers_fn), comme les actions de
-- la fiche client. Pas d'EF déclarée, pas de bouton.


-- ------ 3. Recette d'installation ------

-- (1) Noyau complet. Doit rendre zéro.
--
--     select count(*) from @SCHEMA@.baikal_comptes_pro
--     where compte_id is null or raison_sociale is null
--        or actif is null or est_test is null;

-- (2) Identifiant unique. Doit rendre zéro ligne.
--
--     select compte_id, count(*) from @SCHEMA@.baikal_comptes_pro
--     group by 1 having count(*) > 1;

-- (3) Colonnes pivots. Un bloc dont une colonne est publiée sans son pivot ne
--     s'affichera pas : relire la liste et vérifier que `credits_stock`,
--     `abo_statut` ou `ca_ttc` est bien là quand le bloc est voulu.
--
--     select column_name from information_schema.columns
--     where table_schema = '@SCHEMA@' and table_name = 'baikal_comptes_pro';

-- (4) Accord avec les mesures. Le nombre de comptes actifs de la liste doit
--     être CELUI de la tuile, sans quoi deux écrans annoncent deux nombres.
--
--     select count(*) from @SCHEMA@.baikal_comptes_pro
--     where actif and not est_test and supprime_le is null;
--     -- à comparer à la mesure de chapitre 'comptes_pro' qui compte les
--     -- comptes actifs, au dernier jour publié.

-- (4 bis) AUCUNE CATÉGORIE N'EST UNE VALEUR PAR DÉFAUT DÉGUISÉE EN
--     INFORMATION. Un site dont le rôle est posé à l'inscription puis promu à
--     une activation a toujours une population invisible entre les deux : elle
--     porte le rôle initial, et la console l'affiche comme un fait.
--
--     Trouvé chez MonsieurDPE le 23/09 : `particulier` est le rôle posé à
--     l'inscription, promu à la validation d'une revendication de fiche. Six
--     comptes s'étaient arrêtés avant, dont quatre cabinets de diagnostic
--     reconnaissables à leur domaine, et la liste les annonçait « Particulier ».
--
--     Le contrôle : pour chaque valeur de `categorie`, se demander si elle est
--     CHOISIE ou SUBIE. Une valeur subie mérite son propre slug, sans quoi
--     elle se lit comme une affirmation. Un vrai particulier, lui, se distingue
--     par un acte — un achat, une commande — et non par l'absence d'un autre.
--
--     select categorie, count(*) from @SCHEMA@.baikal_comptes_pro group by 1;
--
--     (Formulé par la session MonsieurDPE en corrigeant ses deux vues.)

-- (5) Toute table source a son grant ET sa policy baikal_read. Reprendre la
--     requête de catalogue de mesures-v1 §3 (5) en changeant le nom de la vue,
--     et lire son avertissement : sur la base partagée, le rôle postgres a
--     BYPASSRLS, donc un grant manquant ne se voit pas et n'apparaîtra qu'au
--     déménagement vers un projet dédié.

-- (6) Lecture sous le rôle de Baikal.
--
--     set role baikal_reader;
--     select count(*) from @SCHEMA@.baikal_comptes_pro;
--     reset role;

grant select on @SCHEMA@.baikal_comptes_pro to baikal_reader;
