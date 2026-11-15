# Rapport de recette — site d'essai (Lot 1)

Produit le 15/11/2026 par `supabase/functions/_shared/recette/essai/jouer.ts` sur un Postgres local jetable : un site façon Pack vendeur, conforme, puis le même avec six pannes injectées. Données inventées.

---

**Site d'essai conforme**

## Recette Baikal — schéma `recette_essai`, lu sous `baikal_reader`

Niveau 1 : 17 conformes sur 17 — passé
Niveau 2 : 12 conformes sur 12 — passé

### Conformes

- Le rôle baikal_reader existe
- baikal_dossiers : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_dossiers : chaque table source a son grant et sa policy pour baikal_reader
- baikal_dossiers : la lecture passe sous le rôle baikal_reader
- Le noyau est complet
- Chaque dossier_id est unique
- Le périmètre vaut b2c ou b2b
- Un montant payé a toujours sa date de paiement
- Chaque statut est une étape du funnel déclaré
- La catégorie est celle de la personne, identique sur toutes ses lignes
- L'attribution n'est jamais {} et ses domaines sont normalisés
- baikal_dossier_emails : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_dossier_emails : chaque table source a son grant et sa policy pour baikal_reader
- baikal_dossier_emails : la lecture passe sous le rôle baikal_reader
- baikal_dossier_emails : chaque dossier_id cité existe dans baikal_dossiers
- baikal_dossier_events : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_dossier_events : chaque table source a son grant et sa policy pour baikal_reader
- baikal_dossier_events : la lecture passe sous le rôle baikal_reader
- baikal_dossier_events : chaque dossier_id cité existe dans baikal_dossiers
- baikal_mesures : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_mesures : chaque table source a son grant et sa policy pour baikal_reader
- baikal_mesures : la lecture passe sous le rôle baikal_reader
- Aucun doublon par jour, clé et fenêtre
- Seul un stock porte une fenêtre
- Agrégation, format et chapitre sont dans le vocabulaire
- Le rendu vaut tuiles ou entonnoir
- Toutes les mesures d'un groupe déclarent le même rendu
- Aucune ligne incomplète
- Un stock publie une ligne par jour, zéros compris

### Non publiés (optionnels)

- baikal_dossier_champs — Vue non publiée. Onglet Vue de la fiche : les sections et champs déclarés par le site.
- baikal_dossier_documents — Vue non publiée. Onglet Documents : ce que le client a déposé.
- baikal_dossier_resultats — Vue non publiée. Onglet Résultat : ce que le client a obtenu.
- baikal_dossier_messages — Vue non publiée. Onglet Chat : les échanges avec le client.
- baikal_dossier_ia — Vue non publiée. Onglet Logs IA : les appels IA rattachés au dossier.
- baikal_dossier_donnees — Vue non publiée. Onglet Données : le brut, par blocs.
- La catégorie d'une personne est la même dans Clients et dans Comptes — Vue baikal_comptes_pro non publiée : rien à accorder.


---

**Le même site, pannes injectées**

## Recette Baikal — schéma `recette_essai`, lu sous `baikal_reader`

Niveau 1 : 12 conformes sur 17, 5 à corriger — à reprendre
Niveau 2 : 9 conformes sur 12, 3 à corriger — à reprendre

### À corriger — niveau 1

### baikal_dossiers : chaque table source a son grant et sa policy pour baikal_reader

`acces.baikal_dossiers` · mesures-v1 §3 (5) · 1 ligne(s) en cause

Ce que vous verriez de faux : Une table source sans grant ou sans policy ne fait pas échouer la vue : elle la sert AMPUTÉE. Baikal lit moins de lignes que vous, sans une erreur.

Correction : Pour chaque source rendue : grant select on <source> to baikal_reader; create policy baikal_read on <source> for select to baikal_reader using (true);

Exemples :
- {"source":"recette_essai.email_logs","grant_ok":true,"policy_ok":false}

#### Un montant payé a toujours sa date de paiement

`dossiers.montant_sans_paiement` · §4 (3) · 1 ligne(s) en cause

Ce que vous verriez de faux : Ces clients ont payé mais se lisent non convertis : Baikal compte un client payant à paye_le, jamais au statut.

Correction : Renseigner paye_le pour toute ligne encaissée (date du paiement Stripe, ou de la commande payée).

Exemples :
- {"dossier_id":"e74e147b-fd9b-418f-a325-9b21f7efe75e","montant_ttc":"49.00","statut":"paye"}

### Chaque statut est une étape du funnel déclaré

`dossiers.statut_funnel` · §1 noyau · 1 ligne(s) en cause

Ce que vous verriez de faux : Ces statuts ne sont pas des étapes du funnel : la liste les affiche en badge brut et le filtre de statut ne les propose pas.

Correction : Soit ramener la valeur à une étape du funnel, soit ajouter l'étape au funnel déclaré.

Exemples :
- {"statut":"archive","lignes":1}

### baikal_mesures : chaque table source a son grant et sa policy pour baikal_reader

`acces.baikal_mesures` · mesures-v1 §3 (5) · 1 ligne(s) en cause

