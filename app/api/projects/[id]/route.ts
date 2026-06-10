import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getDeployQueue } from '@/lib/deploy-queue';
import { prisma } from '@/lib/db';
import { deleteProjectRepository } from '@/lib/forgejo';
import { parseProjectResources } from '@/lib/project-resources';

type ProjectRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: NextRequest, context: ProjectRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing applications' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: user.id
    },
    select: {
      id: true,
      templateId: true,
      templateName: true,
      domain: true,
      url: true,
      status: true,
      deployError: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    project
  });
}

export async function DELETE(_request: NextRequest, context: ProjectRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before deleting applications' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId: user.id
    },
    select: {
      id: true,
      resources: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  await prisma.project.update({
    where: { id },
    data: {
      status: 'deleting',
      deployError: null
    }
  });

  const deployQueue = getDeployQueue();
  const deployJob = await deployQueue.getJob(id);

  if (deployJob) {
    await deployJob.remove().catch(() => null);
  }

  const managerUrl = process.env.MANAGER_URL || 'http://manager:8080';
  const resources = parseProjectResources(project.resources);
  const response = await fetch(
    `${managerUrl}/swarm/projects/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        serviceName: resources.swarm?.serviceName,
        services: resources.mysql
          ? {
              mysql: {
                db: resources.mysql.db,
                user: resources.mysql.user
              }
            }
          : {}
      })
    }
  );
  const result = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    await prisma.project.update({
      where: { id },
      data: {
        status: 'failed',
        deployError: `Delete failed: ${JSON.stringify(result)}`
      }
    });

    return NextResponse.json(
      {
        ok: false,
        message: 'Manager failed to delete application',
        manager: result
      },
      { status: 502 }
    );
  }

  let gitResult: Awaited<ReturnType<typeof deleteProjectRepository>> | null = null;

  try {
    gitResult = resources.git
      ? await deleteProjectRepository(resources.git.owner, resources.git.name)
      : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git repository deletion failed';

    await prisma.project.update({
      where: { id },
      data: {
        status: 'failed',
        deployError: message
      }
    });

    return NextResponse.json(
      {
        ok: false,
        message,
        manager: result
      },
      { status: 502 }
    );
  }

  await prisma.project.delete({
    where: { id }
  });

  return NextResponse.json({
    ok: true,
    projectId: id,
    manager: result,
    git: gitResult
  });
}
