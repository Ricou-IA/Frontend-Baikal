-- ---------------------------------------------------------------------------
-- MonsieurDPE : la catégorie « Inscrit, sans fiche » au registre
--
-- Découverte d'Eric devant la liste Clients : un compte d'un cabinet de
-- diagnostic s'affichait « Particulier ». Le rôle `particulier` est celui que
-- l'inscription POSE PAR DÉFAUT chez MonsieurDPE, et il n'est promu qu'à la
-- validation d'une revendication de fiche. Un compte qui s'arrête avant reste
-- donc étiqueté particulier à vie : six comptes dans ce cas, dont quatre
-- cabinets identifiables à leur domaine.
--
-- Le site a corrigé ses vues (elles portent désormais le slug
-- `inscrit_sans_fiche` dans baikal_comptes_pro et baikal_dossiers). Sans la
-- déclaration correspondante ici, la console afficherait le slug brut dans un
-- badge neutre, faute de libellé et de couleur.
--
-- La couleur : les six du vocabulaire étaient prises chez ce site, et il ne
-- restait qu'emerald, qui se lit « réussi », et red, qui se lit « problème ».
-- Un compte inscrit sans fiche n'est ni l'un ni l'autre, c'est une occasion
-- commerciale. D'où `sky`, ajouté au vocabulaire des badges.
-- ---------------------------------------------------------------------------

UPDATE config.apps
   SET categories_client = categories_client || jsonb_build_array(
         jsonb_build_object(
           'slug', 'inscrit_sans_fiche',
           'libelle', 'Inscrit, sans fiche',
           'couleur', 'sky'
         ))
 WHERE id = 'monsieurdpe'
   AND NOT (categories_client @> '[{"slug": "inscrit_sans_fiche"}]'::jsonb);
