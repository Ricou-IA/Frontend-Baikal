-- ---------------------------------------------------------------------------
-- Contrat de mesures v1 — la vue d'ensemble d'un site dans Baikal.
--
-- Ce fichier n'est PAS un module duplicable comme prospects-v1.sql. Ce qui est
-- figé ici, c'est la FORME : le nom de la vue, ses colonnes, leurs types, la
-- sémantique de chaque agrégation, et la recette d'installation du §3. Le
-- corps de la vue appartient au site : personne d'autre que lui ne sait ce
-- qu'est une consultation, un dossier ou un abonné chez lui.
--
-- Installer chez un site : copier ce fichier dans une migration du site,
-- substituer @SCHEMA@ par le schéma du produit, remplacer les branches de
-- l'exemple par les siennes, puis passer les cinq contrôles du §3.
--
-- Baikal ne connaît aucun libellé, aucune clé, aucun métier. Il lit des
-- séries, pose ses bornes de fenêtre, calcule la variation et trace la
-- courbe. Ajouter un site ne demande aucune ligne de code Baikal.
--
-- Spec : docs/superpowers/specs/2026-09-23-contrat-mesures-design.md
-- ---------------------------------------------------------------------------


-- ------ 1. La vue ------
--
-- Une ligne par jour, par clé et par fenêtre.
--
-- | jour          | date, non nul    | jour LOCAL du site, voir §2          |
-- | cle           | text, non nul    | identifiant stable de l'indicateur   |
-- | libelle       | text, non nul    | le site nomme, Baikal range          |
-- | valeur        | numeric, non nul |                                      |
-- | agregation    | text, non nul    | 'somme' (flux) ou 'dernier' (stock)  |
-- | format        | text, non nul    | 'nombre', 'eur' ou 'pourcent'        |
-- | fenetre_jours | int, nullable    | non nul => agregation = 'dernier'    |
-- | groupe        | text, nullable   | bloc de tuiles                       |
-- | ordre         | int, nullable    | rang dans le groupe, NULL en dernier |
--
-- Trois règles tiennent tout le reste. Elles ne sont pas des recommandations :
-- chacune a déjà coûté un écran qui annonçait un nombre faux.
--
-- (a) UN FLUX SE SOMME, UN STOCK SE LIT AU DERNIER JOUR. Sommer trente lignes
--     de « 28 fiches revendiquées » donnerait 840. Un compte de valeurs
--     DISTINCTES sur une fenêtre est un stock, pas un flux : aucune fonction
--     des distincts quotidiens ne donne les distincts de la période.
--
-- (b) LA FENÊTRE EST UNE DONNÉE, JAMAIS UN MORCEAU DE NOM. Une clé
--     `dossiers_distincts_30j` ne suivrait pas la fenêtre choisie à l'écran :
--     la tuile voisine afficherait 7 jours et celle-ci 30, et le lecteur
--     calculerait un rapport faux. La fenêtre vit donc dans fenetre_jours, et
--     le site publie une série par fenêtre qu'il veut servir (7, 30, 90).
--     Baikal ne se rabat JAMAIS sur la fenêtre publiée la plus proche : une
--     clé qui ne couvre pas la fenêtre demandée n'est pas affichée.
--
-- (c) LES TESTS ET LES SUPPRIMÉS SONT EXCLUS À LA SOURCE. Tant que les KPI
--     étaient écrits dans Baikal, c'est lui qui les écartait en joignant
--     baikal_dossiers. Avec ce contrat, la garantie change de camp : elle
--     appartient au site, et personne ne s'en apercevra tant que les nombres
--     resteront plausibles. Voirie a affiché 5 demandes payées pour 2 réelles
--     pendant des semaines, à cause de sessions TEST_SKIP_.
--
-- L'unicité sur (jour, cle, fenetre_jours) est une PROMESSE du site : une vue
-- ne contraint rien. Un doublon sur un 'dernier' est inoffensif, un doublon
-- sur une 'somme' double le nombre affiché sans un bruit. Baikal le détecte et
-- l'affiche en bandeau, mais c'est au site de ne pas en produire.
--
-- Les « non nul » du tableau sont des promesses de la même façon : une vue ne
-- porte aucune contrainte, toutes ses colonnes se déclarent nullables quoi
-- qu'on écrive. Baikal écarte donc silencieusement une ligne dont jour, cle,
-- libelle, valeur, agregation ou format serait nul, plutôt que d'échouer.

