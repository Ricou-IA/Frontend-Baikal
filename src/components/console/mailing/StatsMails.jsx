/**
 * StatsMails - Mailing
 * ============================================================================
 * Delivrabilite de TOUS les mails du site (Eric, 14/10/2026) : ceux qu'il
 * envoie lui-meme (vue agregee baikal_mail_stats, contrat mail-stats-v1) et
 * les campagnes Baikal (journal mail_envoi), un tableau par groupe, les
 * colonnes du /admin de pre-etat-date. Taux rapportes aux ENVOIS.
 * Fenetre en jours civils (fuseau du site), quand PV compte une fenetre
 * glissante de 24 h x N : les deux different de quelques mails en bordure.
 * ============================================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { mailingService } from '../../../services/mailing.service';
import { Chargement, Erreur, Vide } from '../etats';
import { Chip, fmtNombre } from './commun';

const PERIODES = [[7, '7 jours'], [30, '30 jours'], [90, '90 jours']];

function Cellule({ n, base, couleur = 'text-white', alerte }) {
  const pct = base ? (100 * (n || 0)) / base : null;
  return (
    <td className="px-3 py-2.5 text-right whitespace-nowrap">
      <span className={`tabular-nums ${alerte ? 'text-red-400' : couleur}`}>{fmtNombre(n)}</span>
      {pct !== null && (
        <span className="text-[11px] text-baikal-text opacity-60 ml-1 tabular-nums">
          ({pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)
        </span>
      )}
    </td>
  );
}

function fmtJour(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function StatsMails({ appId }) {
  const [jours, setJours] = useState(30);
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    setDonnees(null);
    mailingService.stats(appId, jours).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreur(error.message); else { setDonnees(data); setErreur(null); }
    });
    return () => { actif = false; };
  }, [appId, jours, version]);

  const groupes = useMemo(() => {
    const g = new Map();
    for (const l of donnees?.lignes || []) {
      if (!g.has(l.groupe)) g.set(l.groupe, []);
      g.get(l.groupe).push(l);
    }
    return [...g.entries()];
  }, [donnees]);

  const total = (donnees?.lignes || []).reduce((acc, l) => {
    for (const k of ['envois', 'delivres', 'ouverts', 'cliques', 'rebonds', 'desinscrits', 'plaintes']) acc[k] = (acc[k] || 0) + (l[k] || 0);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-baikal-text">
          Tous les mails du site{donnees && !donnees.stats_site ? ' (le site ne publie pas encore ses statistiques : campagnes Baikal seulement)' : ''}
        </p>
        <div className="flex items-center gap-1.5">
          {PERIODES.map(([v, l]) => <Chip key={v} actif={jours === v} onClick={() => setJours(v)}>{l}</Chip>)}
          <button onClick={() => setVersion((v) => v + 1)} title="Rafraîchir"
            className="p-2 rounded-md border border-baikal-border text-baikal-text hover:text-baikal-cyan hover:border-baikal-cyan">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {erreur && <Erreur message={erreur} />}
      {!erreur && !donnees && <Chargement />}
      {donnees && groupes.length === 0 && <Vide message="Aucun mail envoyé sur la période." />}

      {donnees && groupes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Envois', fmtNombre(total.envois)],
            ['Délivrés', total.envois ? `${((100 * total.delivres) / total.envois).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—'],
            ['Ouverts', total.envois ? `${((100 * total.ouverts) / total.envois).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—'],
            ['Cliqués', total.envois ? `${((100 * total.cliques) / total.envois).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—'],
          ].map(([l, v]) => (
            <div key={l} className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
              <p className="text-xs font-mono text-baikal-text uppercase">{l}</p>
              <p className="text-xl font-semibold text-white mt-1 tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}

      {groupes.map(([groupe, lignes]) => (
        <div key={groupe} className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-baikal-text opacity-70">{groupe}</h3>
          <div className="bg-baikal-surface border border-baikal-border rounded-lg overflow-x-auto">
            <table data-mobile="1,2,4" className="w-full text-sm text-baikal-text">
              <thead>
                <tr className="text-xs opacity-70 border-b border-baikal-border">
                  <th className="px-3 py-2 text-left">Mail</th>
                  <th className="px-3 py-2 text-right">Envois</th>
                  <th className="px-3 py-2 text-right">Délivrés</th>
                  <th className="px-3 py-2 text-right">Ouverts</th>
                  <th className="px-3 py-2 text-right">Cliqués</th>
                  <th className="px-3 py-2 text-right">Bounce</th>
                  <th className="px-3 py-2 text-right">Désabos</th>
                  <th className="px-3 py-2 text-right">Spam</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Dernier envoi</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.type} className="border-t border-baikal-border/50">
                    <td className="px-3 py-2.5 text-white max-w-[260px] truncate" title={l.type}>{l.libelle}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white">{fmtNombre(l.envois)}</td>
                    <Cellule n={l.delivres} base={l.envois} />
                    <Cellule n={l.ouverts} base={l.envois} couleur="text-emerald-400" />
                    <Cellule n={l.cliques} base={l.envois} couleur="text-sky-400" />
                    <Cellule n={l.rebonds} base={l.envois} couleur="text-amber-400" alerte={l.envois >= 50 && l.rebonds / l.envois > 0.05} />
                    <Cellule n={l.desinscrits} base={l.envois} />
                    <Cellule n={l.plaintes} base={l.envois} couleur="text-white" alerte={l.plaintes > 0} />
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtJour(l.dernier)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
