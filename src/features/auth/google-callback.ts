import { NextRequest } from 'next/server'

import { finishGoogleOAuth } from '@/server/auth/google'

export async function handleGoogleCallbackGet(request: NextRequest) {
  return finishGoogleOAuth(request)
}
