import { NextRequest, NextResponse } from 'next/server'

import {
  type OAuthFrameCodeRequest,
  type OAuthFrameCodeResponse
} from '@/features/oauth/bridge'
import { getCurrentUser } from '@/server/auth'
import { createAuthorizationCode, findActiveOAuthClient } from '@/server/oauth'
import { prisma } from '@/server/db'
import { jsonErrorMessage } from '@/server/http'
import { logInfo, logWarn } from '@/server/logger'
import { projectMemberWhere } from '@/server/project-members'

type RouteContext = {
  params: Promise<{ id: string }> | { id: string }
}

export async function handleOAuthFrameCodePost(
  request: NextRequest,
  context: RouteContext
) {
  const user = await getCurrentUser()

  if (!user) {
    logWarn('oauth.frame_code.unsigned')
    return jsonErrorMessage('Sign in required', 401)
  }

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as OAuthFrameCodeRequest | null
  logInfo('oauth.frame_code.started', {
    clientId: body?.clientId,
    projectId: id,
    redirectUri: body?.redirectUri,
    userId: user.id
  })

  if (!body?.clientId || !body.redirectUri || !body.state) {
    logWarn('oauth.frame_code.invalid_request', {
      projectId: id,
      userId: user.id
    })
    return jsonErrorMessage('Invalid OAuth request', 400)
  }

  const project = await prisma.project.findFirst({
    where: {
      id,
      members: projectMemberWhere(user.id),
      deletedAt: null,
      status: {
        notIn: ['deleting', 'deleted']
      }
    },
    select: {
      devDomain: true,
      id: true,
      domain: true
    }
  })

  if (!project) {
    logWarn('oauth.frame_code.project_not_found', {
      projectId: id,
      userId: user.id
    })
    return jsonErrorMessage('Project not found', 404)
  }

  const redirectUrl = new URL(body.redirectUri)

  const allowedHosts = new Set([project.domain, project.devDomain].filter(Boolean))

  if (
    redirectUrl.pathname !== '/api/auth/callback/os7' ||
    !allowedHosts.has(redirectUrl.host)
  ) {
    logWarn('oauth.frame_code.redirect_host_mismatch', {
      expectedHosts: Array.from(allowedHosts),
      projectId: project.id,
      redirectHost: redirectUrl.host
    })
    return jsonErrorMessage('Redirect URI is not allowed', 400)
  }

  const client = await findActiveOAuthClient({
    clientId: body.clientId,
    redirectUri: body.redirectUri
  })

  if (!client || client.projectId !== project.id) {
    logWarn('oauth.frame_code.client_mismatch', {
      clientId: body.clientId,
      clientProjectId: client?.projectId,
      projectId: project.id
    })
    return jsonErrorMessage('OAuth client not found', 404)
  }

  const code = await createAuthorizationCode({
    clientId: client.id,
    redirectUri: body.redirectUri,
    scope: body.scope ?? 'openid email profile',
    userId: user.id
  })
  logInfo('oauth.frame_code.issued', {
    clientId: body.clientId,
    projectId: project.id,
    redirectUri: body.redirectUri,
    userId: user.id
  })

  const payload: OAuthFrameCodeResponse = {
    ok: true,
    code,
    state: body.state
  }

  return NextResponse.json(payload)
}
