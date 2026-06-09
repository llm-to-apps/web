import type { ReactNode } from 'react';
import type { CurrentUser } from '@/lib/auth';
import { Boxes, UserRound } from 'lucide-react';
import { LogoutButton } from './logout-button';

type AppShellProps = {
  user: CurrentUser | null;
  title: string;
  description: string;
  children: ReactNode;
};

export function AppShell({ user, title, description, children }: AppShellProps) {
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
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </header>

          {children}
        </div>
      </section>
    </main>
  );
}
