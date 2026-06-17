'use client'

import { useEffect } from 'react'

import { clientError, clientInfo, clientWarn } from '@/shared/client-logger'

type ProjectOAuthBridgeProps = {
  appOrigin: string
  projectId: string
}

type OAuthRequestMessage = {
  type?: string
  clientId?: string
  redirectUri?: string
  scope?: string
  state?: string
}

export function ProjectOAuthBridge({ appOrigin, projectId }: ProjectOAuthBridgeProps) {
  useEffect(() => {
    clientInfo('oauth_bridge.mounted', { appOrigin, projectId })

    async function onMessage(event: MessageEvent<OAuthRequestMessage>) {
      if (event.data?.type === 'oauth:request') {
        clientInfo('oauth_bridge.request.received', {
          appOrigin,
          clientId: event.data.clientId,
          eventOrigin: event.origin,
          projectId,
          redirectUri: event.data.redirectUri
        })
      }

      if (event.origin !== appOrigin || event.data?.type !== 'oauth:request') {
        if (event.data?.type === 'oauth:request') {
          clientWarn('oauth_bridge.request.unexpected_origin', {
            expectedOrigin: appOrigin,
            eventOrigin: event.origin
          })
        }
        return
      }

      const source = event.source

      if (!source || source === window) {
        clientWarn('oauth_bridge.request.missing_iframe_source')
        return
      }

      try {
        clientInfo('oauth_bridge.frame_code.requested', { projectId })
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/oauth/frame-code`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              clientId: event.data.clientId,
              redirectUri: event.data.redirectUri,
              scope: event.data.scope,
              state: event.data.state
            })
          }
        )
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; code: string; state: string }
          | { ok: false; message?: string }
          | null

        if (!response.ok || !payload) {
          clientWarn('oauth_bridge.frame_code.failed', { status: response.status })
          throw new Error('OAuth bridge request failed')
        }

        if (!payload.ok) {
          clientWarn('oauth_bridge.frame_code.rejected', {
            message: payload.message
          })
          throw new Error(payload.message || 'OAuth bridge request failed')
        }

        clientInfo('oauth_bridge.response.posted', { appOrigin })
        windowPostMessage(
          source,
          {
            type: 'oauth:response',
            code: payload.code,
            state: payload.state
          },
          appOrigin
        )
      } catch (error) {
        clientError('oauth_bridge.request.failed', {
          message: error instanceof Error ? error.message : 'OAuth bridge failed'
        })
        windowPostMessage(
          source,
          {
            type: 'oauth:error',
            message: error instanceof Error ? error.message : 'OAuth bridge failed',
            state: event.data?.state
          },
          appOrigin
        )
      }
    }

    window.addEventListener('message', onMessage)

    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [appOrigin, projectId])

  return null
}

function windowPostMessage(
  source: MessageEventSource,
  message: Record<string, unknown>,
  targetOrigin: string
) {
  if ('closed' in source) {
    source.postMessage(message, targetOrigin)
  }
}
