# Contrat Membres v1 : les comptes d'un site vivent chez le site

Conception du 20/11/2026, arbitrée par Eric. Le contrat s'installe chez chaque
site en modèle « organisations » qui a sa propre base ; Majord'home est la
première installation.

## 1. Le constat

Le 20/11/2026, Eric crée un compte de démonstration depuis la page Utilisateurs
de Baikal, site Majord'home sélectionné, dans l'organisation d'un client. La
console répond « créé ». La connexion à Majord'home échoue : « Invalid login
credentials ».

Le mot de passe n'y est pour rien. Le compte a été créé dans l'authentification
de Baikal, alors que Majord'home s'authentifie sur sa propre base depuis qu'il
en a une. La création a semblé réussir parce que Baikal garde, de l'époque de
la base commune, une copie des organisations et des profils de Majord'home.
Cette copie n'est plus alimentée :

- un membre créé depuis Majord'home n'apparaît pas dans Baikal ;
- un compte créé depuis Baikal n'existe pas chez Majord'home ;
- une même adresse a deux comptes, deux mots de passe, deux dates de dernière
  connexion.

La page Utilisateurs est le seul module de la console dans ce cas. Clients,
Comptes, Mesures lisent les vues du site ; Modules clients, Prospects et
Mailing écrivent par le relais du site. Elle, elle lit `core.profiles` de
Baikal et écrit par les EF et RPC de Baikal (`create-user`, `delete-user`,
`admin-comptes` en périmètre site, `assign_user_to_org`, `update_user_role`,
`remove_user_from_org`). C'est juste tant que le site partage la base de
Baikal (ARPET), faux dès qu'il en sort.

Eric, 20/11/2026 : « l'objectif de Baikal c'est d'être l'administration de nos
sites. L'objectif c'est d'avoir une base de vérité pour les auth et surtout de
ne pas refaire dix fois le travail sur les différentes applications. »

## 2. Intention

**Une seule vérité par site : son authentification.** Baikal administre les
membres d'un site sans jamais en tenir une copie. Il demande au site la liste,
il demande au site de créer, de bloquer, de changer un mot de passe ; le site
exécute avec ses propres règles et répond.

**Le travail se fait une fois de chaque côté.** Côté Baikal, une page et une
EF, les mêmes pour tous les sites. Côté site, un jeu d'actions ajouté à son EF
d'administration, écrit par son propre agent à partir du passe-plat de
référence.

### Objectifs

- Un compte créé depuis Baikal pour un site se connecte à ce site, tout de
  suite, avec le mot de passe affiché.
- La page Utilisateurs montre les membres réels du site, y compris ceux créés
  depuis le site lui-même.
- Brancher un nouveau site en modèle « organisations » = installer le contrat
  chez lui et remplir `env_admin_fn`. Aucun code Baikal.
- L'erreur du 20/11 devient impossible : Baikal refuse d'écrire dans sa propre
  authentification pour un site qui a sa base.

### Non-objectifs

- Pas d'authentification unique entre les sites. Chaque site garde ses comptes,
  ses sessions, sa page de connexion.
- Pas de synchronisation, ni de copie rafraîchie. Une copie est ce qui a causé
  le problème.
- Les sites en modèle « clients » ne sont pas concernés : leurs comptes sont
  déjà lus chez eux (pages Clients et Comptes).
- L'étage Baikal (`/baikal?tab=comptes`) ne change pas : les comptes de ceux
  qui administrent depuis la console restent dans l'authentification de Baikal.

### Anti-objectifs, ce qui ferait de ce contrat un échec

- **Un compte créé au mauvais endroit, avec un message de succès.** Tant qu'un
  chemin d'écriture local reste ouvert pour un site sur base dédiée, le contrat
  n'a rien réglé.
- **Un membre d'un autre produit dans la liste.** La base d'un site peut
  contenir des comptes hérités de l'ancienne base commune. Le site ne publie
  que les membres de ses organisations.
- **Un mot de passe dans un journal**, chez Baikal ou chez le site.

## 3. La règle

| Le site… | Lecture des membres | Écriture |
|---|---|---|
| partage la base de Baikal (`heberge_dedie = false`) | `core.profiles`, comme aujourd'hui | EF et RPC de Baikal, comme aujourd'hui |
| a sa base et publie le contrat | relais `env_admin_fn` | relais `env_admin_fn` |
| a sa base, sans le contrat | page fermée, avec le motif | refusée |

Lecture comme écriture passent par le relais, pas par une vue lue en
`baikal_reader` : l'état d'un compte (bloqué, dernière connexion) vit dans le
schéma d'authentification du site, que le rôle de lecture ne doit pas voir.

Le site d'un org_admin est son outil : il gère son équipe chez le site. Pour un
site sur base dédiée, la page Utilisateurs de Baikal n'est donc ouverte qu'aux
super admins et aux admins délégués qui ont le module `users`. C'est la règle
« utilisateur = client » du 08/09/2026, appliquée jusqu'au bout.

## 4. Le contrat côté site

Canal existant : l'EF nommée par `env_admin_fn`, anon key publique pour la
passerelle, secret partagé `X-Baikal-Key`. Aucune colonne nouvelle au registre.

La capacité se lit à la présence : Baikal appelle `manifeste` ; si la réponse
porte un bloc `membres`, le contrat est installé.

```json
{
  "membres": {
    "version": 1,
    "actions": ["membres", "membre-creer", "membre-role", "membre-mot-de-passe",
                "membre-lien", "membre-renommer", "membre-email", "membre-bloquer"],
    "roles": [{ "slug": "org_admin", "libelle": "Administrateur" },
              { "slug": "user", "libelle": "Membre" }]
  }
}
```

