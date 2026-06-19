import { prisma } from '@/server/db'
import { jsonOk } from '@/server/http'

export async function handleStoreTemplatesGet() {
  const templates = await prisma.appTemplate.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })

  return jsonOk({
    templates
  })
}
