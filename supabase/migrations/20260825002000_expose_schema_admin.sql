-- Le schema admin n'etait pas dans les schemas exposes de PostgREST :
-- toutes les actions admin-partenariats/admin-droits sur admin.* echouaient
-- avec "Invalid schema: admin" (latent depuis le 20/08, tables vides).
-- Au passage : perfec (produit supprime) retire de la liste ;
-- majordhome/pack_vendeur en etaient deja absents.
ALTER ROLE authenticator SET pgrst.db_schemas =
  'public, rag, core, sources, config, legifrance, invoicing, arpet, linktrack, karedas, duerp, dpe, admin';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
