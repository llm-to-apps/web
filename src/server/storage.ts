import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

import {
  managerUrl,
  storageS3AccessKeyId,
  storageS3Bucket,
  storageS3BucketPrefix,
  storageS3Endpoint,
  storageS3ForcePathStyle,
  storageS3InternalEndpoint,
  storageS3Region,
  storageS3SecretAccessKey
} from './env'

export type ProjectStorageEnv = {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  AWS_REGION: string
  S3_ENDPOINT: string
  S3_REGION: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
  S3_FORCE_PATH_STYLE: string
  OS7_STORAGE_ENDPOINT: string
  OS7_STORAGE_BUCKET: string
}

export type ProjectStorageCredentials = {
  bucket: string
  user: string
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  internalEndpoint: string
  region: string
  forcePathStyle: string
}

export type PlatformStorageCredentials = {
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  internalEndpoint: string
  region: string
  forcePathStyle: string
}

export function platformStorageConfig() {
  return {
    endpoint: storageS3Endpoint(),
    internalEndpoint: storageS3InternalEndpoint(),
    region: storageS3Region(),
    accessKeyId: storageS3AccessKeyId(),
    secretAccessKey: storageS3SecretAccessKey(),
    bucket: storageS3Bucket(),
    bucketPrefix: storageS3BucketPrefix(),
    forcePathStyle: storageS3ForcePathStyle()
  }
}

export function createPlatformStorageCredentials(): PlatformStorageCredentials {
  const config = platformStorageConfig()

  return {
    accessKeyId: config.accessKeyId,
    bucket: config.bucket,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    internalEndpoint: config.internalEndpoint,
    region: config.region,
    secretAccessKey: config.secretAccessKey
  }
}

export function projectStorageBucket(projectId: string) {
  return `${storageS3BucketPrefix()}-project-${projectId}`
}

export function createProjectStorageEnv(
  credentials: ProjectStorageCredentials
): ProjectStorageEnv {
  return {
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_REGION: credentials.region,
    S3_ENDPOINT: credentials.internalEndpoint,
    S3_REGION: credentials.region,
    S3_ACCESS_KEY_ID: credentials.accessKeyId,
    S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    S3_BUCKET: credentials.bucket,
    S3_FORCE_PATH_STYLE: credentials.forcePathStyle,
    OS7_STORAGE_ENDPOINT: credentials.internalEndpoint,
    OS7_STORAGE_BUCKET: credentials.bucket
  }
}

export async function putPlatformStorageObject({
  body,
  contentType,
  key
}: {
  body: Buffer
  contentType: string
  key: string
}) {
  const config = platformStorageConfig()
  const s3 = new S3Client(storageAwsConfig(config))

  try {
    await s3.send(
      new PutObjectCommand({
        Body: body,
        Bucket: config.bucket,
        ContentLength: body.byteLength,
        ContentType: contentType,
        Key: key
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to write S3 object to ${config.endpoint}/${config.bucket}/${key}`,
      {
        cause: error
      }
    )
  }

  return {
    bucket: config.bucket,
    key
  }
}

export async function getPlatformStorageObjectBuffer({
  bucket,
  key
}: {
  bucket: string
  key: string
}) {
  const config = platformStorageConfig()
  const s3 = new S3Client(storageAwsConfig(config))
  let response

  try {
    response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    )
  } catch (error) {
    throw new Error(`Failed to read S3 object from ${config.endpoint}/${bucket}/${key}`, {
      cause: error
    })
  }

  if (!response.Body) {
    return Buffer.alloc(0)
  }

  return Buffer.from(await response.Body.transformToByteArray())
}

export async function deletePlatformStorageObject({
  bucket,
  key
}: {
  bucket: string
  key: string
}) {
  const config = platformStorageConfig()
  const s3 = new S3Client(storageAwsConfig(config))

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      })
    )
  } catch (error) {
    throw new Error(`Failed to delete S3 object from ${config.endpoint}/${bucket}/${key}`, {
      cause: error
    })
  }
}

export async function provisionProjectStorage(
  projectId: string
): Promise<ProjectStorageCredentials> {
  const response = await fetch(`${managerUrl()}/storage/projects/${projectId}`, {
    body: JSON.stringify({
      bucket: projectStorageBucket(projectId),
      user: `project-${projectId}`
    }),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error(
      `Manager failed to provision SeaweedFS storage for ${projectId}: ${response.status} ${response.statusText}`
    )
  }

  return parseProjectStorageCredentials(await response.json())
}

function storageAwsConfig(config: ReturnType<typeof platformStorageConfig>) {
  return {
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle === 'true',
    region: config.region
  }
}

function parseProjectStorageCredentials(value: unknown): ProjectStorageCredentials {
  if (!value || typeof value !== 'object') {
    throw new Error('Manager returned an invalid SeaweedFS storage response')
  }

  const credentials = value as Partial<ProjectStorageCredentials>
  const required: Array<keyof ProjectStorageCredentials> = [
    'accessKeyId',
    'bucket',
    'endpoint',
    'forcePathStyle',
    'internalEndpoint',
    'region',
    'secretAccessKey',
    'user'
  ]

  for (const key of required) {
    if (typeof credentials[key] !== 'string' || !credentials[key]) {
      throw new Error(`Manager SeaweedFS storage response is missing ${key}`)
    }
  }

  return credentials as ProjectStorageCredentials
}
