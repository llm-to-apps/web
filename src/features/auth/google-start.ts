import { NextRequest } from 'next/server'

import { startGoogleOAuth } from '@/server/auth/google'

export async function handleGoogleStartGet(request: NextRequest) {
  return startGoogleOAuth(request)
}
