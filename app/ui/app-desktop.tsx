'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download, Store, Trash2, X } from 'lucide-react';
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

type DeleteConfirmations = {
  database: boolean;
  code: boolean;
  data: boolean;
};

const installingStatuses = new Set(['queued', 'deploying', 'starting']);
const busyStatuses = new Set(['queued', 'deploying', 'starting', 'deleting']);
const initialDeleteConfirmations: DeleteConfirmations = {
  database: false,
  code: false,
  data: false
};

export function AppDesktop({ initialProjects }: AppDesktopProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [projectPendingDelete, setProjectPendingDelete] = useState<DesktopProject | null>(
    null
  );
  const [deleteConfirmations, setDeleteConfirmations] = useState<DeleteConfirmations>(
    initialDeleteConfirmations
  );
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

  const canConfirmDelete =
    deleteConfirmations.database && deleteConfirmations.code && deleteConfirmations.data;

  function openDeleteDialog(project: DesktopProject) {
    setProjectPendingDelete(project);
    setDeleteConfirmations(initialDeleteConfirmations);
  }

  function closeDeleteDialog() {
    setProjectPendingDelete(null);
    setDeleteConfirmations(initialDeleteConfirmations);
  }

  function updateDeleteConfirmation(key: keyof DeleteConfirmations, value: boolean) {
    setDeleteConfirmations((currentValue) => ({
      ...currentValue,
      [key]: value
    }));
  }

  async function deleteProject() {
    const project = projectPendingDelete;

    if (!project || !canConfirmDelete) {
      return;
    }

    closeDeleteDialog();
    setDeletingProjectIds((currentIds) => new Set(currentIds).add(project.id));
    setProjects((currentProjects) =>
      currentProjects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              status: 'deleting',
              deployError: null
            }
          : candidate
      )
    );

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
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
        currentProjects.filter((candidate) => candidate.id !== project.id)
      );
    } catch (error) {
      setProjects((currentProjects) =>
        currentProjects.map((candidate) =>
          candidate.id === project.id
            ? {
                ...candidate,
                status: 'failed',
                deployError: error instanceof Error ? error.message : 'Delete failed'
              }
            : candidate
        )
      );
    } finally {
      setDeletingProjectIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(project.id);
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
                  onClick={() => openDeleteDialog(project)}
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

      {projectPendingDelete ? (
        <div className="modal-backdrop" onClick={closeDeleteDialog} role="presentation">
          <section
            aria-labelledby="delete-app-title"
            aria-modal="true"
            className="delete-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="delete-modal-header">
              <div className="delete-modal-icon">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 id="delete-app-title">Delete {projectPendingDelete.templateName}?</h2>
                <p>
                  This permanently removes the application service and all attached
                  resources.
                </p>
              </div>
              <button aria-label="Close" onClick={closeDeleteDialog} type="button">
                <X size={18} />
              </button>
            </header>

            <div className="delete-modal-body">
              <p>
                We will delete the databases, Git repository, source code, and all
                application data for <strong>{projectPendingDelete.domain}</strong>.
              </p>

              <label className="delete-confirm-row">
                <input
                  checked={deleteConfirmations.database}
                  onChange={(event) =>
                    updateDeleteConfirmation('database', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>I understand the databases will be deleted.</span>
              </label>
              <label className="delete-confirm-row">
                <input
                  checked={deleteConfirmations.code}
                  onChange={(event) => updateDeleteConfirmation('code', event.target.checked)}
                  type="checkbox"
                />
                <span>I understand the code and Git repository will be deleted.</span>
              </label>
              <label className="delete-confirm-row">
                <input
                  checked={deleteConfirmations.data}
                  onChange={(event) => updateDeleteConfirmation('data', event.target.checked)}
                  type="checkbox"
                />
                <span>I understand all application data will be permanently lost.</span>
              </label>
            </div>

            <footer className="delete-modal-actions">
              <button className="ghost-button" onClick={closeDeleteDialog} type="button">
                Cancel
              </button>
              <button
                className="danger-button"
                disabled={!canConfirmDelete}
                onClick={() => void deleteProject()}
                type="button"
              >
                <Trash2 size={16} />
                Delete application
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
