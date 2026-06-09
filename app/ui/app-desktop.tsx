'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Store } from 'lucide-react';
import { AppIcon } from './app-icon';
import type { TemplateId } from '@/lib/templates';

export type DesktopProject = {
  id: string;
  templateId: string;
  templateName: string;
  domain: string;
  url: string;
  status: string;
  deployError: string | null;
};

type ProjectsResult =
  | {
      ok: true;
      projects: DesktopProject[];
    }
  | {
      ok: false;
      message: string;
    };

type AppDesktopProps = {
  initialProjects: DesktopProject[];
};

const installingStatuses = new Set(['queued', 'deploying']);

export function AppDesktop({ initialProjects }: AppDesktopProps) {
  const [projects, setProjects] = useState(initialProjects);
  const hasInstallingProjects = projects.some((project) =>
    installingStatuses.has(project.status)
  );

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (!hasInstallingProjects) {
      return;
    }

    let isCurrent = true;

    async function refreshProjects() {
      try {
        const response = await fetch('/api/projects');
        const data = (await response.json()) as ProjectsResult;

        if (isCurrent && response.ok && data.ok) {
          setProjects(data.projects);
        }
      } catch {
        // Keep the current desktop state until the next poll succeeds.
      }
    }

    const interval = window.setInterval(refreshProjects, 2_000);
    void refreshProjects();

    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [hasInstallingProjects]);

  return (
    <section className="desktop-section">
      {projects.length > 0 ? (
        <div className="app-grid" aria-label="Installed applications">
          {projects.map((project) => {
            const isInstalling = installingStatuses.has(project.status);

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
  );
}
