// GÉNÉRÉ par docs/contrats/manifestes/generer.ts — ne pas modifier à la main.
// La référence est docs/contrats : manifestes/*.json et les .sql des contrats.
// deno-fmt-ignore-file
import type { Manifeste } from "./manifeste.ts";

export const MANIFESTES = [
 {
  "contrat": "dossiers-v1",
  "source": "docs/contrats/dossiers-v1.sql",
  "titre": "Clients : la liste des événements commerciaux et la fiche client",
  "types": "Types attendus : text, int (smallint, integer, bigint), numeric (et entiers, réels), boolean, timestamptz, date, jsonb.",
  "vues": [
   {
    "nom": "baikal_dossiers",
    "obligatoire": true,
    "niveau": 1,
    "role": "La liste Clients : une ligne par événement commercial (lead, inscription, achat).",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "email",
      "type": "text",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "contact_nom",
      "type": "text",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "statut",
      "type": "text",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "perimetre",
      "type": "text",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "cree_le",
      "type": "timestamptz",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "paye_le",
      "type": "timestamptz",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "est_test",
      "type": "boolean",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "supprime_le",
      "type": "timestamptz",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "emails_envoyes",
      "type": "int",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "emails_ouverts",
      "type": "int",
      "obligatoire": true,
      "bloc": "noyau"
     },
     {
      "nom": "montant_ttc",
      "type": "numeric",
      "obligatoire": true,
      "bloc": "transaction"
     },
     {
      "nom": "devise",
      "type": "text",
      "obligatoire": true,
      "bloc": "transaction"
     },
     {
      "nom": "stripe_payment_intent_id",
      "type": "text",
      "obligatoire": true,
      "bloc": "transaction"
     },
     {
      "nom": "attribution",
      "type": "jsonb",
      "obligatoire": false,
      "bloc": "attribution"
     },
     {
      "nom": "apporteur",
      "type": "text",
      "obligatoire": false,
      "bloc": "origine"
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": false,
      "bloc": "libelle"
     },
     {
      "nom": "categorie",
      "type": "text",
      "obligatoire": false,
      "bloc": "categorie"
     },
     {
      "nom": "compte_id",
      "type": "text",
      "obligatoire": false,
      "bloc": "compte"
     },
     {
      "nom": "documents_purges_le",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "purge"
     },
     {
      "nom": "email_capture_le",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "capture"
     },
     {
      "nom": "maj_le",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "activite"
     },
     {
      "nom": "abo_statut",
      "type": "text",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_plan",
      "type": "text",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_montant_mensuel",
      "type": "numeric",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_prochaine_echeance",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_resilie_le",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "abonnement"
     }
    ]
   },
   {
    "nom": "baikal_dossier_champs",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Vue de la fiche : les sections et champs déclarés par le site.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "section",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "ordre_section",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "ordre",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "valeur",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "format",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "niveau",
      "type": "text",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_documents",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Documents : ce que le client a déposé.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "document_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "nature",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "type",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "mime",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "taille_octets",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "pages",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "depose_le",
      "type": "timestamptz",
      "obligatoire": false
     },
     {
      "nom": "source",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "statut",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "ouvrable",
      "type": "boolean",
      "obligatoire": false
     },
     {
      "nom": "details",
      "type": "jsonb",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_resultats",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Résultat : ce que le client a obtenu.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "resultat_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "nature",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "produit_le",
      "type": "timestamptz",
      "obligatoire": false
     },
     {
      "nom": "version",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "statut",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "url_publique",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "consulte_le",
      "type": "timestamptz",
      "obligatoire": false
     },
     {
      "nom": "telechargements",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "ouvrable",
      "type": "boolean",
      "obligatoire": false
     },
     {
      "nom": "details",
      "type": "jsonb",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_emails",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Emails : les envois au client.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "envoye_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "sujet",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "destinataire",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "statut",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "ouvert_le",
      "type": "timestamptz",
      "obligatoire": false
     },
     {
      "nom": "type",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "erreur",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "details",
      "type": "jsonb",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_messages",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Chat : les échanges avec le client.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "message_id",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "survenu_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "role",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "contenu",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "canal",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "contexte",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "details",
      "type": "jsonb",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_ia",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Logs IA : les appels IA rattachés au dossier.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "survenu_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "operation",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "modele",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "tokens_entree",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "tokens_sortie",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "tokens_total",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "cout_usd",
      "type": "numeric",
      "obligatoire": false
     },
     {
      "nom": "latence_ms",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "statut",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "erreur",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "details",
      "type": "jsonb",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_donnees",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Données : le brut, par blocs.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "bloc",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "ordre",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "contenu",
      "type": "jsonb",
      "obligatoire": true
     },
     {
      "nom": "maj_le",
      "type": "timestamptz",
      "obligatoire": false
     }
    ]
   },
   {
    "nom": "baikal_dossier_events",
    "obligatoire": false,
    "niveau": 2,
    "role": "Onglet Events : le parcours du client, geste par geste.",
    "jointure": "dossier_id",
    "colonnes": [
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "survenu_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "type",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "acteur",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "detail",
      "type": "jsonb",
      "obligatoire": false
     }
    ]
   }
  ],
  "controles": [
   {
    "id": "dossiers.noyau_complet",
    "ref": "§4 (1)",
    "niveau": 1,
    "vue": "baikal_dossiers",
    "titre": "Le noyau est complet",
    "requiert": [
     "dossier_id",
     "statut",
     "perimetre",
     "cree_le",
     "est_test",
     "emails_envoyes",
     "emails_ouverts",
     "devise"
    ],
    "sql": "select dossier_id, statut, perimetre, cree_le, est_test, emails_envoyes, emails_ouverts, devise from @SCHEMA@.baikal_dossiers where dossier_id is null or statut is null or perimetre is null or cree_le is null or est_test is null or emails_envoyes is null or emails_ouverts is null or devise is null",
    "si_echec": "Ces lignes s'affichent sans statut, sans date ou sans compteur : la liste les classe mal et les filtres les perdent, sans erreur.",
    "correction": "Remplir chaque colonne du noyau : coalesce(..., 0) pour les compteurs, coalesce(..., false) pour est_test, 'EUR' pour devise."
   },
   {
    "id": "dossiers.identifiant_unique",
    "ref": "§4 (2)",
    "niveau": 1,
    "vue": "baikal_dossiers",
    "titre": "Chaque dossier_id est unique",
    "requiert": [
     "dossier_id"
    ],
    "sql": "select dossier_id, count(*)::int as lignes from @SCHEMA@.baikal_dossiers group by 1 having count(*) > 1",
    "si_echec": "Deux lignes partagent un identifiant : la fiche ouvre l'une ou l'autre au hasard, et les onglets mélangent les deux clients.",
    "correction": "Préfixer l'identifiant par la nature de l'acte quand la vue réunit plusieurs tables (ex. 'achat-' || id, 'compte-' || id)."
   },
   {
    "id": "dossiers.perimetre_vocabulaire",
    "ref": "§1 noyau",
    "niveau": 1,
    "vue": "baikal_dossiers",
    "titre": "Le périmètre vaut b2c ou b2b",
    "requiert": [
     "perimetre"
    ],
    "sql": "select dossier_id, perimetre from @SCHEMA@.baikal_dossiers where perimetre not in ('b2c', 'b2b')",
    "si_echec": "Ces lignes disparaissent du filtre B2C / B2B : le client existe, la console ne le montre dans aucun des deux.",
    "correction": "Ramener perimetre à 'b2c' ou 'b2b' par un case dans la vue."
   },
   {
    "id": "dossiers.montant_sans_paiement",
    "ref": "§4 (3)",
    "niveau": 1,
    "vue": "baikal_dossiers",
    "titre": "Un montant payé a toujours sa date de paiement",
    "requiert": [
     "montant_ttc",
     "paye_le"
    ],
    "sql": "select dossier_id, montant_ttc, statut from @SCHEMA@.baikal_dossiers where montant_ttc > 0 and paye_le is null",
    "si_echec": "Ces clients ont payé mais se lisent non convertis : Baikal compte un client payant à paye_le, jamais au statut.",
    "correction": "Renseigner paye_le pour toute ligne encaissée (date du paiement Stripe, ou de la commande payée)."
   },
   {
    "id": "dossiers.statut_funnel",
    "ref": "§1 noyau",
    "niveau": 1,
    "vue": "baikal_dossiers",
    "titre": "Chaque statut est une étape du funnel déclaré",
    "requiert": [
     "statut"
    ],
    "type": "funnel",
    "sql": "select statut, count(*)::int as lignes from @SCHEMA@.baikal_dossiers group by 1 order by 2 desc",
    "si_echec": "Ces statuts ne sont pas des étapes du funnel : la liste les affiche en badge brut et le filtre de statut ne les propose pas.",
    "correction": "Soit ramener la valeur à une étape du funnel, soit ajouter l'étape au funnel déclaré."
   },
   {
    "id": "dossiers.categorie_stable",
    "ref": "§4 (4)",
    "niveau": 2,
    "vue": "baikal_dossiers",
    "titre": "La catégorie est celle de la personne, identique sur toutes ses lignes",
    "requiert": [
     "email",
     "categorie"
    ],
    "sql": "select email, count(distinct categorie)::int as categories from @SCHEMA@.baikal_dossiers where email is not null group by email having count(distinct categorie) > 1",
    "si_echec": "La même personne apparaît dans deux catégories : la répartition par catégorie la compte deux fois, et le filtre la montre sous l'une ou l'autre selon la ligne.",
    "correction": "Calculer la catégorie une fois par adresse (sous-requête ou vue intermédiaire par email) et la joindre à chaque ligne."
   },
   {
    "id": "dossiers.attribution_jamais_vide",
    "ref": "§4 (5)",
    "niveau": 2,
    "vue": "baikal_dossiers",
    "titre": "L'attribution n'est jamais {} et ses domaines sont normalisés",
    "requiert": [
     "attribution"
    ],
    "sql": "select dossier_id, attribution from @SCHEMA@.baikal_dossiers where attribution = '{}'::jsonb or attribution ->> 'referrer_domaine' ~ '^www\\.|[A-Z]'",
    "si_echec": "Un objet vide se lit « capté, sans signal » au lieu de « inconnu », et un domaine en www. ou en majuscules crée un faux canal : le tableau des origines ment, sans erreur.",
    "correction": "Publier NULL quand l'origine est inconnue (nullif(attribution, '{}'::jsonb)), et le domaine en minuscules sans www."
   }
  ],
  "concordances": [
   {
    "id": "dossiers.categorie_comptes_pro",
    "ref": "comptes-pro-v1 §3 et README, règle des deux vues",
    "niveau": 2,
    "gauche": {
     "vue": "baikal_dossiers",
     "colonne": "categorie"
    },
    "droite": {
     "vue": "baikal_comptes_pro",
     "colonne": "categorie"
    },
    "cle": "email",
    "titre": "La catégorie d'une personne est la même dans Clients et dans Comptes",
    "si_echec": "La même personne est « agent immobilier » dans Clients et « inscrit sans fiche » dans Comptes : deux écrans, deux réponses.",
    "correction": "Dériver la catégorie de baikal_comptes_pro de celle de baikal_dossiers (ou l'inverse), jamais deux cascades."
   }
  ],
  "verifications_manuelles": [
   {
    "ref": "§4 (7)",
    "texte": "Les colonnes publiées sont celles du contrat, et rien d'autre : une colonne hors contrat n'est pas rendue, mais elle trompe le prochain lecteur de la vue."
   },
   {
    "ref": "§4 (10)",
    "texte": "Le nombre de payés hors tests de la liste (paye_le non nul, est_test faux, supprime_le nul) est celui de la tuile du chapitre 'clients' de baikal_mesures."
   },
   {
    "ref": "§4 (11)",
    "texte": "Ouvrir la fiche d'un client réel et vérifier que chaque onglet raconte ce qu'il a fait, consulté, activé."
   }
  ]
 },
 {
  "contrat": "mesures-v1",
  "source": "docs/contrats/mesures-v1.sql",
  "titre": "Mesures : les tuiles en tête de Clients, Finances et Comptes",
  "types": "Types attendus : text, int (smallint, integer, bigint), numeric (et entiers, réels), date.",
  "vues": [
   {
    "nom": "baikal_mesures",
    "obligatoire": true,
    "niveau": 1,
    "role": "Les séries quotidiennes que Baikal affiche en tuiles : une ligne par jour, par clé et par fenêtre.",
    "colonnes": [
     {
      "nom": "jour",
      "type": "date",
      "obligatoire": true
     },
     {
      "nom": "cle",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "valeur",
      "type": "numeric",
      "obligatoire": true
     },
     {
      "nom": "agregation",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "format",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "chapitre",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "fenetre_jours",
      "type": "int",
      "obligatoire": true
     },
     {
      "nom": "groupe",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "rendu",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "ordre",
      "type": "int",
      "obligatoire": true
     }
    ]
   }
  ],
  "controles": [
   {
    "id": "mesures.sans_doublon",
    "ref": "§3 (1)",
    "niveau": 1,
    "vue": "baikal_mesures",
    "titre": "Aucun doublon par jour, clé et fenêtre",
    "requiert": [
     "jour",
     "cle",
     "fenetre_jours"
    ],
    "sql": "select jour, cle, fenetre_jours, count(*)::int as lignes from @SCHEMA@.baikal_mesures group by 1, 2, 3 having count(*) > 1",
    "si_echec": "Un doublon sur une somme double le nombre affiché sans un bruit : la tuile annonce 40 ventes pour 20.",
    "correction": "Vérifier que chaque branche de l'union produit une seule ligne par (jour, cle, fenetre_jours), et que deux branches ne publient pas la même clé."
   },
   {
    "id": "mesures.fenetre_sur_stock",
    "ref": "§3 (2)",
    "niveau": 1,
    "vue": "baikal_mesures",
    "titre": "Seul un stock porte une fenêtre",
    "requiert": [
     "cle",
     "agregation",
     "fenetre_jours"
    ],
    "sql": "select distinct cle, agregation, fenetre_jours from @SCHEMA@.baikal_mesures where fenetre_jours is not null and agregation <> 'dernier'",
    "si_echec": "Un flux à fenêtre est sommé sur la période choisie à l'écran alors qu'il compte déjà une fenêtre : la tuile multiplie le nombre par la durée.",
    "correction": "Un flux a fenetre_jours NULL ; un compte de valeurs distinctes sur une fenêtre est un stock, agregation 'dernier'."
   },
   {
    "id": "mesures.vocabulaire",
    "ref": "§3 (3)",
    "niveau": 1,
    "vue": "baikal_mesures",
    "titre": "Agrégation, format et chapitre sont dans le vocabulaire",
    "requiert": [
     "cle",
     "agregation",
     "format",
     "chapitre"
    ],
    "sql": "select distinct cle, agregation, format, chapitre from @SCHEMA@.baikal_mesures where agregation not in ('somme', 'dernier') or format not in ('nombre', 'eur', 'pourcent') or chapitre not in ('clients', 'finances', 'comptes_pro')",
    "si_echec": "Baikal écarte ces lignes sans erreur : la tuile n'apparaît nulle part et rien ne dit pourquoi.",
    "correction": "agregation ∈ somme|dernier, format ∈ nombre|eur|pourcent, chapitre ∈ clients|finances|comptes_pro."
   },
   {
    "id": "mesures.rendu_vocabulaire",
    "ref": "§3 (3)",
    "niveau": 2,
    "vue": "baikal_mesures",
    "titre": "Le rendu vaut tuiles ou entonnoir",
    "requiert": [
     "cle",
     "rendu"
    ],
    "sql": "select distinct cle, rendu from @SCHEMA@.baikal_mesures where coalesce(rendu, 'tuiles') not in ('tuiles', 'entonnoir')",
    "si_echec": "Un rendu inconnu retombe en tuiles : l'entonnoir prévu ne s'affiche pas.",
    "correction": "rendu ∈ tuiles|entonnoir, ou NULL pour des tuiles."
   },
   {
    "id": "mesures.rendu_uniforme",
    "ref": "§3 (3)",
    "niveau": 2,
    "vue": "baikal_mesures",
    "titre": "Toutes les mesures d'un groupe déclarent le même rendu",
    "requiert": [
     "chapitre",
     "groupe",
     "rendu"
    ],
    "sql": "select chapitre, groupe, count(distinct coalesce(rendu, 'tuiles'))::int as rendus from @SCHEMA@.baikal_mesures group by 1, 2 having count(distinct coalesce(rendu, 'tuiles')) > 1",
    "si_echec": "Un groupe panaché retombe sur des tuiles : l'entonnoir disparaît dès qu'une étape oublie son rendu.",
    "correction": "Écrire rendu une seule fois en sortie de l'union, par un case sur la clé."
   },
   {
    "id": "mesures.complete",
    "ref": "§3 (4)",
    "niveau": 1,
    "vue": "baikal_mesures",
    "titre": "Aucune ligne incomplète",
    "requiert": [
     "jour",
     "cle",
     "libelle",
     "valeur",
     "agregation",
     "format",
     "chapitre"
    ],
    "sql": "select jour, cle, libelle, valeur, agregation, format, chapitre from @SCHEMA@.baikal_mesures where jour is null or cle is null or libelle is null or valeur is null or agregation is null or format is null or chapitre is null",
    "si_echec": "Baikal écarte ces lignes en silence : un jour manque à la courbe, ou la tuile n'apparaît pas.",
    "correction": "coalesce(count, 0)::numeric pour la valeur ; un libellé et un chapitre écrits en dur dans chaque branche."
   },
   {
    "id": "mesures.stock_continu",
    "ref": "§3 (6) et §1 (b bis)",
    "niveau": 1,
    "vue": "baikal_mesures",
    "titre": "Un stock publie une ligne par jour, zéros compris",
    "requiert": [
     "jour",
     "cle",
     "agregation",
     "fenetre_jours",
     "valeur"
    ],
    "sql": "with s as (select cle, fenetre_jours, jour, valeur, lag(valeur) over (partition by cle, fenetre_jours order by jour) as precedente from @SCHEMA@.baikal_mesures where agregation = 'dernier') select cle, fenetre_jours, count(distinct jour)::int as jours_publies, (max(jour) - min(jour) + 1) as jours_attendus from s group by 1, 2 having count(distinct jour) <> (max(jour) - min(jour) + 1) and (fenetre_jours is not null or bool_or(valeur < precedente))",
    "si_echec": "Un jour sans ligne se lit « pas mesuré » : la tuile garde la dernière valeur non nulle, une fenêtre glissante qui ne redescend jamais, un abonné résilié qui reste compté.",
    "correction": "Joindre le calendrier (generate_series) en jointure EXTERNE et publier coalesce(..., 0) chaque jour depuis la première mesure. Seul un cumul qui ne décroît jamais, sans fenêtre, est dispensé de ses zéros."
   }
  ],
  "concordances": [],
  "verifications_manuelles": [
   {
    "ref": "§1 (d)",
    "texte": "Une mesure qui coiffe une liste se dérive de cette liste : la tuile des dossiers payés lit baikal_dossiers, jamais les tables sources."
   },
   {
    "ref": "§1 (e)",
    "texte": "Des tuiles posées à côté d'un total en sont une répartition complète : leur somme est le total."
   },
   {
    "ref": "§2",
    "texte": "Le jour est le jour LOCAL du site : (horodatage at time zone 'Europe/Paris')::date, jamais un ::date nu."
   }
  ]
 },
 {
  "contrat": "comptes-pro-v1",
  "source": "docs/contrats/comptes-pro-v1.sql",
  "titre": "Comptes : la liste de ceux qui ont un compte sur l'app",
  "optionnel": true,
  "quand": "si l'app a des comptes utilisateur (inscription, espace client, comptes pro). Un compte est tout compte ouvert sur l'app, pro ou particulier : raison_sociale vaut la société, à défaut le nom, à défaut l'email.",
  "types": "Types attendus : text, int (smallint, integer, bigint), numeric (et entiers, réels), boolean, timestamptz.",
  "vues": [
   {
    "nom": "baikal_comptes_pro",
    "obligatoire": true,
    "niveau": 2,
    "role": "La liste du chapitre Comptes : une ligne par compte ouvert sur l'app.",
    "colonnes": [
     {
      "nom": "compte_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "raison_sociale",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "email",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "cree_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "actif",
      "type": "boolean",
      "obligatoire": true
     },
     {
      "nom": "est_test",
      "type": "boolean",
      "obligatoire": true
     },
     {
      "nom": "supprime_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "credits_stock",
      "type": "int",
      "obligatoire": false,
      "bloc": "credits"
     },
     {
      "nom": "credits_achetes",
      "type": "int",
      "obligatoire": false,
      "bloc": "credits"
     },
     {
      "nom": "credits_consommes",
      "type": "int",
      "obligatoire": false,
      "bloc": "credits"
     },
     {
      "nom": "ca_ttc",
      "type": "numeric",
      "obligatoire": false,
      "bloc": "argent"
     },
     {
      "nom": "devise",
      "type": "text",
      "obligatoire": false,
      "bloc": "argent"
     },
     {
      "nom": "abo_statut",
      "type": "text",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_plan",
      "type": "text",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_montant_mensuel",
      "type": "numeric",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_prochaine_echeance",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "abo_resilie_le",
      "type": "timestamptz",
      "obligatoire": false,
      "bloc": "abonnement"
     },
     {
      "nom": "contact_nom",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "telephone",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "categorie",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "derniere_activite_le",
      "type": "timestamptz",
      "obligatoire": false
     }
    ]
   }
  ],
  "controles": [
   {
    "id": "comptes.noyau_complet",
    "ref": "§3 (1)",
    "niveau": 2,
    "vue": "baikal_comptes_pro",
    "titre": "Chaque compte a un identifiant, un nom, un état actif et un drapeau de test",
    "requiert": [
     "compte_id",
     "raison_sociale",
     "actif",
     "est_test"
    ],
    "sql": "select compte_id, raison_sociale is null as sans_nom, actif is null as sans_etat, est_test is null as sans_drapeau_test from @SCHEMA@.baikal_comptes_pro where compte_id is null or raison_sociale is null or actif is null or est_test is null",
    "si_echec": "Une ligne sans nom ou sans état s'affiche vide dans la liste, et un est_test nul fait disparaître le compte des deux positions de la bascule « Exclure tests ».",
    "correction": "raison_sociale = coalesce(société, nom, email) ; actif et est_test passés par coalesce(…, true/false)."
   },
   {
    "id": "comptes.identifiant_unique",
    "ref": "§3 (2)",
    "niveau": 2,
    "vue": "baikal_comptes_pro",
    "titre": "Un compte n'apparaît qu'une fois",
    "requiert": [
     "compte_id"
    ],
    "sql": "select compte_id, count(*)::int as lignes from @SCHEMA@.baikal_comptes_pro group by 1 having count(*) > 1",
    "si_echec": "Une jointure démultiplie les comptes : la liste les montre deux fois et la fiche ouvre le mauvais.",
    "correction": "Une ligne par compte : agréger ce qui vient d'une table fille (sous-requête ou lateral), jamais une jointure brute."
   }
  ],
  "concordances": [],
  "verifications_manuelles": [
   {
    "ref": "§3 (4 bis)",
    "texte": "Pour chaque valeur de categorie, se demander si elle est CHOISIE ou SUBIE : un rôle posé à l'inscription et jamais confirmé mérite son propre slug."
   }
  ]
 },
 {
  "contrat": "comptes-historique-v1",
  "source": "docs/contrats/comptes-historique-v1.sql",
  "titre": "Comptes : l'historique d'un compte, sur sa fiche",
  "optionnel": true,
  "quand": "si tu publies baikal_comptes_pro et que l'app garde ce que fait ou achète un compte (achats, crédits, factures, changements de plan).",
  "types": "Types attendus : text, int (smallint, integer, bigint), numeric (et entiers, réels), timestamptz.",
  "vues": [
   {
    "nom": "baikal_compte_historique",
    "obligatoire": true,
    "niveau": 2,
    "role": "La fiche d'un compte : une ligne par événement, achat ou consommation.",
    "colonnes": [
     {
      "nom": "compte_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "evenement_id",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "survenu_le",
      "type": "timestamptz",
      "obligatoire": true
     },
     {
      "nom": "nature",
      "type": "text",
      "obligatoire": true
     },
     {
      "nom": "libelle",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "quantite",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "montant_ttc",
      "type": "numeric",
      "obligatoire": false
     },
     {
      "nom": "devise",
      "type": "text",
      "obligatoire": false
     },
     {
      "nom": "solde_apres",
      "type": "int",
      "obligatoire": false
     },
     {
      "nom": "dossier_id",
      "type": "text",
      "obligatoire": false
     }
    ]
   }
  ],
  "controles": [
   {
    "id": "historique.noyau_complet",
    "ref": "§2 (1)",
    "niveau": 2,
    "vue": "baikal_compte_historique",
    "titre": "Chaque événement a son compte, son identifiant, sa date et sa nature",
    "requiert": [
     "compte_id",
     "evenement_id",
     "survenu_le",
     "nature"
    ],
    "sql": "select evenement_id, compte_id from @SCHEMA@.baikal_compte_historique where compte_id is null or evenement_id is null or survenu_le is null or nature is null",
    "si_echec": "Un événement sans compte ou sans date n'apparaît sur aucune fiche, ou à la mauvaise place.",
    "correction": "Écarter les lignes orphelines (where compte_id is not null) et poser la date de l'événement, pas celle d'une mise à jour."
   },
   {
    "id": "historique.identifiant_unique",
    "ref": "§2 (2)",
    "niveau": 2,
    "vue": "baikal_compte_historique",
    "titre": "Un événement n'apparaît qu'une fois",
    "requiert": [
     "evenement_id"
    ],
    "sql": "select evenement_id, count(*)::int as lignes from @SCHEMA@.baikal_compte_historique group by 1 having count(*) > 1",
    "si_echec": "Un achat compté deux fois sur la fiche : le client croit avoir payé le double.",
    "correction": "Préfixer l'identifiant par sa source quand la vue unit plusieurs tables (achat:<id>, credit:<id>)."
   },
   {
    "id": "historique.compte_connu",
    "ref": "§2 (3)",
    "niveau": 2,
    "vue": "baikal_compte_historique",
    "titre": "Chaque événement cite un compte de la liste",
    "requiert": [
     "compte_id"
    ],
    "sql": "select distinct h.compte_id from @SCHEMA@.baikal_compte_historique h where not exists (select 1 from @SCHEMA@.baikal_comptes_pro c where c.compte_id = h.compte_id)",
    "si_echec": "Ces événements citent un compte absent de la liste : ils n'apparaissent sur aucune fiche, sans erreur.",
    "correction": "Construire compte_id exactement comme dans baikal_comptes_pro (même source, même cast ::text)."
   }
  ],
  "concordances": [],
  "verifications_manuelles": []
 }
] as Manifeste[];

