import type { InputHTMLAttributes, ReactNode } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
  label: string;
  trailing?: ReactNode;
};

export function FormField({
  className,
  icon,
  id,
  label,
  trailing,
  ...props
}: FormFieldProps) {
  const inputId = id ?? props.name;

  return (
    <div className="grid gap-2.5">
      <LabelPrimitive.Root className="text-sm font-bold text-slate-700" htmlFor={inputId}>
        {label}
      </LabelPrimitive.Root>
      <div
        className={cn(
          trailing ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2' : ''
        )}
      >
        <div
          className={cn(
            'grid min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-slate-400',
            icon ? 'grid-cols-[18px_minmax(0,1fr)]' : 'grid-cols-1'
          )}
        >
          {icon ? <span className="grid place-items-center">{icon}</span> : null}
          <input
            className={cn(
              'min-h-11 min-w-0 w-full border-0 bg-transparent p-0 text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-transparent',
              className
            )}
            id={inputId}
            {...props}
          />
        </div>
        {trailing}
      </div>
    </div>
  );
}
