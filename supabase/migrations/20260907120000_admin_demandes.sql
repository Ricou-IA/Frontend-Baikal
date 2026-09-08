-- Demandes d'accès déposées depuis la landing publique de Baikal (décision
-- d'Eric du 07/09/2026 : lancer le site et voir s'il y a des demandes).
--
-- Écrite par l'EF baikal-demande (verify_jwt off, service_role) ; lue dans
-- l'étage Baikal (/baikal?tab=demandes) par la même EF, super_admin seul.
-- Même régime que le reste du schéma admin : RLS forcée sans policy,
-- service_role uniquement. Donnée nominative (email) : rien n'est archivé
-- ailleurs, la ligne est la seule trace.

CREATE TABLE IF NOT EXISTS admin.demandes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  site        text,                     -- URL ou nom du SaaS du demandeur
  pile        text NOT NULL DEFAULT 'autre',  -- postgres_stripe | postgres | autre_base | autre
  message     text,
  origine     text,                     -- referrer ou utm, brut
  statut      text NOT NULL DEFAULT 'nouvelle'
              CHECK (statut IN ('nouvelle', 'contactee', 'branchee', 'ecartee')),
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demandes_cree_le_idx ON admin.demandes (cree_le DESC);
-- Une adresse ne dépose qu'une demande : la seconde est une mise à jour.
-- Index sur la colonne (pas sur lower(email)) : l'upsert PostgREST
-- on_conflict exige une contrainte unique de colonne ; l'EF met l'email
-- en minuscules avant d'écrire.
CREATE UNIQUE INDEX IF NOT EXISTS demandes_email_idx ON admin.demandes (email);

ALTER TABLE admin.demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.demandes FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.demandes TO service_role;

COMMENT ON TABLE admin.demandes IS
  'Demandes d''accès à Baikal déposées depuis la landing publique (EF baikal-demande).';
