import { Prisma } from '@prisma/client'

import { deployProjectForUser } from '@/features/projects/deploy'
import { isInstallableTemplate } from '@/platform/templates'
import { publishHomeChanged } from '@/server/agent/home-events'
import { elapsedSince, logAgentRun } from '@/server/agent/run-logger'
import { prisma } from '@/server/db'
import { projectMemberWhere } from '@/server/project-members'

import {
  agentRoutingByTemplateId,
  appAgentRoutingFromManifest,
  type AppAgentRouting
} from './app-agent-routing'
import { type AppCatalogArguments, type McpContext } from './schema'
import { toolJson } from './tools'

type AppTemplateRecord = Prisma.AppTemplateGetPayload<{
  include: {
    translations: {
      select: {
        description: true
        locale: true
        name: true
      }
    }
  }
}>

const maxSearchResults = 5

export async function searchAppsTool({
  args,
  context,
  requestId,
  startedAt,
  toolName
}: {
  args: unknown
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const input = parseAppCatalogArguments(args)
  const dbStartedAt = Date.now()
  const templates = await prisma.appTemplate.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      translations: {
        select: {
          description: true,
          locale: true,
          name: true
        }
      }
    }
  })
  const installedProjects = await installedProjectsByTemplate(context.user.id)
  const searchText = [input.query, input.category, input.intent].filter(Boolean).join(' ')
  const results = rankTemplates(templates, searchText)
    .slice(0, maxSearchResults)
    .map(({ score, template }) =>
      serializeCatalogTemplate(template, {
        installedProjects: installedProjects.get(template.id) ?? [],
        score
      })
    )

  logAgentRun(
    'mcp.personal.apps.search.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      resultCount: results.length,
      toolName
    }
  )

  return toolJson({
    apps: results
  })
}

export async function getAppTool({
  args,
  context,
  requestId,
  startedAt,
  toolName
}: {
  args: unknown
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const input = parseAppCatalogArguments(args)
  const appId = input.appId

  if (!appId) {
    return invalidArgumentsToolResult(
      'appId is required',
      requestId,
      context,
      startedAt,
      toolName
    )
  }

  const dbStartedAt = Date.now()
  const template = await prisma.appTemplate.findUnique({
    where: { id: appId },
    include: {
      translations: {
        select: {
          description: true,
          locale: true,
          name: true
        }
      }
    }
  })
  const installedProjects = await installedProjectsByTemplate(context.user.id)

  logAgentRun(
    'mcp.personal.apps.get.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      found: Boolean(template),
      toolName
    }
  )

  if (!template) {
    return toolJson({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Application template not found'
      }
    })
  }

  return toolJson({
    ok: true,
    app: serializeCatalogTemplate(template, {
      installedProjects: installedProjects.get(template.id) ?? []
    })
  })
}

export async function requestInstallAppTool({
  args,
  context,
  requestId,
  startedAt,
  toolName
}: {
  args: unknown
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const input = parseAppCatalogArguments(args)
  const appId = input.appId

  if (!appId) {
    return invalidArgumentsToolResult(
      'appId is required',
      requestId,
      context,
      startedAt,
      toolName
    )
  }

  const existingProject = await findInstalledProjectForTemplate(context.user.id, appId)

  if (existingProject) {
    notifyHomeChanged(context.user.id)
    logAgentRun(
      'mcp.personal.apps.request_install.finished',
      {
        projectId: existingProject.id,
        requestId,
        userId: context.user.id
      },
      {
        elapsedMs: elapsedSince(startedAt),
        reason: input.reason || null,
        status: 'already_installed',
        toolName
      }
    )

    return toolJson({
      ok: true,
      alreadyInstalled: true,
      app: serializeInstalledProject(existingProject),
      installStatus: installStatusFromProject(existingProject)
    })
  }

  const result = await deployProjectForUser({
    input: {
      templateId: appId
    },
    user: {
      aiExperienceLevel: null,
      email: context.user.email,
      id: context.user.id,
      name: context.user.name,
      onboarded: true,
      onboardingGoal: null,
      username: context.user.username,
      vibeCodingExperienceLevel: null
    }
  })

  logAgentRun(
    'mcp.personal.apps.request_install.finished',
    {
      projectId: result.ok ? result.data.projectId : null,
      requestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      ok: result.ok,
      reason: input.reason || null,
      toolName
    }
  )

  if (!result.ok) {
    return toolJson({
      ok: false,
      error: {
        code: result.code,
        message: result.message
      }
    })
  }

  notifyHomeChanged(context.user.id)

  return toolJson({
    ok: true,
    alreadyInstalled: false,
    app: {
      id: result.data.projectId,
      name: result.data.template,
      status: result.data.status,
      url: result.data.url
    },
    installStatus: {
      appId: result.data.projectId,
      ready: false,
      status: result.data.status
    },
    jobId: result.data.jobId
  })
}

export async function listInstalledAppsTool({
  context,
  requestId,
  startedAt,
  toolName
}: {
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const dbStartedAt = Date.now()
  const apps = await findInstalledProjects(context.user.id)
  const agentRouting = await agentRoutingByTemplateId(
    apps.map((app) => app.templateId),
    prisma
  )

  logAgentRun(
    'mcp.personal.apps.list_installed.finished',
    {
      requestId,
      userId: context.user.id
    },
    {
      appCount: apps.length,
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      toolName
    }
  )

  return toolJson({
    apps: apps.map((app) =>
      serializeInstalledProject(app, agentRouting.get(app.templateId))
    )
  })
}

export async function getInstallStatusTool({
  args,
  context,
  requestId,
  startedAt,
  toolName
}: {
  args: unknown
  context: McpContext
  requestId: string
  startedAt: number
  toolName: string
}) {
  const input = parseAppCatalogArguments(args)
  const appId = input.appId

  if (!appId) {
    return invalidArgumentsToolResult(
      'appId is required',
      requestId,
      context,
      startedAt,
      toolName
    )
  }

  const dbStartedAt = Date.now()
  const project =
    (await prisma.project.findFirst({
      where: {
        id: appId,
        members: projectMemberWhere(context.user.id),
        deletedAt: null,
        status: {
          notIn: ['deleting', 'deleted']
        }
      },
      select: installedProjectSelect()
    })) ?? (await findInstalledProjectForTemplate(context.user.id, appId))

  logAgentRun(
    'mcp.personal.apps.get_install_status.finished',
    {
      projectId: project?.id ?? null,
      requestId,
      userId: context.user.id
    },
    {
      dbElapsedMs: elapsedSince(dbStartedAt),
      elapsedMs: elapsedSince(startedAt),
      found: Boolean(project),
      toolName
    }
  )

  if (!project) {
    return toolJson({
      appId,
      ready: false,
      status: 'not_installed'
    })
  }

  return toolJson(installStatusFromProject(project))
}

function parseAppCatalogArguments(args: unknown): AppCatalogArguments {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {}
  }

  const input = args as Record<string, unknown>

  return {
    appId: trimmedString(input.appId),
    category: trimmedString(input.category),
    intent: trimmedString(input.intent),
    query: trimmedString(input.query),
    reason: trimmedString(input.reason)
  }
}

function trimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined
}

