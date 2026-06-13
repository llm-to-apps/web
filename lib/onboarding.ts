import { redirect } from 'next/navigation';

import { getCurrentUser } from './auth';

export async function requireOnboardedUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/');
  }

  if (!user.onboarded) {
    redirect('/welcome');
  }

  return user;
}
