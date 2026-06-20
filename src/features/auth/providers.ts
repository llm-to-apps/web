import { isGoogleOAuthConfigured } from '@/server/auth/google'
import { jsonOk } from '@/server/http'

export async function handleAuthProvidersGet() {
  return jsonOk({
    google: isGoogleOAuthConfigured()
  })
}
