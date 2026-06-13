import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

import { requireOnboardedUser } from '@/lib/onboarding';
import { prisma } from '@/lib/db';
import { formatMessage } from '@/lib/i18n/dictionaries';
import { getRequestDictionary } from '@/lib/i18n/server';
import { projectMemberWhere } from '@/lib/project-members';
import { ProjectAgentPanel } from '../../ui/project-agent-panel';
import { ProjectOAuthBridge } from '../../ui/project-oauth-bridge';

type ProjectPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const t = await getRequestDictionary();
  const project = await prisma.project.findFirst({
    where: {
      OR: [
        {
          id
        },
        {
          slug: id
        }
      ],
      members: projectMemberWhere(user.id),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      id: true,
      templateName: true,
      slug: true,
      domain: true,
      url: true,
      status: true,
      deployError: true
    }
  });

  if (!project) {
    notFound();
  }

  const chatMessages = await prisma.projectAgentChatMessage.findMany({
    where: {
      mode: 'use',
      projectId: project.id,
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 100,
    select: {
      id: true,
      role: true,
      source: true,
      content: true
    }
  });
  const orderedChatMessages = chatMessages.reverse();
  const activeProjectAgentRun = await prisma.agentRun.findFirst({
    where: {
      projectId: project.id,
      mode: 'use',
      scope: 'project_agent',
      status: {
        in: ['queued', 'running']
      },
      userId: user.id
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: {
      id: true
    }
  });
  const chatMessageIds = orderedChatMessages.map((message) => message.id);
  const agentUsages =
    chatMessageIds.length > 0
      ? await prisma.agentUsage.findMany({
          where: {
            assistantMessageId: {
              in: chatMessageIds
            },
            projectId: project.id,
            userId: user.id
          },
          select: {
            assistantMessageId: true,
            requestId: true
          }
        })
      : [];
  const requestIds = agentUsages.map((usage) => usage.requestId);
  const ledgerEntries =
    requestIds.length > 0
      ? await prisma.creditLedgerEntry.findMany({
          where: {
            actorUserId: user.id,
            meterType: 'llm_tokens',
            sourceId: {
              in: requestIds
            },
            sourceType: 'agent_run'
          },
          select: {
            credits: true,
            sourceId: true
          }
        })
      : [];
  const creditsByRequestId = new Map(
    ledgerEntries.map((entry) => [entry.sourceId, formatCreditsUsed(entry.credits)])
  );
  const usageByAssistantMessageId = new Map(
    agentUsages
      .filter((usage) => usage.assistantMessageId)
      .map((usage) => [
        usage.assistantMessageId,
        {
          creditsUsed: creditsByRequestId.get(usage.requestId) ?? 0
        }
      ])
  );
  const creditUsageSummary = await prisma.creditLedgerEntry.aggregate({
    where: {
      actorUserId: user.id,
      projectId: project.id,
      sourceType: 'agent_run'
    },
    _sum: {
      credits: true
    }
  });
  const usageSummary = formatUsageSummary(formatCreditsUsed(creditUsageSummary._sum.credits));
  const appUrl = project.url.replace(/\/$/, '');
  const appOrigin = new URL(appUrl).origin;

  return (
    <main className="project-workspace">
      <ProjectOAuthBridge appOrigin={appOrigin} projectId={project.id} />
      <ProjectAgentPanel
        activeRunId={activeProjectAgentRun?.id ?? null}
        appUrl={appUrl}
        project={{
          id: project.id,
          name: project.templateName,
          status: project.status,
          domain: project.domain,
          toolsUrl: `${appUrl}/agent-tools`
        }}
        usageSummary={usageSummary}
        initialMessages={orderedChatMessages.map((message) => ({
          id: message.id,
          role: message.role === 'user' ? 'user' : 'assistant',
          source: message.source,
          content: message.content,
          usage:
            message.role === 'assistant'
              ? formatInitialUsage(usageByAssistantMessageId.get(message.id))
              : null
        }))}
      />

      <section className="app-preview-column">
        <div className="app-preview-bar">
          <a className="app-preview-domain-link" href={project.url} target="_blank" rel="noreferrer">
            <strong>{project.domain}</strong>
            <ExternalLink className="app-preview-domain-icon" size={16} />
          </a>
        </div>

        {project.status === 'ready' ? (
          <iframe
            className="app-frame"
            src={appUrl}
            title={formatMessage(t.project.iframeTitle, { name: project.templateName })}
          />
        ) : (
          <div className="app-frame-placeholder">
            <h2>{formatMessage(t.project.applicationStatus, { status: project.status })}</h2>
            <p>{project.deployError || t.project.previewPending}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function formatInitialUsage(
  usage:
    | {
        creditsUsed: number;
      }
    | null
    | undefined
) {
  if (!usage || usage.creditsUsed <= 0) {
    return null;
  }

  return {
    creditsUsed: usage.creditsUsed
  };
}

function formatUsageSummary(creditsUsed: number) {
  if (creditsUsed <= 0) {
    return null;
  }

  const formattedCredits = formatCredits(creditsUsed);

  return {
    title: `${formattedCredits} credits used`,
    total: `${formattedCredits} ₵`
  };
}

function formatCreditsUsed(value: unknown) {
  const numericValue = Number(value ?? 0);
  return Math.ceil(Math.abs(Math.min(numericValue, 0)));
}

function formatCredits(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value);
}
