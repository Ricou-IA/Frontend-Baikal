/**
 * Card - Composant carte réutilisable
 * ============================================================================
 * Conteneur avec header, contenu et footer optionnels.
 * 
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Titre</CardTitle>
 *   </CardHeader>
 *   <CardContent>
 *     Contenu de la carte
 *   </CardContent>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 * ============================================================================
 */

import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

/**
 * Variantes de padding
 */
const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * Variantes d'ombre
 */
const shadows = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

/**
 * Composant Card principal
 */
const Card = forwardRef(({
  children,
  className,
  padding = 'none',
  shadow = 'sm',
  bordered = true,
  hoverable = false,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-white rounded-xl',
        bordered && 'border border-slate-200',
        shadows[shadow],
        paddings[padding],
        hoverable && 'transition-shadow hover:shadow-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

/**
 * Header de la carte
 */
const CardHeader = forwardRef(({
  children,
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'px-6 py-4 border-b border-slate-100',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

CardHeader.displayName = 'CardHeader';

/**
 * Titre de la carte
 */
const CardTitle = forwardRef(({
  children,
  className,
  as: Component = 'h3',
  ...props
}, ref) => {
  return (
    <Component
      ref={ref}
      className={cn(
        'text-lg font-semibold text-slate-800',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

CardTitle.displayName = 'CardTitle';

/**
 * Description de la carte
 */
const CardDescription = forwardRef(({
  children,
  className,
  ...props
}, ref) => {
  return (
    <p
      ref={ref}
      className={cn(
        'text-sm text-slate-500 mt-1',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
});

CardDescription.displayName = 'CardDescription';

/**
 * Contenu de la carte
 */
const CardContent = forwardRef(({
  children,
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'px-6 py-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

CardContent.displayName = 'CardContent';

/**
 * Footer de la carte
 */
const CardFooter = forwardRef(({
  children,
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};

export default Card;
