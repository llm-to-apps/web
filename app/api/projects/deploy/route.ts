import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '../../../../lib/auth';
import { ensureAuthToken } from '../../../../lib/auth-tokens';
import { getDeployQueue } from '../../../../lib/deploy-queue';
import { prisma } from '../../../../lib/db';
import { createProjectRepository } from '../../../../lib/forgejo';
import {
  managerUrl as readManagerUrl,
  platformDomain as readPlatformDomain,
  projectPublicScheme
} from '../../../../lib/env';
import { ensureProjectOAuthClient, oauthUrls } from '../../../../lib/oauth';
import { type ProjectResources } from '../../../../lib/project-resources';
import { createAvailableProjectSlug } from '../../../../lib/project-slugs';
import {
  parseTemplateManifest,
  renderTemplateEnv
} from '../../../../lib/templates/manifest';
import {
  cleanSlug,
  createAgentToolsToken,
  createProjectCredentials,
  createProjectId,
  isInstallableTemplate
} from '../../../../lib/templates';

type DeployRequest = {
  templateId?: string;
  slug?: string;
};

export async function POST(request: NextRequest) {
  try {
    return await deployProject(request);
  } catch (error) {
    console.error('Failed to deploy project', error);

    return NextResponse.json(
      {
        ok: false,
        message: errorMessage(error)
      },
      { status: 500 }
    );
  }
}

