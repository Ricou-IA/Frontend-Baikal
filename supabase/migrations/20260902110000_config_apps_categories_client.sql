-- Module Clients : catégories de client par site (décision Eric, 02/09/2026).
-- La console remplace la colonne « Type » (B2C/B2B) par une « Catégorie »
-- propre à chaque site. Même mécanique que funnel_etapes : la vue
-- baikal_dossiers du site expose un slug dans la colonne optionnelle
-- `categorie`, le registre porte libellé et couleur. Site sans colonne
-- `categorie` -> la console retombe sur B2C/B2B (règle de présence).
--
-- Forme : [{slug, libelle, couleur}], couleur ∈ slate|blue|amber|emerald|red|violet.

alter table config.apps
  add column if not exists categories_client jsonb;

comment on column config.apps.categories_client is
  'Catégories de client du site (module Clients) : [{slug, libelle, couleur}]. '
  'Les slugs sont ceux de la colonne categorie de la vue baikal_dossiers du site. '
  'NULL = pas de catégories, la console affiche B2C/B2B.';

update config.apps set categories_client = '[
  {"slug": "particulier",    "libelle": "Particulier",    "couleur": "slate"},
  {"slug": "agent_immo",     "libelle": "Agent immo",     "couleur": "blue"},
  {"slug": "diagnostiqueur", "libelle": "Diagnostiqueur", "couleur": "violet"},
  {"slug": "entreprise_rge", "libelle": "Entreprise RGE", "couleur": "amber"}
]'::jsonb where id = 'monsieurdpe';

update config.apps set categories_client = '[
  {"slug": "particulier", "libelle": "Particulier", "couleur": "slate"},
  {"slug": "pro",         "libelle": "Pro",         "couleur": "blue"}
]'::jsonb where id = 'pack-vendeur';

update config.apps set categories_client = '[
  {"slug": "particulier", "libelle": "Particulier", "couleur": "slate"},
  {"slug": "entreprise",  "libelle": "Entreprise",  "couleur": "blue"}
]'::jsonb where id = 'voirie';
