# PRODUCT.md - Baikal

register: product

## Product Purpose

Baikal est le back-office des SaaS de Confer, en cours de transformation en produit
(décision du 07/09/2026) : le back-office des fondateurs qui vibecodent un SaaS et
n'ont pas l'énergie du backend. Il lit les bases Postgres des sites (rôle lecture
seule), Stripe et la Search Console, et rend une console par site : Clients,
Finances, SEO, Rapports, Prospects, Partenariats, Utilisateurs, Paramétrage. Un
étage Baikal au-dessus des sites (super admin) gère les accès et le registre.
La landing publique vit sur withbaikal.io.

## Users

- Eric, fondateur solo, une douzaine de sites en portefeuille : usage quotidien,
  souvent en déplacement, au téléphone entre deux rendez-vous (« compagnon »).
  Il compare les chiffres à la source et challenge tout storytelling.
- Associés et partenaires délégués : lecture d'un site ou d'un module (finances
  d'un produit, rapport mensuel), rarement en écriture.
- Demain : fondateurs vibecodeurs francophones branchés en accès anticipé.

## Tone

Sobre, technique, français, libellés métier (« mots-clés », « longue traîne »,
« payé »), jamais de jargon décoratif. Peu d'écrans, zéro saisie inutile. Les
chiffres priment sur le texte ; les variations s'expriment en valeur quand le
pourcentage n'a pas de sens.

## Brand

Thème sombre unique (couleurs `baikal-*` dans tailwind.config.js) : fond
abyssal 0B0F17, surface 161B26, bordures 2D3748, accent cyan 00F0FF, texte
technique slate 94A3B8. JetBrains Mono pour les titres de section, libellés
techniques et données ; Inter pour le texte ; Playfair Display réservé à la
landing. Bordures plutôt qu'ombres, coins peu arrondis.

## Anti-references

- Les tableaux de bord « hero metric » à gradient et les grilles de cartes
  identiques.
- Les admin panels CRUD génériques (Supabase Studio, Forest Admin) : Baikal
  montre des événements commerciaux et des rapprochements, pas des tables.
- Toute rubrique ou saisie supplémentaire livrée sans demande d'Eric.

## Strategic principles

- Le site déclare ses capacités (présence des vues et colonnes) ; la console
  ne montre que ce qui existe et ne tombe jamais en erreur sur ce qui manque.
- Lecture en direct dans les bases, jamais de copie nominative dans `admin`.
- Parité chiffre à chiffre avec les back-offices existants avant tout redesign.
- Mobile d'abord pour la consultation (listes, KPI, fiche, statuts) ; les
  actions lourdes (imports, campagnes, PDF) restent confortables sur bureau
  mais doivent rester accessibles au téléphone.
