import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { projectMemberWhere } from '../../../../../lib/project-members';

type ProjectDevStartContext = {
  params: Promise<unknown>;
};

type AppStatusResponse = {
  dev?: {
    running?: boolean;
  };
};

export async function POST(_request: NextRequest, context: ProjectDevStartContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before starting development preview' },
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
      members: projectMemberWhere(user.id, 'edit'),
      deletedAt: null,
      status: 'ready'
    },
    select: {
      agentToolsToken: true,
      url: true
    }
  });

  if (!project?.agentToolsToken) {
    return NextResponse.json(
      { ok: false, message: 'Development tools are not available for this application' },
      { status: 404 }
    );
  }

  const toolsUrl = `${project.url.replace(/\/$/, '')}/agent-tools`;
  const status = await readAppStatus(toolsUrl, project.agentToolsToken);

  if (status.dev?.running) {
    return NextResponse.json({ ok: true });
  }

  const startResponse = await callAgentTools(
    `${toolsUrl}/app/dev/start`,
    project.agentToolsToken,
    {
      method: 'POST'
    }
  );

  if (startResponse.ok) {
    return NextResponse.json({ ok: true });
  }

  const nextStatus = await readAppStatus(toolsUrl, project.agentToolsToken);

  if (nextStatus.dev?.running) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { ok: false, message: 'Development server did not start' },
    { status: 502 }
  );
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

async function readAppStatus(toolsUrl: string, token: string): Promise<AppStatusResponse> {
  const response = await callAgentTools(`${toolsUrl}/app/status`, token);

  if (!response.ok) {
    return {};
  }

  return (await response.json().catch(() => ({}))) as AppStatusResponse;
}

async function callAgentTools(
  url: string,
  token: string,
  init: RequestInit = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.headers ?? {})
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
