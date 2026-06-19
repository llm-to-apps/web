import { type NextRequest } from 'next/server'

import { getCurrentUser } from '@/server/auth'
import { isUsernameAvailable, normalizeUsername } from '@/server/auth/username'
import { jsonErrorMessage, jsonOk } from '@/server/http'

export async function handleUsernameAvailabilityGet(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in before checking username', 401)
  }

  const username = normalizeUsername(request.nextUrl.searchParams.get('username') ?? '')
  const availability = await isUsernameAvailable(username, user.id)

  return jsonOk(availability)
}
