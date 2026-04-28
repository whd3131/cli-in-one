import * as React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const selectTriggerClassName = 'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-left text-sm text-foreground shadow-sm transition-colors hover:border-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground';
const selectPositionerClassName = 'z-[9200] outline-none';
const selectPopupClassName = 'min-w-[var(--anchor-width)] max-w-[min(36rem,calc(100vw-16px))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl';
const selectListClassName = 'max-h-[min(320px,var(--available-height))] overflow-y-auto p-1.5';
const selectItemClassName = 'flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const Select = React.forwardRef(({
  ariaLabel,
  className,
  disabled = false,
  iconClassName,
  id,
  itemClassName,
  onClick,
  onPointerDown,
  onValueChange,
  options = [],
  popupClassName,
  positionerClassName,
  placeholder,
  title,
  value,
  valueClassName,
  ...props
}, ref) => {
  const items = options.map((option) => ({
    label: option.label,
    value: option.value
  }));

  return (
    <BaseSelect.Root
      disabled={disabled}
      items={items}
      modal={false}
      value={value}
      onValueChange={(nextValue) => onValueChange?.(nextValue)}
      {...props}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cn(selectTriggerClassName, className)}
        id={id}
        onClick={onClick}
        onPointerDown={onPointerDown}
        ref={ref}
        title={title}
        type="button"
      >
        <BaseSelect.Value className={cn('min-w-0 flex-1 truncate', valueClassName)} placeholder={placeholder} />
        <BaseSelect.Icon className={cn('flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground', iconClassName)}>
          <ChevronDown className="h-4 w-4" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner align="start" className={cn(selectPositionerClassName, positionerClassName)} sideOffset={6}>
          <BaseSelect.Popup className={cn(selectPopupClassName, popupClassName)}>
            <BaseSelect.List className={selectListClassName}>
              {options.map((option, index) => (
                <BaseSelect.Item
                  className={cn(selectItemClassName, itemClassName)}
                  disabled={option.disabled}
                  key={option.key || `${index}-${String(option.value)}`}
                  value={option.value}
                >
                  <BaseSelect.ItemText className="min-w-0 flex-1 break-words text-left leading-5">
                    {option.label}
                  </BaseSelect.ItemText>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary">
                    <BaseSelect.ItemIndicator>
                      <Check className="h-4 w-4" />
                    </BaseSelect.ItemIndicator>
                  </span>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
});

Select.displayName = 'Select';

export { Select };