export const CONTRATS: Record<string, string> = {
 "dossiers-v1": "-- ---------------------------------------------------------------------------\n-- Contrat Dossiers v1 — le chapitre Clients de la console et la fiche client.\n--\n-- Contrat de FORME, comme mesures-v1 et comptes-pro-v1 : les noms des vues,\n-- leurs colonnes et leurs types sont figés, le corps de chaque vue appartient\n-- au site. Personne d'autre que lui ne sait ce qu'est un dossier chez lui :\n-- un bien à vendre (Pré-état-daté), une adresse qui a demandé un rapport\n-- (MonsieurDPE), une demande d'autorisation (Voirie).\n--\n-- Jusqu'au 24/10/2026, ce contrat n'existait que dans la spec du 26/08\n-- (clients) et celle du 03/09 (fiche), et dans le code de Baikal\n-- (admin-dossiers/onglets.ts, fiche/colonnes.js, admin-dossiers/champs.ts).\n-- Un troisième site devait lire Pack Vendeur ou MonsieurDPE pour savoir quoi\n-- publier. Ce fichier est la référence ; le code de Baikal s'y conforme, et\n-- les deux sites installés le passent.\n--\n-- UNE VUE OBLIGATOIRE, SIX OPTIONNELLES. Sans `baikal_dossiers`, le site n'a\n-- pas le module (disponible = false, jamais une erreur). Chaque vue optionnelle\n-- ouvre un onglet de la fiche : pas de vue, pas d'onglet ; pas de colonne, pas\n-- de section. Baikal détecte tout par le catalogue (to_regclass,\n-- information_schema.columns) : aucun registre de capacités à tenir.\n--\n-- | vue                        | onglet    | obligatoire |\n-- |----------------------------|-----------|-------------|\n-- | baikal_dossiers            | liste, Vue| oui         |\n-- | baikal_dossier_champs      | Vue       | non         |\n-- | baikal_dossier_documents   | Documents | non         |\n-- | baikal_dossier_resultats   | Résultat  | non         |\n-- | baikal_dossier_emails      | Emails    | non         |\n-- | baikal_dossier_messages    | Chat      | non         |\n-- | baikal_dossier_ia          | Logs IA   | non         |\n-- | baikal_dossier_donnees     | Données   | non         |\n-- | baikal_dossier_events      | Events    | non         |\n--\n-- Installer chez un site : copier dans une migration du site, substituer\n-- @SCHEMA@ (`dpe`, `pack_vendeur`… ou `public` sur un projet dédié), écrire\n-- la projection de chaque vue voulue, passer la recette du §4.\n--\n-- Specs : docs/superpowers/specs/2026-08-26-baikal-clients-design.md (liste),\n-- 2026-09-03-fiche-transaction-format-commun-design.md (fiche et onglets).\n-- Installés : pack-vendeur (les huit vues), monsieurdpe (six : pas de\n-- documents, pas de chat, pas de logs IA — voir §3 pourquoi).\n-- ---------------------------------------------------------------------------\n\n\n-- ------ 1. `baikal_dossiers` — la liste, une ligne par ÉVÉNEMENT COMMERCIAL ------\n--\n-- Le grain n'est pas la personne, c'est l'acte (Eric, 02/09/2026) : un compte\n-- qui évolue (inscrit → abonné), un achat (toujours un acte, même chez un\n-- abonné), un lead absorbé par le premier compte ou achat de la même adresse.\n-- Définitions : Lead = service gratuit consommé contre un email ; Inscrit =\n-- fiche ou compte ; Payé = service payant consommé, coupon 100 % compris (un\n-- achat à 0 € est un Payé, pas un test).\n--\n-- NOYAU, obligatoire :\n--\n-- | dossier_id   | text, non nul    | identifiant côté site, clé de toutes les autres vues |\n-- | email        | text, nullable   | l'adresse du client                                   |\n-- | contact_nom  | text, nullable   | la personne, quand le site la tient                   |\n-- | statut       | text, non nul    | slug d'étape de config.apps.funnel_etapes ; sans funnel, libre |\n-- | perimetre    | text, non nul    | 'b2c' ou 'b2b'                                        |\n-- | cree_le      | timestamptz      | date de l'événement                                   |\n-- | paye_le      | timestamptz null | CLIENT PAYANT = paye_le renseigné, jamais un slug     |\n-- | est_test     | boolean, non nul | bascule « Exclure tests » — définition du SITE        |\n-- | supprime_le  | timestamptz null | bascule « Inclure supprimés »                         |\n-- | emails_envoyes, emails_ouverts | int | compteurs de la liste ; 0 si le site ne sait pas |\n--\n-- TRANSACTION (noyau, nullable quand l'acte n'est pas un paiement) :\n--\n-- | montant_ttc              | numeric, null | |\n-- | devise                   | text          | 'EUR' |\n-- | stripe_payment_intent_id | text, null    | pont vers admin.ventes et Stripe |\n--\n-- BLOCS OPTIONNELS. La capacité se lit à la PRÉSENCE de la colonne.\n--\n-- | attribution   | jsonb, null | d'où vient le client — voir §1 bis |\n-- | apporteur     | text, null  | le « via Antique Immo » : un apporteur non vide classe la ligne Portail-Pro |\n-- | libelle       | text, null  | ce que la ligne vend ou consomme : adresse du bien, « Rapport gratuit »… |\n-- | categorie     | text, null  | slug de config.apps.categories_client ; catégorie de la PERSONNE, identique sur toutes ses lignes |\n-- | compte_id     | text, null  | le compte pro de la ligne (contrat comptes-pro-v1) |\n-- | documents_purges_le | timestamptz null | badge « documents purgés » |\n-- | email_capture_le    | timestamptz null | quand l'adresse a été laissée (visiteur → lead) |\n-- | maj_le        | timestamptz null | dernière activité de la ligne |\n-- | abo_statut    | text, null  | PIVOT du bloc abonnement, vocabulaire Stripe ('trialing', 'active', 'past_due', 'canceled'…) |\n-- | abo_plan      | text, null  | slug du plan |\n-- | abo_montant_mensuel | numeric, null | ne pas recopier un tarif qui vit chez Stripe : absente chez monsieurdpe |\n-- | abo_prochaine_echeance | timestamptz null | |\n-- | abo_resilie_le | timestamptz null | |\n--\n-- Les règles de comptes-pro-v1 valent ici : les tests et les supprimés sont\n-- portés par la vue (admin-site-stats se joint à baikal_dossiers plutôt que\n-- de redéfinir ses filtres — c'est ce qui a mis fin aux « 5 payées pour 2\n-- réelles » de Voirie) ; une colonne qu'on ne sait pas remplir est ABSENTE.\n\ncreate or replace view @SCHEMA@.baikal_dossiers\nwith (security_invoker = true) as\nselect\n  d.id::text              as dossier_id,\n  d.email                 as email,\n  d.contact_name          as contact_nom,\n  d.funnel_slug           as statut,\n  case when d.pro_account_id is null then 'b2c' else 'b2b' end as perimetre,\n  d.created_at            as cree_le,\n  d.paid_at               as paye_le,\n  coalesce(d.is_test, false) or d.email ~* 'pudebat|confer-sas|test|demo|example\\.' as est_test,\n  d.deleted_at            as supprime_le,\n  coalesce(e.envoyes, 0)  as emails_envoyes,\n  coalesce(e.ouverts, 0)  as emails_ouverts,\n  d.amount_paid           as montant_ttc,\n  'EUR'                   as devise,\n  d.stripe_payment_intent_id,\n  -- Blocs optionnels : retirer les lignes que le site ne sait pas remplir.\n  d.attribution,\n  p.company_name          as apporteur,\n  d.property_address      as libelle,\n  case when d.pro_account_id is null then 'particulier' else 'pro' end as categorie,\n  d.pro_account_id::text  as compte_id,\n  d.documents_purged_at   as documents_purges_le,\n  d.email_captured_at     as email_capture_le,\n  d.updated_at            as maj_le\nfrom @SCHEMA@.dossiers d\nleft join @SCHEMA@.pro_accounts p on p.id = d.pro_account_id\nleft join lateral (\n  select count(*) as envoyes, count(l.opened_at) as ouverts\n  from @SCHEMA@.email_logs l\n  where l.dossier_id = d.id and l.status = 'sent'\n) e on true;\n\ncomment on view @SCHEMA@.baikal_dossiers is\n  'Contrat Dossiers v1 lu par Baikal (admin-dossiers, admin-site-stats). Une ligne '\n  'par événement commercial ; client payant = paye_le ; tests et suppressions '\n  'définis ici ; catégorie de la personne. Le canal d''origine est déduit par '\n  'Baikal de `attribution`, jamais stocké.';\n\n\n-- ------ 1 bis. `attribution` — d'où vient le client ------\n--\n-- Forme commune à Clients et au Financier ; Baikal en DÉDUIT le canal par sa\n-- cascade (admin-dossiers/canal.ts : portail_pro → paid → geo → campaign →\n-- organic → referral → direct → indetermine → unattributed), jamais stocké.\n--\n-- | referrer_domaine | text    | hôte du référent externe, sans www, minuscules |\n-- | utm_source, utm_medium, utm_campaign, utm_term | text | tels que reçus |\n-- | a_gclid          | boolean | clic Google Ads                                |\n-- | landing_page     | text    | première page vue                              |\n-- | channel          | text    | repli calculé par le site : 'organic_search', 'direct', 'email', 'campaign', 'referral', 'paid_search', 'paid_social', 'organic_social' |\n-- | capture          | text    | 'live' (capté à l'arrivée), 'backfill_partiel' (reconstitué, lu « Origine perdue »), autre : libre |\n--\n-- PREMIER CONTACT QUI GAGNE : la question est « qu'est-ce qui a produit ce\n-- client », pas « par quelle porte est-il revenu ». Pack Vendeur garde 90\n-- jours en localStorage (src/lib/acquisition.js), MonsieurDPE de même\n-- (site/lib/acquisition.ts) ; un référent interne n'est pas un contact.\n--\n-- Un lead posé par un partenaire sans navigateur se publie avec\n-- `referrer_domaine` = domaine du partenaire, lu « Référent · <domaine> »\n-- (Eric, 24/10/2026). Une page d'entrée seule (`landing_page` sans référent\n-- ni UTM) reste « sans origine » : une porte n'est pas une origine.\n--\n-- NULL = inconnu. Jamais `{}` : un objet vide se lit « capté, sans signal ».\n\n\n-- ------ 2. Les vues de la fiche ------\n--\n-- Motif commun : `dossier_id` (seule colonne obligatoire), un horodatage, un\n-- libellé, quelques colonnes propres à la nature, et `details` jsonb libre\n-- dont chaque clé devient sa propre colonne du tableau. Une colonne absente de\n-- toutes les lignes n'est pas rendue.\n--\n-- GRAIN : les vues sont par `dossier_id`. Un site dont l'identité est\n-- l'adresse (MonsieurDPE) joint ses gestes à chaque ligne de l'adresse : le\n-- même événement apparaît sur le compte, l'achat et l'abonnement de la même\n-- personne. C'est permis ; le dire dans le commentaire de la vue.\n\n-- 2.1 `baikal_dossier_champs` — les sections déclarées de l'onglet Vue.\n-- Le site fournit la valeur BRUTE, Baikal formate. Une ligne absente =\n-- inconnu : ne jamais publier une valeur vide.\n--\n-- | dossier_id    | text          | |\n-- | section       | text          | titre du bloc ; '' = section sans titre, qui ouvre la fiche |\n-- | ordre_section | int, null     | |\n-- | libelle       | text          | |\n-- | ordre         | int, null     | |\n-- | valeur        | text, null    | brute, non formatée |\n-- | format        | text, null    | 'texte' (défaut) 'euro' 'dollar' 'date' 'datetime' 'pourcent' 'nombre' 'octets' 'booleen' 'lien' 'mono' |\n-- | niveau        | text, null    | 'attention' / 'danger' : surligne le champ (remplace tout encart codé en dur) |\n\ncreate or replace view @SCHEMA@.baikal_dossier_champs\nwith (security_invoker = true) as\nselect d.id::text as dossier_id,\n       'Bien' as section, 1 as ordre_section,\n       'Surface' as libelle, 1 as ordre,\n       d.surface::text as valeur, 'nombre' as format, null::text as niveau\nfrom @SCHEMA@.dossiers d\nwhere d.surface is not null;\n\n-- 2.2 `baikal_dossier_documents` — l'entrée (ce que le client a déposé).\n-- Pas « une liste de fichiers » : un formulaire, un vocal, un lien entrent\n-- dans le même onglet.\n--\n-- | dossier_id    | text          | |\n-- | document_id   | text          | identité, utilisée par l'ouverture (§2 bis) |\n-- | libelle       | text          | |\n-- | nature        | text, null    | 'fichier' 'formulaire' 'audio' 'photo' 'lien' 'texte' |\n-- | type          | text, null    | type métier du site, affiché tel quel |\n-- | mime          | text, null    | |\n-- | taille_octets | bigint, null  | |\n-- | pages         | int, null     | |\n-- | depose_le     | timestamptz null | tri de l'onglet |\n-- | source        | text, null    | 'client' 'admin' 'systeme' |\n-- | statut        | text, null    | 'recu' 'analyse' 'rejete' 'illisible'… ; 'erreur' passe la ligne en rouge |\n-- | ouvrable      | boolean, null | le site sait signer une URL ; absent → déduit de nature = 'fichier' et de la présence du relais |\n-- | details       | jsonb, null   | |\n\n-- 2.3 `baikal_dossier_resultats` — la sortie (ce que le client a obtenu).\n--\n-- | dossier_id     | text          | |\n-- | resultat_id    | text          | identité, utilisée par l'ouverture (§2 bis) |\n-- | libelle        | text          | |\n-- | nature         | text, null    | 'document' 'lien_partage' 'rapport' 'analyse' 'export' 'reponse'… |\n-- | produit_le     | timestamptz null | tri de l'onglet |\n-- | version        | int, null     | régénérations successives |\n-- | statut         | text, null    | libre ('Payé', 'Envoyé par courriel', 'niveau 2'…) ; 'erreur' passe en rouge |\n-- | url_publique   | text, null    | un lien publique par construction (partage, rapport signé) — rendu 'lien' |\n-- | consulte_le    | timestamptz null | |\n-- | telechargements | int, null    | |\n-- | ouvrable       | boolean, null | |\n-- | details        | jsonb, null   | |\n\n-- 2.4 `baikal_dossier_emails` — les envois.\n--\n-- | dossier_id   | text          | |\n-- | envoye_le    | timestamptz   | tri de l'onglet |\n-- | sujet        | text          | |\n-- | destinataire | text, null    | |\n-- | statut       | text, null    | 'envoye' 'delivre' 'ouvert' 'clique' 'bounce' 'plainte' 'echec' |\n-- | ouvert_le    | timestamptz null | |\n-- | type         | text, null    | slug du modèle |\n-- | erreur       | text, null    | |\n-- | details      | jsonb, null   | |\n--\n-- Les campagnes Baikal (module mailing-v1) s'y publient depuis le journal\n-- `<schema>.mail_envoi` du site : c'est le site qui tient le nominatif.\n\n-- 2.5 `baikal_dossier_messages` — le chat.\n--\n-- | dossier_id | text          | |\n-- | message_id | text, null    | |\n-- | survenu_le | timestamptz   | tri, croissant |\n-- | role       | text          | 'client' 'assistant' 'agent' (humain) |\n-- | contenu    | text          | |\n-- | canal      | text, null    | 'chat' 'widget' 'whatsapp'… |\n-- | contexte   | text, null    | la page de l'échange |\n-- | details    | jsonb, null   | |\n--\n-- Une question et sa réponse stockées sur une même ligne se DÉGROUPENT dans\n-- la vue (UNION ALL, message_id suffixé -q / -r) : l'adaptation appartient\n-- au site, jamais à Baikal.\n\n-- 2.6 `baikal_dossier_ia` — les appels IA. Le coût total est sommé par Baikal.\n--\n-- | dossier_id   | text          | |\n-- | survenu_le   | timestamptz   | |\n-- | operation    | text, null    | le prompt_type du site |\n-- | modele       | text, null    | celui qui a RÉELLEMENT répondu (après repli) |\n-- | tokens_entree, tokens_sortie, tokens_total | int, null | |\n-- | cout_usd     | numeric, null | |\n-- | latence_ms   | int, null     | |\n-- | statut       | text, null    | 'ok' / 'erreur' |\n-- | erreur       | text, null    | |\n-- | details      | jsonb, null   | |\n--\n-- Ne publier que les appels RATTACHÉS à un dossier par un fait. MonsieurDPE\n-- rattache ses logs à un numéro de DPE ou à une session de sourcing, jamais à\n-- une personne : il ne publie pas la vue plutôt que de deviner.\n\n-- 2.7 `baikal_dossier_donnees` — le brut, par blocs, rendu en accordéon.\n--\n-- | dossier_id | text        | |\n-- | bloc       | text        | identifiant, ex. 'extracted_data' |\n-- | libelle    | text        | |\n-- | ordre      | int, null   | |\n-- | contenu    | jsonb       | n'importe quelle structure |\n-- | maj_le     | timestamptz null | |\n\n-- 2.8 `baikal_dossier_events` — le parcours (timeline).\n--\n-- | dossier_id | text        | |\n-- | survenu_le | timestamptz | tri, décroissant |\n-- | type       | text        | slug du site ('achat', 'auto_controle'…), repli d'affichage |\n-- | libelle    | text, null  | ce qui s'affiche ; à défaut le type |\n-- | acteur     | text, null  | 'client' 'admin' 'systeme' (couleur) |\n-- | detail     | jsonb, null | rendu en paires clé/valeur telles quelles : le contrat n'en privilégie aucune |\n--\n-- TOUT geste daté du client a sa place : ce qu'il a fait, consulté, activé\n-- (Eric, 24/10/2026). Un site qui ne publie que ses ventes publie une timeline\n-- qui ment par omission.\n\ncreate or replace view @SCHEMA@.baikal_dossier_events\nwith (security_invoker = true) as\nselect ev.dossier_id::text as dossier_id,\n       ev.created_at       as survenu_le,\n       ev.event_name       as type,\n       ev.label            as libelle,\n       'client'            as acteur,\n       jsonb_strip_nulls(jsonb_build_object('page', ev.page_url)) || coalesce(ev.properties, '{}'::jsonb) as detail\nfrom @SCHEMA@.events ev\nwhere ev.dossier_id is not null;\n\n\n-- ------ 2 bis. Ouvrir un document ou un résultat ------\n--\n-- Baikal ne tient aucun fichier : lui seul le site sait signer une URL.\n-- L'ouverture passe par l'EF d'administration du site\n-- (config.apps.env_dossiers_fn, auth env_anon_key + X-Baikal-Key =\n-- env_secret_ref), action `fichier` : entrée { dossier_id, cible\n-- ('document' | 'resultat'), id }, sortie { url, expire_le }. Seuls http(s)\n-- sont ouverts par la console. Sans relais, `ouvrable` vaut false partout et\n-- les lignes restent lisibles — jamais une erreur.\n--\n-- Les ACTIONS de la fiche (renvoyer un email, relancer une analyse, créditer,\n-- purger…) passent par le même relais : action `manifeste` (ce que le site\n-- offre pour ce dossier) puis `site-action`. Référence : _shared/actions-site.ts\n-- et docs/contrats/prospects-relais-v1.ts pour la forme du passe-plat.\n\n\n-- ------ 3. Ce que Baikal fait de ces vues ------\n--\n-- Liste : recherche sur email, contact_nom, libelle ; période ; statuts du\n-- funnel ; périmètre ; catégories (si la colonne existe) ; bascules tests et\n-- supprimés ; « Ont payé » = paye_le non nul ; tri cree_le ou paye_le ;\n-- pagination. Les tuiles qui coiffent la liste viennent de baikal_mesures,\n-- chapitre 'clients' — jamais de cette vue.\n--\n-- Fiche : le noyau (contact, transaction, origine déduite de attribution,\n-- abonnement si abo_statut), puis les sections de baikal_dossier_champs, puis\n-- un onglet par vue présente, avec son compteur. Baikal n'ÉCRIT jamais dans\n-- une vue ni dans une table du site.\n--\n-- Un site n'a aucune obligation de tout publier, mais ce qu'il ne publie pas\n-- est invisible : « on doit pouvoir récupérer les informations de notre\n-- client » (Eric, 24/10/2026). Avant de laisser une vue de côté, se demander\n-- si la donnée existe vraiment nulle part — et, si elle existe sans\n-- rattachement sûr à une personne, la laisser de côté plutôt que d'inventer\n-- le rattachement.\n\n\n-- ------ 4. Recette d'installation ------\n\n-- (1) Noyau complet. Doit rendre zéro.\n--\n--     select count(*) from @SCHEMA@.baikal_dossiers\n--     where dossier_id is null or statut is null or perimetre is null\n--        or cree_le is null or est_test is null\n--        or emails_envoyes is null or emails_ouverts is null or devise is null;\n\n-- (2) Identifiant unique. Doit rendre zéro ligne.\n--\n--     select dossier_id, count(*) from @SCHEMA@.baikal_dossiers\n--     group by 1 having count(*) > 1;\n\n-- (3) Client payant = paye_le, jamais un slug. Si le funnel porte une étape\n--     d'APRÈS-VENTE (envoye, abonne…), la déclarer `apres_paiement: true` dans\n--     config.apps.funnel_etapes, sinon un client payant se lit non converti.\n--     Doit rendre zéro ligne :\n--\n--     select dossier_id from @SCHEMA@.baikal_dossiers\n--     where montant_ttc > 0 and paye_le is null;\n\n-- (4) Catégorie de la personne, identique sur toutes ses lignes. Doit rendre\n--     zéro ligne :\n--\n--     select email from @SCHEMA@.baikal_dossiers\n--     where email is not null\n--     group by email having count(distinct categorie) > 1;\n--\n--     Et aucune catégorie n'est une valeur par défaut déguisée en information\n--     (comptes-pro-v1 §3 (4 bis)) : le rôle posé à l'inscription n'est pas une\n--     catégorie choisie.\n\n-- (5) Attribution : jamais `{}`, domaines en minuscules sans www. Doit rendre\n--     zéro ligne :\n--\n--     select dossier_id, attribution from @SCHEMA@.baikal_dossiers\n--     where attribution = '{}'::jsonb\n--        or attribution ->> 'referrer_domaine' ~ '^www\\.|[A-Z]';\n\n-- (6) Chaque vue optionnelle joint sur dossier_id, et chaque dossier_id\n--     qu'elle cite existe dans la liste. Doit rendre zéro, pour chaque vue\n--     publiée :\n--\n--     select count(*) from @SCHEMA@.baikal_dossier_events v\n--     where not exists (select 1 from @SCHEMA@.baikal_dossiers d\n--                       where d.dossier_id = v.dossier_id);\n\n-- (7) Les colonnes publiées sont celles du contrat, et rien d'autre : une\n--     colonne hors contrat n'est pas rendue, mais elle trompe le prochain\n--     lecteur de la vue. Relire la liste :\n--\n--     select table_name, column_name from information_schema.columns\n--     where table_schema = '@SCHEMA@' and table_name like 'baikal_dossier%'\n--     order by 1, ordinal_position;\n\n-- (8) TOUTE TABLE SOURCE A SON GRANT ET SA POLICY baikal_read — le contrôle\n--     dont le symptôme est muet : une table oubliée ne fait pas échouer la\n--     vue, elle la sert amputée (trois tables chez MonsieurDPE le 23/09 :\n--     revendications absentes, moitié des courriels manquants, aucune\n--     erreur). Reprendre la requête de catalogue de mesures-v1 §3 (5) pour\n--     CHAQUE vue publiée (`r.ev_class = '@SCHEMA@.baikal_dossier_events'`…),\n--     et lire son avertissement : sur la base partagée, le rôle postgres a\n--     BYPASSRLS, un grant manquant ne se voit qu'au déménagement vers un\n--     projet dédié.\n\n-- (9) Lecture sous le rôle de Baikal, pour chaque vue publiée :\n--\n--     set role baikal_reader;\n--     select count(*) from @SCHEMA@.baikal_dossiers;\n--     select count(*) from @SCHEMA@.baikal_dossier_events;\n--     reset role;\n\n-- (10) Accord avec les mesures. Le nombre de payés hors tests de la liste doit\n--     être CELUI de la tuile du chapitre 'clients' (mesures-v1), sinon deux\n--     écrans annoncent deux nombres :\n--\n--     select count(*) from @SCHEMA@.baikal_dossiers\n--     where paye_le is not null and not est_test and supprime_le is null;\n\n-- (11) La fiche d'un client réel, lue à la main : ouvrir /clients dans la\n--     console, choisir un client actif, et vérifier que chaque onglet raconte\n--     ce qu'il a fait, consulté, activé — sans un fait qui manque et sans une\n--     ligne qu'on ne sait pas expliquer. C'est la seule recette que le SQL ne\n--     passe pas à votre place.\n",
 "mesures-v1": "-- ---------------------------------------------------------------------------\n-- Contrat de mesures v1 — la vue d'ensemble d'un site dans Baikal.\n--\n-- Ce fichier n'est PAS un module duplicable comme prospects-v1.sql. Ce qui est\n-- figé ici, c'est la FORME : le nom de la vue, ses colonnes, leurs types, la\n-- sémantique de chaque agrégation, et la recette d'installation du §3. Le\n-- corps de la vue appartient au site : personne d'autre que lui ne sait ce\n-- qu'est une consultation, un dossier ou un abonné chez lui.\n--\n-- Installer chez un site : copier ce fichier dans une migration du site,\n-- substituer @SCHEMA@ par le schéma du produit, remplacer les branches de\n-- l'exemple par les siennes, puis passer les sept contrôles du §3.\n--\n-- Baikal ne connaît aucun libellé, aucune clé, aucun métier. Il lit des\n-- séries, pose ses bornes de fenêtre, calcule la variation et trace la\n-- courbe. Ajouter un site ne demande aucune ligne de code Baikal.\n--\n-- Spec : docs/superpowers/specs/2026-09-23-contrat-mesures-design.md\n-- ---------------------------------------------------------------------------\n\n\n-- ------ 1. La vue ------\n--\n-- Une ligne par jour, par clé et par fenêtre.\n--\n-- | jour          | date, non nul    | jour LOCAL du site, voir §2          |\n-- | cle           | text, non nul    | identifiant stable de l'indicateur   |\n-- | libelle       | text, non nul    | le site nomme, Baikal range          |\n-- | valeur        | numeric, non nul |                                      |\n-- | agregation    | text, non nul    | 'somme' (flux) ou 'dernier' (stock)  |\n-- | format        | text, non nul    | 'nombre', 'eur' ou 'pourcent'        |\n-- | chapitre      | text, non nul    | OÙ la tuile s'affiche, voir §1.1     |\n-- | fenetre_jours | int, nullable    | non nul => agregation = 'dernier'    |\n-- | groupe        | text, nullable   | bloc de tuiles dans le chapitre      |\n-- | rendu         | text, nullable   | 'tuiles' (défaut) ou 'entonnoir'     |\n-- | ordre         | int, nullable    | rang dans le groupe, NULL en dernier |\n--\n-- Trois règles tiennent tout le reste. Elles ne sont pas des recommandations :\n-- chacune a déjà coûté un écran qui annonçait un nombre faux.\n--\n-- (a) UN FLUX SE SOMME, UN STOCK SE LIT AU DERNIER JOUR. Sommer trente lignes\n--     de « 28 fiches revendiquées » donnerait 840. Un compte de valeurs\n--     DISTINCTES sur une fenêtre est un stock, pas un flux : aucune fonction\n--     des distincts quotidiens ne donne les distincts de la période.\n--\n-- (b) LA FENÊTRE EST UNE DONNÉE, JAMAIS UN MORCEAU DE NOM. Une clé\n--     `dossiers_distincts_30j` ne suivrait pas la fenêtre choisie à l'écran :\n--     la tuile voisine afficherait 7 jours et celle-ci 30, et le lecteur\n--     calculerait un rapport faux. La fenêtre vit donc dans fenetre_jours, et\n--     le site publie une série par fenêtre qu'il veut servir (7, 30, 90).\n--     Baikal ne se rabat JAMAIS sur la fenêtre publiée la plus proche : une\n--     clé qui ne couvre pas la fenêtre demandée n'est pas affichée.\n--\n-- (b bis) UN STOCK PUBLIE UNE LIGNE PAR JOUR, ZÉROS COMPRIS, depuis sa\n--     première mesure. Une ligne absente veut dire « pas mesuré », jamais\n--     « zéro », et Baikal ne sait pas distinguer les deux : il affiche alors la\n--     dernière valeur connue, datée. Un stock publié en jointure INTERNE se\n--     fige donc à sa dernière valeur non nulle — une fenêtre glissante qui ne\n--     redescend jamais, un abonné résilié qui reste compté, une fiche\n--     supprimée qui survit. Trouvé chez MonsieurDPE le 23/09 sur quatre\n--     branches : la tuile « dossiers distincts, 7 j » aurait annoncé 1 au\n--     huitième jour sans ouverture, là où la réponse est 0. La jointure\n--     externe est ce qui répare.\n--\n--     La valeur datée du dernier jour connu est une TOLÉRANCE aux pannes de\n--     publication, pas une licence de publier par intermittence.\n--\n--     Deux bornes à cette règle. On ne publie RIEN avant la première mesure :\n--     des zéros antérieurs prétendraient qu'on mesurait déjà et dessineraient\n--     une courbe plate qui n'a jamais existé. Et un cumul monotone, qui ne peut\n--     pas décroître (un chiffre d'affaires cumulé), n'a pas besoin de ses\n--     zéros : son absence de ligne ne peut pas mentir.\n--\n-- (c) LES TESTS ET LES SUPPRIMÉS SONT EXCLUS À LA SOURCE. Tant que les KPI\n--     étaient écrits dans Baikal, c'est lui qui les écartait en joignant\n--     baikal_dossiers. Avec ce contrat, la garantie change de camp : elle\n--     appartient au site, et personne ne s'en apercevra tant que les nombres\n--     resteront plausibles. Voirie a affiché 5 demandes payées pour 2 réelles\n--     pendant des semaines, à cause de sessions TEST_SKIP_.\n--\n-- (d) UNE MESURE QUI COIFFE UNE LISTE SE DÉRIVE DE CETTE LISTE, elle ne la\n--     recompte jamais. La tuile « comptes actifs » lit baikal_comptes_pro, la\n--     tuile « dossiers payés » lit baikal_dossiers. C'est le seul montage où\n--     les deux écrans ne PEUVENT PAS diverger : recompter, c'est redéfinir un\n--     périmètre en double, et deux définitions finissent toujours par\n--     s'écarter. La règle vaut déjà dans stats-sites.ts, où les KPI se\n--     joignent à baikal_dossiers ; elle vaut maintenant pour tout le contrat.\n--     (Formulée par la session MonsieurDPE en publiant comptes_pro_actifs.)\n--\n-- (e) UN GROUPE QUI RESSEMBLE À UNE RÉPARTITION EN EST UNE, COMPLÈTE. Des\n--     tuiles posées à côté d'un total seront additionnées par le lecteur :\n--     si elles ne couvrent pas tout le total, ou si elles comptent autre chose\n--     que lui, l'addition tombe faux et le chiffre juste paraît faux. Trouvé\n--     par Eric le 24/09 sur MonsieurDPE : 27 fiches diagnostiqueur + 37 fiches\n--     entreprise + 6 inscrits sans fiche = 70, pour 71 comptes pro — un agent\n--     immobilier n'avait pas de tuile, et les fiches n'étaient pas des\n--     comptes. Une répartition dérive de la liste par sa catégorie, couvre\n--     toutes les catégories, et ne mélange pas deux unités.\n--\n-- Le format 'pourcent' porte une valeur DÉJÀ en pourcentage, de 0 à 100 :\n-- Baikal ajoute le signe, il ne multiplie pas. Un taux publié de 0 à 1\n-- s'afficherait « 0,2 % » pour 20 %.\n--\n-- L'unicité sur (jour, cle, fenetre_jours) est une PROMESSE du site : une vue\n-- ne contraint rien. Un doublon sur un 'dernier' est inoffensif, un doublon\n-- sur une 'somme' double le nombre affiché sans un bruit. Baikal le détecte et\n-- l'affiche en bandeau, mais c'est au site de ne pas en produire.\n--\n-- Les « non nul » du tableau sont des promesses de la même façon : une vue ne\n-- porte aucune contrainte, toutes ses colonnes se déclarent nullables quoi\n-- qu'on écrive. Baikal écarte donc silencieusement une ligne dont jour, cle,\n-- libelle, valeur, agregation, format ou chapitre serait nul, plutôt que\n-- d'échouer.\n\n\n-- ------ 1.1 Le chapitre : où la tuile s'affiche ------\n--\n-- Il n'y a PAS d'écran des statistiques. Une mesure s'affiche en tête du\n-- chapitre de la console auquel elle appartient : le chiffre d'affaires\n-- au-dessus de Finances, le nombre de comptes au-dessus de Comptes pro, les\n-- dossiers au-dessus de Clients. Un chiffre se lit à côté de ce qu'il compte,\n-- et les droits par module s'appliquent sans une ligne de plus : qui n'a pas\n-- le module ne voit pas ses tuiles.\n--\n-- Le vocabulaire est FERMÉ, et il appartient à Baikal, pas au site :\n--\n--     'clients' | 'finances' | 'comptes_pro'\n--\n-- Ce sont les chapitres qui montrent des données du site. Les autres modules\n-- de la console (prospects, rapports, seo, partenariats, users) portent des\n-- données de Baikal ou de Google, pas du site : une mesure n'y a rien à faire.\n-- La liste grandira le jour où un chapitre nouveau montrera du site.\n--\n-- Une valeur hors vocabulaire n'est pas affichée ailleurs par défaut : elle\n-- est écartée, comme une ligne incomplète. Baikal ne devine pas un rangement.\n--\n-- LE RENDU SE DÉCLARE, IL NE SE DEVINE PAS À UN NOM. `rendu` vaut 'tuiles'\n-- (défaut, NULL compris) ou 'entonnoir'. Un groupe en 'entonnoir' s'affiche en\n-- étapes alignées, dans l'ordre de `ordre`, avec le taux de passage entre deux\n-- étapes CONSÉCUTIVES.\n--\n-- Un nom de groupe réservé — « publie un groupe appelé funnel et Baikal\n-- comprendra » — aurait été la même faute que la fenêtre dans le nom d'une\n-- clé : de la métadonnée passée en contrebande dans une étiquette, chez un\n-- lecteur qui ne lit aucune étiquette. `groupe` reste libre et le site le nomme\n-- comme il veut, y compris « Entonnoir d'achat » ou « Parcours ».\n--\n-- Quatre règles pour un entonnoir, et la dernière est la plus importante.\n--\n--   - Toutes les mesures d'un même groupe déclarent le MÊME rendu. Un groupe\n--     panaché retombe sur des tuiles : mieux vaut un affichage ordinaire qu'un\n--     entonnoir dont une étape ne serait pas une étape. En pratique, écrire\n--     `rendu` UNE FOIS en sortie de l'union, par un `case` sur la clé, plutôt\n--     que dans chaque branche : une valeur écrite une seule fois ne peut pas\n--     diverger. (Mise en œuvre de la session MonsieurDPE.)\n--   - Une étape absente est absente : Baikal calcule ses taux entre les étapes\n--     RÉELLEMENT PUBLIÉES, et ne devine pas qu'il en manque une. Un site qui\n--     n'a pas encore de mesure de trafic affiche un entonnoir qui commence\n--     plus bas, avec ses libellés pour le dire.\n--   - Un entonnoir se lit sur la période que TOUTES ses étapes mesurent. Ses\n--     étapes sont des flux, et chacune PUBLIE SES ZÉROS depuis sa première\n--     mesure, comme un stock : c'est la seule façon pour Baikal de savoir\n--     depuis quand une étape est mesurée. Baikal calcule alors la période\n--     commune (du plus tardif des débuts à la fin de la fenêtre), y totalise\n--     les étapes et les taux, et affiche « sur N jours, depuis le JJ/MM »\n--     quand elle est plus courte que la fenêtre. Trouvé sur les premières\n--     données réelles, le 24/09 : les rapports ouverts n'étaient journalisés\n--     que depuis la veille, les courriels depuis fin août, et l'entonnoir sur\n--     30 jours affichait 11 ouvertures suivies de 19 courriels — 173 % de\n--     passage. Comparer deux étapes mesurées sur deux durées, c'est rapporter\n--     deux jours à trente.\n--   - Un taux de passage entre deux flux de la même période est APPARENT, pas\n--     une cohorte : celui qui ouvre son rapport un lundi paie trois semaines\n--     plus tard, et il n'est pas le même que celui qui paie ce lundi-là.\n--     Baikal l'écrit sous l'entonnoir. Un chiffre juste qu'on laisse lire pour\n--     ce qu'il n'est pas devient un chiffre faux.\n--\n-- LA RÈGLE POUR RANGER : le chapitre suit ce que la mesure COMPTE, pas qui l'a\n-- produite. Les analyses lancées par un diagnostiqueur abonné vont dans\n-- 'clients', parce qu'elles comptent des logements ; quarante analyses ne font\n-- pas quarante comptes. 'comptes_pro' est le chapitre des COMPTES.\n-- (Formulée par la session MonsieurDPE en rangeant ses cinq premières clés.)\n\ncreate or replace view @SCHEMA@.baikal_mesures as\n\n-- Branche d'exemple 1 : un FLUX. Une ligne par jour, sommée par Baikal sur la\n-- fenêtre demandée, donc fenetre_jours reste NULL. La jointure à\n-- baikal_dossiers est ce qui applique la règle (c).\nselect\n  (a.survenu_le at time zone 'Europe/Paris')::date as jour,\n  'achats'                                         as cle,\n  'Achats'                                         as libelle,\n  count(*)::numeric                                as valeur,\n  'somme'                                          as agregation,\n  'nombre'                                         as format,\n  'finances'                                       as chapitre,\n  null::int                                        as fenetre_jours,\n  'Ventes'                                         as groupe,\n  10                                               as ordre\nfrom @SCHEMA@.achat a\njoin @SCHEMA@.baikal_dossiers v on v.dossier_id = a.dossier_id::text\nwhere v.est_test is not true and v.supprime_le is null\ngroup by 1\n\nunion all\n\n-- Branche d'exemple 2 : un STOCK À FENÊTRE. Le compte de distincts est\n-- recalculé pour chaque jour de la courbe et pour chaque fenêtre servie, d'où\n-- la jointure au calendrier. fenetre_jours porte la fenêtre, l'agrégation est\n-- 'dernier' : Baikal lit la dernière ligne, il ne somme pas.\nselect\n  j.jour,\n  'dossiers_distincts'                        as cle,\n  'Dossiers distincts'                        as libelle,\n  count(distinct a.dossier_id)::numeric       as valeur,\n  'dernier'                                   as agregation,\n  'nombre'                                    as format,\n  'clients'                                   as chapitre,\n  f.fenetre                                   as fenetre_jours,\n  'Ventes'                                    as groupe,\n  20                                          as ordre\nfrom generate_series(\n       (current_date - interval '180 days')::date, current_date, interval '1 day'\n     ) as j(jour)\ncross join (values (7), (30), (90)) as f(fenetre)\njoin @SCHEMA@.achat a\n  on (a.survenu_le at time zone 'Europe/Paris')::date\n     between j.jour - (f.fenetre - 1) and j.jour\njoin @SCHEMA@.baikal_dossiers v on v.dossier_id = a.dossier_id::text\nwhere v.est_test is not true and v.supprime_le is null\ngroup by j.jour, f.fenetre;\n\ncomment on view @SCHEMA@.baikal_mesures is\n  'Contrat de mesures v1 lu par Baikal (admin-site-stats). Une ligne par jour, '\n  'clé et fenêtre. Un flux se somme, un stock se lit au dernier jour, et les '\n  'tests et supprimés sont exclus ICI, pas dans Baikal.';\n\n\n-- ------ 2. Le jour est LOCAL, et le registre dit lequel ------\n--\n-- La base stocke minuit heure de Paris exprimé en UTC : un `::date` nu rend la\n-- VEILLE en fin de soirée, sur toute la base et sans rien signaler. Deux sites\n-- dont l'un publie `cree_le::date` et l'autre le jour local produisent des\n-- séries décalées d'un jour, et la comparaison de période est fausse aux deux\n-- bornes.\n--\n-- Le jour se calcule donc toujours ainsi :\n--\n--     (<horodatage> at time zone '<fuseau du site>')::date\n--\n-- Le fuseau est celui déclaré dans config.apps.fuseau côté Baikal (défaut\n-- 'Europe/Paris'). C'est le même que Baikal utilise pour poser ses bornes de\n-- fenêtre : les deux doivent s'accorder, sinon la journée en cours est fausse\n-- des deux côtés à la fois. Un site qui change de fuseau change la colonne du\n-- registre ET ses vues, jamais l'une sans l'autre.\n\n\n-- ------ 3. Recette d'installation ------\n--\n-- Les sept contrôles à passer avant de déclarer un site branché. Aucun n'est\n-- facultatif : chacun correspond à une panne déjà vue, et toutes ces pannes\n-- ont la même signature, une vue plausible mais fausse, jamais une erreur.\n--\n-- Passés sur dpe.baikal_mesures le 23/09/2026 : 93 lignes, 5 clés, zéro\n-- doublon, zéro fenêtre sur un flux, zéro valeur hors vocabulaire, zéro ligne\n-- incomplète. Cette vue est antérieure à la colonne chapitre (§1.1) : elle la\n-- gagnera avant d'être branchée.\n\n-- (1) Aucun doublon. Doit rendre zéro ligne.\n--\n--     select jour, cle, fenetre_jours, count(*)\n--     from @SCHEMA@.baikal_mesures\n--     group by 1, 2, 3 having count(*) > 1;\n\n-- (2) Seul un stock porte une fenêtre. Doit rendre zéro ligne.\n--\n--     select distinct cle, agregation, fenetre_jours\n--     from @SCHEMA@.baikal_mesures\n--     where fenetre_jours is not null and agregation <> 'dernier';\n\n-- (3) Vocabulaire admis. Doit rendre zéro ligne.\n--\n--     select distinct cle, agregation, format, chapitre, rendu\n--     from @SCHEMA@.baikal_mesures\n--     where agregation not in ('somme', 'dernier')\n--        or format not in ('nombre', 'eur', 'pourcent')\n--        or chapitre not in ('clients', 'finances', 'comptes_pro')\n--        or coalesce(rendu, 'tuiles') not in ('tuiles', 'entonnoir');\n--\n--     Et le rendu uniforme par groupe, qui doit aussi rendre zéro ligne :\n--\n--     select chapitre, groupe, count(distinct coalesce(rendu, 'tuiles'))\n--     from @SCHEMA@.baikal_mesures\n--     group by 1, 2 having count(distinct coalesce(rendu, 'tuiles')) > 1;\n\n-- (4) Complétude. Doit rendre zéro.\n--\n--     select count(*) from @SCHEMA@.baikal_mesures\n--     where jour is null or cle is null or libelle is null or valeur is null\n--        or agregation is null or format is null or chapitre is null;\n\n-- (5) TOUTE TABLE SOURCE A SON GRANT ET SA POLICY baikal_read. C'est le\n--     contrôle le plus important, parce que c'est le seul dont le symptôme est\n--     muet : une table source oubliée ne fait pas échouer la vue, elle la sert\n--     AMPUTÉE. Trouvé chez MonsieurDPE le 23/09 sur trois tables\n--     (diag_revendication, envoi_campagne, envoi_recap) : revendications\n--     absentes de la timeline, moitié des courriels manquants, aucune erreur.\n--\n--     Ce contrôle ne se fait PAS à la main : les sources d'une vue se lisent\n--     dans le catalogue, et une table qui entre dans la vue six mois plus tard\n--     n'a aucune chance d'être repérée autrement. Doit rendre zéro ligne, pour\n--     chaque vue contractuelle du site.\n--\n--     with sources as (\n--       select distinct c.oid, n.nspname || '.' || c.relname as source,\n--              c.relrowsecurity as rls\n--       from pg_rewrite r\n--       join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass\n--       join pg_class c on c.oid = d.refobjid\n--       join pg_namespace n on n.oid = c.relnamespace\n--       where r.ev_class = '@SCHEMA@.baikal_mesures'::regclass\n--         and c.relkind in ('r','v','m','p') and c.oid <> r.ev_class\n--         and n.nspname not in ('pg_catalog', 'information_schema')\n--     )\n--     select source,\n--            has_table_privilege('baikal_reader', oid, 'SELECT') as grant_ok,\n--            exists (select 1 from pg_policies p\n--                     where p.schemaname || '.' || p.tablename = source\n--                       and 'baikal_reader' = any (p.roles)\n--                       and p.cmd in ('SELECT', 'ALL')) as policy_ok\n--     from sources\n--     where not has_table_privilege('baikal_reader', oid, 'SELECT')\n--        or (rls and not exists (select 1 from pg_policies p\n--                                 where p.schemaname || '.' || p.tablename = source\n--                                   and 'baikal_reader' = any (p.roles)\n--                                   and p.cmd in ('SELECT', 'ALL')));\n--\n--     Réparer chaque ligne rendue :\n--\n--         grant select on @SCHEMA@.<source> to baikal_reader;\n--         create policy baikal_read on @SCHEMA@.<source>\n--           for select to baikal_reader using (true);\n--\n--     ATTENTION à ce que ce contrôle ne dit pas. Un site de la base PARTAGÉE\n--     est lu par `SUPABASE_DB_URL`, c'est-à-dire le rôle postgres, qui a\n--     BYPASSRLS : chez lui, un grant manquant ne se voit pas, et la vue paraît\n--     complète. Le trou n'apparaît que le jour du déménagement vers un projet\n--     dédié, où la lecture passe par `baikal_reader`. Passer ce contrôle même\n--     quand tout marche est donc le seul moyen de ne pas transformer un\n--     déménagement en régression silencieuse.\n\n-- (6) Série continue des stocks. Un stock doit avoir autant de jours publiés\n--     que de jours écoulés depuis sa première mesure. Les seules lignes\n--     admises en sortie sont les cumuls monotones (§1 b bis).\n--\n--     select cle, fenetre_jours,\n--            count(distinct jour) as jours_publies,\n--            (max(jour) - min(jour) + 1) as jours_attendus\n--     from @SCHEMA@.baikal_mesures\n--     where agregation = 'dernier'\n--     group by 1, 2\n--     having count(distinct jour) <> (max(jour) - min(jour) + 1);\n\n-- (7) Lecture effective sous le rôle de Baikal, et non sous le rôle courant.\n--     Doit rendre des lignes, et les MÊMES qu'en (1).\n--\n--     set role baikal_reader;\n--     select count(*), min(jour), max(jour) from @SCHEMA@.baikal_mesures;\n--     reset role;\n\ngrant select on @SCHEMA@.baikal_mesures to baikal_reader;\n\n\n-- ------ 4. Ce que le contrat ne couvre pas ------\n--\n-- Les PÉRIODES CALENDAIRES. fenetre_jours compte des jours, comme le paramètre\n-- `jours` de admin-site-stats et les périodes de /clients (7, 30, 90). Il\n-- n'exprime ni « mois en cours » ni « année en cours », que /finances propose\n-- pourtant. Le jour où la vue d'ensemble les voudra, ce sera une v2 du\n-- contrat, pas un rattrapage silencieux.\n--\n-- Les LIGNES NOMINATIVES. Une série ne porte pas de personnes, et ne doit pas\n-- en porter. Les listes ont leurs propres contrats : baikal_dossiers pour le\n-- chapitre Clients, baikal_comptes_pro pour le chapitre Comptes pro. Les\n-- mesures les coiffent, elles ne les remplacent pas.\n--\n-- Les COLONNES TOUJOURS VIDES. Une colonne optionnelle qu'un site ne sait pas\n-- remplir doit être ABSENTE, pas présente et nulle : la capacité se lit à la\n-- présence, et une colonne vide se lit comme un fait (« personne n'ouvre nos\n-- courriels ») au lieu d'une absence de mesure.\n",
 "comptes-pro-v1": "-- ---------------------------------------------------------------------------\n-- Contrat Comptes pro v1 — le chapitre Comptes pro de la console.\n--\n-- Contrat de FORME, comme mesures-v1 : le nom de la vue, ses colonnes et leurs\n-- types sont figés, le corps appartient au site.\n--\n-- Deux populations, jamais mélangées. Le chapitre CLIENTS liste les dossiers,\n-- c'est-à-dire l'acte commercial : baikal_dossiers. Le chapitre COMPTES (id de\n-- module comptes_pro, libellé « Comptes » depuis le 06/10/2026) liste ceux qui\n-- ont un compte chez le site, pro ou particulier : l'agence immobilière de\n-- Pré-état-daté, le diagnostiqueur abonné de MonsieurDPE, l'installateur de\n-- Conseil Solaire, et l'inscrit d'une app grand public. Chez un particulier,\n-- raison_sociale vaut son nom, à défaut son email. Un compte vit dans le\n-- temps, un dossier est un événement.\n--\n-- Les tuiles qui coiffent la liste ne sont PAS ici : elles viennent de\n-- baikal_mesures avec chapitre = 'comptes_pro'. Une vue de liste ne porte pas\n-- d'agrégat, sans quoi deux écrans finiront par annoncer deux nombres.\n--\n-- Installer chez un site : copier dans une migration du site, substituer\n-- @SCHEMA@, écrire la projection, passer la recette du §3.\n--\n-- Spec : docs/superpowers/specs/2026-09-23-contrat-mesures-design.md\n-- ---------------------------------------------------------------------------\n\n\n-- ------ 1. La vue ------\n--\n-- NOYAU, obligatoire. Sans lui, pas de chapitre.\n--\n-- | compte_id      | text, non nul    | identifiant côté site            |\n-- | raison_sociale | text, non nul    | ce qui s'affiche dans la liste   |\n-- | email          | text, nullable   |                                  |\n-- | cree_le        | timestamptz      | date d'ouverture du compte       |\n-- | actif          | boolean, non nul | compte ouvert ou fermé           |\n-- | est_test       | boolean, non nul | bascule « Exclure tests »        |\n-- | supprime_le    | timestamptz null | bascule « Inclure supprimés »    |\n--\n-- BLOCS OPTIONNELS. La capacité se lit à la PRÉSENCE des colonnes : un bloc\n-- absent de la vue n'est pas affiché, ce n'est jamais une erreur.\n--\n-- Chaque colonne d'un bloc est INDÉPENDAMMENT optionnelle. Le bloc est déclaré\n-- par sa colonne pivot — `abo_statut` pour l'abonnement, `credits_stock` pour\n-- les crédits, `ca_ttc` pour l'argent. Sans le pivot, pas de bloc ; avec lui,\n-- Baikal affiche ce qui est là et rien d'autre.\n--\n-- Ce n'est pas du laxisme, c'est l'alignement sur le contrat voisin. Clients\n-- n'a jamais exigé de bloc entier : dpe.baikal_dossiers publie quatre colonnes\n-- abo_* sur cinq depuis le 02/09, sans `abo_montant_mensuel`, parce que le\n-- montant d'un abonnement n'existe nulle part côté dpe — le catalogue de prix\n-- vit chez Stripe. Exiger ici ce que Clients n'exige pas, sur LES MÊMES\n-- colonnes, obligerait le site à recopier un tarif dans sa vue : une seconde\n-- source de vérité pour un prix, qui divergera au premier changement, dans une\n-- console où l'on passe la journée à empêcher deux écrans d'annoncer deux\n-- nombres.\n--\n-- Crédits (Pré-état-daté, Conseil Solaire) :\n-- | credits_stock      | int     | solde disponible                      |\n-- | credits_achetes    | int     | cumul acheté                          |\n-- | credits_consommes  | int     | cumul consommé                        |\n--\n-- Argent :\n-- | ca_ttc             | numeric | cumul facturé au compte               |\n-- | devise             | text    | 'EUR'                                 |\n--\n-- Abonnement (MonsieurDPE), même vocabulaire que baikal_dossiers :\n-- | abo_statut             | text        | 'trialing', 'active', 'past_due'… |\n-- | abo_plan               | text        | slug du plan                      |\n-- | abo_montant_mensuel    | numeric     |                                   |\n-- | abo_prochaine_echeance | timestamptz |                                   |\n-- | abo_resilie_le         | timestamptz |                                   |\n--\n-- Divers :\n-- | contact_nom        | text        | la personne, quand le site la tient |\n-- | telephone          | text        |                                     |\n-- | categorie          | text        | slug de config.apps.categories_client |\n-- | derniere_activite_le | timestamptz | pour trier les comptes dormants   |\n--\n-- Deux règles valent ici comme ailleurs, et pour les mêmes raisons.\n--\n-- (a) LES TESTS ET LES SUPPRIMÉS SONT PORTÉS PAR LA VUE, pas redéfinis par\n--     Baikal. La définition du test appartient au site, et c'est elle qui doit\n--     valoir dans la liste ET dans les mesures : un compte écarté ici et\n--     compté là serait la panne de Voirie à l'identique.\n--\n-- (b) UNE COLONNE QU'ON NE SAIT PAS REMPLIR EST ABSENTE, jamais présente et\n--     nulle. Un `credits_stock` toujours nul se lit « ce compte n'a plus rien »\n--     au lieu de « ce site ne vend pas de crédits ».\n--\n--     À ne pas confondre avec une colonne dont NULL est une réponse. Chez un\n--     site qui ne supprime jamais un compte, `supprime_le` vaut null partout,\n--     et c'est juste : null y signifie « pas supprimé », pas « on ne sait\n--     pas ». Elle reste au noyau, et la bascule « Inclure supprimés » continue\n--     de fonctionner.\n\ncreate or replace view @SCHEMA@.baikal_comptes_pro as\nselect\n  p.id::text                as compte_id,\n  p.company_name            as raison_sociale,\n  p.email                   as email,\n  p.created_at              as cree_le,\n  coalesce(p.is_active, true) as actif,\n  coalesce(p.is_test, false)  as est_test,\n  p.deleted_at              as supprime_le,\n  -- Bloc crédits : retirer ces trois lignes chez un site qui n'en vend pas.\n  coalesce(p.credits_balance, 0)   as credits_stock,\n  coalesce(p.credits_purchased, 0) as credits_achetes,\n  coalesce(p.credits_consumed, 0)  as credits_consommes,\n  -- Bloc argent.\n  coalesce(p.revenue_eur, 0)       as ca_ttc,\n  'EUR'                            as devise\nfrom @SCHEMA@.pro_accounts p;\n\ncomment on view @SCHEMA@.baikal_comptes_pro is\n  'Contrat Comptes pro v1 lu par Baikal (admin-comptes-pro). Ceux qui ont '\n  'un compte chez le site, pro ou particulier, une ligne par compte. Les agrégats ne sont PAS ici : '\n  'ils viennent de baikal_mesures, chapitre comptes_pro.';\n\n\n-- ------ 2. Ce que Baikal fait de cette vue ------\n--\n-- Une liste : recherche sur la raison sociale et le courriel, tri sur les\n-- colonnes présentes, bascules « Exclure tests » et « Inclure supprimés »,\n-- pagination. Les tuiles du chapitre la coiffent.\n--\n-- Baikal n'ÉCRIT jamais dans cette vue, et n'écrit jamais dans les tables du\n-- site. Créditer un compte, le suspendre ou le fermer passe par l'EF\n-- d'administration du site (config.apps.env_dossiers_fn), comme les actions de\n-- la fiche client. Pas d'EF déclarée, pas de bouton.\n\n\n-- ------ 3. Recette d'installation ------\n\n-- (1) Noyau complet. Doit rendre zéro.\n--\n--     select count(*) from @SCHEMA@.baikal_comptes_pro\n--     where compte_id is null or raison_sociale is null\n--        or actif is null or est_test is null;\n\n-- (2) Identifiant unique. Doit rendre zéro ligne.\n--\n--     select compte_id, count(*) from @SCHEMA@.baikal_comptes_pro\n--     group by 1 having count(*) > 1;\n\n-- (3) Colonnes pivots. Un bloc dont une colonne est publiée sans son pivot ne\n--     s'affichera pas : relire la liste et vérifier que `credits_stock`,\n--     `abo_statut` ou `ca_ttc` est bien là quand le bloc est voulu.\n--\n--     select column_name from information_schema.columns\n--     where table_schema = '@SCHEMA@' and table_name = 'baikal_comptes_pro';\n\n-- (4) Accord avec les mesures. Le nombre de comptes actifs de la liste doit\n--     être CELUI de la tuile, sans quoi deux écrans annoncent deux nombres.\n--\n--     select count(*) from @SCHEMA@.baikal_comptes_pro\n--     where actif and not est_test and supprime_le is null;\n--     -- à comparer à la mesure de chapitre 'comptes_pro' qui compte les\n--     -- comptes actifs, au dernier jour publié.\n\n-- (4 bis) AUCUNE CATÉGORIE N'EST UNE VALEUR PAR DÉFAUT DÉGUISÉE EN\n--     INFORMATION. Un site dont le rôle est posé à l'inscription puis promu à\n--     une activation a toujours une population invisible entre les deux : elle\n--     porte le rôle initial, et la console l'affiche comme un fait.\n--\n--     Trouvé chez MonsieurDPE le 23/09 : `particulier` est le rôle posé à\n--     l'inscription, promu à la validation d'une revendication de fiche. Six\n--     comptes s'étaient arrêtés avant, dont quatre cabinets de diagnostic\n--     reconnaissables à leur domaine, et la liste les annonçait « Particulier ».\n--\n--     Le contrôle : pour chaque valeur de `categorie`, se demander si elle est\n--     CHOISIE ou SUBIE. Une valeur subie mérite son propre slug, sans quoi\n--     elle se lit comme une affirmation. Un vrai particulier, lui, se distingue\n--     par un acte — un achat, une commande — et non par l'absence d'un autre.\n--\n--     select categorie, count(*) from @SCHEMA@.baikal_comptes_pro group by 1;\n--\n--     (Formulé par la session MonsieurDPE en corrigeant ses deux vues.)\n\n-- (4 ter) LES DEUX VUES S'ACCORDENT LIGNE À LIGNE sur les colonnes qu'elles\n--     partagent. Un site qui publie `categorie` ici ET dans baikal_dossiers\n--     doit la DÉRIVER de celle qui fait autorité, jamais la recalculer : deux\n--     cascades du même fait s'écartent toujours, et aucune n'est fausse de son\n--     point de vue, ce qui rend l'écart introuvable.\n--\n--     Trouvé chez MonsieurDPE le 23/09 : la même personne sortait « inscrit\n--     sans fiche » de baikal_comptes_pro et « agent immo » de baikal_dossiers,\n--     la cascade courte de la première ignorant un lead de sourcing agence.\n--\n--     Doit rendre zéro ligne (adapter la clé de rapprochement du site) :\n--\n--     select p.compte_id, p.categorie, d.categorie\n--     from @SCHEMA@.baikal_comptes_pro p\n--     join @SCHEMA@.baikal_dossiers d on d.email = p.email\n--     where p.categorie is distinct from d.categorie;\n\n-- (5) Toute table source a son grant ET sa policy baikal_read. Reprendre la\n--     requête de catalogue de mesures-v1 §3 (5) en changeant le nom de la vue,\n--     et lire son avertissement : sur la base partagée, le rôle postgres a\n--     BYPASSRLS, donc un grant manquant ne se voit pas et n'apparaîtra qu'au\n--     déménagement vers un projet dédié.\n\n-- (6) Lecture sous le rôle de Baikal.\n--\n--     set role baikal_reader;\n--     select count(*) from @SCHEMA@.baikal_comptes_pro;\n--     reset role;\n\ngrant select on @SCHEMA@.baikal_comptes_pro to baikal_reader;\n",
 "comptes-historique-v1": "-- ---------------------------------------------------------------------------\n-- Contrat Comptes historique v1 — la fiche d'un compte dans la console.\n--\n-- Contrat de FORME, comme comptes-pro-v1 : le nom de la vue, ses colonnes et\n-- leurs types sont figés, le corps appartient au site.\n--\n-- Ce que la personne a FAIT ou ACHETÉ, une ligne par événement, du plus\n-- récent au plus ancien. Chez un site à crédits (Pré-état-daté), chaque\n-- transaction de crédit ; chez un site à abonnement, chaque facture, chaque\n-- changement de plan. Rien n'est stocké pour Baikal : la vue dérive.\n--\n-- Vient avec deux autres éléments du chapitre Comptes :\n--   - baikal_comptes_pro (contrat comptes-pro-v1), la liste ;\n--   - la colonne OPTIONNELLE `compte_id` (text) de baikal_dossiers, qui\n--     relie un dossier à son compte sans passer par un nom de société. Sans\n--     elle, la fiche n'a pas de liste de dossiers — ce n'est pas une erreur.\n-- Les actions sur un compte (créditer, désactiver, réactiver, supprimer…)\n-- passent par l'EF d'administration du site (config.apps.env_admin_fn), qui\n-- publie un manifeste PAR COMPTE au même format que celui des dossiers, avec\n-- la clé `compte_id` (actions `manifeste` et `site-action` de\n-- admin-comptes-pro, relais _shared/actions-site.ts). Baikal n'écrit jamais\n-- dans les tables du site.\n--\n-- Installer chez un site : copier dans une migration du site, substituer\n-- @SCHEMA@, écrire la projection, passer la recette du §2.\n--\n-- Spec : Pack Vendeur, docs/superpowers/specs/2026-10-06-baikal-chapitre-comptes-design.md\n-- ---------------------------------------------------------------------------\n\n\n-- ------ 1. La vue ------\n--\n-- NOYAU, obligatoire.\n--\n-- | compte_id    | text, non nul         | le compte (baikal_comptes_pro.compte_id) |\n-- | evenement_id | text, non nul, unique | identifiant d'affichage                  |\n-- | survenu_le   | timestamptz, non nul  | tri                                      |\n-- | nature       | text, non nul         | achat · consommation · ajustement ·      |\n-- |              |                       | remboursement · bienvenue · parrainage · |\n-- |              |                       | option ; un site peut en ajouter         |\n-- |              |                       | (abonnement, facture)                    |\n--\n-- OPTIONNELLES. Une colonne qu'on ne sait pas remplir est ABSENTE, jamais\n-- présente et nulle (un site à abonnement n'a ni quantite ni solde_apres).\n--\n-- | libelle      | text                | une phrase, écrite par le site           |\n-- | quantite     | int, nullable       | crédits, signée                          |\n-- | montant_ttc  | numeric, nullable   | l'argent quand il y en a                 |\n-- | devise       | text                | 'EUR'                                    |\n-- | solde_apres  | int, nullable       |                                          |\n-- | dossier_id   | text, nullable      | lien vers baikal_dossiers                |\n\ncreate or replace view @SCHEMA@.baikal_compte_historique as\nselect\n  x.pro_account_id::text as compte_id,\n  x.id::text             as evenement_id,\n  x.created_at           as survenu_le,\n  case x.type\n    when 'purchase' then 'achat'\n    when 'usage'    then 'consommation'\n    else x.type\n  end                    as nature,\n  x.description          as libelle,\n  x.amount::int          as quantite,\n  x.amount_paid_eur      as montant_ttc,\n  'EUR'::text            as devise,\n  x.balance_after::int   as solde_apres,\n  x.dossier_id::text     as dossier_id\nfrom @SCHEMA@.pro_credit_transactions x\nwhere x.pro_account_id is not null;\n\ncomment on view @SCHEMA@.baikal_compte_historique is\n  'Contrat Comptes historique v1 lu par Baikal (fiche compte). Une ligne par '\n  'événement du compte, rien de stocké.';\n\n\n-- ------ 2. Recette d'installation ------\n\n-- (1) Noyau complet. Doit rendre zéro.\n--\n--     select count(*) from @SCHEMA@.baikal_compte_historique\n--     where compte_id is null or evenement_id is null\n--        or survenu_le is null or nature is null;\n\n-- (2) Identifiant unique. Doit rendre zéro ligne.\n--\n--     select evenement_id, count(*) from @SCHEMA@.baikal_compte_historique\n--     group by 1 having count(*) > 1;\n\n-- (3) Chaque événement a son compte dans la liste. Doit rendre zéro.\n--\n--     select count(*) from @SCHEMA@.baikal_compte_historique h\n--     where not exists (select 1 from @SCHEMA@.baikal_comptes_pro c\n--                       where c.compte_id = h.compte_id);\n\n-- (4) Lecture sous le rôle de Baikal : même nombre qu'en service_role.\n--\n--     set role baikal_reader;\n--     select count(*) from @SCHEMA@.baikal_compte_historique;\n--     reset role;\n\n-- (5) Toute table source a son grant ET sa policy baikal_read (README).\n\ngrant select on @SCHEMA@.baikal_compte_historique to baikal_reader;\n"
};
