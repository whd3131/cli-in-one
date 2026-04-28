import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '@/lib/utils';
import { resolveBaseUiRenderProp } from '@/components/ui/base-ui-render';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = React.forwardRef(({ asChild = false, children: childrenProp, ...props }, ref) => {
  const { children, render } = resolveBaseUiRenderProp(asChild, childrenProp);
  return (
    <TooltipPrimitive.Trigger ref={ref} render={render} {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef(({
  align,
  className,
  side = 'top',
  sideOffset = 6,
  ...props
}, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner align={align} side={side} sideOffset={sideOffset}>
      <TooltipPrimitive.Popup
        ref={ref}
        className={cn(
          'z-[100] overflow-hidden rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Popup.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
