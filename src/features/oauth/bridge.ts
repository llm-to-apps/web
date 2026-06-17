export type OAuthFrameCodeRequest = {
  clientId?: string
  redirectUri?: string
  scope?: string
  state?: string
}

export type OAuthFrameCodeResponse = {
  ok: true
  code: string
  state: string
}
