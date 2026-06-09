'use client';

import { useEffect, useMemo, useState } from 'react';
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

type ProjectResult =
  | {
      ok: true;
      project: DesktopProject;
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
  const installingProjectIds = useMemo(
    () =>
      projects
        .filter((project) => installingStatuses.has(project.status))
        .map((project) => project.id),
    [projects]
  );
  const installingProjectIdsKey = installingProjectIds.join('|');

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    const projectIds = installingProjectIdsKey.split('|').filter(Boolean);

    if (projectIds.length === 0) {
      return;
    }

    let isCurrent = true;

    async function refreshInstallingProjects() {
      try {
        const results = await Promise.all(
          projectIds.map(async (projectId) => {
            const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
            const data = (await response.json()) as ProjectResult;

            return response.ok && data.ok ? data.project : null;
          })
        );

        if (!isCurrent) {
          return;
        }

        const updatedProjects = results.filter((project): project is DesktopProject =>
          Boolean(project)
        );

        if (updatedProjects.length > 0) {
          setProjects((currentProjects) =>
            currentProjects.map((project) => {
              const updatedProject = updatedProjects.find(
                (candidate) => candidate.id === project.id
              );

              return updatedProject ?? project;
            })
          );
        }
      } catch {
        // Keep the current icon states until the next poll succeeds.
      }
    }

    const interval = window.setInterval(refreshInstallingProjects, 2_000);
    void refreshInstallingProjects();

    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [installingProjectIdsKey]);

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
