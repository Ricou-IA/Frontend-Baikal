/**
 * cn - Utility function to merge class names
 * ============================================================================
 * Combines class names conditionally, filtering out falsy values.
 * Similar to clsx but simpler.
 * ============================================================================
 */

/**
 * Combines class names into a single string
 * @param {...(string|boolean|undefined|null)} classes - Class names to combine
 * @returns {string} Combined class names
 * 
 * @example
 * cn('foo', 'bar') // 'foo bar'
 * cn('foo', false && 'bar') // 'foo'
 * cn('foo', isActive && 'active') // 'foo active' or 'foo'
 */
export function cn(...classes) {
    return classes
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  
  export default cn;
  