create or replace view @SCHEMA@.baikal_mesures as

-- Branche d'exemple 1 : un FLUX. Une ligne par jour, sommée par Baikal sur la
-- fenêtre demandée, donc fenetre_jours reste NULL. La jointure à
-- baikal_dossiers est ce qui applique la règle (c).
select
  (a.survenu_le at time zone 'Europe/Paris')::date as jour,
  'achats'                                         as cle,
  'Achats'                                         as libelle,
  count(*)::numeric                                as valeur,
  'somme'                                          as agregation,
  'nombre'                                         as format,
  null::int                                        as fenetre_jours,
  'Ventes'                                         as groupe,
  10                                               as ordre
from @SCHEMA@.achat a
join @SCHEMA@.baikal_dossiers v on v.dossier_id = a.dossier_id::text
where v.est_test is not true and v.supprime_le is null
group by 1

union all

-- Branche d'exemple 2 : un STOCK À FENÊTRE. Le compte de distincts est
-- recalculé pour chaque jour de la courbe et pour chaque fenêtre servie, d'où
-- la jointure au calendrier. fenetre_jours porte la fenêtre, l'agrégation est
-- 'dernier' : Baikal lit la dernière ligne, il ne somme pas.
select
  j.jour,
  'dossiers_distincts'                        as cle,
  'Dossiers distincts'                        as libelle,
  count(distinct a.dossier_id)::numeric       as valeur,
  'dernier'                                   as agregation,
  'nombre'                                    as format,
  f.fenetre                                   as fenetre_jours,
  'Ventes'                                    as groupe,
  20                                          as ordre
from generate_series(
       (current_date - interval '180 days')::date, current_date, interval '1 day'
     ) as j(jour)
cross join (values (7), (30), (90)) as f(fenetre)
join @SCHEMA@.achat a
  on (a.survenu_le at time zone 'Europe/Paris')::date
     between j.jour - (f.fenetre - 1) and j.jour
join @SCHEMA@.baikal_dossiers v on v.dossier_id = a.dossier_id::text
where v.est_test is not true and v.supprime_le is null
group by j.jour, f.fenetre;

comment on view @SCHEMA@.baikal_mesures is
  'Contrat de mesures v1 lu par Baikal (admin-site-stats). Une ligne par jour, '
  'clé et fenêtre. Un flux se somme, un stock se lit au dernier jour, et les '
  'tests et supprimés sont exclus ICI, pas dans Baikal.';


-- ------ 2. Le jour est LOCAL, et le registre dit lequel ------
--
-- La base stocke minuit heure de Paris exprimé en UTC : un `::date` nu rend la
-- VEILLE en fin de soirée, sur toute la base et sans rien signaler. Deux sites
-- dont l'un publie `cree_le::date` et l'autre le jour local produisent des
-- séries décalées d'un jour, et la comparaison de période est fausse aux deux
-- bornes.
--
-- Le jour se calcule donc toujours ainsi :
--
--     (<horodatage> at time zone '<fuseau du site>')::date
--
-- Le fuseau est celui déclaré dans config.apps.fuseau côté Baikal (défaut
-- 'Europe/Paris'). C'est le même que Baikal utilise pour poser ses bornes de
-- fenêtre : les deux doivent s'accorder, sinon la journée en cours est fausse
-- des deux côtés à la fois. Un site qui change de fuseau change la colonne du
-- registre ET ses vues, jamais l'une sans l'autre.


