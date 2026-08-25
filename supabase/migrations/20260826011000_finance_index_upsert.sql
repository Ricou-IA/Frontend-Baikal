-- L'upsert PostgREST (on_conflict=stripe_payment_intent_id) ne sait pas viser
-- un index partiel : il lui faut un index unique total. Les NULL multiples
-- restent autorises (NULLS DISTINCT par defaut), donc les ventes B2B sans
-- payment_intent ne se genent pas entre elles.
DROP INDEX IF EXISTS admin.ventes_pi_uidx;
CREATE UNIQUE INDEX ventes_pi_uidx ON admin.ventes (stripe_payment_intent_id);
