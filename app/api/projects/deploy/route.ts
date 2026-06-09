import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { getCurrentUser } from '@/lib/auth';

const templates = {
  money: {
    id: 'money',
    name: 'Money',
    git: 'git@github.com:llm-to-apps/money-template.git',
    appPort: 3001,
    agentPort: 7001
  }
} as const;

type TemplateId = keyof typeof templates;

type DeployRequest = {
  templateId?: TemplateId;
  subdomain?: string;
};

function cleanSubdomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function createId() {
  return randomBytes(6).toString('hex');
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in before deploying an application' },
      { status: 401 }
    );
  }

  const body = (await request.json()) as DeployRequest;
  const templateId = body.templateId ?? 'money';
  const template = templates[templateId];
  const rootDomain = process.env.APP_ROOT_DOMAIN || 'llmagents.com';
  const managerUrl = process.env.MANAGER_URL || 'http://manager:8080';

  if (!template) {
    return NextResponse.json(
      { ok: false, message: 'Unknown template' },
      { status: 400 }
    );
  }

  const id = createId();
  const subdomain = cleanSubdomain(body.subdomain || `money-${id}`);

  if (!subdomain) {
    return NextResponse.json(
      { ok: false, message: 'A valid subdomain is required' },
      { status: 400 }
    );
  }

  const dbName = `project_${id}`;
  const dbUser = `project_${id}`;
  const dbPassword = randomBytes(18).toString('base64url');
  const domain = `${subdomain}.${rootDomain}`;
  const databaseUrl = `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(
    dbPassword
  )}@mysql:3306/${encodeURIComponent(dbName)}`;

  const managerPayload = {
    id,
    git: template.git,
    services: {
      mysql: {
        db: dbName,
        user: dbUser,
        password: dbPassword
      }
    },
    env: {
      TEMPLATE_ID: template.id,
      USER_ID: user.id,
      USER_EMAIL: user.email,
      MYSQL_HOST: 'mysql',
      MYSQL_PORT: '3306',
      MYSQL_DATABASE: dbName,
      MYSQL_USER: dbUser,
      MYSQL_PASSWORD: dbPassword,
      DATABASE_URL: databaseUrl
    },
    domain,
    ports: {
      app: template.appPort,
      agent: template.agentPort
    }
  };

  const response = await fetch(`${managerUrl}/swarm/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(managerPayload)
  });
  const result = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: 'Manager deployment request failed',
        manager: result
      },
      { status: response.status }
    );
  }

  return NextResponse.json({
    ok: true,
    projectId: id,
    url: `http://${domain}`,
    template: template.name,
    manager: result
  });
}
