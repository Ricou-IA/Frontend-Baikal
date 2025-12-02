/**
 * Utilitaire cn - Combine les classes Tailwind
 * ============================================================================
 * Combine les classes CSS de manière intelligente.
 * 
 * @example
 * import { cn } from '@/utils/cn';
 * 
 * cn('px-4 py-2', 'bg-blue-500', isActive && 'bg-blue-700')
 * ============================================================================
 */

/**
 * Combine les classes CSS
 * @param {...(string|undefined|null|false)} classes - Classes à combiner
 * @returns {string} - Classes combinées
 */
export function cn(...classes) {
  return classes
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function clsx(...classes) {
  return cn(...classes);
}

export default cn;
