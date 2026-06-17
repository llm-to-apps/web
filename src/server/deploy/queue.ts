import { Queue } from 'bullmq'
import { redisUrl } from '../env'
import { type ProjectResources } from './project-resources'
import { type ManagerDeployAppPayload } from './manager-client'

export type DeployProjectJob = {
  projectId: string
  managerUrl: string
  managerPayload: ManagerDeployAppPayload
}

export type CheckProjectReadyJob = {
  projectId: string
  domain: string
  readinessStartedAt: string
}

export type DeleteProjectJob = {
  projectId: string
  managerUrl: string
  resources: ProjectResources
}

export type ProjectDeploymentJob =
  | DeployProjectJob
  | CheckProjectReadyJob
  | DeleteProjectJob
export type ProjectDeploymentJobName =
  | 'deploy-project'
  | 'check-project-ready'
  | 'delete-project'

export const deployRedisUrl = redisUrl()

export function redisConnectionOptions() {
  const url = new URL(deployRedisUrl)

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null
  }
}

export const deployQueueName = 'project-deployments'

let deployQueue: Queue<ProjectDeploymentJob, unknown, ProjectDeploymentJobName> | null =
  null

export function getDeployQueue() {
  deployQueue ??= new Queue<ProjectDeploymentJob, unknown, ProjectDeploymentJobName>(
    deployQueueName,
    {
      connection: redisConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5_000
        },
        removeOnComplete: {
          age: 60 * 60 * 24,
          count: 500
        },
        removeOnFail: {
          age: 60 * 60 * 24 * 7
        }
      }
    }
  )

  return deployQueue
}
