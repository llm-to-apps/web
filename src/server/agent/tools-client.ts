export type AgentToolsRuntimeStatus = {
  dev?: {
    running?: boolean
  }
  prod?: {
    running?: boolean
  }
}

export class AgentToolsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  async status(): Promise<AgentToolsRuntimeStatus> {
    const response = await this.request('/app/status')

    if (!response.ok) {
      return {}
    }

    return (await response.json().catch(() => ({}))) as AgentToolsRuntimeStatus
  }

  async startDev() {
    return this.request('/app/dev/start', {
      method: 'POST'
    })
  }

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${this.token}`,
          ...(init.headers ?? {})
        },
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}
