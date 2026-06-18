import { managerUrl, storageS3Bucket } from '../../src/server/env'
import { type PlatformStorageCredentials } from '../../src/server/storage'

export async function ensureWebBucketCommand() {
  const response = await fetch(`${managerUrl()}/storage/platform-bucket`, {
    body: JSON.stringify({
      bucket: storageS3Bucket(),
      user: 'web-platform'
    }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error(
      `Manager failed to provision web storage bucket: ${response.status} ${response.statusText}`
    )
  }

  const credentials = (await response.json()) as PlatformStorageCredentials

  console.log(`Ensured web storage bucket ${credentials.bucket}`)
}
