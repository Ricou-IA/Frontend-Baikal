-- ---------------------------------------------------------------------------
-- Contrat Dossiers v1 — le chapitre Clients de la console et la fiche client.
--
-- Contrat de FORME, comme mesures-v1 et comptes-pro-v1 : les noms des vues,
-- leurs colonnes et leurs types sont figés, le corps de chaque vue appartient
-- au site. Personne d'autre que lui ne sait ce qu'est un dossier chez lui :
-- un bien à vendre (Pré-état-daté), une adresse qui a demandé un rapport
-- (MonsieurDPE), une demande d'autorisation (Voirie).
--
-- Jusqu'au 24/10/2026, ce contrat n'existait que dans la spec du 26/08
-- (clients) et celle du 03/09 (fiche), et dans le code de Baikal
-- (admin-dossiers/onglets.ts, fiche/colonnes.js, admin-dossiers/champs.ts).
-- Un troisième site devait lire Pack Vendeur ou MonsieurDPE pour savoir quoi
-- publier. Ce fichier est la référence ; le code de Baikal s'y conforme, et
-- les deux sites installés le passent.
--
-- UNE VUE OBLIGATOIRE, SIX OPTIONNELLES. Sans `baikal_dossiers`, le site n'a
-- pas le module (disponible = false, jamais une erreur). Chaque vue optionnelle
-- ouvre un onglet de la fiche : pas de vue, pas d'onglet ; pas de colonne, pas
-- de section. Baikal détecte tout par le catalogue (to_regclass,
-- information_schema.columns) : aucun registre de capacités à tenir.
--
-- | vue                        | onglet    | obligatoire |
-- |----------------------------|-----------|-------------|
-- | baikal_dossiers            | liste, Vue| oui         |
-- | baikal_dossier_champs      | Vue       | non         |
-- | baikal_dossier_documents   | Documents | non         |
-- | baikal_dossier_resultats   | Résultat  | non         |
-- | baikal_dossier_emails      | Emails    | non         |
-- | baikal_dossier_messages    | Chat      | non         |
-- | baikal_dossier_ia          | Logs IA   | non         |
-- | baikal_dossier_donnees     | Données   | non         |
-- | baikal_dossier_events      | Events    | non         |
--
-- Installer chez un site : copier dans une migration du site, substituer
-- @SCHEMA@ (`dpe`, `pack_vendeur`… ou `public` sur un projet dédié), écrire
-- la projection de chaque vue voulue, passer la recette du §4.
--
-- Specs : docs/superpowers/specs/2026-08-26-baikal-clients-design.md (liste),
-- 2026-09-03-fiche-transaction-format-commun-design.md (fiche et onglets).
-- Installés : pack-vendeur (les huit vues), monsieurdpe (six : pas de
-- documents, pas de chat, pas de logs IA — voir §3 pourquoi).
-- ---------------------------------------------------------------------------


