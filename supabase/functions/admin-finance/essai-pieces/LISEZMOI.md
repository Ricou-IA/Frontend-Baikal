# Essais de la migration des lignes de pièces de ventes

Exécutent pour de vrai `supabase/migrations/20261126200000_pieces_ventes_lignes.sql`
sur un Postgres JETABLE. Jamais sur une base de production : `00-decor.sql` crée
des schémas `admin` et `config`.

```bash
createdb pieces_essai
psql -v ON_ERROR_STOP=1 pieces_essai -f supabase/functions/admin-finance/essai-pieces/00-decor.sql
psql -v ON_ERROR_STOP=1 pieces_essai -f supabase/migrations/20261126200000_pieces_ventes_lignes.sql
psql -v ON_ERROR_STOP=1 pieces_essai -f supabase/migrations/20261126200000_pieces_ventes_lignes.sql   # rejouable
psql pieces_essai -f supabase/functions/admin-finance/essai-pieces/90-essais.sql
dropdb pieces_essai
```

La dernière commande rend une ligne par essai et un bilan : unicité d'une vente
par nature, garde croisée avec les factures individuelles, cascade à la
suppression d'un brouillon de pièce, droits.
