import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
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
      deployError: true
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

  return (
    <main className="project-workspace">
      <section className="agent-column">
        <header className="project-header">
          <Link className="back-link" href="/">
            <ArrowLeft size={17} />
            Apps
          </Link>
        </header>

        <ProjectAgentChat
          project={{
            id: project.id,
            name: project.templateName,
            status: project.status,
            domain: project.domain,
            toolsUrl: `${project.url.replace(/\/$/, '')}/agent-tools`
          }}
          initialMessages={orderedChatMessages.map((message) => ({
            id: message.id,
            role: message.role === 'user' ? 'user' : 'assistant',
            content: message.content
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
