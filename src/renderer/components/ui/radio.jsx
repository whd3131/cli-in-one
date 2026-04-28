import * as React from 'react';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { cn } from '@/lib/utils';

const RadioGroup = React.forwardRef(({ className, ...props }, ref) => (
  <BaseRadioGroup
    ref={ref}
    className={cn('grid gap-2', className)}
    {...props}
  />
));
RadioGroup.displayName = 'RadioGroup';

const RadioItem = React.forwardRef(({ className, indicatorClassName, ...props }, ref) => (
  <Radio.Root
    ref={ref}
    className={cn(
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <Radio.Indicator className={cn('flex h-full w-full items-center justify-center', indicatorClassName)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </Radio.Indicator>
  </Radio.Root>
));
RadioItem.displayName = 'RadioItem';

export { RadioGroup, RadioItem };
