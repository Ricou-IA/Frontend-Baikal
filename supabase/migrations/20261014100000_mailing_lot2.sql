-- ---------------------------------------------------------------------------
-- Mailing lot 2 (spec docs/superpowers/specs/2026-10-14-baikal-mailing-lot2-design.md)
--
-- Entonnoir commun (population « audience », vue baikal_audience du site) et
-- campagnes continues.
-- ---------------------------------------------------------------------------

ALTER TABLE admin.mail_campagnes DROP CONSTRAINT IF EXISTS mail_campagnes_population_check;
ALTER TABLE admin.mail_campagnes ADD CONSTRAINT mail_campagnes_population_check
  CHECK (population IN ('audience', 'prospects', 'clients', 'comptes'));

ALTER TABLE admin.mail_campagnes
  -- Une campagne continue ne se termine jamais : chaque nouvel entrant de sa
  -- cible la recoit. Elle se suspend, a la main ou par le coupe-circuit.
  ADD COLUMN IF NOT EXISTS continue boolean NOT NULL DEFAULT false,
  -- Envois maximum par jour pour CETTE campagne, en plus du plafond du site.
  ADD COLUMN IF NOT EXISTS plafond_jour int CHECK (plafond_jour > 0),
  -- Campagne continue sans nouvel entrant : prochaine relecture de la cible.
  ADD COLUMN IF NOT EXISTS attente_jusqu_au timestamptz;
