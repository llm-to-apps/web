import { getCurrentUser } from '@/server/auth'
import { jsonErrorMessage, jsonOk } from '@/server/http'

export async function handleAuthMeGet() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonErrorMessage('Sign in required', 401)
  }

  return jsonOk({ user })
}
