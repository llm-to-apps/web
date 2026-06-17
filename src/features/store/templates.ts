import { getCurrentUser } from '@/server/auth'
import { prisma } from '@/server/db'
import { jsonErrorMessage, jsonOk } from '@/server/http'

export async function handleStoreTemplatesGet() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before viewing the store', 401)
  }

  if (!user.onboarded) {
    return jsonErrorMessage('Complete onboarding first', 403)
  }

  const templates = await prisma.appTemplate.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
  })

  return jsonOk({
    templates
  })
}
