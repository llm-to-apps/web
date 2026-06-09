import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { McpConnectButton } from '../../ui/mcp-connect-button';
import { ProjectAgentChat } from '../../ui/project-agent-chat';

type ProjectPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/');
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: user.id
    },
    select: {
      id: true,
      templateName: true,
      domain: true,
      url: true,
      status: true,
      deployError: true,
      appMcpToken: true
    }
  });

  if (!project) {
    notFound();
  }

  const chatMessages = await prisma.agentChatMessage.findMany({
    where: {
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
      content: true
    }
  });
  const orderedChatMessages = chatMessages.reverse();
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
            completionTokens: true,
            promptTokens: true,
            totalTokens: true
          }
        })
      : [];
  const usageByAssistantMessageId = new Map(
    agentUsages
      .filter((usage) => usage.assistantMessageId)
      .map((usage) => [usage.assistantMessageId, usage])
  );
  const agentUsageSummary = await prisma.agentUsage.aggregate({
    where: {
      projectId: project.id,
      userId: user.id
    },
    _sum: {
      completionTokens: true,
      promptTokens: true,
      totalTokens: true
    }
  });
  const usageSummary = formatUsageSummary({
    completionTokens: agentUsageSummary._sum.completionTokens,
    promptTokens: agentUsageSummary._sum.promptTokens,
    totalTokens: agentUsageSummary._sum.totalTokens
  });
  const appUrl = project.url.replace(/\/$/, '');

  return (
    <main className="project-workspace">
      <section className="agent-column">
        <header className="project-header">
          <Link className="back-link" href="/">
            <ArrowLeft size={17} />
            Apps
          </Link>
          <div className="project-header-actions">
            {usageSummary ? (
              <span className="project-token-summary" title={usageSummary.title}>
                <strong>{usageSummary.total}</strong>
              </span>
            ) : null}
            <McpConnectButton
              mcpToken={project.appMcpToken}
              mcpUrl={`${appUrl}/api/mcp`}
            />
          </div>
        </header>

        <ProjectAgentChat
          project={{
            id: project.id,
            name: project.templateName,
            status: project.status,
            domain: project.domain,
            toolsUrl: `${appUrl}/agent-tools`
          }}
          initialMessages={orderedChatMessages.map((message) => ({
            id: message.id,
            role: message.role === 'user' ? 'user' : 'assistant',
            content: message.content,
            usage:
              message.role === 'assistant'
                ? formatInitialUsage(usageByAssistantMessageId.get(message.id))
                : null
          }))}
        />
      </section>

      <section className="app-preview-column">
        <div className="app-preview-bar">
          <div>
            <span>{project.status}</span>
            <strong>{project.domain}</strong>
          </div>
          <a href={project.url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Open
          </a>
        </div>

        {project.status === 'ready' ? (
          <iframe
            className="app-frame"
            src={project.url}
            title={`${project.templateName} application`}
          />
        ) : (
          <div className="app-frame-placeholder">
            <h2>Application is {project.status}</h2>
            <p>{project.deployError || 'The preview will load when the service is ready.'}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function formatInitialUsage(
  usage:
    | {
        completionTokens: number | null;
        promptTokens: number | null;
        totalTokens: number | null;
      }
    | null
    | undefined
) {
  if (!usage) {
    return null;
  }

  return {
    completionTokens: usage.completionTokens ?? undefined,
    promptTokens: usage.promptTokens ?? undefined,
    totalTokens: usage.totalTokens ?? undefined
  };
}

function formatUsageSummary(usage: {
  completionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
}) {
  const promptTokens = usage.promptTokens ?? 0;
  const completionTokens = usage.completionTokens ?? 0;
  const knownTotal = promptTokens + completionTokens;
  const totalTokens = usage.totalTokens ?? knownTotal;

  if (totalTokens <= 0) {
    return null;
  }

  return {
    title: [
      `Total: ${formatTokenCount(totalTokens)}`,
      promptTokens > 0 ? `Input: ${formatTokenCount(promptTokens)}` : '',
      completionTokens > 0 ? `Output: ${formatTokenCount(completionTokens)}` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    total: formatTokenCount(totalTokens)
  };
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat().format(value);
}
