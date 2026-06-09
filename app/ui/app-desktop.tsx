'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Store, Trash2 } from 'lucide-react';
import { AppIcon } from './app-icon';

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
const busyStatuses = new Set(['queued', 'deploying', 'deleting']);

export function AppDesktop({ initialProjects }: AppDesktopProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [deletingProjectIds, setDeletingProjectIds] = useState<Set<string>>(
    () => new Set()
  );
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

  async function deleteProject(projectId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);

    if (!project || !window.confirm(`Delete ${project.templateName}?`)) {
      return;
    }

    setDeletingProjectIds((currentIds) => new Set(currentIds).add(projectId));
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              status: 'deleting',
              deployError: null
            }
          : project
      )
    );

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE'
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; message?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data && 'message' in data ? data.message : 'Delete failed');
      }

      setProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== projectId)
      );
    } catch (error) {
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                status: 'failed',
                deployError: error instanceof Error ? error.message : 'Delete failed'
              }
            : project
        )
      );
    } finally {
      setDeletingProjectIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(projectId);
        return nextIds;
      });
    }
  }

  return (
    <section className="desktop-section">
      {projects.length > 0 ? (
        <div className="app-grid" aria-label="Installed applications">
          {projects.map((project) => {
            const isBusy = busyStatuses.has(project.status);
            const isDeleting = deletingProjectIds.has(project.id) || project.status === 'deleting';

            return (
              <div
                className={`desktop-app app-state-${project.status}`}
                key={project.id}
              >
                <a
                  className="desktop-app-link"
                  href={`/apps/${encodeURIComponent(project.id)}`}
                >
                  <span className="desktop-app-icon-wrap">
                    <AppIcon templateId={project.templateId} size="large" />
                    {isBusy ? (
                      <span className="install-spinner" aria-label="Installing" />
                    ) : null}
                  </span>
                  <span className="desktop-app-name">{project.templateName}</span>
                </a>
                <button
                  aria-label={`Delete ${project.templateName}`}
                  className="delete-app-button"
                  disabled={isDeleting}
                  onClick={() => void deleteProject(project.id)}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
                {project.deployError ? (
                  <span className="desktop-app-error">{project.deployError}</span>
                ) : null}
              </div>
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
