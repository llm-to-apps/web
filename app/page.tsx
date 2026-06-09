import { AppIcon } from './ui/app-icon';
import { AppShell } from './ui/app-shell';
import { AppTabs } from './ui/app-tabs';
import { SignedOutContent } from './ui/signed-out-content';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { Download, Store } from 'lucide-react';
import type { TemplateId } from '@/lib/templates';

export default async function Home() {
  const user = await getCurrentUser();
  const projects = user
    ? await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
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
          <section className="desktop-section">
            {projects.length > 0 ? (
              <div className="app-grid" aria-label="Installed applications">
                {projects.map((project) => {
                  const isInstalling = project.status === 'queued' || project.status === 'deploying';

                  return (
                    <a
                      className={`desktop-app app-state-${project.status}`}
                      href={project.url}
                      target="_blank"
                      rel="noreferrer"
                      key={project.id}
                    >
                      <span className="desktop-app-icon-wrap">
                        <AppIcon templateId={project.templateId as TemplateId} size="large" />
                        {isInstalling ? (
                          <span className="install-spinner" aria-label="Installing" />
                        ) : null}
                      </span>
                      <span className="desktop-app-name">{project.templateName}</span>
                      {project.deployError ? (
                        <span className="desktop-app-error">{project.deployError}</span>
                      ) : null}
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="empty-desktop">
                <div className="empty-icon">
                  <Download size={24} />
                </div>
                <h3>No apps installed</h3>
                <p>Install Money from the App Store to add it to your desktop.</p>
                <Link className="store-link" href="/store">
                  <Store size={17} />
                  Open App Store
                </Link>
              </div>
            )}
          </section>
        </>
      ) : (
        <SignedOutContent />
      )}
    </AppShell>
  );
}
