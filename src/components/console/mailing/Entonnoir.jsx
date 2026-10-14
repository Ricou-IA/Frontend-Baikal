/**
 * Entonnoir - Mailing
 * ============================================================================
 * La cible d'une campagne lue comme l'entonnoir commun a tous les sites : six
 * etapes, l'effectif de chacune, l'intention de mail qu'elle porte. Cliquer
 * une etape la cible (plusieurs possibles) ; les profils se croisent dessous.
 *
 * Comptes en facette : la barre d'une etape tient compte des profils choisis
 * mais pas des autres etapes, et inversement — sinon cocher une etape
 * mettrait toutes les autres a zero. Memes exclusions que l'envoi (optout,
 * tests, presse par defaut), calculees par le serveur.
 * ============================================================================
 */
import { Check } from 'lucide-react';
import { ETAPES, fmtNombre } from './commun';

const BARRES = {
  slate: 'bg-slate-400', sky: 'bg-sky-400', amber: 'bg-amber-400',
  emerald: 'bg-emerald-400', violet: 'bg-violet-400', red: 'bg-red-400',
};

export default function Entonnoir({ lignes, etapes, profils, libelleProfil, onEtapes, onProfils, disabled }) {
  const parEtape = Object.fromEntries(ETAPES.map((e) => [e.id, 0]));
  const parProfil = {};
  for (const l of lignes || []) {
    if (profils.length === 0 || profils.includes(l.profil)) parEtape[l.etape] = (parEtape[l.etape] || 0) + l.n;
    if (etapes.length === 0 || etapes.includes(l.etape)) parProfil[l.profil] = (parProfil[l.profil] || 0) + l.n;
  }
  const max = Math.max(1, ...Object.values(parEtape));
  // Tous les profils publies par le site, y compris ceux a zero dans la
  // selection courante (sinon ils disparaitraient au premier clic).
  const tousProfils = [...new Set((lignes || []).map((l) => l.profil).filter(Boolean))]
    .sort((a, b) => (parProfil[b] || 0) - (parProfil[a] || 0));

  const basculer = (liste, v, set) => set(liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {ETAPES.map((e) => {
          const actif = etapes.includes(e.id);
          const n = parEtape[e.id] || 0;
          return (
            <button
              key={e.id}
              type="button"
              disabled={disabled}
              onClick={() => basculer(etapes, e.id, onEtapes)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md border text-left transition-colors disabled:cursor-default
                ${actif ? 'border-baikal-cyan bg-baikal-cyan/10' : 'border-baikal-border hover:border-baikal-text/50'}`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0
                ${actif ? 'bg-baikal-cyan border-baikal-cyan' : 'border-baikal-border'}`}>
                {actif && <Check className="w-3 h-3 text-black" />}
              </span>
              <span className="w-28 shrink-0">
                <span className="block text-sm text-white leading-tight">{e.libelle}</span>
                <span className="block text-[11px] text-baikal-text opacity-60">{e.intention}</span>
              </span>
              <span className="flex-1 h-2 bg-baikal-bg rounded-full overflow-hidden">
                <span className={`block h-full ${BARRES[e.couleur]} ${n ? '' : 'opacity-0'}`}
                  style={{ width: `${Math.max(2, (100 * n) / max)}%` }} />
              </span>
              <span className="w-16 text-right text-sm tabular-nums text-white">{fmtNombre(n)}</span>
            </button>
          );
        })}
      </div>

      {tousProfils.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-baikal-text opacity-60 mr-1">Profil</span>
          {tousProfils.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => basculer(profils, p, onProfils)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors
                ${profils.includes(p)
                  ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
                  : 'border-baikal-border text-baikal-text hover:text-white'}`}
            >
              {libelleProfil(p)} · <span className="tabular-nums">{fmtNombre(parProfil[p] || 0)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
