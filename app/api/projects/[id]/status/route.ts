import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { projectMemberWhere } from '../../../../../lib/project-members';

type ProjectStatusContext = {
  params: Promise<unknown>;
};

export async function GET(_request: NextRequest, context: ProjectStatusContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before viewing applications' },
      { status: 401 }
    );
  }

  const id = readProjectId(await context.params);

  if (!id) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

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
      deletedAt: null
    },
    select: {
      id: true,
      status: true,
      url: true
    }
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, message: 'Application not found' },
      { status: 404 }
    );
  }

  const prodUrl = project.url.replace(/\/$/, '');
  const devUrl = createDevUrl(prodUrl);
  const [prodReady, devReady] = await Promise.all([
    isRuntimeReady(prodUrl),
    isRuntimeReady(devUrl)
  ]);

  return NextResponse.json(
    {
      ok: true,
      project: {
        id: project.id,
        status: project.status
      },
      prod: {
        ready: prodReady,
        url: prodUrl
      },
      dev: {
        ready: devReady,
        url: devUrl
      }
    },
    {
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
}

async function isRuntimeReady(baseUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const healthUrl = new URL('/api/health', baseUrl);
    const response = await fetch(healthUrl, {
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal
    });

    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function createDevUrl(appUrl: string) {
  const url = new URL(appUrl);
  url.port = '8080';
  url.pathname = '/';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

function readProjectId(params: unknown) {
  if (
    params &&
    typeof params === 'object' &&
    'id' in params &&
    typeof params.id === 'string'
  ) {
    return params.id;
  }

  return null;
}
