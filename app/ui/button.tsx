'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-[background-color,border-color,color,box-shadow] duration-150 ease-out disabled:cursor-not-allowed [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-400',
        secondary:
          'border-slate-200 bg-white text-slate-950 hover:bg-slate-50 disabled:text-slate-400',
        ghost:
          'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
        danger:
          'border-red-700 bg-red-700 text-white hover:bg-red-800 disabled:border-red-200 disabled:bg-red-100 disabled:text-red-300',
        icon:
          'size-9 border-slate-200 bg-white p-0 text-slate-700 hover:bg-slate-50 disabled:text-slate-400'
      }
    },
    defaultVariants: {
      variant: 'primary'
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    loadingLabel?: ReactNode;
  };

const loadingIndicatorDelayMs = 180;
const minimumLoadingIndicatorMs = 300;

export function Button({
  asChild = false,
  children,
  className,
  disabled,
  loading = false,
  loadingLabel,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const [isLoadingIndicatorVisible, setIsLoadingIndicatorVisible] = useState(false);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;

    if (loading) {
      timeoutId = window.setTimeout(() => {
        visibleSinceRef.current = Date.now();
        setIsLoadingIndicatorVisible(true);
      }, loadingIndicatorDelayMs);
    } else {
      const visibleSince = visibleSinceRef.current;

      if (!visibleSince) {
        setIsLoadingIndicatorVisible(false);
        return;
      }

      const visibleForMs = Date.now() - visibleSince;
      const remainingMs = minimumLoadingIndicatorMs - visibleForMs;

      if (remainingMs > 0) {
        timeoutId = window.setTimeout(() => {
          visibleSinceRef.current = null;
          setIsLoadingIndicatorVisible(false);
        }, remainingMs);
      } else {
        visibleSinceRef.current = null;
        setIsLoadingIndicatorVisible(false);
      }
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [loading]);

  const Comp = asChild ? Slot : 'button';
  const isDisabled = disabled || loading || isLoadingIndicatorVisible;

  return (
    <Comp
      aria-disabled={asChild && isDisabled ? true : undefined}
      className={cn(
        buttonVariants({ variant }),
        isLoadingIndicatorVisible ? 'cursor-wait' : '',
        className
      )}
      disabled={!asChild ? isDisabled : undefined}
      type={!asChild ? type : undefined}
      {...props}
    >
      {isLoadingIndicatorVisible ? (
        <>
          <Loader2 className="animate-spin" size={16} />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
