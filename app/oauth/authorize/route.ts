import { NextRequest } from 'next/server'

import { authorizeOAuthRequest } from '@/features/oauth/authorize'

export async function GET(request: NextRequest) {
  return authorizeOAuthRequest(request)
}
