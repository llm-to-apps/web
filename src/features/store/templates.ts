import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { jsonOk } from '@/server/http'

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
