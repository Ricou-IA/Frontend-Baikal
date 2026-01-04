/**
 * Date Formatter - Baikal Console
 * ============================================================================
 * Utilitaires centralisés pour le formatage des dates.
 * Remplace les 10+ duplications de formatDate() dans le projet.
 *
 * @example
 * import { formatDate, formatDateTime, formatRelative } from '@shared/utils/dateFormatter';
 *
 * formatDate('2024-01-15');           // "15/01/2024"
 * formatDateTime('2024-01-15T14:30'); // "15/01/2024 à 14:30"
 * formatRelative(new Date());         // "il y a 2 heures"
 * ============================================================================
 */

/**
 * Formate une date au format français (JJ/MM/AAAA)
 * @param {string|Date|null} dateStr - Date à formater
 * @param {string} fallback - Valeur par défaut si date invalide
 * @returns {string} Date formatée
 */
export function formatDate(dateStr, fallback = '-') {
  if (!dateStr) return fallback;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;

    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return fallback;
  }
}

/**
 * Formate une date avec l'heure (JJ/MM/AAAA à HH:MM)
 * @param {string|Date|null} dateStr - Date à formater
 * @param {string} fallback - Valeur par défaut si date invalide
 * @returns {string} Date et heure formatées
 */
export function formatDateTime(dateStr, fallback = '-') {
  if (!dateStr) return fallback;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;

    const dateFormatted = date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const timeFormatted = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${dateFormatted} à ${timeFormatted}`;
  } catch {
    return fallback;
  }
}

/**
 * Formate une date en format long (15 janvier 2024)
 * @param {string|Date|null} dateStr - Date à formater
 * @param {string} fallback - Valeur par défaut si date invalide
 * @returns {string} Date formatée en long
 */
export function formatDateLong(dateStr, fallback = '-') {
  if (!dateStr) return fallback;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;

    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return fallback;
  }
}

/**
 * Formate une date en format relatif (il y a 2 heures, hier, etc.)
 * @param {string|Date|null} dateStr - Date à formater
 * @param {string} fallback - Valeur par défaut si date invalide
 * @returns {string} Date relative
 */
export function formatRelative(dateStr, fallback = '-') {
  if (!dateStr) return fallback;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;

    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffHour < 24) return `il y a ${diffHour}h`;
    if (diffDay === 1) return 'hier';
    if (diffDay < 7) return `il y a ${diffDay} jours`;

    return formatDate(date);
  } catch {
    return fallback;
  }
}

/**
 * Formate une date ISO pour les inputs HTML
 * @param {string|Date|null} dateStr - Date à formater
 * @returns {string} Date au format YYYY-MM-DD
 */
export function formatDateISO(dateStr) {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

export default {
  formatDate,
  formatDateTime,
  formatDateLong,
  formatRelative,
  formatDateISO,
};
