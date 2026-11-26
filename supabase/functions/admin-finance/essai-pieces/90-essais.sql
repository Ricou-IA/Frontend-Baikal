-- Essais de la migration 20261126200000 (lignes de pièces), pour de vrai.
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

create temp table bilan (n serial, essai text, ok boolean, detail text);
create or replace function pg_temp.refuse(p_sql text, p_motif text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'PAS DE REFUS';
exception when others then
  return case when sqlerrm like p_motif then 'refusé' else 'AUTRE ERREUR : ' || sqlerrm end;
end $$;

insert into admin.pieces_ventes (id, app_id, du, au, pennylane_invoice_id, montant_ttc, nb_ventes) values
  ('00000000-0000-4000-8000-00000000000a', 'site-a', '2026-03-01', '2026-10-31', 1, 20, 2),
  ('00000000-0000-4000-8000-00000000000b', 'site-a', '2026-11-01', '2026-11-30', 2, 10, 1);
insert into admin.factures (app_id, stripe_payment_intent_id, statut, numero, cree_le) values
  ('site-a', 'pi_facturee', 'emise', 'F-TEST-1', now() - interval '1 day'),
  ('site-a', 'pi_brouillon', 'brouillon', null, now() - interval '1 day'),
  ('site-a', 'pi_apres', 'emise', 'F-TEST-2', now() + interval '1 day');

insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc) values
  ('00000000-0000-4000-8000-00000000000a', 'site-a', 'pi_1', 'vente', 10),
  ('00000000-0000-4000-8000-00000000000a', 'site-a', 'pi_2', 'vente', 10);
insert into bilan (essai, ok, detail) values ('deux ventes rattachées à la première pièce',
  (select count(*) = 2 from admin.pieces_ventes_lignes), null);

insert into bilan (essai, ok, detail)
select 'la même vente dans une seconde pièce est refusée', r = 'refusé', r from (select pg_temp.refuse(
  $q$insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
     values ('00000000-0000-4000-8000-00000000000b', 'site-a', 'pi_1', 'vente', 10)$q$, '%pieces_ventes_lignes_unique%') r) x;

insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
  values ('00000000-0000-4000-8000-00000000000b', 'site-a', 'pi_1', 'remboursement', -10);
insert into bilan (essai, ok, detail) values ('son remboursement entre dans une autre pièce, une fois',
  (select count(*) = 1 from admin.pieces_ventes_lignes where nature = 'remboursement'), null);
insert into bilan (essai, ok, detail)
select 'le même remboursement deux fois est refusé', r = 'refusé', r from (select pg_temp.refuse(
  $q$insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
     values ('00000000-0000-4000-8000-00000000000a', 'site-a', 'pi_1', 'remboursement', -10)$q$, '%pieces_ventes_lignes_unique%') r) x;

insert into bilan (essai, ok, detail)
select 'une vente facturée seule (émise) ne rejoint pas une pièce', r = 'refusé', r from (select pg_temp.refuse(
  $q$insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
     values ('00000000-0000-4000-8000-00000000000b', 'site-a', 'pi_facturee', 'vente', 10)$q$, '%deja facturee individuellement%') r) x;
insert into bilan (essai, ok, detail)
select 'une vente au brouillon de facture ne rejoint pas une pièce', r = 'refusé', r from (select pg_temp.refuse(
  $q$insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
     values ('00000000-0000-4000-8000-00000000000b', 'site-a', 'pi_brouillon', 'vente', 10)$q$, '%deja facturee individuellement%') r) x;
insert into bilan (essai, ok, detail)
select 'un retrait sans facture émise est refusé', r = 'refusé', r from (select pg_temp.refuse(
  $q$insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
     values ('00000000-0000-4000-8000-00000000000b', 'site-a', 'pi_2', 'retrait_facture', -10)$q$, '%sans facture individuelle emise%') r) x;

insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
  values ('00000000-0000-4000-8000-00000000000b', 'site-a', 'pi_facturee', 'retrait_facture', -10);
insert into bilan (essai, ok, detail) values ('un retrait avec facture émise passe',
  (select count(*) = 1 from admin.pieces_ventes_lignes where nature = 'retrait_facture'), null);

insert into admin.pieces_ventes_lignes (piece_id, app_id, stripe_payment_intent_id, nature, montant_ttc)
  values ('00000000-0000-4000-8000-00000000000a', 'site-a', 'pi_apres', 'vente', 10);
insert into bilan (essai, ok, detail) values ('une vente facturée seule APRÈS sa pièce y reste rattachable (règle du retrait)',
  (select count(*) = 1 from admin.pieces_ventes_lignes where stripe_payment_intent_id = 'pi_apres'), null);

delete from admin.pieces_ventes where id = '00000000-0000-4000-8000-00000000000b';
insert into bilan (essai, ok, detail) values ('supprimer un brouillon de pièce libère ses lignes',
  (select count(*) = 3 from admin.pieces_ventes_lignes), null);

insert into bilan (essai, ok, detail) values ('anon et authenticated ne lisent pas les lignes',
  not has_table_privilege('anon', 'admin.pieces_ventes_lignes', 'SELECT')
  and not has_table_privilege('authenticated', 'admin.pieces_ventes_lignes', 'SELECT'), null);
insert into bilan (essai, ok, detail) values ('RLS activée et forcée',
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'admin.pieces_ventes_lignes'::regclass), null);

select n || '. ' || case when ok then 'OK   ' else 'ÉCHEC' end || ' ' || essai || coalesce(' (' || detail || ')', '') from bilan order by n;
select 'Bilan : ' || count(*) filter (where ok) || ' sur ' || count(*) from bilan;
