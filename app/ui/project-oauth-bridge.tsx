'use client';

import { useEffect } from 'react';

type ProjectOAuthBridgeProps = {
  appOrigin: string;
  projectId: string;
};

type OAuthRequestMessage = {
  type?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  state?: string;
};

export function ProjectOAuthBridge({ appOrigin, projectId }: ProjectOAuthBridgeProps) {
  useEffect(() => {
    console.info('[OS7 OAuth Bridge] mounted', { appOrigin, projectId });

    async function onMessage(event: MessageEvent<OAuthRequestMessage>) {
      if (event.data?.type === 'oauth:request') {
        console.info('[OS7 OAuth Bridge] oauth:request received', {
          appOrigin,
          clientId: event.data.clientId,
          eventOrigin: event.origin,
          projectId,
          redirectUri: event.data.redirectUri,
          state: event.data.state
        });
      }

      if (event.origin !== appOrigin || event.data?.type !== 'oauth:request') {
        if (event.data?.type === 'oauth:request') {
          console.warn('[OS7 OAuth Bridge] ignored request from unexpected origin', {
            expectedOrigin: appOrigin,
            eventOrigin: event.origin
          });
        }
        return;
      }

      const source = event.source;

      if (!source || source === window) {
        console.warn('[OS7 OAuth Bridge] ignored request without iframe source');
        return;
      }

      try {
        console.info('[OS7 OAuth Bridge] requesting frame code', { projectId });
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
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; code: string; state: string }
          | { ok: false; message?: string }
          | null;

        if (!response.ok || !payload) {
          console.warn('[OS7 OAuth Bridge] frame-code failed', {
            status: response.status,
            payload
          });
          throw new Error('OAuth bridge request failed');
        }

        if (!payload.ok) {
          console.warn('[OS7 OAuth Bridge] frame-code rejected', payload);
          throw new Error(payload.message || 'OAuth bridge request failed');
        }

        console.info('[OS7 OAuth Bridge] posting oauth:response', {
          appOrigin,
          state: payload.state
        });
        windowPostMessage(source,
          {
            type: 'oauth:response',
            code: payload.code,
            state: payload.state
          },
          appOrigin
        );
      } catch (error) {
        console.error('[OS7 OAuth Bridge] oauth:request failed', error);
        windowPostMessage(source,
          {
            type: 'oauth:error',
            message: error instanceof Error ? error.message : 'OAuth bridge failed',
            state: event.data?.state
          },
          appOrigin
        );
      }
    }

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [appOrigin, projectId]);

  return null;
}

function windowPostMessage(
  source: MessageEventSource,
  message: Record<string, unknown>,
  targetOrigin: string
) {
  if ('closed' in source) {
    source.postMessage(message, targetOrigin);
  }
}
