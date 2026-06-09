import { AppDesktop } from './ui/app-desktop';
import { AppShell } from './ui/app-shell';
import { AppTabs } from './ui/app-tabs';
import { SignedOutContent } from './ui/signed-out-content';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function Home() {
  const user = await getCurrentUser();
  const projects = user
    ? await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          templateId: true,
          templateName: true,
          domain: true,
          url: true,
          status: true,
          deployError: true
        }
      })
    : [];

  return (
    <AppShell
      user={user}
      title={user ? 'Applications' : 'Create your account'}
      description={
        user
          ? 'Open installed apps or install new templates from the store.'
          : 'Register or sign in before deploying a live application.'
      }
    >
      {user ? (
        <>
          <AppTabs active="apps" />
          <AppDesktop initialProjects={projects} />
        </>
      ) : (
        <SignedOutContent />
      )}
    </AppShell>
  );
}