-- ------ 1. `baikal_dossiers` — la liste, une ligne par ÉVÉNEMENT COMMERCIAL ------
--
-- Le grain n'est pas la personne, c'est l'acte (Eric, 02/09/2026) : un compte
-- qui évolue (inscrit → abonné), un achat (toujours un acte, même chez un
-- abonné), un lead absorbé par le premier compte ou achat de la même adresse.
-- Définitions : Lead = service gratuit consommé contre un email ; Inscrit =
-- fiche ou compte ; Payé = service payant consommé, coupon 100 % compris (un
-- achat à 0 € est un Payé, pas un test).
--
-- NOYAU, obligatoire :
--
-- | dossier_id   | text, non nul    | identifiant côté site, clé de toutes les autres vues |
-- | email        | text, nullable   | l'adresse du client                                   |
-- | contact_nom  | text, nullable   | la personne, quand le site la tient                   |
-- | statut       | text, non nul    | slug d'étape de config.apps.funnel_etapes ; sans funnel, libre |
-- | perimetre    | text, non nul    | 'b2c' ou 'b2b'                                        |
-- | cree_le      | timestamptz      | date de l'événement                                   |
-- | paye_le      | timestamptz null | CLIENT PAYANT = paye_le renseigné, jamais un slug     |
-- | est_test     | boolean, non nul | bascule « Exclure tests » — définition du SITE        |
-- | supprime_le  | timestamptz null | bascule « Inclure supprimés »                         |
-- | emails_envoyes, emails_ouverts | int | compteurs de la liste ; 0 si le site ne sait pas |
--
-- TRANSACTION (noyau, nullable quand l'acte n'est pas un paiement) :
--
-- | montant_ttc              | numeric, null | |
-- | devise                   | text          | 'EUR' |
-- | stripe_payment_intent_id | text, null    | pont vers admin.ventes et Stripe |
--
-- BLOCS OPTIONNELS. La capacité se lit à la PRÉSENCE de la colonne.
--
-- | attribution   | jsonb, null | d'où vient le client — voir §1 bis |
-- | apporteur     | text, null  | le « via Antique Immo » : un apporteur non vide classe la ligne Portail-Pro |
-- | libelle       | text, null  | ce que la ligne vend ou consomme : adresse du bien, « Rapport gratuit »… |
-- | categorie     | text, null  | slug de config.apps.categories_client ; catégorie de la PERSONNE, identique sur toutes ses lignes |
-- | compte_id     | text, null  | le compte pro de la ligne (contrat comptes-pro-v1) |
-- | documents_purges_le | timestamptz null | badge « documents purgés » |
-- | email_capture_le    | timestamptz null | quand l'adresse a été laissée (visiteur → lead) |
-- | maj_le        | timestamptz null | dernière activité de la ligne |
-- | abo_statut    | text, null  | PIVOT du bloc abonnement, vocabulaire Stripe ('trialing', 'active', 'past_due', 'canceled'…) |
-- | abo_plan      | text, null  | slug du plan |
-- | abo_montant_mensuel | numeric, null | ne pas recopier un tarif qui vit chez Stripe : absente chez monsieurdpe |
-- | abo_prochaine_echeance | timestamptz null | |
-- | abo_resilie_le | timestamptz null | |
--
-- Les règles de comptes-pro-v1 valent ici : les tests et les supprimés sont
-- portés par la vue (admin-site-stats se joint à baikal_dossiers plutôt que
-- de redéfinir ses filtres — c'est ce qui a mis fin aux « 5 payées pour 2
-- réelles » de Voirie) ; une colonne qu'on ne sait pas remplir est ABSENTE.

create or replace view @SCHEMA@.baikal_dossiers
with (security_invoker = true) as
select
  d.id::text              as dossier_id,
  d.email                 as email,
  d.contact_name          as contact_nom,
  d.funnel_slug           as statut,
  case when d.pro_account_id is null then 'b2c' else 'b2b' end as perimetre,
  d.created_at            as cree_le,
  d.paid_at               as paye_le,
  coalesce(d.is_test, false) or d.email ~* 'pudebat|confer-sas|test|demo|example\.' as est_test,
  d.deleted_at            as supprime_le,
  coalesce(e.envoyes, 0)  as emails_envoyes,
  coalesce(e.ouverts, 0)  as emails_ouverts,
  d.amount_paid           as montant_ttc,
  'EUR'                   as devise,
  d.stripe_payment_intent_id,
  -- Blocs optionnels : retirer les lignes que le site ne sait pas remplir.
  d.attribution,
  p.company_name          as apporteur,
  d.property_address      as libelle,
  case when d.pro_account_id is null then 'particulier' else 'pro' end as categorie,
  d.pro_account_id::text  as compte_id,
  d.documents_purged_at   as documents_purges_le,
  d.email_captured_at     as email_capture_le,
  d.updated_at            as maj_le
from @SCHEMA@.dossiers d
left join @SCHEMA@.pro_accounts p on p.id = d.pro_account_id
left join lateral (
  select count(*) as envoyes, count(l.opened_at) as ouverts
  from @SCHEMA@.email_logs l
  where l.dossier_id = d.id and l.status = 'sent'
) e on true;

