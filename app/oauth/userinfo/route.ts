import { NextRequest } from 'next/server'

import { readOAuthUserInfo } from '@/features/oauth/userinfo'

export async function GET(request: NextRequest) {
  return readOAuthUserInfo(request)
}
