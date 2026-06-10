import { redirect } from 'next/navigation';

import { AppShell } from './ui/app-shell';
import { SignedOutContent } from './ui/signed-out-content';
import { getCurrentUser } from '@/lib/auth';

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect('/home');
  }

  return (
    <AppShell
      user={null}
      title="Sign in"
      description="Enter your email and confirm the code to deploy a live application."
    >
      <SignedOutContent />
    </AppShell>
  );
}
