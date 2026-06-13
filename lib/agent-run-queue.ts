import { Queue } from 'bullmq';

import { redisConnectionOptions } from './deploy-queue';
import { type AgentRunJob } from './agent-run-types';

export const agentRunQueueName = 'agent-runs';

let agentRunQueue: Queue<AgentRunJob, unknown, 'run-agent'> | null = null;

export function getAgentRunQueue() {
  agentRunQueue ??= new Queue<AgentRunJob, unknown, 'run-agent'>(agentRunQueueName, {
    connection: redisConnectionOptions(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 1_000
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7
      }
    }
  });

  return agentRunQueue;
}
