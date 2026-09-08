/**
 * TableauTrafic.jsx - Baikal Console
 * ============================================================================
 * Trafic par semaine pleine, Google et Bing dans le meme tableau, du plus
 * recent au plus ancien, comme dans le rapport : une semaine par ligne,
 * clics par jour, clics, impressions et CTR pour chaque moteur.
 * Semaines ISO (« S35 2026 ») ; les audits anterieurs au 07/09/2026 n'ont que
 * la date du lundi, on la convertit ici.
 * ============================================================================
 */
import { LigneVide } from '../console/etats';

const nb = (n) => new Intl.NumberFormat('fr-FR').format(Number(n || 0));
const dec = (n) => Number(n || 0).toFixed(1).replace('.', ',');
const pct = (n) => (n === undefined || n === null ? '—' : `${(Number(n) * 100).toFixed(1).replace('.', ',')} %`);

export function semaineIso(isoLundi) {
  const lundi = new Date(`${isoLundi}T00:00:00Z`);
  const jeudi = new Date(lundi);
  jeudi.setUTCDate(lundi.getUTCDate() + 3);
  const debutAnnee = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((jeudi.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return `S${String(n).padStart(2, '0')} ${jeudi.getUTCFullYear()}`;
}

const libelleSemaine = (l) => l.semaine_iso || semaineIso(l.semaine);

export default function TableauTrafic({ google = [], bing = [], titre = 'Trafic par semaine pleine' }) {
  // Les semaines viennent de Google ; Bing se lit sur la meme cle (lundi).
  const parLundi = new Map(bing.map((b) => [b.semaine, b]));
  const semaines = google.length ? google : bing;
  const colonnesMoteur = (source) => [
    ['Clics / j', (l) => (l ? dec(l.clics_par_jour) : '—'), true],
    ['Clics', (l) => (l ? nb(l.clics) : '—'), false],
    ['Impr.', (l) => (l ? nb(l.impressions) : '—'), false],
    ['CTR', (l) => (l ? pct(l.ctr) : '—'), false],
  ].map(([t, f, gras]) => ({ titre: `${source} ${t}`, valeur: f, gras }));
  const cols = [...colonnesMoteur('Google'), ...colonnesMoteur('Bing')];

  return (
    <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-hidden">
      {titre && <div className="px-4 py-2 text-xs opacity-60 uppercase tracking-wider text-baikal-text">{titre}</div>}
      <div className="overflow-x-auto">
        <table className="tableau-large w-full text-sm text-baikal-text">
          <thead>
            <tr className="text-xs opacity-70 border-b border-baikal-border">
              <th className="text-left px-4 py-1.5" rowSpan={2}>Semaine</th>
              <th className="text-center px-2 py-1 border-l border-baikal-border/50" colSpan={4}>Google</th>
              <th className="text-center px-2 py-1 border-l border-baikal-border/50" colSpan={4}>Bing</th>
            </tr>
            <tr className="text-xs opacity-70 border-b border-baikal-border">
              {cols.map((c, i) => (
                <th key={c.titre} className={`text-right px-2 py-1 whitespace-nowrap ${i % 4 === 0 ? 'border-l border-baikal-border/50' : ''}`}>{c.titre.replace(/^(Google|Bing) /, '')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {semaines.length === 0 && <LigneVide colonnes={9} message="Aucune semaine pleine sur la période." />}
            {semaines.map((g) => {
              const b = google.length ? parLundi.get(g.semaine) : g;
              const gg = google.length ? g : null;
              return (
                <tr key={g.semaine} className={`border-t border-baikal-border/50 ${g.reference ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-1.5 font-mono text-xs whitespace-nowrap" title={`Semaine du ${g.semaine}`}>{libelleSemaine(g)}{g.reference ? ' (réf.)' : ''}</td>
                  {cols.map((c, i) => {
                    const src = i < 4 ? gg : b;
                    return (
                      <td key={c.titre} className={`text-right px-2 py-1.5 tabular-nums ${c.gras ? 'text-white' : ''} ${i % 4 === 0 ? 'border-l border-baikal-border/50' : ''}`}>{c.valeur(src)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
