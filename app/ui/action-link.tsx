import Link, { type LinkProps } from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const actionLinkVariants = cva(
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold no-underline transition-[background-color,border-color,color,box-shadow] duration-150 ease-out',
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-slate-950 text-white hover:bg-slate-800',
        secondary: 'border-slate-200 bg-white text-slate-950 hover:bg-slate-50',
        ghost: 'border-transparent bg-transparent text-slate-500 hover:text-slate-950'
      }
    },
    defaultVariants: {
      variant: 'secondary'
    }
  }
);

type ActionLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  VariantProps<typeof actionLinkVariants> & {
    children: ReactNode;
  };

export function ActionLink({
  children,
  className,
  variant,
  ...props
}: ActionLinkProps) {
  return (
    <Link className={cn(actionLinkVariants({ variant }), className)} {...props}>
      {children}
    </Link>
  );
}
