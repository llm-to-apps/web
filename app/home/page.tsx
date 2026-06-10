import { redirect } from 'next/navigation';

import { AppDesktop } from '../ui/app-desktop';
import { AppShell } from '../ui/app-shell';
import { AppTabs } from '../ui/app-tabs';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/');
  }

  const projects = await prisma.project.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
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
  });

  return (
    <AppShell
      user={user}
      title="Applications"
      description="Open installed apps or install new templates from the store."
    >
      <AppTabs active="apps" />
      <AppDesktop initialProjects={projects} />
    </AppShell>
  );
}
