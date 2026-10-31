-- Nom public d'un site : la marque que lit le destinataire d'un mail de
-- campagne (pied, variable {{site}}). name reste le nom de la console
-- (« Pack Vendeur ») ; expediteur_nom peut etre une personne (« Eric de
-- MonsieurDPE »). NULL = name. Modifiable dans Parametrage (/sites).
ALTER TABLE config.apps
  ADD COLUMN IF NOT EXISTS nom_public text;

COMMENT ON COLUMN config.apps.nom_public IS
  'Nom lu par le destinataire des mails (pied, {{site}}) ; NULL = name.';
