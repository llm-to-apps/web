export function userAgentMemoryIds(userId: string) {
  return {
    resourceId: `user:${userId}:agent:user`,
    threadId: `user:${userId}:agent:user:main`
  };
}

export function projectAgentMemoryIds(
  userId: string,
  projectId: string,
  mode: 'dev' | 'use'
) {
  return {
    resourceId: `user:${userId}:project:${projectId}:agent:${mode}`,
    threadId: `user:${userId}:project:${projectId}:agent:${mode}:main`
  };
}
