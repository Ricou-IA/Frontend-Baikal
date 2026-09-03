/**
 * formats.jsx - Baikal Console
 * ============================================================================
 * Un seul endroit decide comment s'ecrit une valeur. Les sites fournissent
 * du brut et un nom de format ; Baikal applique le sien. C'est ce qui evite
 * que chaque produit invente sa facon d'ecrire un montant ou une date.
 * ============================================================================
 */
import { fmtDate, fmtDateHeure, fmtEur } from '../badges-clients';

export function fmtOctets(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formaterValeur(valeur, format = 'texte') {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  switch (format) {
    case 'euro':
      return fmtEur(valeur);
    case 'date':
      return fmtDate(valeur);
    case 'datetime':
      return fmtDateHeure(valeur);
    case 'pourcent': {
      const v = Number(valeur);
      return Number.isFinite(v) ? `${Math.round(v)} %` : '—';
    }
    case 'nombre': {
      const v = Number(valeur);
      return Number.isFinite(v) ? v.toLocaleString('fr-FR') : '—';
    }
    case 'octets':
      return fmtOctets(valeur);
    case 'booleen':
      return valeur === true || valeur === 'true' ? 'Oui' : 'Non';
    case 'lien':
      return (
        <a
          href={String(valeur)}
          target="_blank"
          rel="noreferrer"
          className="text-baikal-cyan hover:underline break-all"
        >
          {String(valeur)}
        </a>
      );
    case 'mono':
      return <span className="font-mono text-xs">{String(valeur)}</span>;
    default:
      return String(valeur);
  }
}

export const CLASSES_NIVEAU = {
  attention: 'text-amber-300',
  danger: 'text-red-300',
};
