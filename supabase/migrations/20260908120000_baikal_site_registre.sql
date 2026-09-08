-- Baikal entre au registre des sites (décision d'Eric du 08/09/2026).
--
-- Règle : utilisateur = client, un compte appartient à celui qui le vend.
-- Baikal est un produit comme les autres : une landing (withbaikal.io) à
-- suivre en SEO, des demandes qui sont ses prospects, des clients (les
-- comptes qui administrent des sites depuis la console) et demain du Stripe.
-- Ce sont les modules d'un site. L'étage Baikal (/baikal) reste à part pour
-- le transversal : accès par site, super admins, registre, métiers, et demain
-- les locataires.
--
-- Effet immédiat : core.profiles.app_id = 'baikal' devient légal (FK
-- config.apps) — c'est ce qui marque un compte créé depuis l'onglet Comptes
-- comme client de Baikal tant qu'il n'a ni accès délégué ni statut super
-- admin. gsc_propriete reste NULL : à renseigner dans Paramétrage une fois la
-- propriété Search Console vérifiée ; le module SEO s'ouvre alors seul.
-- Aucune vue baikal_dossiers : le module Clients reste fermé jusqu'à l'étage
-- locataire.
insert into config.apps (id, name, description, icon, color, is_active, sort_order,
                         domaine, db_schema, modele_comptes)
values ('baikal', 'Baikal', 'Le back-office des fondateurs qui vibecodent',
        'shield', '#22d3ee', false, 0, 'withbaikal.io', 'admin', 'clients')
on conflict (id) do nothing;

-- Insertion inactive puis activation : historiquement le trigger
-- tr_create_documents_cles_on_app_insert cassait toute insertion active.
update config.apps set is_active = true, updated_at = now() where id = 'baikal';