-- ------ 3. Recette d'installation ------
--
-- Les six contrôles à passer avant de déclarer un site branché. Aucun n'est
-- facultatif : chacun correspond à une panne déjà vue, et toutes ces pannes
-- ont la même signature, une vue plausible mais fausse, jamais une erreur.
--
-- Passés sur dpe.baikal_mesures le 23/09/2026 : 93 lignes, 5 clés, zéro
-- doublon, zéro fenêtre sur un flux, zéro valeur hors vocabulaire.

-- (1) Aucun doublon. Doit rendre zéro ligne.
--
--     select jour, cle, fenetre_jours, count(*)
--     from @SCHEMA@.baikal_mesures
--     group by 1, 2, 3 having count(*) > 1;

-- (2) Seul un stock porte une fenêtre. Doit rendre zéro ligne.
--
--     select distinct cle, agregation, fenetre_jours
--     from @SCHEMA@.baikal_mesures
--     where fenetre_jours is not null and agregation <> 'dernier';

-- (3) Vocabulaire admis. Doit rendre zéro ligne.
--
--     select distinct cle, agregation, format
--     from @SCHEMA@.baikal_mesures
--     where agregation not in ('somme', 'dernier')
--        or format not in ('nombre', 'eur', 'pourcent');

-- (4) Complétude. Doit rendre zéro.
--
--     select count(*) from @SCHEMA@.baikal_mesures
--     where jour is null or cle is null or libelle is null or valeur is null
--        or agregation is null or format is null;

-- (5) TOUTE TABLE SOURCE A SON GRANT ET SA POLICY baikal_read. C'est le
--     contrôle le plus important, parce que c'est le seul dont le symptôme est
--     muet : une table source oubliée ne fait pas échouer la vue, elle la sert
--     AMPUTÉE. Trouvé chez MonsieurDPE le 23/09 sur trois tables
--     (diag_revendication, envoi_campagne, envoi_recap) : revendications
--     absentes de la timeline, moitié des courriels manquants, aucune erreur.
--
--     Lister les tables citées par la vue, puis pour chacune :
--
--         grant select on @SCHEMA@.<table> to baikal_reader;
--         create policy baikal_read on @SCHEMA@.<table>
--           for select to baikal_reader using (true);
--
--     La règle d'exploitation du dépôt vaut ici : rejouer cette boucle chaque
--     fois qu'une table nouvelle entre dans une vue contractuelle.

-- (6) Lecture effective sous le rôle de Baikal, et non sous le rôle courant.
--     Doit rendre des lignes, et les MÊMES qu'en (1).
--
--     set role baikal_reader;
--     select count(*), min(jour), max(jour) from @SCHEMA@.baikal_mesures;
--     reset role;

grant select on @SCHEMA@.baikal_mesures to baikal_reader;


-- ------ 4. Ce que le contrat ne couvre pas ------
--
-- Les PÉRIODES CALENDAIRES. fenetre_jours compte des jours, comme le paramètre
-- `jours` de admin-site-stats et les périodes de /clients (7, 30, 90). Il
-- n'exprime ni « mois en cours » ni « année en cours », que /finances propose
-- pourtant. Le jour où la vue d'ensemble les voudra, ce sera une v2 du
-- contrat, pas un rattrapage silencieux.
--
-- Les LIGNES NOMINATIVES. Une série ne porte pas de personnes, et ne doit pas
-- en porter. Le tableau des dernières entrées de la vue d'ensemble se dérive
-- de baikal_dossiers, que Baikal lit déjà.
--
-- Les COLONNES TOUJOURS VIDES. Une colonne optionnelle qu'un site ne sait pas
-- remplir doit être ABSENTE, pas présente et nulle : la capacité se lit à la
-- présence, et une colonne vide se lit comme un fait (« personne n'ouvre nos
-- courriels ») au lieu d'une absence de mesure.