comment on view @SCHEMA@.baikal_dossiers is
  'Contrat Dossiers v1 lu par Baikal (admin-dossiers, admin-site-stats). Une ligne '
  'par événement commercial ; client payant = paye_le ; tests et suppressions '
  'définis ici ; catégorie de la personne. Le canal d''origine est déduit par '
  'Baikal de `attribution`, jamais stocké.';


-- ------ 1 bis. `attribution` — d'où vient le client ------
--
-- Forme commune à Clients et au Financier ; Baikal en DÉDUIT le canal par sa
-- cascade (admin-dossiers/canal.ts : portail_pro → paid → geo → campaign →
-- organic → referral → direct → indetermine → unattributed), jamais stocké.
--
-- | referrer_domaine | text    | hôte du référent externe, sans www, minuscules |
-- | utm_source, utm_medium, utm_campaign, utm_term | text | tels que reçus |
-- | a_gclid          | boolean | clic Google Ads                                |
-- | landing_page     | text    | première page vue                              |
-- | channel          | text    | repli calculé par le site : 'organic_search', 'direct', 'email', 'campaign', 'referral', 'paid_search', 'paid_social', 'organic_social' |
-- | capture          | text    | 'live' (capté à l'arrivée), 'backfill_partiel' (reconstitué, lu « Origine perdue »), autre : libre |
--
-- PREMIER CONTACT QUI GAGNE : la question est « qu'est-ce qui a produit ce
-- client », pas « par quelle porte est-il revenu ». Pack Vendeur garde 90
-- jours en localStorage (src/lib/acquisition.js), MonsieurDPE de même
-- (site/lib/acquisition.ts) ; un référent interne n'est pas un contact.
--
-- Un lead posé par un partenaire sans navigateur se publie avec
-- `referrer_domaine` = domaine du partenaire, lu « Référent · <domaine> »
-- (Eric, 24/10/2026). Une page d'entrée seule (`landing_page` sans référent
-- ni UTM) reste « sans origine » : une porte n'est pas une origine.
--
-- NULL = inconnu. Jamais `{}` : un objet vide se lit « capté, sans signal ».


-- ------ 2. Les vues de la fiche ------
--
-- Motif commun : `dossier_id` (seule colonne obligatoire), un horodatage, un
-- libellé, quelques colonnes propres à la nature, et `details` jsonb libre
-- dont chaque clé devient sa propre colonne du tableau. Une colonne absente de
-- toutes les lignes n'est pas rendue.
--
-- GRAIN : les vues sont par `dossier_id`. Un site dont l'identité est
-- l'adresse (MonsieurDPE) joint ses gestes à chaque ligne de l'adresse : le
-- même événement apparaît sur le compte, l'achat et l'abonnement de la même
-- personne. C'est permis ; le dire dans le commentaire de la vue.

-- 2.1 `baikal_dossier_champs` — les sections déclarées de l'onglet Vue.
-- Le site fournit la valeur BRUTE, Baikal formate. Une ligne absente =
-- inconnu : ne jamais publier une valeur vide.
--
-- | dossier_id    | text          | |
-- | section       | text          | titre du bloc ; '' = section sans titre, qui ouvre la fiche |
-- | ordre_section | int, null     | |
-- | libelle       | text          | |
-- | ordre         | int, null     | |
-- | valeur        | text, null    | brute, non formatée |
-- | format        | text, null    | 'texte' (défaut) 'euro' 'dollar' 'date' 'datetime' 'pourcent' 'nombre' 'octets' 'booleen' 'lien' 'mono' |
-- | niveau        | text, null    | 'attention' / 'danger' : surligne le champ (remplace tout encart codé en dur) |

create or replace view @SCHEMA@.baikal_dossier_champs
with (security_invoker = true) as
select d.id::text as dossier_id,
       'Bien' as section, 1 as ordre_section,
       'Surface' as libelle, 1 as ordre,
       d.surface::text as valeur, 'nombre' as format, null::text as niveau
from @SCHEMA@.dossiers d
where d.surface is not null;

