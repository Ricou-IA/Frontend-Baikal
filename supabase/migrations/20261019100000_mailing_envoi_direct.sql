-- Mailing lot 4 (spec 2026-10-19-baikal-mailing-lot4-envoi-direct) :
-- un envoi depuis une fiche est une campagne liste d'une adresse, marquee
-- direct pour etre repliee dans la liste des campagnes.
ALTER TABLE admin.mail_campagnes
  ADD COLUMN IF NOT EXISTS direct boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN admin.mail_campagnes.direct IS
  'Envoi direct depuis une fiche (lot 4) : campagne liste d''une adresse, lancee aussitot.';
