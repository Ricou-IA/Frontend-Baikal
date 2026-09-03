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
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formaterValeur(valeur, format = 'texte') {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  switch (format) {
    case 'euro':
      return fmtEur(valeur);
    case 'dollar': {
      // Quatre decimales, comme l'ecran remplace : un cout d'appel IA se
      // compte au dix-millieme de dollar. La conversion est indispensable --
      // la bibliotheque d'acces a la base ne convertit pas les numeric en
      // nombres JS, la valeur arrive telle que "0.00310000".
      const v = Number(valeur);
      return Number.isFinite(v) ? `${v.toFixed(4)} $` : '—';
    }
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
    case 'booleen': {
      // Deux origines possibles : un booleen reel (SELECT * sur une vue) ou
      // du texte (la colonne valeur de baikal_dossier_champs est typee text).
      // On accepte donc les encodages courants d'un vrai.
      const vrai = valeur === true || valeur === 1
        || (typeof valeur === 'string'
          && ['true', 't', '1'].includes(valeur.trim().toLowerCase()));
      return vrai ? 'Oui' : 'Non';
    }
    case 'lien': {
      const url = String(valeur).trim();
      const estSecurisee = url.startsWith('http://') || url.startsWith('https://');
      if (!estSecurisee) return url;
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-baikal-cyan hover:underline break-all"
        >
          {url}
        </a>
      );
    }
    case 'mono':
      return <span className="font-mono text-xs">{String(valeur)}</span>;
    default:
      return String(valeur);
  }
}

// Encart pleine largeur pour un champ porteur d'un niveau : c'est ce qui
// remplace les encarts d'alerte codes en dur (spec 3.3, colonne "niveau" de
// baikal_dossier_champs) -- consomme par OngletFiche pour un champ dont le
// niveau n'est pas nul.
export const CLASSES_NIVEAU_ENCART = {
  attention: 'bg-amber-900/20 border-amber-500/50 text-amber-300',
  danger: 'bg-red-900/20 border-red-500/50 text-red-300',
};
