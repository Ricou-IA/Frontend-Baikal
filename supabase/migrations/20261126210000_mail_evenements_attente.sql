-- Mailing : file des evenements Resend arrives avant que le journal du site
-- ne connaisse leur envoi.
--
-- Constat du 26/11/2026 : le worker marquait les resend_id d'un sous-lot a la
-- FIN du sous-lot (jusqu'a ~2 min apres le premier envoi). Les webhooks
-- `delivered` arrives entre-temps trouvaient un resend_id inconnu
-- (mail_evenement -> connu=false) ; le webhook repondait 200 et Resend ne les
-- rejouait pas : evenements perdus.
--
-- Le worker marque desormais chaque envoi des que Resend rend son id. Cette
-- file couvre le reste de la fenetre : un evenement TAGUE campagne Baikal
-- (tags app_id + campagne) dont le resend_id est encore inconnu est garde ici,
-- puis rejoue par le worker apres ses marquages, pendant 15 minutes. Au-dela,
-- il passe `expire` (jamais supprime : c'est la trace d'une perte).
-- Les evenements non tagues (transactionnels du site sur le meme compte
-- Resend) n'entrent jamais ici.
--
-- Vit chez Baikal (schema admin), pas chez le site : le contrat mailing-v1
-- (mail_marquer / mail_evenement) ne change pas, aucune migration de site.
-- AUCUNE donnee nominative : identifiants Resend et de campagne, type,
-- horodatage, detail du rebond. Rejouable sans effet.

CREATE TABLE IF NOT EXISTS admin.mail_evenements_attente (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       text NOT NULL REFERENCES config.apps(id),
  campagne_id  uuid NOT NULL,
  resend_id    text NOT NULL,
  type         text NOT NULL CHECK (type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained')),
  le           timestamptz NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut       text NOT NULL DEFAULT 'attente' CHECK (statut IN ('attente', 'rejoue', 'expire')),
  tentatives   integer NOT NULL DEFAULT 0,
  recu_le      timestamptz NOT NULL DEFAULT now(),
  traite_le    timestamptz,
  -- Resend peut livrer deux fois le meme evenement : une seule ligne. Les
  -- ouvertures et clics repetes d'un meme mail se distinguent par `le`.
  CONSTRAINT mail_evenements_attente_unique UNIQUE (resend_id, type, le)
);

CREATE INDEX IF NOT EXISTS mail_evenements_attente_file_idx
  ON admin.mail_evenements_attente (app_id, recu_le) WHERE statut = 'attente';

COMMENT ON TABLE admin.mail_evenements_attente IS
  'Evenements Resend tagues campagne arrives avant le marquage de leur envoi ; rejoues par admin-mailing-worker. Aucune donnee nominative.';

ALTER TABLE admin.mail_evenements_attente ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.mail_evenements_attente FORCE ROW LEVEL SECURITY;
REVOKE ALL ON admin.mail_evenements_attente FROM PUBLIC, anon, authenticated;
GRANT ALL ON admin.mail_evenements_attente TO service_role;

-- Verification apres application (lecture seule) :
--   SELECT to_regclass('admin.mail_evenements_attente');                    -- admin.mail_evenements_attente
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'admin.mail_evenements_attente'::regclass;                 -- t, t
--   SELECT has_table_privilege('anon', 'admin.mail_evenements_attente', 'SELECT'),
--          has_table_privilege('authenticated', 'admin.mail_evenements_attente', 'SELECT'); -- f, f
--   SELECT statut, count(*) FROM admin.mail_evenements_attente GROUP BY 1;   -- apres deploiement
