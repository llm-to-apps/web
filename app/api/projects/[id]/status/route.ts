import http from 'node:http';
import https from 'node:https';

import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { appReadyBaseUrl } from '../../../../../lib/env';
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
      devDomain: true,
      id: true,
      domain: true,
      status: true,
      devUrl: true,
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
  const devUrl = (project.devUrl ?? createDevUrl(prodUrl)).replace(/\/$/, '');
  const devHost = project.devDomain ?? new URL(devUrl).host;
  const [prodReady, devReady] = await Promise.all([
    isRuntimeReady(project.domain),
    isRuntimeReady(devHost)
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

async function isRuntimeReady(host: string) {
  try {
    const response = await requestRuntimeHealth(host);

    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

function requestRuntimeHealth(host: string) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const baseUrl = new URL(appReadyBaseUrl());
    const healthPath = new URL('/api/health', baseUrl);
    const client = healthPath.protocol === 'https:' ? https : http;
    const request = client.request(
      {
        headers: {
          Host: host
        },
        hostname: healthPath.hostname,
        method: 'GET',
        path: `${healthPath.pathname}${healthPath.search}`,
        port: healthPath.port || undefined,
        protocol: healthPath.protocol,
        timeout: 1500
      },
      (response) => {
        response.resume();

        resolve({
          status: response.statusCode ?? 0
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Runtime health request timed out'));
    });
    request.on('error', reject);
    request.end();
  });
}

function createDevUrl(appUrl: string) {
  const url = new URL(appUrl);
  url.port = '4046';
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
