-- ---------------------------------------------------------------------------
-- Contrat Comptes historique v1 — la fiche d'un compte dans la console.
--
-- Contrat de FORME, comme comptes-pro-v1 : le nom de la vue, ses colonnes et
-- leurs types sont figés, le corps appartient au site.
--
-- Ce que la personne a FAIT ou ACHETÉ, une ligne par événement, du plus
-- récent au plus ancien. Chez un site à crédits (Pré-état-daté), chaque
-- transaction de crédit ; chez un site à abonnement, chaque facture, chaque
-- changement de plan. Rien n'est stocké pour Baikal : la vue dérive.
--
-- Vient avec deux autres éléments du chapitre Comptes :
--   - baikal_comptes_pro (contrat comptes-pro-v1), la liste ;
--   - la colonne OPTIONNELLE `compte_id` (text) de baikal_dossiers, qui
--     relie un dossier à son compte sans passer par un nom de société. Sans
--     elle, la fiche n'a pas de liste de dossiers — ce n'est pas une erreur.
-- Les actions sur un compte (créditer, désactiver, réactiver, supprimer…)
-- passent par l'EF d'administration du site (config.apps.env_admin_fn), qui
-- publie un manifeste PAR COMPTE au même format que celui des dossiers, avec
-- la clé `compte_id` (actions `manifeste` et `site-action` de
-- admin-comptes-pro, relais _shared/actions-site.ts). Baikal n'écrit jamais
-- dans les tables du site.
--
-- Installer chez un site : copier dans une migration du site, substituer
-- @SCHEMA@, écrire la projection, passer la recette du §2.
--
-- Spec : Pack Vendeur, docs/superpowers/specs/2026-10-06-baikal-chapitre-comptes-design.md
-- ---------------------------------------------------------------------------


-- ------ 1. La vue ------
--
-- NOYAU, obligatoire.
--
-- | compte_id    | text, non nul         | le compte (baikal_comptes_pro.compte_id) |
-- | evenement_id | text, non nul, unique | identifiant d'affichage                  |
-- | survenu_le   | timestamptz, non nul  | tri                                      |
-- | nature       | text, non nul         | achat · consommation · ajustement ·      |
-- |              |                       | remboursement · bienvenue · parrainage · |
-- |              |                       | option ; un site peut en ajouter         |
-- |              |                       | (abonnement, facture)                    |
--
-- OPTIONNELLES. Une colonne qu'on ne sait pas remplir est ABSENTE, jamais
-- présente et nulle (un site à abonnement n'a ni quantite ni solde_apres).
--
-- | libelle      | text                | une phrase, écrite par le site           |
-- | quantite     | int, nullable       | crédits, signée                          |
-- | montant_ttc  | numeric, nullable   | l'argent quand il y en a                 |
-- | devise       | text                | 'EUR'                                    |
-- | solde_apres  | int, nullable       |                                          |
-- | dossier_id   | text, nullable      | lien vers baikal_dossiers                |

create or replace view @SCHEMA@.baikal_compte_historique as
select
  x.pro_account_id::text as compte_id,
  x.id::text             as evenement_id,
  x.created_at           as survenu_le,
  case x.type
    when 'purchase' then 'achat'
    when 'usage'    then 'consommation'
    else x.type
  end                    as nature,
  x.description          as libelle,
  x.amount::int          as quantite,
  x.amount_paid_eur      as montant_ttc,
  'EUR'::text            as devise,
  x.balance_after::int   as solde_apres,
  x.dossier_id::text     as dossier_id
from @SCHEMA@.pro_credit_transactions x
where x.pro_account_id is not null;

comment on view @SCHEMA@.baikal_compte_historique is
  'Contrat Comptes historique v1 lu par Baikal (fiche compte). Une ligne par '
  'événement du compte, rien de stocké.';


-- ------ 2. Recette d'installation ------

-- (1) Noyau complet. Doit rendre zéro.
--
--     select count(*) from @SCHEMA@.baikal_compte_historique
--     where compte_id is null or evenement_id is null
--        or survenu_le is null or nature is null;

-- (2) Identifiant unique. Doit rendre zéro ligne.
--
--     select evenement_id, count(*) from @SCHEMA@.baikal_compte_historique
--     group by 1 having count(*) > 1;

-- (3) Chaque événement a son compte dans la liste. Doit rendre zéro.
--
--     select count(*) from @SCHEMA@.baikal_compte_historique h
--     where not exists (select 1 from @SCHEMA@.baikal_comptes_pro c
--                       where c.compte_id = h.compte_id);

-- (4) Lecture sous le rôle de Baikal : même nombre qu'en service_role.
--
--     set role baikal_reader;
--     select count(*) from @SCHEMA@.baikal_compte_historique;
--     reset role;

-- (5) Toute table source a son grant ET sa policy baikal_read (README).

grant select on @SCHEMA@.baikal_compte_historique to baikal_reader;
