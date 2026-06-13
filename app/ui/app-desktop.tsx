'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Store } from 'lucide-react';
import { ActionLink } from './action-link';
import { AppIcon } from './app-icon';
import { useI18n } from './i18n-provider';

export type DesktopProject = {
  id: string;
  templateId: string;
  templateName: string;
  slug: string;
  domain: string;
  url: string;
  status: string;
  deletedAt?: string | null;
  deployError: string | null;
  usage?: {
    creditsUsed: number;
  } | null;
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

const installingStatuses = new Set(['queued', 'deploying', 'starting']);
const busyStatuses = new Set(['queued', 'deploying', 'starting', 'deleting']);

export function AppDesktop({ initialProjects }: AppDesktopProps) {
  const { format, locale, t } = useI18n();
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

              return updatedProject ? { ...project, ...updatedProject } : project;
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
        <div className="app-grid" aria-label={t.desktop.installedAriaLabel}>
          {projects.map((project) => {
            const isBusy = busyStatuses.has(project.status);
            const isDeleted = project.status === 'deleted' || Boolean(project.deletedAt);
            const usageSummary = formatProjectUsageSummary(project.usage, locale, t, format);
            const appTileContent = (
              <>
                <span className="desktop-app-icon-wrap">
                  <AppIcon templateId={project.templateId} size="large" />
                  {isBusy ? (
                    <span className="install-spinner" aria-label={t.desktop.installing} />
                  ) : null}
                </span>
                <span className="desktop-app-name">{project.templateName}</span>
              </>
            );

            return (
              <div
                className={`desktop-app app-state-${project.status}${
                  isBusy ? ' desktop-app-disabled' : ''
                }`}
                key={project.id}
              >
                {usageSummary ? (
                  <span className="desktop-app-usage" title={usageSummary.title}>
                    {usageSummary.total}
                  </span>
                ) : null}
                {isBusy ? (
                  <div
                    aria-disabled="true"
                    className="desktop-app-link desktop-app-link-disabled"
                  >
                    {appTileContent}
                  </div>
                ) : isDeleted ? (
                  <div className="desktop-app-link desktop-app-link-archived">
                    {appTileContent}
                  </div>
                ) : (
                  <Link
                    className="desktop-app-link"
                    href={`/apps/${encodeURIComponent(project.slug)}`}
                  >
                    {appTileContent}
                  </Link>
                )}
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
          <h3>{t.desktop.emptyTitle}</h3>
          <p>{t.desktop.emptyDescription}</p>
          <ActionLink href="/store" variant="primary">
            <Store size={17} />
            {t.desktop.openStore}
          </ActionLink>
        </div>
      )}
    </section>
  );
}

function formatProjectUsageSummary(
  usage: DesktopProject['usage'],
  locale: string,
  t: ReturnType<typeof useI18n>['t'],
  format: ReturnType<typeof useI18n>['format']
) {
  if (!usage) {
    return null;
  }

  if (usage.creditsUsed <= 0) {
    return null;
  }

  const formattedCredits = formatCredits(usage.creditsUsed, locale);

  return {
    title: `${formattedCredits} credits used`,
    total: `${formattedCredits} ₵`
  };
}

function formatCredits(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value);
}
