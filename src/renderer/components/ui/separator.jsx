import * as React from 'react';
import { Separator as BaseSeparator } from '@base-ui/react/separator';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <BaseSeparator
    ref={ref}
    aria-hidden={decorative || undefined}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className
    )}
    {...props}
  />
));
Separator.displayName = BaseSeparator.displayName;

export { Separator };
