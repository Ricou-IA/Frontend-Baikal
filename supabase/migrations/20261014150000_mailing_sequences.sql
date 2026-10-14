-- ---------------------------------------------------------------------------
-- Mailing lot 3 : sequences (spec 2026-10-14-baikal-mailing-lot3-sequences-design.md)
--
-- Le mail 1 reste objet / corps_html ; les relances suivent dans `relances`
-- [{delai_jours, objet, corps_html}]. Une campagne avec au moins une relance
-- est une sequence, continue d'office. Le journal du site porte une ligne
-- par mail (module mailing-v1.1, colonne touche).
-- ---------------------------------------------------------------------------

ALTER TABLE admin.mail_campagnes
  ADD COLUMN IF NOT EXISTS relances jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(relances) = 'array' AND jsonb_array_length(relances) <= 5),
  -- N'envoyer que du lundi au vendredi, dans le fuseau du site (parite avec
  -- la prospection de pv-email-cron).
  ADD COLUMN IF NOT EXISTS jours_ouvres boolean NOT NULL DEFAULT false;
