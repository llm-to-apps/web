import { jsonOk } from '@/server/http'

export const dynamic = 'force-dynamic'

export function GET() {
  return jsonOk(
    {},
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  )
}
