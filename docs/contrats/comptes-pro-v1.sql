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
-- absent de la vue n'est pas affiché, ce n'est jamais une erreur. Un bloc se
-- publie entier ou pas du tout.
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

-- (3) Blocs entiers. Un bloc publié doit l'être en entier : les trois colonnes
--     de crédits, ou aucune ; les cinq colonnes d'abonnement, ou aucune.
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

-- (5) Toute table source a son grant ET sa policy baikal_read. Même contrôle
--     que mesures-v1 §3, même symptôme muet : une table oubliée sert la vue
--     amputée sans lever d'erreur.

-- (6) Lecture sous le rôle de Baikal.
--
--     set role baikal_reader;
--     select count(*) from @SCHEMA@.baikal_comptes_pro;
--     reset role;

grant select on @SCHEMA@.baikal_comptes_pro to baikal_reader;
