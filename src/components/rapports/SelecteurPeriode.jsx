/**
 * SelecteurPeriode.jsx - Baikal Console
 * ============================================================================
 * Choix de la periode d'un rapport, sans le calendrier natif du navigateur.
 *
 *   Mois       : fleches et grille des douze mois de l'annee.
 *   Trimestre  : fleches et quatre trimestres.
 *   Du... au...: deux dates libres.
 *
 * Valeur : { debut, fin } en ISO (AAAA-MM-JJ), bornes incluses. Le futur est
 * refuse : un rapport porte sur du mesure.
 * ============================================================================
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const iso = (d) => d.toISOString().slice(0, 10);
const aujourdhui = () => iso(new Date());

export function moisPeriode(annee, mois) {
  return {
    debut: iso(new Date(Date.UTC(annee, mois, 1))),
    fin: iso(new Date(Date.UTC(annee, mois + 1, 0))),
  };
}

function trimestrePeriode(annee, t) {
  return {
    debut: iso(new Date(Date.UTC(annee, t * 3, 1))),
    fin: iso(new Date(Date.UTC(annee, t * 3 + 3, 0))),
  };
}

export function libellePeriode({ debut, fin }) {
  const a = new Date(`${debut}T00:00:00Z`);
  const b = new Date(`${fin}T00:00:00Z`);
  const dernier = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
  const moisEntier = a.getUTCDate() === 1 && b.getUTCDate() === dernier
    && a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  if (moisEntier) return `${MOIS_LONGS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  const j = (d, an) => `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS_LONGS[d.getUTCMonth()]}${an ? ` ${d.getUTCFullYear()}` : ''}`;
  return `du ${j(a, a.getUTCFullYear() !== b.getUTCFullYear())} au ${j(b, true)}`;
}

const CHIP = 'px-2.5 py-1.5 rounded border text-xs transition-colors';
const CHIP_ACTIF = `${CHIP} border-baikal-cyan text-baikal-cyan`;
const CHIP_INACTIF = `${CHIP} border-baikal-border text-baikal-text hover:text-white`;
const CHAMP = 'px-2 py-1.5 rounded border border-baikal-border bg-baikal-bg text-baikal-text focus:border-baikal-cyan outline-none text-sm';

function Fleche({ sens, onClick, disabled }) {
  const Icone = sens < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded border border-baikal-border text-baikal-text hover:text-white hover:border-baikal-cyan disabled:opacity-30 transition-colors"
      title={sens < 0 ? 'Précédent' : 'Suivant'}
    >
      <Icone className="w-4 h-4" />
    </button>
  );
}

export default function SelecteurPeriode({ valeur, onChange }) {
  const [mode, setMode] = useState('mois'); // mois | trimestre | libre
  const [ouvert, setOuvert] = useState(false);
  const [anneeGrille, setAnneeGrille] = useState(() => Number(valeur.debut.slice(0, 4)));
  const conteneur = useRef(null);

  const anneeActuelle = new Date().getUTCFullYear();
  const moisActuel = new Date().getUTCMonth();
  const debutDate = new Date(`${valeur.debut}T00:00:00Z`);
  const annee = debutDate.getUTCFullYear();
  const mois = debutDate.getUTCMonth();
  const trimestre = Math.floor(mois / 3);

  // Fermer la grille au clic hors du composant.
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (conteneur.current && !conteneur.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  const choisirMode = (m) => {
    setMode(m);
    setOuvert(false);
    if (m === 'mois') onChange(moisPeriode(annee, mois));
    if (m === 'trimestre') onChange(trimestrePeriode(annee, trimestre));
  };

  const decaler = (sens) => {
    if (mode === 'mois') {
      const d = new Date(Date.UTC(annee, mois + sens, 1));
      onChange(moisPeriode(d.getUTCFullYear(), d.getUTCMonth()));
    } else if (mode === 'trimestre') {
      const d = new Date(Date.UTC(annee, (trimestre + sens) * 3, 1));
      onChange(trimestrePeriode(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3)));
    }
  };

  const futur = (p) => p.debut > aujourdhui();
  const suivantInterdit = mode === 'mois'
    ? futur(moisPeriode(annee, mois + 1))
    : mode === 'trimestre' ? futur(trimestrePeriode(annee, trimestre + 1)) : true;

  return (
    <div ref={conteneur} className="flex items-center gap-2 flex-wrap relative">
      <div className="flex items-center gap-1">
        {[['mois', 'Mois'], ['trimestre', 'Trimestre'], ['libre', 'Du… au…']].map(([m, l]) => (
          <button key={m} type="button" onClick={() => choisirMode(m)} className={mode === m ? CHIP_ACTIF : CHIP_INACTIF}>
            {l}
          </button>
        ))}
      </div>

      {mode !== 'libre' && (
        <div className="flex items-center gap-1">
          <Fleche sens={-1} onClick={() => decaler(-1)} />
          <button
            type="button"
            onClick={() => { setAnneeGrille(annee); setOuvert((o) => !o); }}
            className="px-3 py-1.5 rounded border border-baikal-border bg-baikal-bg text-white text-sm min-w-[150px] text-center hover:border-baikal-cyan transition-colors capitalize"
          >
            {mode === 'mois' ? `${MOIS_LONGS[mois]} ${annee}` : `T${trimestre + 1} ${annee}`}
          </button>
          <Fleche sens={1} onClick={() => decaler(1)} disabled={suivantInterdit} />
        </div>
      )}

      {mode === 'libre' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={valeur.debut}
            max={valeur.fin}
            onChange={(e) => e.target.value && onChange({ ...valeur, debut: e.target.value })}
            className={`${CHAMP} font-mono`}
          />
          <span className="text-baikal-text text-sm">au</span>
          <input
            type="date"
            value={valeur.fin}
            min={valeur.debut}
            max={aujourdhui()}
            onChange={(e) => e.target.value && onChange({ ...valeur, fin: e.target.value })}
            className={`${CHAMP} font-mono`}
          />
        </div>
      )}

      {ouvert && mode !== 'libre' && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-30 w-64 max-w-[calc(100vw-2rem)] p-3 rounded-lg border border-baikal-border bg-baikal-surface shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <Fleche sens={-1} onClick={() => setAnneeGrille((a) => a - 1)} />
            <span className="text-white text-sm font-semibold tabular-nums">{anneeGrille}</span>
            <Fleche sens={1} onClick={() => setAnneeGrille((a) => a + 1)} disabled={anneeGrille >= anneeActuelle} />
          </div>
          {mode === 'mois' ? (
            <div className="grid grid-cols-4 gap-1.5">
              {MOIS_COURTS.map((l, i) => {
                const interdit = anneeGrille > anneeActuelle || (anneeGrille === anneeActuelle && i > moisActuel);
                const actif = anneeGrille === annee && i === mois;
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={interdit}
                    onClick={() => { onChange(moisPeriode(anneeGrille, i)); setOuvert(false); }}
                    className={`py-1.5 rounded text-xs transition-colors disabled:opacity-25 ${actif
                      ? 'bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan'
                      : 'text-baikal-text hover:bg-baikal-bg hover:text-white border border-transparent'}`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((tq) => {
                const interdit = anneeGrille > anneeActuelle || (anneeGrille === anneeActuelle && tq * 3 > moisActuel);
                const actif = anneeGrille === annee && tq === trimestre;
                return (
                  <button
                    key={tq}
                    type="button"
                    disabled={interdit}
                    onClick={() => { onChange(trimestrePeriode(anneeGrille, tq)); setOuvert(false); }}
                    className={`py-1.5 rounded text-xs transition-colors disabled:opacity-25 ${actif
                      ? 'bg-baikal-cyan/20 text-baikal-cyan border border-baikal-cyan'
                      : 'text-baikal-text hover:bg-baikal-bg hover:text-white border border-transparent'}`}
                  >
                    T{tq + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
