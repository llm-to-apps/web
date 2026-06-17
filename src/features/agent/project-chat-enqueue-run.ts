import { getAgentRunQueue } from '@/server/agent/run-queue'

export async function enqueueAgentRun(runId: string) {
  await getAgentRunQueue().add(
    'run-agent',
    {
      runId
    },
    {
      jobId: runId
    }
  )
}
