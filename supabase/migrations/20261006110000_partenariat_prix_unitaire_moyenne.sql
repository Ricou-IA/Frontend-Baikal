-- Partenariat IA MEDIA : la franchise de 15 ventes est un compteur, pas un
-- rang chronologique (Eric, 06/10/2026 : « en dessous de 15 ventes on ne
-- partage rien, au-dessus on partage mais je garde une franchise de 15
-- ventes »). Le mode « reel » prenait le HT des ventes au-dela de la 15e
-- dans l'ordre des paiements : avec des ventes de prix differents (PED a
-- 20,82 EUR HT, pack de credits a 99 EUR HT), la place du pack dans le mois
-- changeait le partage de 78 EUR. Le mode « moyenne » retire 15 ventes au prix
-- moyen du mois : CA partageable = (nettes - 15) x (CA HT / nettes), soit le
-- meme ratio que l'imputation des Couts Directs (art. 7.2).
--
-- Septembre 2026 : CA partageable 239,47 EUR (286,38 en « reel »), quote-part
-- 74,52 EUR. Appliquee en prod via MCP apply_migration.
UPDATE admin.partenariats
   SET prix_unitaire = 'moyenne'
 WHERE app_id = 'pack-vendeur' AND partenaire = 'IA MEDIA';
