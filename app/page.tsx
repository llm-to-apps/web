import { redirect } from 'next/navigation';

import { AppShell } from './ui/app-shell';
import { SignedOutContent } from './ui/signed-out-content';
import { getCurrentUser } from '@/lib/auth';
import { getRequestDictionary } from '@/lib/i18n/server';
import { safeRelativeRedirect } from '@/lib/safe-redirect';

type HomeProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const user = await getCurrentUser();
  const t = await getRequestDictionary();
  const resolvedSearchParams = await searchParams;
  const redirectTo = safeRelativeRedirect(resolvedSearchParams?.next);

  if (user) {
    if (!user.onboarded) {
      redirect('/welcome');
    }

    redirect(redirectTo);
  }

  return (
    <AppShell
      user={null}
      title={t.pages.signInTitle}
      description={t.pages.signInDescription}
    >
      <SignedOutContent redirectTo={redirectTo} />
    </AppShell>
  );
}
