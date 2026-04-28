import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { resolveBaseUiRenderProp } from '@/components/ui/base-ui-render';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-border bg-secondary text-foreground hover:bg-accent',
        primary: 'border border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'border border-destructive/35 bg-destructive text-destructive-foreground hover:bg-destructive/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground'
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-xs',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

const Button = React.forwardRef(({ asChild = false, children: childrenProp, className, variant, size, ...props }, ref) => {
  const { children, render } = resolveBaseUiRenderProp(asChild, childrenProp);
  return (
    <BaseButton
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      ref={ref}
      {...props}
    >
      {children}
    </BaseButton>
  );
});

Button.displayName = 'Button';

export { Button, buttonVariants };
