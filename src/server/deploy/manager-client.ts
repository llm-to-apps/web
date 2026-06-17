export type ManagerAppResources = {
  memory?: {
    reservationMb?: number
    limitMb?: number
  }
  cpu?: {
    reservation?: number
    limit?: number
  }
}

export type ManagerDeployAppPayload = {
  id: string
  git: string
  image: string | null
  serviceName?: string
  services: {
    mysql?: {
      db: string
      user: string
      password: string
    }
  }
  env: Record<string, string>
  domain: string
  devDomain?: string
  resources?: ManagerAppResources
  ports: {
    app: number
    agent: number
    dev?: number
  }
}
