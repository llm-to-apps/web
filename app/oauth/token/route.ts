import { NextRequest } from 'next/server'

import { exchangeOAuthTokenRequest } from '@/features/oauth/token'

export async function POST(request: NextRequest) {
  return exchangeOAuthTokenRequest(request)
}
