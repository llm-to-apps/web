import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { jsonOk } from '@/server/http'
import type { TemplateManifest } from '@/shared/templates/manifest'

type StoreTemplateRecord = Prisma.AppTemplateGetPayload<{
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

export async function handleStoreTemplatesGet() {
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

  return jsonOk({
    templates: templates.map(serializeTemplate)
  })
}

function serializeTemplate(template: StoreTemplateRecord) {
  return {
    agentPort: template.agentPort,
    appPort: template.appPort,
    description: template.description,
    git: template.git,
    hubTopicId: template.hubTopicId,
    icon: template.icon,
    id: template.id,
    image: template.image,
    hot: isHotTemplate(template.manifest),
    name: template.name,
    status: template.status,
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

function isHotTemplate(manifest: Prisma.JsonValue) {
  return Boolean((manifest as Partial<TemplateManifest> | null)?.hot)
}
