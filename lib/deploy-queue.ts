import { Queue } from 'bullmq';

export type DeployProjectJob = {
  projectId: string;
  managerUrl: string;
  managerPayload: {
    id: string;
    git: string;
    services: {
      mysql: {
        db: string;
        user: string;
        password: string;
      };
    };
    env: Record<string, string>;
    domain: string;
    ports: {
      app: number;
      agent: number;
    };
  };
};

export const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export function redisConnectionOptions() {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null
  };
}

export const deployQueueName = 'project-deployments';

let deployQueue: Queue<DeployProjectJob, unknown, 'deploy-project'> | null = null;

export function getDeployQueue() {
  deployQueue ??= new Queue<DeployProjectJob, unknown, 'deploy-project'>(
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
  );

  return deployQueue;
}
