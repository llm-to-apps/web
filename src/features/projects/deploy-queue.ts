import { getDeployQueue } from '@/server/deploy/queue'
import { type ManagerDeployAppPayload } from '@/server/deploy/manager-client'

export async function enqueueProjectDeploy({
  managerPayload,
  managerUrl,
  projectId
}: {
  managerPayload: ManagerDeployAppPayload
  managerUrl: string
  projectId: string
}) {
  const deployQueue = getDeployQueue()

  return deployQueue.add(
    'deploy-project',
    {
      projectId,
      managerUrl,
      managerPayload
    },
    {
      jobId: projectId
    }
  )
}
