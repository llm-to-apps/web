import { agentRuntimeUrl } from '../env'

type DeleteMastraMemoryThreadInput = {
  agentId: 'projectDevAgent' | 'projectUseAgent' | 'userAgent'
  resourceId: string
  threadId: string
}

export async function deleteMastraMemoryThread({
  agentId,
  resourceId,
  threadId
}: DeleteMastraMemoryThreadInput) {
  const agentUrl = agentRuntimeUrl()

  if (!agentUrl) {
    throw new Error('The agent runtime is not connected yet')
  }

  const headers = new Headers({
    'Content-Type': 'application/json'
  })

  const response = await fetch(`${agentUrl}/internal/agent-memory/delete-thread`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agentId,
      resourceId,
      threadId
    })
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null

    throw new Error(
      body?.message ?? `Mastra memory delete failed with ${response.status}`
    )
  }
}