Le site déclare ses rôles : Baikal n'en connaît aucun d'avance et n'en propose
aucun autre. Une action absente de la liste n'a pas de bouton.

| Action | Corps | Réponse |
|---|---|---|
| `membres` | `{org_id?}` | `{organisations: [{id, nom}], membres: [{id, email, nom, org_id, role, cree_le, derniere_connexion, bloque}]}` |
| `membre-creer` | `{email, mot_de_passe, nom?, org_id, role, auteur}` | `{membre}` |
| `membre-role` | `{id, role, auteur}` | `{membre}` |
| `membre-mot-de-passe` | `{id, mot_de_passe, auteur}` | `{ok}` |
| `membre-lien` | `{id, auteur}` | `{lien}` (réinitialisation, à transmettre soi-même) |
| `membre-renommer` | `{id, nom, auteur}` | `{membre}` |
| `membre-email` | `{id, email, auteur}` | `{membre}` |
| `membre-bloquer` | `{id, bloque, auteur}` | `{membre}` |
| `membre-retirer` (optionnelle) | `{id, auteur}` | `{ok}` |

Ce que le site garantit :

- `membres` ne rend que les membres de ses organisations.
- `membre-creer` fait tout ce que fait une invitation depuis le site : compte
  confirmé d'office, profil, adhésion, et ce que son métier ajoute (une
  ressource de planning, par exemple). Elle est idempotente : une adresse déjà
  inscrite et sans organisation est complétée, une adresse membre d'une autre
  organisation est refusée (`409 deja_membre`).
- Une cible hors de ses organisations répond `404 membre_inconnu`, sans dire si
  l'adresse existe ailleurs.
- `auteur` (l'email du jeton Baikal) est journalisé ; le mot de passe ne l'est
  jamais.
- Erreurs nommées : `invalid_body`, `role_inconnu`, `org_inconnue`,
  `membre_inconnu`, `deja_membre`, `mot_de_passe_trop_court`.

`membre-retirer` est optionnelle parce que supprimer un membre peut casser
l'historique du site (interventions, signatures). Le site qui ne sait pas le
faire proprement ne la publie pas ; bloquer suffit.

Livrable : `docs/contrats/membres-relais-v1.ts`, passe-plat de référence avec
ses tests, sur le modèle de `prospects-relais-v1.ts`. La validation des corps y
est pure et testée.

## 5. Côté Baikal

- **EF `admin-membres`** (`{action, appId, ...}`), deux transports derrière les
  mêmes actions, comme `admin-prospects` : local pour un site en base partagée
  (elle reprend ce que font aujourd'hui les RPC et `create-user`), relais pour
  un site sur base dédiée. Validation commune dans `admin-membres/actions.ts`,
  pure et testée. Droit `users` par `exigerModule` : lecture pour `membres`,
  écriture pour le reste. Erreurs du site remontées en 502 avec
  `canal: {statut_site, code, detail}`.
- **Page Utilisateurs** : ne parle plus qu'à `admin-membres`. Les rôles
  proposés viennent du site. Le mot de passe généré s'affiche une fois, comme
  aujourd'hui. Site sur base dédiée sans contrat : page fermée avec la phrase
  « Ce site gère ses comptes chez lui et n'a pas encore publié le contrat
  Membres ».
- **Garde-fou** : `core.app_sur_base_dediee(app_id)`, appelée par `create-user`,
  `delete-user`, `admin-comptes` en périmètre site et les trois RPC d'écriture.
  Réponse 409 nommée. Le garde-fou reste après la bascule : c'est lui qui tient
  l'anti-objectif.
- **Mot de passe** : il traverse Baikal dans le corps du relais, en HTTPS, sans
  être écrit nulle part.

## 6. Lots

| Lot | Contenu | Dépôt | Recette |
|---|---|---|---|
| 0 | Garde-fou seul | Baikal | Créer un compte pour Majord'home depuis Baikal est refusé avec le motif ; ARPET inchangé |
| 1 | Passe-plat de référence, actions chez Majord'home | Baikal, Majord'home | Appel direct du relais : la liste rend les membres réels, un compte créé se connecte |
| 2 | EF `admin-membres` et page Utilisateurs | Baikal | Depuis la console : créer, changer le mot de passe, bloquer ; le compte se connecte à Majord'home ; un membre créé chez Majord'home apparaît dans Baikal |
| 3 | Retrait des copies Majord'home de la base de Baikal | Baikal | Plus aucun profil ni organisation du site dans Baikal ; la page affiche le même nombre de membres que l'écran Équipe du site |

Le lot 0 se livre seul, le jour même. Le lot 3 est destructif : il ne part
qu'après le lot 2 en production et sur accord explicite.

## 7. Questions ouvertes

1. **Qui se connecte encore à la copie ?** L'administrateur d'une organisation
   cliente de Majord'home s'est connecté sur la base de Baikal après la
   séparation. Console Baikal, ou application qui pointe encore sur l'ancienne
   base ? À établir avant le lot 3, qui lui retire ce compte.
2. **Comptes hérités dans la base de Majord'home.** Son authentification porte
   des comptes d'autres produits, venus de la base commune. Le contrat les
   ignore ; les retirer est un ménage à part, côté Majord'home.
3. **DUERP** est déclaré en modèle « organisations » sans base dédiée ni
   compte : il suit le chemin local tant qu'il reste sur la base de Baikal.
4. **Changer d'organisation** (`assign_user_to_org`) n'est pas au contrat v1 :
   chez un site, un membre appartient à une organisation, et le déplacer touche
   son historique. À ajouter si le besoin se présente.