async function deployProject(request: NextRequest) {
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
  const platformDomain = readPlatformDomain();
  const managerUrl = readManagerUrl();
  const publicScheme = projectPublicScheme();

  if (!template || !isInstallableTemplate(template)) {
    return NextResponse.json(
      { ok: false, message: 'This template is not available for install yet' },
      { status: 400 }
    );
  }

  const id = createProjectId();
  const requestedSlug = body.slug ? cleanSlug(body.slug) : null;
  const slug = requestedSlug
    ? requestedSlug
    : await createAvailableProjectSlug({
        db: prisma,
        fallbackId: id,
        prefix: template.id
      });

  if (!slug) {
    return NextResponse.json(
      { ok: false, message: 'A valid slug is required' },
      { status: 400 }
    );
  }

  const existingProject = await prisma.project.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    }
  });

  if (existingProject) {
    return NextResponse.json(
      { ok: false, message: 'This slug is already deployed' },
      { status: 409 }
    );
  }

  const agentToolsToken = createAgentToolsToken();
  const domain = `${slug}.${platformDomain}`;
  const manifest = template.manifest
    ? parseTemplateManifest(template.manifest)
    : null;
  const needsMysql = manifest?.services.mysql?.required ?? false;
  const needsOauth = manifest?.services.oauth?.required ?? false;
  const projectRepository = await createProjectRepository(id);
  const credentials = needsMysql ? createProjectCredentials(id) : null;
  const resourceState: ProjectResources = {
    git: {
      owner: projectRepository.owner,
      name: projectRepository.name,
      cloneUrl: projectRepository.cloneUrl,
      user: projectRepository.user
    },
    swarm: {
      serviceName: `app-${id}`
    }
  };

  if (credentials) {
    resourceState.mysql = {
      db: credentials.dbName,
      user: credentials.dbUser
    };
  }

  const project = await prisma.project.create({
    data: {
      id,
      userId: user.id,
      templateId: template.id,
      templateName: template.name,
      git: projectRepository.authenticatedCloneUrl,
      slug,
      domain,
      url: `${publicScheme}://${domain}`,
      status: 'queued',
      appPort: template.appPort,
      agentPort: template.agentPort,
      agentToolsToken,
      resources: resourceState,
      members: {
        create: {
          role: 'admin',
          userId: user.id
        }
      }
    }
  });

  const oauthClient = needsOauth
    ? await ensureProjectOAuthClient({
        domain,
        name: `${template.name} (${project.id})`,
        projectId: project.id
      })
    : null;

  if (oauthClient) {
    resourceState.oauth = {
      clientId: oauthClient.clientId,
      redirectUri: oauthClient.redirectUri
    };

    await prisma.project.update({
      where: {
        id: project.id
      },
      data: {
        resources: resourceState
      }
    });
  }

  const urls = oauthUrls();
  const projectServiceToken = await ensureAuthToken({
    name: `${template.name} service API`,
    projectId: project.id,
    scope: 'project:service',
    subjectType: 'project'
  });
  const internalApiBaseUrl = urls.internalToken.replace(/\/oauth\/token$/, '');
  const projectServiceApiBaseUri = `${internalApiBaseUrl}/api/s2s/projects/${project.id}`;
  const templateEnv = manifest
    ? renderTemplateEnv(manifest, {
        app: {
          projectId: project.id,
          publicUrl: `${publicScheme}://${domain}`
        },
        services: {
          ...(credentials
            ? {
                mysql: {
                  database: credentials.dbName,
                  user: credentials.dbUser,
                  password: credentials.dbPassword
                }
              }
            : {}),
          ...(oauthClient
            ? {
                oauth: {
                  clientId: oauthClient.clientId,
                  clientSecret: oauthClient.clientSecret,
                  redirectUri: oauthClient.redirectUri,
                  issuerUrl: urls.issuer,
                  authorizeUrl: urls.authorize,
                  tokenUrl: urls.token,
                  userinfoUrl: urls.userinfo,
                  internalTokenUrl: urls.internalToken,
                  internalUserinfoUrl: urls.internalUserinfo,
                  internalProjectUserTokenIntrospectionUrl:
                    urls.internalProjectUserTokenIntrospection,
                  projectUserTokenIntrospectionUrl:
                    urls.projectUserTokenIntrospection,
                  projectServiceApiToken: projectServiceToken.token,
                  projectServiceApiBaseUri,
                  requestHost: urls.requestHost
                }
              }
            : {})
        }
      })
    : {};

  const managerPayload = {
    id,
    git: projectRepository.authenticatedCloneUrl,
    image: template.image,
    serviceName: resourceState.swarm?.serviceName,
    services: credentials
      ? {
          mysql: {
            db: credentials.dbName,
            user: credentials.dbUser,
            password: credentials.dbPassword
          }
        }
      : {},
    env: {
      TEMPLATE_ID: template.id,
      PROJECT_ID: project.id,
      PROJECT_SERVICE_API_TOKEN: projectServiceToken.token,
      PROJECT_SERVICE_API_BASE_URI: projectServiceApiBaseUri,
      USER_ID: user.id,
      USER_EMAIL: user.email,
      ...templateEnv,
      ...(credentials
        ? {
            MYSQL_HOST: 'mysql',
            MYSQL_PORT: '3306',
            MYSQL_DATABASE: credentials.dbName,
            MYSQL_USER: credentials.dbUser,
            MYSQL_PASSWORD: credentials.dbPassword,
            DATABASE_URL: credentials.databaseUrl
          }
        : {}),
      GIT_REPO_URL: projectRepository.authenticatedCloneUrl,
      GIT_BRANCH: 'main',
      ...(manifest?.git.mount.preserve?.length
        ? { GIT_PRESERVE_PATHS: manifest.git.mount.preserve.join(':') }
        : {}),
      ...(manifest?.runtime.restoreCommand
        ? { APP_RESTORE_COMMAND: manifest.runtime.restoreCommand }
        : {}),
      ...(manifest?.runtime.startupCommands
        ? { APP_STARTUP_COMMANDS: manifest.runtime.startupCommands }
        : {}),
      AGENT_TOOLS_TOKEN: agentToolsToken
    },
    domain,
    resources: manifest?.resources,
    ports: {
      app: template.appPort,
      agent: template.agentPort,
      dev: manifest?.runtime.devPort ?? 8080
    }
  };

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

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Deploy failed';
}
