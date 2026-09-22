/**
 * BandeauMesures - Baikal Console
 * ============================================================================
 * Les tuiles d'un chapitre, lues dans la vue contractuelle baikal_mesures du
 * site (contrat docs/contrats/mesures-v1.sql, spec 2026-09-23).
 *
 * Il n'y a PAS d'écran des statistiques : une mesure s'affiche en tête du
 * chapitre auquel elle appartient, parce qu'un chiffre se lit à côté de ce
 * qu'il compte. Ce composant est donc monté par chaque page concernée avec
 * son chapitre en paramètre, et ne connaît aucun site, aucune clé, aucun
 * libellé.
 *
 * Un site qui ne publie pas la vue, ou qui n'a aucune mesure pour ce
 * chapitre, n'affiche RIEN : pas de cadre vide, pas de message. La capacité
 * se lit à la présence.
 * ============================================================================
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDonneesCachees } from '../../hooks/useDonneesCachees';
import { siteStatsService } from '../../services/siteStats.service';

const FENETRES = [7, 30, 90];

function formater(valeur, format) {
  const n = Number(valeur) || 0;
  if (format === 'eur') {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
    }).format(n);
  }
  if (format === 'pourcent') {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} %`;
  }
  return new Intl.NumberFormat('fr-FR').format(n);
}

function jourCourt(jour) {
  const d = new Date(`${jour}T00:00:00`);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/**
 * Variation contre la période précédente.
 *
 * Rien n'est affiché quand la référence manque (stock sans antériorité) ou
 * qu'elle vaut zéro : un taux depuis zéro n'existe pas, et l'inventer est
 * pire que ne rien dire.
 */
function Variation({ valeur, precedente }) {
  if (precedente === null || precedente === undefined || precedente === 0) return null;
  const ecart = ((Number(valeur) - Number(precedente)) / Math.abs(Number(precedente))) * 100;
  if (!Number.isFinite(ecart)) return null;
  const signe = ecart > 0 ? '+' : '';
  const couleur = ecart > 0 ? 'text-emerald-400' : ecart < 0 ? 'text-red-400' : 'text-baikal-text';
  return (
    <span className={`text-xs ${couleur}`}>
      {signe}{new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(ecart)} %
    </span>
  );
}

/**
 * Courbe de la série, en SVG pour rester légère à huit tuiles par écran.
 *
 * Un stock se trace en MARCHES D'ESCALIER : sa valeur vaut jusqu'à la mesure
 * suivante, et l'interpoler dessinerait une progression qui n'a pas eu lieu.
 * Un flux se trace en lignes.
 */
function Courbe({ serie, agregation }) {
  if (!serie || serie.length < 2) return <div className="h-7" />;
  const valeurs = serie.map((p) => Number(p.valeur) || 0);
  const mini = Math.min(...valeurs);
  const maxi = Math.max(...valeurs);
  const amplitude = maxi - mini || 1;
  const L = 100;
  const H = 28;
  const x = (i) => (i / (serie.length - 1)) * L;
  const y = (v) => H - 2 - ((v - mini) / amplitude) * (H - 4);

  let d = `M ${x(0)} ${y(valeurs[0])}`;
  for (let i = 1; i < valeurs.length; i += 1) {
    if (agregation === 'dernier') d += ` L ${x(i)} ${y(valeurs[i - 1])}`;
    d += ` L ${x(i)} ${y(valeurs[i])}`;
  }

  return (
    <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className="w-full h-7 mt-2">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5"
        className="text-baikal-cyan/70" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tuile({ tuile }) {
  return (
    <div className="bg-baikal-surface border border-baikal-border rounded-lg p-4">
      <p className="text-xs font-mono text-baikal-text uppercase truncate" title={tuile.libelle}>
        {tuile.libelle}
      </p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-xl sm:text-2xl font-semibold text-white">
          {formater(tuile.valeur, tuile.format)}
        </p>
        <Variation valeur={tuile.valeur} precedente={tuile.valeurPrecedente} />
      </div>
      {/* Un stock porte TOUJOURS sa date de mesure : aucun chiffre sans sa
          source, dans le même composant. Une valeur vieille et datée est
          honnête, un chiffre muet ne l'est pas. */}
      {tuile.mesureLe && (
        <p className="text-[11px] text-baikal-text opacity-60 mt-0.5">
          au {jourCourt(tuile.mesureLe)}
        </p>
      )}
      <Courbe serie={tuile.serie} agregation={tuile.agregation} />
    </div>
  );
}

export default function BandeauMesures({ appId, chapitre }) {
  const [jours, setJours] = useState(30);
  const { donnees, erreur } = useDonneesCachees(
    `mesures:${appId}:${chapitre}:${jours}`,
    () => siteStatsService.getMesures(appId, chapitre, jours),
    appId,
  );

  // Ni vue, ni mesure, ni droit sur le module : on ne montre rien. Un cadre
  // vide dirait « ce site ne mesure rien » là où il n'y a rien à dire.
  if (erreur) return null;
  const groupes = donnees?.disponible ? (donnees.groupes || []) : [];
  if (groupes.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1.5">
        {FENETRES.map((f) => (
          <button
            key={f}
            onClick={() => setJours(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors
              ${jours === f
                ? 'border-baikal-cyan text-baikal-cyan bg-baikal-cyan/10'
                : 'border-baikal-border text-baikal-text hover:text-white'}`}
          >
            {f} j
          </button>
        ))}
      </div>

      {/* L'unicité est une promesse du site, pas une contrainte : une vue ne
          contraint rien. Un doublon sur un flux double le nombre affiché sans
          un bruit — on le nomme, avec sa clé et son jour, plutôt que de
          sommer en silence. */}
      {donnees.doublons?.length > 0 && (
        <div className="p-3 bg-amber-900/20 border border-amber-500/40 rounded-md flex items-start gap-2 text-amber-200 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            Mesures en double dans la vue du site, les totaux de ces clés sont faux :
            {' '}
            {donnees.doublons.map((d) => `${d.cle} le ${jourCourt(d.jour)}`).join(', ')}.
          </p>
        </div>
      )}

      {groupes.map((g) => (
        <div key={g.groupe ?? '_'} className="space-y-2">
          {g.groupe && (
            <h3 className="text-xs font-mono text-baikal-text uppercase opacity-70">
              {g.groupe}
            </h3>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {g.tuiles.map((t) => <Tuile key={t.cle} tuile={t} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
