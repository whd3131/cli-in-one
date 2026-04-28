import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveBaseUiRenderProp } from '@/components/ui/base-ui-render';

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-[9000] bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Backdrop.displayName;

const DialogTrigger = React.forwardRef(({ asChild = false, children: childrenProp, ...props }, ref) => {
  const { children, render } = resolveBaseUiRenderProp(asChild, childrenProp);
  return (
    <DialogPrimitive.Trigger ref={ref} render={render} {...props}>
      {children}
    </DialogPrimitive.Trigger>
  );
});
DialogTrigger.displayName = DialogPrimitive.Trigger.displayName;

const DialogClose = React.forwardRef(({ asChild = false, children: childrenProp, ...props }, ref) => {
  const { children, render } = resolveBaseUiRenderProp(asChild, childrenProp);
  return (
    <DialogPrimitive.Close ref={ref} render={render} {...props}>
      {children}
    </DialogPrimitive.Close>
  );
});
DialogClose.displayName = DialogPrimitive.Close.displayName;

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        'fixed right-4 top-20 z-[9100] grid w-[min(780px,calc(100vw-32px))] max-h-[calc(100vh-96px)] rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl focus-visible:outline-none',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground opacity-80 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Popup>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Popup.displayName;

const DialogHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col gap-1.5 border-b border-border px-4 py-3', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div className={cn('flex items-center justify-end gap-2 border-t border-border px-4 py-3', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold leading-none tracking-normal text-foreground', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('truncate text-xs text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
};