function rankTemplates(templates: AppTemplateRecord[], searchText: string) {
  const tokens = searchText
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean)

  return templates
    .map((template) => {
      const haystack = [
        template.id,
        template.slug,
        template.name,
        template.description,
        template.icon,
        ...template.translations.flatMap((translation) => [
          translation.name,
          translation.description
        ])
      ]
        .join(' ')
        .toLowerCase()
      const score =
        tokens.length === 0
          ? 0
          : tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)

      return {
        score,
        template
      }
    })
    .filter((result) => tokens.length === 0 || result.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.template.sortOrder - right.template.sortOrder
    })
}

async function installedProjectsByTemplate(userId: string) {
  const projects = await findInstalledProjects(userId)
  const map = new Map<string, Awaited<ReturnType<typeof findInstalledProjects>>>()

  for (const project of projects) {
    const existing = map.get(project.templateId) ?? []
    existing.push(project)
    map.set(project.templateId, existing)
  }

  return map
}

async function findInstalledProjectForTemplate(userId: string, templateId: string) {
  return prisma.project.findFirst({
    where: {
      templateId,
      members: projectMemberWhere(userId),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted', 'failed']
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: installedProjectSelect()
  })
}

async function findInstalledProjects(userId: string) {
  return prisma.project.findMany({
    where: {
      members: projectMemberWhere(userId),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    select: installedProjectSelect()
  })
}

function installedProjectSelect() {
  return {
    id: true,
    templateId: true,
    templateName: true,
    domain: true,
    url: true,
    status: true,
    deployError: true,
    createdAt: true,
    updatedAt: true
  } satisfies Prisma.ProjectSelect
}

function serializeCatalogTemplate(
  template: AppTemplateRecord,
  {
    installedProjects,
    score
  }: {
    installedProjects: Awaited<ReturnType<typeof findInstalledProjects>>
    score?: number
  }
) {
  const agent = appAgentRoutingFromManifest(template.manifest)

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    agent,
    hubTopicId: template.hubTopicId,
    icon: template.icon,
    status: template.status,
    installable: isInstallableTemplate(template),
    installed: installedProjects.length > 0,
    installedApps: installedProjects.map((project) =>
      serializeInstalledProject(project, agent ?? undefined)
    ),
    score,
    translations: Object.fromEntries(
      template.translations.map((translation) => [
        translation.locale,
        {
          description: translation.description,
          name: translation.name
        }
      ])
    )
  }
}

function serializeInstalledProject(project: InstalledProject, agent?: AppAgentRouting) {
  return {
    id: project.id,
    templateId: project.templateId,
    name: project.templateName,
    agent: agent ?? null,
    domain: project.domain,
    url: project.url,
    status: project.status,
    deployError: project.deployError,
    ready: project.status === 'ready',
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  }
}

function installStatusFromProject(project: InstalledProject) {
  return {
    appId: project.id,
    templateId: project.templateId,
    name: project.templateName,
    url: project.url,
    status: project.status,
    ready: project.status === 'ready',
    failed: project.status === 'failed',
    deployError: project.deployError
  }
}

function invalidArgumentsToolResult(
  message: string,
  requestId: string,
  context: McpContext,
  startedAt: number,
  toolName: string
) {
  logAgentRun(
    'mcp.personal.apps.invalid_arguments',
    {
      requestId,
      userId: context.user.id
    },
    {
      elapsedMs: elapsedSince(startedAt),
      toolName
    }
  )

  return toolJson({
    ok: false,
    error: {
      code: 'BAD_REQUEST',
      message
    }
  })
}

type InstalledProject = NonNullable<
  Awaited<ReturnType<typeof findInstalledProjectForTemplate>>
>

function notifyHomeChanged(userId: string) {
  publishHomeChanged(userId).catch(() => undefined)
}
