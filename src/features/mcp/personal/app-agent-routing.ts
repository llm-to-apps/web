import { Prisma } from '@prisma/client'

export type AppAgentRouting = {
  routing: string[]
  tasks: string[]
}

export function appAgentRoutingFromManifest(
  manifest: Prisma.JsonValue | null | undefined
): AppAgentRouting | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return null
  }

  const agent = (manifest as Record<string, unknown>).agent

  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    return null
  }

  const routing = stringArray((agent as Record<string, unknown>).routing)
  const tasks = stringArray((agent as Record<string, unknown>).tasks)

  if (routing.length === 0 || tasks.length === 0) {
    return null
  }

  return {
    routing,
    tasks
  }
}

export async function agentRoutingByTemplateId(
  templateIds: string[],
  prisma: Pick<Prisma.TransactionClient, 'appTemplate'>
) {
  const uniqueTemplateIds = [...new Set(templateIds)].filter(Boolean)

  if (uniqueTemplateIds.length === 0) {
    return new Map<string, AppAgentRouting>()
  }

  const templates = await prisma.appTemplate.findMany({
    where: {
      id: {
        in: uniqueTemplateIds
      }
    },
    select: {
      id: true,
      manifest: true
    }
  })

  return new Map(
    templates.flatMap((template) => {
      const agent = appAgentRoutingFromManifest(template.manifest)

      return agent ? [[template.id, agent] as const] : []
    })
  )
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : []
}
