-- Retrait de la console des sites qui n'ont rien à y administrer (Eric, 25/10/2026) :
-- ni organisation, ni contrat publié, ni domaine. Même mécanique que zelty :
-- is_active = false les sort du sélecteur, des droits et des crons SEO.
-- Réversible : repasser is_active à true.
UPDATE config.apps
SET is_active = false
WHERE id IN ('linktrack', 'cosette', 'legifrance', 'snapstudio', 'karedas');