-- 2.2 `baikal_dossier_documents` — l'entrée (ce que le client a déposé).
-- Pas « une liste de fichiers » : un formulaire, un vocal, un lien entrent
-- dans le même onglet.
--
-- | dossier_id    | text          | |
-- | document_id   | text          | identité, utilisée par l'ouverture (§2 bis) |
-- | libelle       | text          | |
-- | nature        | text, null    | 'fichier' 'formulaire' 'audio' 'photo' 'lien' 'texte' |
-- | type          | text, null    | type métier du site, affiché tel quel |
-- | mime          | text, null    | |
-- | taille_octets | bigint, null  | |
-- | pages         | int, null     | |
-- | depose_le     | timestamptz null | tri de l'onglet |
-- | source        | text, null    | 'client' 'admin' 'systeme' |
-- | statut        | text, null    | 'recu' 'analyse' 'rejete' 'illisible'… ; 'erreur' passe la ligne en rouge |
-- | ouvrable      | boolean, null | le site sait signer une URL ; absent → déduit de nature = 'fichier' et de la présence du relais |
-- | details       | jsonb, null   | |

-- 2.3 `baikal_dossier_resultats` — la sortie (ce que le client a obtenu).
--
-- | dossier_id     | text          | |
-- | resultat_id    | text          | identité, utilisée par l'ouverture (§2 bis) |
-- | libelle        | text          | |
-- | nature         | text, null    | 'document' 'lien_partage' 'rapport' 'analyse' 'export' 'reponse'… |
-- | produit_le     | timestamptz null | tri de l'onglet |
-- | version        | int, null     | régénérations successives |
-- | statut         | text, null    | libre ('Payé', 'Envoyé par courriel', 'niveau 2'…) ; 'erreur' passe en rouge |
-- | url_publique   | text, null    | un lien publique par construction (partage, rapport signé) — rendu 'lien' |
-- | consulte_le    | timestamptz null | |
-- | telechargements | int, null    | |
-- | ouvrable       | boolean, null | |
-- | details        | jsonb, null   | |

-- 2.4 `baikal_dossier_emails` — les envois.
--
-- | dossier_id   | text          | |
-- | envoye_le    | timestamptz   | tri de l'onglet |
-- | sujet        | text          | |
-- | destinataire | text, null    | |
-- | statut       | text, null    | 'envoye' 'delivre' 'ouvert' 'clique' 'bounce' 'plainte' 'echec' |
-- | ouvert_le    | timestamptz null | |
-- | type         | text, null    | slug du modèle |
-- | erreur       | text, null    | |
-- | details      | jsonb, null   | |
--
-- Les campagnes Baikal (module mailing-v1) s'y publient depuis le journal
-- `<schema>.mail_envoi` du site : c'est le site qui tient le nominatif.

-- 2.5 `baikal_dossier_messages` — le chat.
--
-- | dossier_id | text          | |
-- | message_id | text, null    | |
-- | survenu_le | timestamptz   | tri, croissant |
-- | role       | text          | 'client' 'assistant' 'agent' (humain) |
-- | contenu    | text          | |
-- | canal      | text, null    | 'chat' 'widget' 'whatsapp'… |
-- | contexte   | text, null    | la page de l'échange |
-- | details    | jsonb, null   | |
--
-- Une question et sa réponse stockées sur une même ligne se DÉGROUPENT dans
-- la vue (UNION ALL, message_id suffixé -q / -r) : l'adaptation appartient
-- au site, jamais à Baikal.

-- 2.6 `baikal_dossier_ia` — les appels IA. Le coût total est sommé par Baikal.
--
-- | dossier_id   | text          | |
-- | survenu_le   | timestamptz   | |
-- | operation    | text, null    | le prompt_type du site |
-- | modele       | text, null    | celui qui a RÉELLEMENT répondu (après repli) |
-- | tokens_entree, tokens_sortie, tokens_total | int, null | |
-- | cout_usd     | numeric, null | |
-- | latence_ms   | int, null     | |
-- | statut       | text, null    | 'ok' / 'erreur' |
-- | erreur       | text, null    | |
-- | details      | jsonb, null   | |
--
-- Ne publier que les appels RATTACHÉS à un dossier par un fait. MonsieurDPE
-- rattache ses logs à un numéro de DPE ou à une session de sourcing, jamais à
-- une personne : il ne publie pas la vue plutôt que de deviner.

