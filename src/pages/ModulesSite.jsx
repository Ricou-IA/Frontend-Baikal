/**
 * ModulesSite.jsx - Baikal Console
 * ============================================================================
 * Ouvrir / fermer les modules des organisations clientes du site sélectionné,
 * par son canal d'administration (config.apps.env_admin_fn ; baikal-admin
 * chez Majord'home — spec Majord'home 2026-09-26).
 *
 * Une ligne par organisation, une case par module du catalogue. Libellés,
 * descriptions et état effectif viennent du site à chaque chargement : Baikal
 * ne recopie rien. Enregistrement par ligne, qui n'envoie que les cases
 * changées et remplace la ligne par ce que le site renvoie ; une erreur reste
 * sur sa ligne, avec la saisie, et jamais de succès supposé.
 * ============================================================================
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, RotateCcw, Save } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ConsoleLayout from '../components/console/ConsoleLayout';
import LectureSeule from '../components/console/LectureSeule';
import { useDroitModule } from '../hooks/useDroitModule';
import { Chargement, Erreur, LigneVide, Section, Vide } from '../components/console/etats';
import { modulesSiteService } from '../services/modulesSite.service';

// Les clés qui diffèrent entre l'état du site et la saisie.
function changements(effectif, saisie) {
  const out = {};
  for (const [cle, valeur] of Object.entries(saisie || {})) {
    if (effectif?.[cle] !== valeur) out[cle] = valeur;
  }
  return out;
}

function LigneOrganisation({ org, catalogue, ecriture, onEnregistree }) {
  const { currentApp } = useApp();
  const [saisie, setSaisie] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [enregistree, setEnregistree] = useState(false);

  const valeur = (cle) => (cle in saisie ? saisie[cle] : Boolean(org.modules?.[cle]));
  const diff = changements(org.modules, saisie);
  const modifiee = Object.keys(diff).length > 0;

  const basculer = (cle) => {
    setEnregistree(false);
    setErreur(null);
    setSaisie((s) => ({ ...s, [cle]: !valeur(cle) }));
  };

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    setEnregistree(false);
    const { data, error } = await modulesSiteService.enregistrer(currentApp, org.id, diff);
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    // Seule la réponse du site fait foi : pas d'organisation renvoyée = pas
    // de succès.
    if (!data?.organisation?.id) {
      setErreur('Réponse du site sans organisation : enregistrement non confirmé');
      return;
    }
    onEnregistree(data.organisation);
    setSaisie({});
    setEnregistree(true);
  };

  return (
    <>
      <tr className="border-t border-baikal-border/50 align-middle">
        <td className="px-4 py-3 text-white whitespace-nowrap">{org.nom || org.id}</td>
        {catalogue.map((m) => {
          const coche = valeur(m.key);
          const change = m.key in diff;
          return (
            <td key={m.key} className="px-3 py-3 text-center">
              <input
                type="checkbox"
                checked={coche}
                disabled={!ecriture || enCours}
                onChange={() => basculer(m.key)}
                aria-label={`${m.label} — ${org.nom || org.id}`}
                className={`w-4 h-4 accent-baikal-cyan ${change ? 'ring-2 ring-amber-400/70 rounded' : ''}`}
              />
            </td>
          );
        })}
        {ecriture && (
          <td className="px-4 py-3 whitespace-nowrap text-right">
            <div className="inline-flex items-center gap-2">
              {enregistree && !modifiee && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                  <Check className="w-3.5 h-3.5" /> Enregistré
                </span>
              )}
              {modifiee && (
                <button
                  onClick={() => { setSaisie({}); setErreur(null); }}
                  disabled={enCours}
                  title="Annuler"
                  className="p-1.5 rounded border border-baikal-border text-baikal-text hover:text-white disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={enregistrer}
                disabled={!modifiee || enCours}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-baikal-cyan text-baikal-cyan hover:bg-baikal-cyan/10 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                {enCours ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </td>
        )}
      </tr>
      {erreur && (
        <tr>
          <td colSpan={catalogue.length + 2} className="px-4 pb-3">
            <Erreur message={erreur} />
          </td>
        </tr>
      )}
    </>
  );
}

function ModulesSiteContent() {
  const { currentApp } = useApp();
  const { ecriture } = useDroitModule('modules');
  const [etat, setEtat] = useState({ chargement: true, erreur: null, disponible: true });
  const [catalogue, setCatalogue] = useState([]);
  const [organisations, setOrganisations] = useState([]);

  const charger = useCallback(async () => {
    setEtat({ chargement: true, erreur: null, disponible: true });
    const [cat, orgs] = await Promise.all([
      modulesSiteService.getCatalogue(currentApp),
      modulesSiteService.getOrganisations(currentApp),
    ]);
    const erreur = cat.error || orgs.error;
    if (erreur) {
      setEtat({ chargement: false, erreur: erreur.message, disponible: true });
      return;
    }
    if (cat.data?.disponible === false) {
      setEtat({ chargement: false, erreur: null, disponible: false });
      return;
    }
    setCatalogue(Array.isArray(cat.data?.modules) ? cat.data.modules : []);
    setOrganisations(Array.isArray(orgs.data?.organisations) ? orgs.data.organisations : []);
    setEtat({ chargement: false, erreur: null, disponible: true });
  }, [currentApp]);

  useEffect(() => { charger(); }, [charger]);

  const remplacer = (orgMaj) => {
    setOrganisations((liste) => liste.map((o) => (o.id === orgMaj.id ? { ...o, ...orgMaj } : o)));
  };

  if (etat.chargement) return <Section titre="Modules clients"><Chargement /></Section>;
  if (!etat.disponible) {
    return (
      <Section titre="Modules clients">
        <Vide message="Canal d'administration non déclaré pour ce site (config.apps.env_admin_fn)." />
      </Section>
    );
  }

  return (
    <Section titre="Modules clients">
      {!ecriture && <LectureSeule module="Modules clients" />}
      {etat.erreur && <Erreur message={etat.erreur} />}

      {!etat.erreur && (
        <>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
            <table className="tableau-large w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-xs border-b border-baikal-border">
                  <th className="px-4 py-2 text-left opacity-70 align-bottom">Organisation</th>
                  {catalogue.map((m) => (
                    <th key={m.key} className="px-3 py-2 text-center align-bottom min-w-[96px]" title={m.description || ''}>
                      <span className="text-white font-medium">{m.label}</span>
                    </th>
                  ))}
                  {ecriture && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {organisations.length === 0 && (
                  <LigneVide colonnes={catalogue.length + 2} message="Aucune organisation sur ce site." />
                )}
                {organisations.map((org) => (
                  <LigneOrganisation
                    key={org.id}
                    org={org}
                    catalogue={catalogue}
                    ecriture={ecriture}
                    onEnregistree={remplacer}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {catalogue.length > 0 && (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-xs text-baikal-text">
              {catalogue.map((m) => (
                <div key={m.key}>
                  <dt className="inline text-white font-medium">{m.label}</dt>
                  {m.description && <dd className="inline opacity-70"> — {m.description}</dd>}
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </Section>
  );
}

export default function ModulesSite() {
  return (
    <ConsoleLayout actif="modules">
      <ModulesSiteContent />
    </ConsoleLayout>
  );
}
