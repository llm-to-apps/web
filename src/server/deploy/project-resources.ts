export type ProjectResources = {
  mysql?: {
    db: string
    user: string
  }
  oauth?: {
    clientId: string
    redirectUri: string
  }
  git?: {
    owner: string
    name: string
    cloneUrl: string
    user?: string
  }
  swarm?: {
    serviceName: string
  }
}

export function parseProjectResources(input: unknown): ProjectResources {
  if (!input || typeof input !== 'object') {
    return {}
  }

  return input as ProjectResources
}
