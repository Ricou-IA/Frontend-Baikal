-- ---------------------------------------------------------------------------
-- Les pannes déjà vues dans les contrats, injectées dans le site d'essai
-- conforme (site-conforme.sql). Chacune a la même signature : une vue
-- plausible mais fausse, jamais une erreur. Le moteur doit toutes les voir.
-- ---------------------------------------------------------------------------

-- (1) Une table source sans policy baikal_read (MonsieurDPE, 23/09/2026) :
--     la vue ne casse pas, elle sert zéro email à Baikal.
drop policy baikal_read on @SCHEMA@.email_logs;

-- (2) Un stock publié sans ses zéros : la jointure INTERNE au calendrier fige
--     la tuile à sa dernière valeur non nulle (mesures-v1 §1 b bis).
create or replace view @SCHEMA@.baikal_mesures
with (security_invoker = true) as
select
  (v.paye_le at time zone 'Europe/Paris')::date as jour,
  'achats'::text          as cle,
  'Achats'::text          as libelle,
  count(*)::numeric       as valeur,
  'somme'::text           as agregation,
  'nombre'::text          as format,
  'clients'::text         as chapitre,
  null::int               as fenetre_jours,
  'Ventes'::text          as groupe,
  null::text              as rendu,
  10                      as ordre
from @SCHEMA@.baikal_dossiers v
where v.paye_le is not null and v.est_test is not true and v.supprime_le is null
group by 1

union all

select
  j.jour::date,
  'dossiers_payes_distincts',
  'Dossiers payés',
  count(distinct v.dossier_id)::numeric,
  'dernier',
  'nombre',
  'clients',
  f.fenetre,
  'Ventes',
  null,
  20
from generate_series(
       (select min((paye_le at time zone 'Europe/Paris')::date) from @SCHEMA@.baikal_dossiers where paye_le is not null),
       current_date, interval '1 day'
     ) as j(jour)
cross join (values (2)) as f(fenetre)
join @SCHEMA@.baikal_dossiers v
  on (v.paye_le at time zone 'Europe/Paris')::date between j.jour::date - (f.fenetre - 1) and j.jour::date
 and v.est_test is not true and v.supprime_le is null
group by j.jour, f.fenetre;

-- (3) attribution {} : « capté, sans signal » au lieu de « inconnu ».
update @SCHEMA@.dossiers set attribution = '{}'::jsonb
where email in ('client1@exemple.fr', 'client5@exemple.fr');

-- (4) La catégorie change entre deux lignes d'une même personne : un second
--     dossier de la même adresse, cette fois sans compte pro.
insert into @SCHEMA@.dossiers (email, contact_name, funnel_slug, created_at, property_address)
values ('client6@exemple.fr', 'Client 6', 'lead', now(), '99 rue du Doublon, 31000 Toulouse');

-- (5) Un statut hors funnel.
update @SCHEMA@.dossiers set funnel_slug = 'archive' where email = 'client2@exemple.fr';

-- (6) Un montant sans paye_le : payé chez Stripe, non converti chez Baikal.
update @SCHEMA@.dossiers set paid_at = null where email = 'client3@exemple.fr';
