import { AppIcon } from '../ui/app-icon';
import { AppShell } from '../ui/app-shell';
import { AppTabs } from '../ui/app-tabs';
import { InstallButton } from '../ui/install-button';
import { SignedOutContent } from '../ui/signed-out-content';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isInstallableTemplate } from '@/lib/templates';

export default async function StorePage() {
  const user = await getCurrentUser();
  const appTemplates = user
    ? await prisma.appTemplate.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      })
    : [];

  return (
    <AppShell
      user={user}
      title={user ? 'App Store' : 'Sign in'}
      description={
        user
          ? 'Install new templates into your workspace.'
          : 'Enter your email and confirm the code before deploying a live application.'
      }
    >
      {user ? (
        <>
          <AppTabs active="store" />
          <section className="store-section">
            <div className="store-grid">
              {appTemplates.map((template) => (
                <article className="store-app" key={template.id}>
                  <div className="store-app-main">
                    <AppIcon icon={template.icon} templateId={template.id} size="large" />
                    <div>
                      <h3>{template.name}</h3>
                      <p>{template.description}</p>
                    </div>
                  </div>
                  {isInstallableTemplate(template) ? (
                    <InstallButton templateId={template.id} />
                  ) : (
                    <div className="coming-soon-pill">Soon</div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <SignedOutContent />
      )}
    </AppShell>
  );
}
