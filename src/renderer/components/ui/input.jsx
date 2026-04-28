import * as React from 'react';
import { Input as BaseInput } from '@base-ui/react/input';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <BaseInput
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    type={type}
    {...props}
  />
));

Input.displayName = 'Input';

export { Input };
