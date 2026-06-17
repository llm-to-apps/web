'use client';

import type { ReactNode } from 'react';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type SessionData, useSession } from './session-provider';

type SessionGateProps = {
  children: (session: SessionData) => ReactNode;
  requireOnboarded?: boolean;
  redirectIfAuthenticatedTo?: string;
};

export function SessionGate({
  children,
  requireOnboarded = true,
  redirectIfAuthenticatedTo
}: SessionGateProps) {
  return (
    <Suspense fallback={<SessionPlaceholder />}>
      <SessionGateContent
        redirectIfAuthenticatedTo={redirectIfAuthenticatedTo}
        requireOnboarded={requireOnboarded}
      >
        {children}
      </SessionGateContent>
    </Suspense>
  );
}

function SessionGateContent({
  children,
  requireOnboarded,
  redirectIfAuthenticatedTo
}: SessionGateProps & { requireOnboarded: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();

  useEffect(() => {
    if (session.status === 'loading') {
      return;
    }

    if (session.status === 'unauthenticated') {
      const next = `${pathname}${searchParams.toString() ? `?${searchParams}` : ''}`;
      router.replace(`/?next=${encodeURIComponent(next)}`);
      return;
    }

    const sessionData = session.data;

    if (!sessionData) {
      return;
    }

    if (redirectIfAuthenticatedTo) {
      router.replace(sessionData.user.onboarded ? redirectIfAuthenticatedTo : '/welcome');
      return;
    }

    if (requireOnboarded && !sessionData.user.onboarded) {
      router.replace('/welcome');
    }
  }, [pathname, redirectIfAuthenticatedTo, requireOnboarded, router, searchParams, session]);

  if (session.status !== 'authenticated') {
    return <SessionPlaceholder />;
  }

  return children(session.data);
}

function SessionPlaceholder() {
  return null;
}
