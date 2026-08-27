/**
 * ImportProspectsDialog.jsx - Baikal Console
 * ============================================================================
 * Import CSV par lots dans la base d'un site, relaye par
 * prospectsService.importer -> admin-prospects -> RPC baikal_prospect_importer
 * -> <schema>.prospect_importer (spec 2026-08-27, verifie tache 2).
 *
 * Ce dernier ecrit en `on conflict (email) do nothing` : un import ne modifie
 * JAMAIS le statut d'un prospect deja connu, une adresse connue est comptee
 * en doublon. C'est une garantie du serveur, pas de ce composant -- elle est
 * seulement annoncee ici, au-dessus du bouton d'envoi.
 *
 * C'est aussi le serveur qui decide, seul, qu'une valeur "email" ne ressemble
 * pas a une adresse (regex sur `dpe.prospect_importer`, deja verifiee de bout
 * en bout tache 2) : ce composant n'a pas de filtre client qui deciderait quoi
 * envoyer, seulement un miroir informatif utilise pour l'apercu (colonne
 * `valides` + surlignage rouge dans les 5 lignes montrees). Dupliquer le
 * regex serveur pour filtrer l'envoi risquerait de diverger de lui -- deux
 * regles qui doivent rester d'accord pour toujours, exactement le defaut que
 * la vue contractuelle de /clients existe pour eviter (CLAUDE.md). Les
 * lignes rejetees ne comptent de toute facon pas dans `recus` cote serveur :
 * le compte-rendu final (qui accumule le `recus` RENVOYE par chaque appel,
 * jamais un compte client) est donc correct que ce composant filtre ou non.
 *
 * Decoupage en lots de TAILLE_LOT : la borne serveur est 2000 lignes par
 * appel (admin-prospects renvoie une 400 au-dela, sans tronquer -- c'est au
 * client de decouper). 500 laisse de la marge et rend la barre de
 * progression utile sur un fichier de plusieurs milliers de lignes.
 * ============================================================================
 */
import { useState } from 'react';
import {
  Info, Loader2, Upload, X,
} from 'lucide-react';
import { prospectsService } from '../../services/prospects.service';
import { parseCsv } from '../../utils/csv';
import { Erreur } from './etats';
import { fmtNombre } from './badges-prospects';

const TAILLE_LOT = 500;

// Alias de colonnes, insensibles a la casse : parseCsv normalise deja les
// en-tetes en minuscules, donc comparer directement aux cles ci-dessous
// suffit. Ce sont les alias demandes pour CE contrat (prospect_importer),
// distincts de ceux -- plus larges, pour un autre contrat -- de
// versProspects/csv.js (pas de commune/siret, "nom" n'y couvre pas
// nom_affiche/raison_sociale) : reutiliser versProspects ici mapperait mal
// la moitie des colonnes.
const ALIAS_COLONNES = [
  ['email', ['email']],
  ['nom_affiche', ['nom', 'nom_affiche', 'raison_sociale']],
  ['commune', ['commune', 'ville']],
  ['code_postal', ['code_postal', 'cp']],
  ['telephone', ['telephone', 'tel']],
  ['site_web', ['site_web', 'site']],
  ['siret', ['siret']],
];

// Miroir du regex que dpe.prospect_importer applique reellement
// (^[^@\s]+@[^@\s]+\.[^@\s]+$) : voir le commentaire d'en-tete -- sert
// uniquement a l'apercu, jamais a decider ce qui est envoye.
const EMAIL_PLAUSIBLE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function mapperLigne(brut) {
  const ligne = {};
  for (const [champ, alias] of ALIAS_COLONNES) {
    const cle = alias.find((a) => brut[a] !== undefined && brut[a] !== '');
    if (cle) ligne[champ] = brut[cle];
  }
  return ligne;
}

