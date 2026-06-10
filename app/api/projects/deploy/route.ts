import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { getDeployQueue } from '@/lib/deploy-queue';
import { prisma } from '@/lib/db';
import { createProjectRepository } from '@/lib/forgejo';
import { createAvailableSubdomain } from '@/lib/subdomains';
import { parseTemplateManifest } from '@/lib/templates/manifest';
import {
  cleanSubdomain,
  createAgentToolsToken,
  createAppMcpToken,
  createProjectCredentials,
  createProjectId,
  isInstallableTemplate
} from '@/lib/templates';

type DeployRequest = {
  templateId?: string;
  subdomain?: string;
};

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
  const template = await prisma.appTemplate.findUnique({
    where: { id: templateId }
  });
  const rootDomain = process.env.APP_ROOT_DOMAIN || 'llmagents.com';
  const managerUrl = process.env.MANAGER_URL || 'http://manager:8080';

  if (!template || !isInstallableTemplate(template)) {
    return NextResponse.json(
      { ok: false, message: 'This template is not available for install yet' },
      { status: 400 }
    );
  }

  const id = createProjectId();
  const subdomain = body.subdomain
    ? cleanSubdomain(body.subdomain)
    : await createAvailableSubdomain({
        db: prisma,
        fallbackId: id,
        prefix: template.id,
        rootDomain
      });

  if (!subdomain) {
    return NextResponse.json(
      { ok: false, message: 'A valid subdomain is required' },
      { status: 400 }
    );
  }

  const existingProject = await prisma.project.findUnique({
    where: {
      domain: `${subdomain}.${rootDomain}`
    }
  });

  if (existingProject) {
    return NextResponse.json(
      { ok: false, message: 'This subdomain is already deployed' },
      { status: 409 }
    );
  }

  const { dbName, dbUser, dbPassword, databaseUrl } =
    createProjectCredentials(id);
  const agentToolsToken = createAgentToolsToken();
  const appMcpToken = createAppMcpToken();
  const domain = `${subdomain}.${rootDomain}`;
  const projectRepository = await createProjectRepository(id);
  const manifest = template.manifest
    ? parseTemplateManifest(template.manifest)
    : null;

  const managerPayload = {
    id,
    git: projectRepository.authenticatedCloneUrl,
    image: template.image,
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
      DATABASE_URL: databaseUrl,
      GIT_REPO_URL: projectRepository.authenticatedCloneUrl,
      GIT_BRANCH: 'main',
      AGENT_TOOLS_TOKEN: agentToolsToken,
      APP_MCP_TOKEN: appMcpToken
    },
    domain,
    resources: manifest?.resources,
    ports: {
      app: template.appPort,
      agent: template.agentPort
    }
  };

  const project = await prisma.project.create({
    data: {
      id,
      userId: user.id,
      templateId: template.id,
      templateName: template.name,
      git: projectRepository.authenticatedCloneUrl,
      domain,
      url: `http://${domain}`,
      status: 'queued',
      appPort: template.appPort,
      agentPort: template.agentPort,
      agentToolsToken,
      appMcpToken
    }
  });

  const deployQueue = getDeployQueue();
  const job = await deployQueue.add(
    'deploy-project',
    {
      projectId: project.id,
      managerUrl,
      managerPayload
    },
    {
      jobId: project.id
    }
  );

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    url: project.url,
    template: template.name,
    status: project.status,
    jobId: job.id
  });
}
