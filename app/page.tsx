import { AuthPanel } from './ui/auth-panel';
import { DeployPanel } from './ui/deploy-panel';
import { LogoutButton } from './ui/logout-button';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Boxes, CircleDollarSign, ExternalLink, UserRound } from 'lucide-react';

export default async function Home() {
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
              <h2>{user ? 'Application templates' : 'Create your account'}</h2>
              <p>
                {user
                  ? 'Deploy apps from templates and track every live project.'
                  : 'Register or sign in before deploying a live application.'}
              </p>
            </div>
          </header>

          {user ? (
            <>
              <section className="projects-section">
                <div className="subheading">
                  <h3>Your projects</h3>
                  <span>{projects.length}</span>
                </div>

                {projects.length > 0 ? (
                  <div className="project-list">
                    {projects.map((project) => (
                      <article className="project-row" key={project.id}>
                        <div className="project-main">
                          <div className="template-icon small">
                            <CircleDollarSign size={18} />
                          </div>
                          <div>
                            <h4>{project.domain}</h4>
                            <p>
                              {project.templateName} &middot; {project.id}
                            </p>
                          </div>
                        </div>
                        <div className="project-meta">
                          <span className={`status status-${project.status}`}>
                            {project.status}
                          </span>
                          <a href={project.url} target="_blank" rel="noreferrer">
                            <ExternalLink size={16} />
                            Open
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    Deploy Money to create your first project.
                  </div>
                )}
              </section>

              <div className="deploy-grid">
                <article className="template">
                  <div className="template-header">
                    <div className="template-title">
                      <div className="template-icon">
                        <CircleDollarSign size={24} />
                      </div>
                      <div>
                        <h3>Money</h3>
                        <p>Personal finance dashboard with MySQL-backed data.</p>
                      </div>
                    </div>
                    <span className="tag">Ready</span>
                  </div>

                  <div className="meta">
                    <div>
                      <span>Repository</span>
                      <strong>money-template</strong>
                    </div>
                    <div>
                      <span>App port</span>
                      <strong>3001</strong>
                    </div>
                    <div>
                      <span>Agent port</span>
                      <strong>7001</strong>
                    </div>
                  </div>
                </article>

                <DeployPanel />
              </div>
            </>
          ) : (
            <div className="auth-grid">
              <article className="template">
                <div className="template-header">
                  <div className="template-title">
                    <div className="template-icon">
                      <CircleDollarSign size={24} />
                    </div>
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
