import { type Prisma } from '@prisma/client';

export type AgentScope = 'user_agent' | 'project_agent';
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type AgentMode = 'use' | 'dev';

export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type AgentStreamEvent =
  | {
      type: 'text';
      text: string;
    }
	  | {
	      type: 'progress';
	      message: string;
	      toolInput?: Prisma.InputJsonValue;
	      toolName?: string;
	      toolState?: 'running' | 'finished';
	    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'usage';
      usage: TokenUsage;
    }
  | {
      type: 'credits';
      creditsUsed: number;
    }
  | {
      type: 'done';
    };

export type UserAgentRunPayload = {
  message: string;
  personalMcpUrl: string;
  userEmail: string;
};

export type ProjectAgentRunPayload = {
  appMcpUrl: string;
  agentToolsToken: string | null;
  domain: string;
  message: string;
  projectUserToken: string | null;
  projectName: string;
  status: string;
  toolsUrl: string;
};

export type AgentRunJob = {
  runId: string;
};