export default function ImportProspectsDialog({
  appId, metiers, onFerme, onImporte,
}) {
  const [metier, setMetier] = useState(metiers?.[0]?.slug ?? '');
  const [nomFichier, setNomFichier] = useState('');
  const [analyse, setAnalyse] = useState(null); // { lignes: [...mappees], valides }
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState(null); // { fait, total } en lots
  // { recus, inseres, doublons } cumules sur les lots reussis, `complet`
  // (tous les lots sont passes) et `lignesRestantes` (non confirmees si
  // l'envoi s'est arrete en cours de route) -- voir lancerImport.
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  async function choisirFichier(event) {
    const fichier = event.target.files?.[0];
    // Vide immediatement : permet de re-choisir le meme fichier (meme nom)
    // sans quoi un second choix identique ne redeclenche pas onChange.
    event.target.value = '';
    if (!fichier) return;
    setErreur(null);
    setResultat(null);
    setProgression(null);
    setNomFichier(fichier.name);
    const texte = await fichier.text();
    const lignes = parseCsv(texte).lignes.map(mapperLigne);
    const valides = lignes.filter((l) => l.email && EMAIL_PLAUSIBLE.test(l.email)).length;
    setAnalyse({ lignes, valides });
  }

  async function lancerImport() {
    if (!analyse || !metier || analyse.lignes.length === 0 || enCours) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);

    const lots = [];
    for (let i = 0; i < analyse.lignes.length; i += TAILLE_LOT) {
      lots.push(analyse.lignes.slice(i, i + TAILLE_LOT));
    }
    setProgression({ fait: 0, total: lots.length });

    const cumul = { recus: 0, inseres: 0, doublons: 0 };
    let lotsReussis = 0;
    // Lignes BRUTES (pas `recus`, qui exclut deja les adresses invalides
    // cote serveur) des lots confirmes par une reponse serveur reussie.
    // Sert a chiffrer honnetement ce qui n'a PAS ete confirme sur un arret
    // en cours de route (voir setResultat plus bas) : le lot en echec et
    // tous ceux qui suivent, jamais confirmes, pas seulement "jamais
    // envoyes" -- une reponse perdue en route est aussi peu confirmee
    // qu'un lot jamais tente.
    let lignesConfirmees = 0;
    // Message d'echec du lot qui a arrete l'envoi ; reste null si tous les
    // lots sont passes. Sert deux fois plus bas (bandeau d'erreur ET flag
    // `complet` du resultat) : capture ici plutot que deux fois recalcule.
    let messageEchec = null;
    // Sequentiel et non parallele : la progression affichee doit refleter
    // des lots realises, pas simplement lances, et un echec doit arreter
    // l'envoi plutot que de continuer a cote d'un lot en erreur.
    for (const lot of lots) {
      // Le metier est choisi UNE FOIS pour tout le lot (le CSV n'en porte
      // jamais un fiable, voir l'en-tete). La provenance n'est jamais
      // envoyee : le serveur la defaut a 'import'.
      const lignes = lot.map((l) => ({ ...l, metier }));
      const { data, error } = await prospectsService.importer(appId, lignes);
      if (error) {
        messageEchec = `Import interrompu au lot ${lotsReussis + 1} sur ${lots.length} : ${error.message}`;
        break;
      }
      cumul.recus += data.recus;
      cumul.inseres += data.inseres;
      cumul.doublons += data.doublons;
      lignesConfirmees += lot.length;
      lotsReussis += 1;
      setProgression({ fait: lotsReussis, total: lots.length });
    }

    setEnCours(false);
    if (messageEchec) setErreur(messageEchec);
    // Le compte-rendu s'affiche des que l'envoi s'est arrete, MEME a zero
    // lot reussi (echec sur le tout premier lot) : le pilote est "l'envoi
    // est termine", pas "au moins un lot est passe". "0 insere, 0 doublon"
    // est une information (rien n'est entre) -- le silence se lirait comme
    // "peut-etre entre, personne ne le dit", ce qui est pire. `complet`
    // distingue les deux gabarits d'affichage (voir le rendu) : un arret en
    // cours de route n'a jamais droit a la phrase de succes complet, meme
    // couleur, meme mot -- c'est exactement ce qui pouvait faire croire a
    // un operateur qu'un import stoppe a mi-fichier etait termine.
    setResultat({
      ...cumul,
      complet: !messageEchec,
      lignesRestantes: analyse.lignes.length - lignesConfirmees,
    });
    // Le rafraichissement de la liste, lui, reste conditionne a une
    // ecriture reelle : recharger une liste qui n'a pas bouge n'apporte
    // rien (contrairement au compte-rendu ci-dessus, toujours du, ceci
    // reste un pur gain de reseau evite).
    if (lotsReussis > 0) {
      onImporte();
    }
  }

  function fermer() {
    if (enCours) return; // des lots sont en vol : fermer ne les annule pas, seulement masquerait leur suivi.
    onFerme();
  }

  const pretAEnvoyer = Boolean(analyse) && analyse.lignes.length > 0 && Boolean(metier) && !enCours;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
      onClick={fermer}
    >
      <div
        className="bg-baikal-surface border border-baikal-border rounded-lg w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 p-4 border-b border-baikal-border">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-baikal-cyan" />
            <h3 className="text-white font-semibold">Importer un CSV</h3>
          </div>
          <button
            onClick={fermer}
            disabled={enCours}
            className="p-1.5 text-baikal-text hover:text-white rounded-md hover:bg-baikal-bg disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs text-baikal-text opacity-60">Fichier CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={choisirFichier}
                disabled={enCours}
                className="w-full text-sm text-baikal-text file:mr-3 file:px-3 file:py-1.5 file:rounded-md
                  file:border file:border-baikal-border file:bg-baikal-bg file:text-baikal-text file:text-xs
                  hover:file:border-baikal-cyan disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs text-baikal-text opacity-60">
                Métier (appliqué à tout le lot)
              </label>
              {/* Options depuis la prop metiers (donnees.metiers, table admin.metier) :
                  jamais une liste figee ici, voir la regle du module. */}
              <select
                value={metier}
                onChange={(e) => setMetier(e.target.value)}
                disabled={enCours}
                className="w-full px-3 py-2 bg-baikal-bg border border-baikal-border rounded-md text-sm
                  text-white focus:outline-none focus:border-baikal-cyan disabled:opacity-50"
              >
                {(metiers || []).map((m) => (
                  <option key={m.slug} value={m.slug}>{m.libelle}</option>
                ))}
              </select>
            </div>
          </div>

          {analyse && (
            <div className="space-y-2">
              <p className="text-sm text-baikal-text">
                <span className="font-mono text-xs opacity-60">{nomFichier}</span>
                {' — '}
                <span className="tabular-nums">{fmtNombre(analyse.lignes.length)}</span>
                {' '}ligne(s) lue(s), dont{' '}
                <span className="tabular-nums text-baikal-cyan">{fmtNombre(analyse.valides)}</span>
                {' '}avec une adresse qui semble valide.
              </p>

              {analyse.lignes.length === 0 ? (
                <p className="text-xs text-amber-300">Aucune ligne exploitable dans ce fichier.</p>
              ) : (
                <div>
                  <p className="text-xs text-baikal-text opacity-60 mb-1">
                    Aperçu
                    {analyse.lignes.length > 5 ? ' — 5 premières lignes' : ''}
                  </p>
                  <div className="border border-baikal-border rounded-md overflow-x-auto">
                    <table className="w-full text-xs text-baikal-text">
                      <thead>
                        <tr className="text-left opacity-70 border-b border-baikal-border">
                          <th className="px-2 py-1.5">Email</th>
                          <th className="px-2 py-1.5">Nom</th>
                          <th className="px-2 py-1.5">Commune</th>
                          <th className="px-2 py-1.5">CP</th>
                          <th className="px-2 py-1.5">Téléphone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyse.lignes.slice(0, 5).map((l, i) => (
                          // Cle d'index defendable : apercu fige d'un tableau
                          // jamais reordonne/mute pendant l'affichage de ce dialogue.
                          <tr key={i} className="border-t border-baikal-border/50">
                            <td className="px-2 py-1.5">
                              <span className={l.email && EMAIL_PLAUSIBLE.test(l.email) ? '' : 'text-red-300'}>
                                {l.email || '—'}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">{l.nom_affiche || '—'}</td>
                            <td className="px-2 py-1.5">{l.commune || '—'}</td>
                            <td className="px-2 py-1.5">{l.code_postal || '—'}</td>
                            <td className="px-2 py-1.5">{l.telephone || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg border bg-blue-900/20 border-blue-500/30">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-300" />
            <p className="text-sm text-blue-300">
              Un import ne modifie jamais le statut d&apos;un prospect déjà connu.
            </p>
          </div>

          {progression && (
            <div className="space-y-1.5">
              <p className="text-xs text-baikal-text opacity-70">
                {/* "Termine" ne doit JAMAIS s'afficher sur un arret en
                    cours de route (voir erreur ci-dessous) : ce mot a lui
                    seul suffit a faire croire qu'un import stoppe a
                    mi-fichier est complet. Trois libelles mutuellement
                    exclusifs plutot qu'un ternaire enCours/Termine. */}
                {enCours && (
                  <>
                    Envoi en cours — lot{' '}
                    <span className="tabular-nums">{fmtNombre(progression.fait)}</span>
                    {' '}sur{' '}
                    <span className="tabular-nums">{fmtNombre(progression.total)}</span>
                  </>
                )}
                {!enCours && erreur && (
                  <>
                    Interrompu après{' '}
                    <span className="tabular-nums">{fmtNombre(progression.fait)}</span>
                    {' '}lot(s) sur{' '}
                    <span className="tabular-nums">{fmtNombre(progression.total)}</span>
                  </>
                )}
                {!enCours && !erreur && (
                  <>
                    Terminé —{' '}
                    <span className="tabular-nums">{fmtNombre(progression.total)}</span>
                    {' '}lot(s)
                  </>
                )}
              </p>
              <div className="h-2 bg-baikal-bg border border-baikal-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-baikal-cyan transition-all"
                  style={{ width: `${(progression.fait / progression.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {erreur && <Erreur message={erreur} />}

          {resultat && resultat.complet && (
            <p className="text-sm text-emerald-300">
              Import :{' '}
              <span className="tabular-nums">{fmtNombre(resultat.inseres)}</span>
              {' '}insérés,{' '}
              <span className="tabular-nums">{fmtNombre(resultat.doublons)}</span>
              {' '}doublons ignorés{' '}
              (<span className="tabular-nums">{fmtNombre(resultat.recus)}</span>
              {' '}lignes lues).
            </p>
          )}

          {/* Arret en cours de route : jamais la phrase de succes complet
              (meme couleur, meme mot) -- c'est ce qui laissait croire a un
              import termine alors que des lots entiers n'avaient jamais ete
              tentes. Ambre (alerte), pas vert (succes) ni rouge (deja pris
              par le bandeau d'erreur technique ci-dessus) : un etat a part,
              ni l'un ni l'autre. */}
          {resultat && !resultat.complet && (
            <div className="space-y-1.5 p-3 rounded-lg border bg-amber-900/20 border-amber-500/30">
              <p className="text-sm text-amber-300">
                Import interrompu :{' '}
                <span className="tabular-nums">{fmtNombre(resultat.inseres)}</span>
                {' '}insérés,{' '}
                <span className="tabular-nums">{fmtNombre(resultat.doublons)}</span>
                {' '}doublons ignorés avant l&apos;arrêt —{' '}
                <span className="tabular-nums">{fmtNombre(resultat.lignesRestantes)}</span>
                {' '}ligne(s) du fichier n&apos;ont pas été traitées.
              </p>
              {/* La garantie du bloc bleu au-dessus s'applique deja, mais
                  ici c'est ce qui rend un arret actionnable plutot
                  qu'alarmant : dire explicitement, au moment ou l'operateur
                  se demande quoi faire, que reprendre est sans risque. */}
              <p className="text-xs text-amber-200/80">
                Vous pouvez réimporter le même fichier sans risque : les adresses déjà
                connues seront comptées en doublons, aucun statut existant ne sera modifié.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-baikal-border bg-baikal-bg/50">
          <button
            onClick={fermer}
            disabled={enCours}
            className="px-4 py-2 text-sm text-baikal-text hover:text-white transition-colors disabled:opacity-50"
          >
            Fermer
          </button>
          <button
            onClick={lancerImport}
            disabled={!pretAEnvoyer}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-baikal-cyan
              text-baikal-bg hover:bg-baikal-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {enCours ? 'Envoi…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
