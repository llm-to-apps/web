import { AuthPanel } from './ui/auth-panel';
import { InstallButton } from './ui/install-button';
import { LogoutButton } from './ui/logout-button';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { templates, type TemplateId } from '@/lib/templates';
import Link from 'next/link';
import {
  Boxes,
  CircleDollarSign,
  Download,
  Grid2X2,
  Store,
  UserRound
} from 'lucide-react';

type HomeProps = {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
};

const appTemplates = Object.values(templates);

function AppIcon({ templateId, size = 'normal' }: { templateId: TemplateId; size?: 'normal' | 'large' }) {
  return (
    <div className={`app-icon app-icon-${templateId} ${size === 'large' ? 'large' : ''}`}>
      <CircleDollarSign size={size === 'large' ? 34 : 26} />
    </div>
  );
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const activeTab = params?.tab === 'store' ? 'store' : 'apps';
  const user = await getCurrentUser();
  const projects = user
    ? await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' }
      })
    : [];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="mark">
              <Boxes size={20} />
            </div>
            <span>LLAgents</span>
          </div>
          <h1>Deploy an app and edit it with agents.</h1>
          <p>
            Create an isolated live instance from a template, then hand changes
            to the coding agent without touching the platform runtime.
          </p>
        </div>
        <dl>
          <div>
            <dt>Runtime</dt>
            <dd>Docker Swarm service with Traefik routing</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>Private Git workspace cloned from a template</dd>
          </div>
          <div>
            <dt>First template</dt>
            <dd>Money app from llm-to-apps/money-template</dd>
          </div>
        </dl>
      </aside>

      <section className="main">
        <div className="topbar">
          <span className="pill">Private beta</span>
          {user ? (
            <div className="account-pill">
              <UserRound size={16} />
              <span>{user.name || user.email}</span>
              <LogoutButton />
            </div>
          ) : null}
        </div>

        <div className="workspace">
          <header className="section-heading">
            <div>
              <h2>{user ? 'Applications' : 'Create your account'}</h2>
              <p>
                {user
                  ? 'Open installed apps or install new templates from the store.'
                  : 'Register or sign in before deploying a live application.'}
              </p>
            </div>
          </header>

          {user ? (
            <>
              <nav className="app-tabs" aria-label="Application sections">
                <Link className={activeTab === 'apps' ? 'active' : ''} href="/">
                  <Grid2X2 size={17} />
                  Apps
                </Link>
                <Link className={activeTab === 'store' ? 'active' : ''} href="/?tab=store">
                  <Store size={17} />
                  App Store
                </Link>
              </nav>

              {activeTab === 'apps' ? (
                <section className="desktop-section">
                  {projects.length > 0 ? (
                    <div className="app-grid" aria-label="Installed applications">
                      {projects.map((project) => (
                        <a
                          className={`desktop-app app-state-${project.status}`}
                          href={project.url}
                          target="_blank"
                          rel="noreferrer"
                          key={project.id}
                        >
                          <AppIcon templateId={project.templateId as TemplateId} size="large" />
                          <span className="desktop-app-name">{project.templateName}</span>
                          <span className="desktop-app-domain">{project.domain}</span>
                          <span className="desktop-app-status">{project.status}</span>
                          {project.deployError ? (
                            <span className="desktop-app-error">{project.deployError}</span>
                          ) : null}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-desktop">
                      <div className="empty-icon">
                        <Download size={24} />
                      </div>
                      <h3>No apps installed</h3>
                      <p>Install Money from the App Store to add it to your desktop.</p>
                      <Link className="store-link" href="/?tab=store">
                        <Store size={17} />
                        Open App Store
                      </Link>
                    </div>
                  )}
                </section>
              ) : (
                <section className="store-section">
                  <div className="store-grid">
                    {appTemplates.map((template) => (
                      <article className="store-app" key={template.id}>
                        <div className="store-app-main">
                          <AppIcon templateId={template.id} size="large" />
                          <div>
                            <h3>{template.name}</h3>
                            <p>{template.description}</p>
                          </div>
                        </div>
                        <div className="store-meta">
                          <div>
                            <span>Repository</span>
                            <strong>{template.repository}</strong>
                          </div>
                          <div>
                            <span>Runtime</span>
                            <strong>MySQL</strong>
                          </div>
                        </div>
                        <InstallButton templateId={template.id} />
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="auth-grid">
              <article className="template">
                <div className="template-header">
                  <div className="template-title">
                    <AppIcon templateId="money" />
                    <div>
                      <h3>Money</h3>
                      <p>Sign in to deploy your first MySQL-backed app.</p>
                    </div>
                  </div>
                </div>
                <div className="meta">
                  <div>
                    <span>Accounts</span>
                    <strong>MySQL</strong>
                  </div>
                  <div>
                    <span>Session</span>
                    <strong>HTTP-only</strong>
                  </div>
                  <div>
                    <span>Deploy</span>
                    <strong>After sign in</strong>
                  </div>
                </div>
              </article>

              <AuthPanel />
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
