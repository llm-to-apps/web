import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50',
        className
      )}
      {...props}
    />
  );
}
