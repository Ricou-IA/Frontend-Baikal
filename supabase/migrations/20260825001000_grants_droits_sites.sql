-- Oubli de la migration droits_sites : sans grant, meme service_role ne peut
-- pas lire la table (PostgREST refusait avec permission denied).
GRANT ALL ON admin.droits_sites TO service_role;
