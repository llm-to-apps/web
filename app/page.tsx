'use client';

import { useEffect } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from './_components/app-layout';
import { SignedOutContent } from './_components/signed-out-content';
import { useSession } from './_components/session-provider';
import { safeRelativeRedirect } from '../lib/safe-redirect';

export default function Home() {
  return (
    <Suspense
      fallback={
        <AppLayout user={null}>
          <SignedOutContent />
        </AppLayout>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRelativeRedirect(searchParams.get('next'));
  const session = useSession();

  useEffect(() => {
    if (session.status !== 'authenticated') {
      return;
    }

    router.replace(session.data.user.onboarded ? redirectTo : '/welcome');
  }, [redirectTo, router, session]);

  return (
    <AppLayout user={null}>
      <SignedOutContent redirectTo={redirectTo} />
    </AppLayout>
  );
}
