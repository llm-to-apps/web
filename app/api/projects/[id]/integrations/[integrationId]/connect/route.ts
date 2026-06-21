import { NextRequest } from 'next/server'

import { handleProjectIntegrationConnectGet } from '@/features/projects/integrations'

type ProjectIntegrationConnectContext = {
  params:
    | Promise<{ id: string; integrationId: string }>
    | { id: string; integrationId: string }
}

export async function GET(
  request: NextRequest,
  context: ProjectIntegrationConnectContext
) {
  const { id, integrationId } = await context.params

  return handleProjectIntegrationConnectGet(request, {
    params: {
      integrationId,
      projectId: id
    }
  })
}
