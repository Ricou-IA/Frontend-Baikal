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
-- l'exemple par les siennes, puis passer les sept contrôles du §3.
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
-- | chapitre      | text, non nul    | OÙ la tuile s'affiche, voir §1.1     |
-- | fenetre_jours | int, nullable    | non nul => agregation = 'dernier'    |
-- | groupe        | text, nullable   | bloc de tuiles dans le chapitre      |
-- | rendu         | text, nullable   | 'tuiles' (défaut) ou 'entonnoir'     |
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
-- (b bis) UN STOCK PUBLIE UNE LIGNE PAR JOUR, ZÉROS COMPRIS, depuis sa
--     première mesure. Une ligne absente veut dire « pas mesuré », jamais
--     « zéro », et Baikal ne sait pas distinguer les deux : il affiche alors la
--     dernière valeur connue, datée. Un stock publié en jointure INTERNE se
--     fige donc à sa dernière valeur non nulle — une fenêtre glissante qui ne
--     redescend jamais, un abonné résilié qui reste compté, une fiche
--     supprimée qui survit. Trouvé chez MonsieurDPE le 23/09 sur quatre
--     branches : la tuile « dossiers distincts, 7 j » aurait annoncé 1 au
--     huitième jour sans ouverture, là où la réponse est 0. La jointure
--     externe est ce qui répare.
--
--     La valeur datée du dernier jour connu est une TOLÉRANCE aux pannes de
--     publication, pas une licence de publier par intermittence.
--
--     Deux bornes à cette règle. On ne publie RIEN avant la première mesure :
--     des zéros antérieurs prétendraient qu'on mesurait déjà et dessineraient
--     une courbe plate qui n'a jamais existé. Et un cumul monotone, qui ne peut
--     pas décroître (un chiffre d'affaires cumulé), n'a pas besoin de ses
--     zéros : son absence de ligne ne peut pas mentir.
--
-- (c) LES TESTS ET LES SUPPRIMÉS SONT EXCLUS À LA SOURCE. Tant que les KPI
--     étaient écrits dans Baikal, c'est lui qui les écartait en joignant
--     baikal_dossiers. Avec ce contrat, la garantie change de camp : elle
--     appartient au site, et personne ne s'en apercevra tant que les nombres
--     resteront plausibles. Voirie a affiché 5 demandes payées pour 2 réelles
--     pendant des semaines, à cause de sessions TEST_SKIP_.
--
-- (d) UNE MESURE QUI COIFFE UNE LISTE SE DÉRIVE DE CETTE LISTE, elle ne la
--     recompte jamais. La tuile « comptes actifs » lit baikal_comptes_pro, la
--     tuile « dossiers payés » lit baikal_dossiers. C'est le seul montage où
--     les deux écrans ne PEUVENT PAS diverger : recompter, c'est redéfinir un
--     périmètre en double, et deux définitions finissent toujours par
--     s'écarter. La règle vaut déjà dans stats-sites.ts, où les KPI se
--     joignent à baikal_dossiers ; elle vaut maintenant pour tout le contrat.
--     (Formulée par la session MonsieurDPE en publiant comptes_pro_actifs.)
--
-- L'unicité sur (jour, cle, fenetre_jours) est une PROMESSE du site : une vue
-- ne contraint rien. Un doublon sur un 'dernier' est inoffensif, un doublon
-- sur une 'somme' double le nombre affiché sans un bruit. Baikal le détecte et
-- l'affiche en bandeau, mais c'est au site de ne pas en produire.
--
-- Les « non nul » du tableau sont des promesses de la même façon : une vue ne
-- porte aucune contrainte, toutes ses colonnes se déclarent nullables quoi
-- qu'on écrive. Baikal écarte donc silencieusement une ligne dont jour, cle,
-- libelle, valeur, agregation, format ou chapitre serait nul, plutôt que
-- d'échouer.


-- ------ 1.1 Le chapitre : où la tuile s'affiche ------
--
-- Il n'y a PAS d'écran des statistiques. Une mesure s'affiche en tête du
-- chapitre de la console auquel elle appartient : le chiffre d'affaires
-- au-dessus de Finances, le nombre de comptes au-dessus de Comptes pro, les
-- dossiers au-dessus de Clients. Un chiffre se lit à côté de ce qu'il compte,
-- et les droits par module s'appliquent sans une ligne de plus : qui n'a pas
-- le module ne voit pas ses tuiles.
--
-- Le vocabulaire est FERMÉ, et il appartient à Baikal, pas au site :
--
--     'clients' | 'finances' | 'comptes_pro'
--
-- Ce sont les chapitres qui montrent des données du site. Les autres modules
-- de la console (prospects, rapports, seo, partenariats, users) portent des
-- données de Baikal ou de Google, pas du site : une mesure n'y a rien à faire.
-- La liste grandira le jour où un chapitre nouveau montrera du site.
--
-- Une valeur hors vocabulaire n'est pas affichée ailleurs par défaut : elle
-- est écartée, comme une ligne incomplète. Baikal ne devine pas un rangement.
--
-- LE RENDU SE DÉCLARE, IL NE SE DEVINE PAS À UN NOM. `rendu` vaut 'tuiles'
-- (défaut, NULL compris) ou 'entonnoir'. Un groupe en 'entonnoir' s'affiche en
-- étapes alignées, dans l'ordre de `ordre`, avec le taux de passage entre deux
-- étapes CONSÉCUTIVES.
--
-- Un nom de groupe réservé — « publie un groupe appelé funnel et Baikal
-- comprendra » — aurait été la même faute que la fenêtre dans le nom d'une
-- clé : de la métadonnée passée en contrebande dans une étiquette, chez un
-- lecteur qui ne lit aucune étiquette. `groupe` reste libre et le site le nomme
-- comme il veut, y compris « Entonnoir d'achat » ou « Parcours ».
--
-- Trois règles pour un entonnoir, et la troisième est la plus importante.
--
--   - Toutes les mesures d'un même groupe déclarent le MÊME rendu. Un groupe
--     panaché retombe sur des tuiles : mieux vaut un affichage ordinaire qu'un
--     entonnoir dont une étape ne serait pas une étape.
--   - Une étape absente est absente : Baikal calcule ses taux entre les étapes
--     RÉELLEMENT PUBLIÉES, et ne devine pas qu'il en manque une. Un site qui
--     n'a pas encore de mesure de trafic affiche un entonnoir qui commence
--     plus bas, avec ses libellés pour le dire.
--   - Un taux de passage entre deux flux de la même période est APPARENT, pas
--     une cohorte : celui qui ouvre son rapport un lundi paie trois semaines
--     plus tard, et il n'est pas le même que celui qui paie ce lundi-là.
--     Baikal l'écrit sous l'entonnoir. Un chiffre juste qu'on laisse lire pour
--     ce qu'il n'est pas devient un chiffre faux.
--
-- LA RÈGLE POUR RANGER : le chapitre suit ce que la mesure COMPTE, pas qui l'a
-- produite. Les analyses lancées par un diagnostiqueur abonné vont dans
-- 'clients', parce qu'elles comptent des logements ; quarante analyses ne font
-- pas quarante comptes. 'comptes_pro' est le chapitre des COMPTES.
-- (Formulée par la session MonsieurDPE en rangeant ses cinq premières clés.)

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
  'finances'                                       as chapitre,
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
  'clients'                                   as chapitre,
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
-- Les sept contrôles à passer avant de déclarer un site branché. Aucun n'est
-- facultatif : chacun correspond à une panne déjà vue, et toutes ces pannes
-- ont la même signature, une vue plausible mais fausse, jamais une erreur.
--
-- Passés sur dpe.baikal_mesures le 23/09/2026 : 93 lignes, 5 clés, zéro
-- doublon, zéro fenêtre sur un flux, zéro valeur hors vocabulaire, zéro ligne
-- incomplète. Cette vue est antérieure à la colonne chapitre (§1.1) : elle la
-- gagnera avant d'être branchée.

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
--     select distinct cle, agregation, format, chapitre, rendu
--     from @SCHEMA@.baikal_mesures
--     where agregation not in ('somme', 'dernier')
--        or format not in ('nombre', 'eur', 'pourcent')
--        or chapitre not in ('clients', 'finances', 'comptes_pro')
--        or coalesce(rendu, 'tuiles') not in ('tuiles', 'entonnoir');
--
--     Et le rendu uniforme par groupe, qui doit aussi rendre zéro ligne :
--
--     select chapitre, groupe, count(distinct coalesce(rendu, 'tuiles'))
--     from @SCHEMA@.baikal_mesures
--     group by 1, 2 having count(distinct coalesce(rendu, 'tuiles')) > 1;

-- (4) Complétude. Doit rendre zéro.
--
--     select count(*) from @SCHEMA@.baikal_mesures
--     where jour is null or cle is null or libelle is null or valeur is null
--        or agregation is null or format is null or chapitre is null;

-- (5) TOUTE TABLE SOURCE A SON GRANT ET SA POLICY baikal_read. C'est le
--     contrôle le plus important, parce que c'est le seul dont le symptôme est
--     muet : une table source oubliée ne fait pas échouer la vue, elle la sert
--     AMPUTÉE. Trouvé chez MonsieurDPE le 23/09 sur trois tables
--     (diag_revendication, envoi_campagne, envoi_recap) : revendications
--     absentes de la timeline, moitié des courriels manquants, aucune erreur.
--
--     Ce contrôle ne se fait PAS à la main : les sources d'une vue se lisent
--     dans le catalogue, et une table qui entre dans la vue six mois plus tard
--     n'a aucune chance d'être repérée autrement. Doit rendre zéro ligne, pour
--     chaque vue contractuelle du site.
--
--     with sources as (
--       select distinct c.oid, n.nspname || '.' || c.relname as source,
--              c.relrowsecurity as rls
--       from pg_rewrite r
--       join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass
--       join pg_class c on c.oid = d.refobjid
--       join pg_namespace n on n.oid = c.relnamespace
--       where r.ev_class = '@SCHEMA@.baikal_mesures'::regclass
--         and c.relkind in ('r','v','m','p') and c.oid <> r.ev_class
--         and n.nspname not in ('pg_catalog', 'information_schema')
--     )
--     select source,
--            has_table_privilege('baikal_reader', oid, 'SELECT') as grant_ok,
--            exists (select 1 from pg_policies p
--                     where p.schemaname || '.' || p.tablename = source
--                       and 'baikal_reader' = any (p.roles)
--                       and p.cmd in ('SELECT', 'ALL')) as policy_ok
--     from sources
--     where not has_table_privilege('baikal_reader', oid, 'SELECT')
--        or (rls and not exists (select 1 from pg_policies p
--                                 where p.schemaname || '.' || p.tablename = source
--                                   and 'baikal_reader' = any (p.roles)
--                                   and p.cmd in ('SELECT', 'ALL')));
--
--     Réparer chaque ligne rendue :
--
--         grant select on @SCHEMA@.<source> to baikal_reader;
--         create policy baikal_read on @SCHEMA@.<source>
--           for select to baikal_reader using (true);
--
--     ATTENTION à ce que ce contrôle ne dit pas. Un site de la base PARTAGÉE
--     est lu par `SUPABASE_DB_URL`, c'est-à-dire le rôle postgres, qui a
--     BYPASSRLS : chez lui, un grant manquant ne se voit pas, et la vue paraît
--     complète. Le trou n'apparaît que le jour du déménagement vers un projet
--     dédié, où la lecture passe par `baikal_reader`. Passer ce contrôle même
--     quand tout marche est donc le seul moyen de ne pas transformer un
--     déménagement en régression silencieuse.

-- (6) Série continue des stocks. Un stock doit avoir autant de jours publiés
--     que de jours écoulés depuis sa première mesure. Les seules lignes
--     admises en sortie sont les cumuls monotones (§1 b bis).
--
--     select cle, fenetre_jours,
--            count(distinct jour) as jours_publies,
--            (max(jour) - min(jour) + 1) as jours_attendus
--     from @SCHEMA@.baikal_mesures
--     where agregation = 'dernier'
--     group by 1, 2
--     having count(distinct jour) <> (max(jour) - min(jour) + 1);

-- (7) Lecture effective sous le rôle de Baikal, et non sous le rôle courant.
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
-- en porter. Les listes ont leurs propres contrats : baikal_dossiers pour le
-- chapitre Clients, baikal_comptes_pro pour le chapitre Comptes pro. Les
-- mesures les coiffent, elles ne les remplacent pas.
--
-- Les COLONNES TOUJOURS VIDES. Une colonne optionnelle qu'un site ne sait pas
-- remplir doit être ABSENTE, pas présente et nulle : la capacité se lit à la
-- présence, et une colonne vide se lit comme un fait (« personne n'ouvre nos
-- courriels ») au lieu d'une absence de mesure.