-- 2.7 `baikal_dossier_donnees` — le brut, par blocs, rendu en accordéon.
--
-- | dossier_id | text        | |
-- | bloc       | text        | identifiant, ex. 'extracted_data' |
-- | libelle    | text        | |
-- | ordre      | int, null   | |
-- | contenu    | jsonb       | n'importe quelle structure |
-- | maj_le     | timestamptz null | |

-- 2.8 `baikal_dossier_events` — le parcours (timeline).
--
-- | dossier_id | text        | |
-- | survenu_le | timestamptz | tri, décroissant |
-- | type       | text        | slug du site ('achat', 'auto_controle'…), repli d'affichage |
-- | libelle    | text, null  | ce qui s'affiche ; à défaut le type |
-- | acteur     | text, null  | 'client' 'admin' 'systeme' (couleur) |
-- | detail     | jsonb, null | rendu en paires clé/valeur telles quelles : le contrat n'en privilégie aucune |
--
-- TOUT geste daté du client a sa place : ce qu'il a fait, consulté, activé
-- (Eric, 24/10/2026). Un site qui ne publie que ses ventes publie une timeline
-- qui ment par omission.

create or replace view @SCHEMA@.baikal_dossier_events
with (security_invoker = true) as
select ev.dossier_id::text as dossier_id,
       ev.created_at       as survenu_le,
       ev.event_name       as type,
       ev.label            as libelle,
       'client'            as acteur,
       jsonb_strip_nulls(jsonb_build_object('page', ev.page_url)) || coalesce(ev.properties, '{}'::jsonb) as detail
from @SCHEMA@.events ev
where ev.dossier_id is not null;


-- ------ 2 bis. Ouvrir un document ou un résultat ------
--
-- Baikal ne tient aucun fichier : lui seul le site sait signer une URL.
-- L'ouverture passe par l'EF d'administration du site
-- (config.apps.env_dossiers_fn, auth env_anon_key + X-Baikal-Key =
-- env_secret_ref), action `fichier` : entrée { dossier_id, cible
-- ('document' | 'resultat'), id }, sortie { url, expire_le }. Seuls http(s)
-- sont ouverts par la console. Sans relais, `ouvrable` vaut false partout et
-- les lignes restent lisibles — jamais une erreur.
--
-- Les ACTIONS de la fiche (renvoyer un email, relancer une analyse, créditer,
-- purger…) passent par le même relais : action `manifeste` (ce que le site
-- offre pour ce dossier) puis `site-action`. Référence : _shared/actions-site.ts
-- et docs/contrats/prospects-relais-v1.ts pour la forme du passe-plat.


-- ------ 3. Ce que Baikal fait de ces vues ------
--
-- Liste : recherche sur email, contact_nom, libelle ; période ; statuts du
-- funnel ; périmètre ; catégories (si la colonne existe) ; bascules tests et
-- supprimés ; « Ont payé » = paye_le non nul ; tri cree_le ou paye_le ;
-- pagination. Les tuiles qui coiffent la liste viennent de baikal_mesures,
-- chapitre 'clients' — jamais de cette vue.
--
-- Fiche : le noyau (contact, transaction, origine déduite de attribution,
-- abonnement si abo_statut), puis les sections de baikal_dossier_champs, puis
-- un onglet par vue présente, avec son compteur. Baikal n'ÉCRIT jamais dans
-- une vue ni dans une table du site.
--
-- Un site n'a aucune obligation de tout publier, mais ce qu'il ne publie pas
-- est invisible : « on doit pouvoir récupérer les informations de notre
-- client » (Eric, 24/10/2026). Avant de laisser une vue de côté, se demander
-- si la donnée existe vraiment nulle part — et, si elle existe sans
-- rattachement sûr à une personne, la laisser de côté plutôt que d'inventer
-- le rattachement.


-- ------ 4. Recette d'installation ------

