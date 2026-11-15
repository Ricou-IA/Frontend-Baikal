-- « Tester mon site » (plan docs/superpowers/plans/2026-11-15-tester-mon-site.md,
-- lot 3) : le résultat d'un test public de la page /tester, retrouvé par un
-- lien privé pendant 30 jours.
--
-- Écrite et lue par l'EF baikal-test (verify_jwt off, service_role). Le jeton
-- EST le droit de relire : 128 bits tirés au hasard, jamais devinables.
--
-- Ce que la ligne ne porte JAMAIS : la connexion du prospect, son hôte en
-- clair, une adresse IP, un email. `hote_empreinte` est un HMAC de
-- hôte:port/base, salé par un secret du projet : il dit que deux tests visent
-- la même base, sans dire laquelle. `diagnostic` porte des noms de tables et
-- de colonnes ; `resultat` porte trois exemples au plus par contrôle, emails
-- masqués par le moteur (_shared/recette/masquage.ts).

CREATE TABLE IF NOT EXISTS admin.tests_site (
  jeton           text PRIMARY KEY CHECK (jeton ~ '^[0-9a-f]{32}$'),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  teste_le        timestamptz,              -- dernier passage de la recette ; NULL = diagnostic seul
  expire_le       timestamptz NOT NULL DEFAULT now() + interval '30 days',
  hote_empreinte  text NOT NULL,
  diagnostic      jsonb,                    -- « ce que Baikal voit dans votre base »
  resultat        jsonb,                    -- le dernier rapport de recette
  niveau1_pret    boolean,                  -- NULL tant qu'aucune recette n'a tourné
  tests           integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tests_site_expire_le_idx ON admin.tests_site (expire_le);

-- Même régime que le reste du schéma admin : RLS forcée, service_role pour
-- écrire. Et, comme toute table de Baikal, le grant ET la policy baikal_read :
-- c'est ce qui permettra à Baikal de publier ses propres mesures du parcours
-- (nombre de tests, taux de réussite) sans trou le jour d'un déménagement.
ALTER TABLE admin.tests_site ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.tests_site FORCE ROW LEVEL SECURITY;
GRANT ALL ON admin.tests_site TO service_role;
GRANT SELECT ON admin.tests_site TO baikal_reader;

DROP POLICY IF EXISTS baikal_read ON admin.tests_site;
CREATE POLICY baikal_read ON admin.tests_site FOR SELECT TO baikal_reader USING (true);

COMMENT ON TABLE admin.tests_site IS
  'Résultats des tests publics de /tester (EF baikal-test). Jeton = lien privé, 30 jours. '
  'Jamais la connexion ni l''hôte en clair : une empreinte seulement.';
