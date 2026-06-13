import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { Checkbox } from './checkbox';

type CheckboxFieldProps = ComponentPropsWithoutRef<typeof Checkbox> & {
  children: ReactNode;
};

export function CheckboxField({ children, ...props }: CheckboxFieldProps) {
  return (
    <LabelPrimitive.Root className="grid min-h-11 grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-950">
      <Checkbox {...props} />
      <span>{children}</span>
    </LabelPrimitive.Root>
  );
}