-- (1) Noyau complet. Doit rendre zéro.
--
--     select count(*) from @SCHEMA@.baikal_dossiers
--     where dossier_id is null or statut is null or perimetre is null
--        or cree_le is null or est_test is null
--        or emails_envoyes is null or emails_ouverts is null or devise is null;

-- (2) Identifiant unique. Doit rendre zéro ligne.
--
--     select dossier_id, count(*) from @SCHEMA@.baikal_dossiers
--     group by 1 having count(*) > 1;

-- (3) Client payant = paye_le, jamais un slug. Si le funnel porte une étape
--     d'APRÈS-VENTE (envoye, abonne…), la déclarer `apres_paiement: true` dans
--     config.apps.funnel_etapes, sinon un client payant se lit non converti.
--     Doit rendre zéro ligne :
--
--     select dossier_id from @SCHEMA@.baikal_dossiers
--     where montant_ttc > 0 and paye_le is null;

-- (4) Catégorie de la personne, identique sur toutes ses lignes. Doit rendre
--     zéro ligne :
--
--     select email from @SCHEMA@.baikal_dossiers
--     where email is not null
--     group by email having count(distinct categorie) > 1;
--
--     Et aucune catégorie n'est une valeur par défaut déguisée en information
--     (comptes-pro-v1 §3 (4 bis)) : le rôle posé à l'inscription n'est pas une
--     catégorie choisie.

-- (5) Attribution : jamais `{}`, domaines en minuscules sans www. Doit rendre
--     zéro ligne :
--
--     select dossier_id, attribution from @SCHEMA@.baikal_dossiers
--     where attribution = '{}'::jsonb
--        or attribution ->> 'referrer_domaine' ~ '^www\.|[A-Z]';

-- (6) Chaque vue optionnelle joint sur dossier_id, et chaque dossier_id
--     qu'elle cite existe dans la liste. Doit rendre zéro, pour chaque vue
--     publiée :
--
--     select count(*) from @SCHEMA@.baikal_dossier_events v
--     where not exists (select 1 from @SCHEMA@.baikal_dossiers d
--                       where d.dossier_id = v.dossier_id);

-- (7) Les colonnes publiées sont celles du contrat, et rien d'autre : une
--     colonne hors contrat n'est pas rendue, mais elle trompe le prochain
--     lecteur de la vue. Relire la liste :
--
--     select table_name, column_name from information_schema.columns
--     where table_schema = '@SCHEMA@' and table_name like 'baikal_dossier%'
--     order by 1, ordinal_position;

-- (8) TOUTE TABLE SOURCE A SON GRANT ET SA POLICY baikal_read — le contrôle
--     dont le symptôme est muet : une table oubliée ne fait pas échouer la
--     vue, elle la sert amputée (trois tables chez MonsieurDPE le 23/09 :
--     revendications absentes, moitié des courriels manquants, aucune
--     erreur). Reprendre la requête de catalogue de mesures-v1 §3 (5) pour
--     CHAQUE vue publiée (`r.ev_class = '@SCHEMA@.baikal_dossier_events'`…),
--     et lire son avertissement : sur la base partagée, le rôle postgres a
--     BYPASSRLS, un grant manquant ne se voit qu'au déménagement vers un
--     projet dédié.

-- (9) Lecture sous le rôle de Baikal, pour chaque vue publiée :
--
--     set role baikal_reader;
--     select count(*) from @SCHEMA@.baikal_dossiers;
--     select count(*) from @SCHEMA@.baikal_dossier_events;
--     reset role;

-- (10) Accord avec les mesures. Le nombre de payés hors tests de la liste doit
--     être CELUI de la tuile du chapitre 'clients' (mesures-v1), sinon deux
--     écrans annoncent deux nombres :
--
--     select count(*) from @SCHEMA@.baikal_dossiers
--     where paye_le is not null and not est_test and supprime_le is null;

-- (11) La fiche d'un client réel, lue à la main : ouvrir /clients dans la
--     console, choisir un client actif, et vérifier que chaque onglet raconte
--     ce qu'il a fait, consulté, activé — sans un fait qui manque et sans une
--     ligne qu'on ne sait pas expliquer. C'est la seule recette que le SQL ne
--     passe pas à votre place.