Ce que vous verriez de faux : Une table source sans grant ou sans policy ne fait pas échouer la vue : elle la sert AMPUTÉE. Baikal lit moins de lignes que vous, sans une erreur.

Correction : Pour chaque source rendue : grant select on <source> to baikal_reader; create policy baikal_read on <source> for select to baikal_reader using (true);

Exemples :
- {"source":"recette_essai.email_logs","grant_ok":true,"policy_ok":false}

#### Un stock publie une ligne par jour, zéros compris

`mesures.stock_continu` · §3 (6) et §1 (b bis) · 1 ligne(s) en cause

Ce que vous verriez de faux : Un jour sans ligne se lit « pas mesuré » : la tuile garde la dernière valeur non nulle, une fenêtre glissante qui ne redescend jamais, un abonné résilié qui reste compté.

Correction : Joindre le calendrier (generate_series) en jointure EXTERNE et publier coalesce(..., 0) chaque jour depuis la première mesure. Seul un cumul qui ne décroît jamais, sans fenêtre, est dispensé de ses zéros.

Exemples :
- {"cle":"dossiers_payes_distincts","fenetre_jours":2,"jours_publies":6,"jours_attendus":8}

### À corriger — niveau 2

#### La catégorie est celle de la personne, identique sur toutes ses lignes

`dossiers.categorie_stable` · §4 (4) · 1 ligne(s) en cause

Ce que vous verriez de faux : La même personne apparaît dans deux catégories : la répartition par catégorie la compte deux fois, et le filtre la montre sous l'une ou l'autre selon la ligne.

Correction : Calculer la catégorie une fois par adresse (sous-requête ou vue intermédiaire par email) et la joindre à chaque ligne.

Exemples :
- {"email":"c***@exemple.fr","categories":2}

#### L'attribution n'est jamais {} et ses domaines sont normalisés

`dossiers.attribution_jamais_vide` · §4 (5) · 2 ligne(s) en cause

Ce que vous verriez de faux : Un objet vide se lit « capté, sans signal » au lieu de « inconnu », et un domaine en www. ou en majuscules crée un faux canal : le tableau des origines ment, sans erreur.

Correction : Publier NULL quand l'origine est inconnue (nullif(attribution, '{}'::jsonb)), et le domaine en minuscules sans www.

Exemples :
- {"dossier_id":"419c5921-6b13-4d38-935e-e382e061cda4","attribution":"{}"}
- {"dossier_id":"2aa17ad9-cc63-4f8d-9f3e-ae5851f9c10f","attribution":"{}"}

### baikal_dossier_emails : chaque table source a son grant et sa policy pour baikal_reader

`acces.baikal_dossier_emails` · mesures-v1 §3 (5) · 1 ligne(s) en cause

Ce que vous verriez de faux : Une table source sans grant ou sans policy ne fait pas échouer la vue : elle la sert AMPUTÉE. Baikal lit moins de lignes que vous, sans une erreur.

Correction : Pour chaque source rendue : grant select on <source> to baikal_reader; create policy baikal_read on <source> for select to baikal_reader using (true);

Exemples :
- {"source":"recette_essai.email_logs","grant_ok":true,"policy_ok":false}

### Conformes

- Le rôle baikal_reader existe
- baikal_dossiers : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_dossiers : la lecture passe sous le rôle baikal_reader
- Le noyau est complet
- Chaque dossier_id est unique
- Le périmètre vaut b2c ou b2b
- baikal_dossier_emails : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_dossier_emails : la lecture passe sous le rôle baikal_reader
- baikal_dossier_emails : chaque dossier_id cité existe dans baikal_dossiers
- baikal_dossier_events : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_dossier_events : chaque table source a son grant et sa policy pour baikal_reader
- baikal_dossier_events : la lecture passe sous le rôle baikal_reader
- baikal_dossier_events : chaque dossier_id cité existe dans baikal_dossiers
- baikal_mesures : la vue est publiée, ses colonnes et leurs types sont ceux du contrat
- baikal_mesures : la lecture passe sous le rôle baikal_reader
- Aucun doublon par jour, clé et fenêtre
- Seul un stock porte une fenêtre
- Agrégation, format et chapitre sont dans le vocabulaire
- Le rendu vaut tuiles ou entonnoir
- Toutes les mesures d'un groupe déclarent le même rendu
- Aucune ligne incomplète

### Non publiés (optionnels)

- baikal_dossier_champs — Vue non publiée. Onglet Vue de la fiche : les sections et champs déclarés par le site.
- baikal_dossier_documents — Vue non publiée. Onglet Documents : ce que le client a déposé.
- baikal_dossier_resultats — Vue non publiée. Onglet Résultat : ce que le client a obtenu.
- baikal_dossier_messages — Vue non publiée. Onglet Chat : les échanges avec le client.
- baikal_dossier_ia — Vue non publiée. Onglet Logs IA : les appels IA rattachés au dossier.
- baikal_dossier_donnees — Vue non publiée. Onglet Données : le brut, par blocs.
- La catégorie d'une personne est la même dans Clients et dans Comptes — Vue baikal_comptes_pro non publiée : rien à accorder.

