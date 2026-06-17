import { clearSession } from '@/server/auth'
import { jsonOk } from '@/server/http'

export async function handleLogoutPost() {
  await clearSession()
  return jsonOk()
}
