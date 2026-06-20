import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

export function requiredEnv(key: string) {
  const value = process.env[key]

  if (!value) {
    throw new Error(`${key} is required`)
  }

  return value
}

export function optionalEnv(key: string) {
  return process.env[key] || undefined
}

export function requiredTrimmedUrlEnv(key: string) {
  return requiredEnv(key).replace(/\/+$/, '')
}

export function optionalTrimmedUrlEnv(key: string) {
  return optionalEnv(key)?.replace(/\/+$/, '')
}

export function envFlag(key: string) {
  return optionalEnv(key) === 'true'
}

export function envNumber(key: string, fallback: number) {
  const value = optionalEnv(key)

  return value ? Number(value) : fallback
}

export function isProductionEnv() {
  return process.env.NODE_ENV === 'production'
}

export function isDevelopmentEnv() {
  return process.env.NODE_ENV === 'development'
}

export function authSecret() {
  return requiredEnv('AUTH_SECRET')
}

export function authTokenSecret() {
  return optionalEnv('AUTH_TOKEN_SECRET') ?? authSecret()
}

export function authTokenEncryptionSecret() {
  return optionalEnv('AUTH_TOKEN_ENCRYPTION_KEY') ?? authSecret()
}

export function oauthSigningSecret() {
  return optionalEnv('OAUTH_SECRET') ?? authSecret()
}

export function oauthEncryptionSecret() {
  return optionalEnv('OAUTH_ENCRYPTION_KEY') ?? authSecret()
}

export function googleOAuthClientId() {
  return optionalEnv('GOOGLE_OAUTH_CLIENT_ID')
}

export function googleOAuthEnabled() {
  return envFlag('GOOGLE_OAUTH_ENABLED')
}

export function googleOAuthClientSecret() {
  return optionalEnv('GOOGLE_OAUTH_CLIENT_SECRET')
}

export function googleOAuthRedirectUri() {
  return optionalTrimmedUrlEnv('GOOGLE_OAUTH_REDIRECT_URI')
}

export function projectUseAgentModel() {
  return requiredEnv('PROJECT_USE_AGENT_MODEL')
}

export function projectDevAgentModel() {
  return requiredEnv('PROJECT_DEV_AGENT_MODEL')
}

export function userAgentModel() {
  return optionalEnv('USER_AGENT_MODEL') ?? projectDevAgentModel()
}

export function openRouterApiKey() {
  return requiredEnv('OPENROUTER_API_KEY')
}

export function openRouterBaseUrl() {
  return optionalTrimmedUrlEnv('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1'
}

export function agentEmbeddingModel() {
  return optionalEnv('AGENT_EMBEDDING_MODEL') ?? 'openai/text-embedding-3-small'
}

export function agentEmbeddingDimensions() {
  return envNumber('AGENT_EMBEDDING_DIMENSIONS', 1536)
}

export function agentPdfExtractionModel() {
  return optionalEnv('AGENT_PDF_EXTRACTION_MODEL') ?? 'openai/gpt-4o-mini'
}

export function agentImageExtractionModel() {
  return optionalEnv('AGENT_IMAGE_EXTRACTION_MODEL') ?? agentPdfExtractionModel()
}

export function hubArtifactClassifierModel() {
  return optionalEnv('HUB_ARTIFACT_CLASSIFIER_MODEL') ?? 'openai/gpt-4o-mini'
}

export function hubTopicEnrichmentModel() {
  return optionalEnv('HUB_TOPIC_ENRICHMENT_MODEL') ?? 'openai/gpt-4o-mini'
}

export function agentPdfExtractionEngine() {
  return optionalEnv('AGENT_PDF_EXTRACTION_ENGINE') ?? 'cloudflare-ai'
}

export function agentPdfExtractionFallbackEngine() {
  return optionalEnv('AGENT_PDF_EXTRACTION_FALLBACK_ENGINE') ?? 'mistral-ocr'
}

export function uploadedFileExtractionMaxBytes() {
  return envNumber('UPLOADED_FILE_EXTRACTION_MAX_BYTES', 512 * 1024)
}

export function resendApiKey() {
  return optionalEnv('RESEND_API_KEY')
}

export function emailFrom() {
  return optionalEnv('EMAIL_FROM') ?? 'login@os7.dev'
}

export function agentRuntimeUrl() {
  return optionalTrimmedUrlEnv('AGENT_URL')
}

export function managerUrl() {
  return requiredTrimmedUrlEnv('MANAGER_URL')
}

export function platformBaseUrl() {
  return requiredTrimmedUrlEnv('PLATFORM_BASE_URL')
}

export function siteUrl() {
  return optionalTrimmedUrlEnv('SITE_URL') ?? 'https://www.os7.dev'
}

export function platformDomain() {
  return requiredEnv('PLATFORM_DOMAIN')
}

export function projectPublicScheme() {
  return requiredEnv('PROJECT_PUBLIC_SCHEME')
}

export function oauthInternalBaseUrl() {
  return requiredTrimmedUrlEnv('OAUTH_INTERNAL_BASE_URL')
}

export function redisUrl() {
  return requiredEnv('REDIS_URL')
}

export function redisPubSubUrl() {
  return optionalEnv('REDIS_PUBSUB_URL') ?? redisUrl()
}

export function browserlessUrl() {
  return optionalTrimmedUrlEnv('BROWSERLESS_URL')
}

export function browserlessToken() {
  return optionalEnv('BROWSERLESS_TOKEN')
}

export function forgejoUrl() {
  return requiredTrimmedUrlEnv('FORGEJO_URL')
}

export function forgejoGitUrl() {
  return requiredTrimmedUrlEnv('FORGEJO_GIT_URL')
}

export function forgejoAdminUser() {
  return requiredEnv('FORGEJO_ADMIN_USER')
}

export function forgejoAdminPassword() {
  return requiredEnv('FORGEJO_ADMIN_PASSWORD')
}

export function appReadyBaseUrl() {
  return requiredTrimmedUrlEnv('APP_READY_BASE_URL')
}

export function storageS3Endpoint() {
  return requiredTrimmedUrlEnv('STORAGE_S3_ENDPOINT')
}

export function storageS3InternalEndpoint() {
  return optionalTrimmedUrlEnv('STORAGE_S3_INTERNAL_ENDPOINT') ?? storageS3Endpoint()
}

export function storageS3Region() {
  return optionalEnv('STORAGE_S3_REGION') ?? 'us-east-1'
}

export function storageS3AccessKeyId() {
  return requiredEnv('STORAGE_S3_ACCESS_KEY_ID')
}

export function storageS3SecretAccessKey() {
  return requiredEnv('STORAGE_S3_SECRET_ACCESS_KEY')
}

export function storageS3BucketPrefix() {
  return optionalEnv('STORAGE_S3_BUCKET_PREFIX') ?? 'os7'
}

export function storageS3Bucket() {
  return optionalEnv('STORAGE_S3_BUCKET') ?? `${storageS3BucketPrefix()}-web`
}

export function storageS3ForcePathStyle() {
  return optionalEnv('STORAGE_S3_FORCE_PATH_STYLE') ?? 'true'
}
