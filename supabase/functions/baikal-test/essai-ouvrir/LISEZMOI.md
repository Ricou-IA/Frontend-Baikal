# Essais de la migration « ouvrir mon site »

Exécutent pour de vrai `supabase/migrations/20261116110000_ouvrir_mon_site.sql`
sur un Postgres JETABLE, avec un coffre factice aux mêmes signatures que Vault.
Jamais sur une base de production : `00-decor.sql` crée des schémas `admin`,
`config`, `auth`, `vault` et `cron`.

```bash
createdb ouvrir_essai
psql -v ON_ERROR_STOP=1 ouvrir_essai -f supabase/functions/baikal-test/essai-ouvrir/00-decor.sql
psql -v ON_ERROR_STOP=1 ouvrir_essai -f supabase/migrations/20261115100000_tests_site.sql
psql -v ON_ERROR_STOP=1 ouvrir_essai -f supabase/migrations/20261115100100_tests_site_purge.sql
psql -v ON_ERROR_STOP=1 ouvrir_essai -f supabase/migrations/20261116110000_ouvrir_mon_site.sql
psql ouvrir_essai -f supabase/functions/baikal-test/essai-ouvrir/90-essais.sql
```

La dernière commande rend une ligne par essai et un bilan (21 sur 21 le
16/11/2026) : refus de `garder` et d'`ouvrir`, ouverture d'un site, lien qui ne
s'ouvre qu'une fois, fonctions réservées au `service_role`, purge.
