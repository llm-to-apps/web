import { redirect } from 'next/navigation';

import { AppIcon } from '../ui/app-icon';
import { AppShell } from '../ui/app-shell';
import { InstallButton } from '../ui/install-button';
import { SignedOutContent } from '../ui/signed-out-content';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRequestDictionary } from '@/lib/i18n/server';
import { isInstallableTemplate } from '@/lib/templates';

export default async function StorePage() {
  const user = await getCurrentUser();
  const t = await getRequestDictionary();

  if (user && !user.onboarded) {
    redirect('/welcome');
  }

  const appTemplates = user
    ? await prisma.appTemplate.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
      })
    : [];

  return (
    <AppShell
      user={user}
      title={user ? t.pages.storeTitle : t.pages.signInTitle}
      description={user ? t.pages.storeDescription : t.pages.signInDescription}
    >
      {user ? (
        <section className="store-section">
          <div className="store-grid">
            {appTemplates.map((template) => (
              <article className="store-app" key={template.id}>
                <div className="store-app-main">
                  <AppIcon icon={template.icon} templateId={template.id} size="large" />
                  <div>
                    <h3>
                      {t.templates[template.id as keyof typeof t.templates]?.name ??
                        template.name}
                    </h3>
                    <p>
                      {t.templates[template.id as keyof typeof t.templates]?.description ??
                        template.description}
                    </p>
                  </div>
                </div>
                <div className="store-app-action">
                  {isInstallableTemplate(template) ? (
                    <InstallButton templateId={template.id} />
                  ) : (
                    <div className="coming-soon-pill">
                      {t.store.comingSoon}
                      <span className="progress-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <SignedOutContent />
      )}
    </AppShell>
  );
}
