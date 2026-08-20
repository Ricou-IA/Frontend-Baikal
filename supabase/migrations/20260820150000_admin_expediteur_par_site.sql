-- ---------------------------------------------------------------------------
-- Parametrage par site : l'expediteur des campagnes sort du code et entre dans
-- le registre. Regle de partage : les credentials mutualises de l'outil
-- (Resend, OAuth Google, secret de desinscription) restent des secrets Edge
-- Functions ; tout ce qui est propre au site vit dans config.apps et se gere
-- dans l'ecran de parametrage. Une cle d'environnement propre a un site reste
-- un secret : la table n'en porte que le nom (env_secret_ref).
-- ---------------------------------------------------------------------------

alter table config.apps add column if not exists expediteur_nom   text;
alter table config.apps add column if not exists expediteur_email text;
alter table config.apps add column if not exists reply_to         text;

comment on column config.apps.expediteur_email is
  'Adresse d''envoi des campagnes du site. Vide = envoi refuse pour ce site '
  '(le domaine doit etre verifie dans Resend avant de la renseigner).';

update config.apps set
  expediteur_nom   = 'Eric de MonsieurDPE',
  expediteur_email = 'eric@monsieurdpe.fr',
  reply_to         = 'eric.pudebat@confer-sas.fr'
where id = 'monsieurdpe';
