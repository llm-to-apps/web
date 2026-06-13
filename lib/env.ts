import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

export function requiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function optionalEnv(key: string) {
  return process.env[key] || undefined;
}

export function requiredTrimmedUrlEnv(key: string) {
  return requiredEnv(key).replace(/\/+$/, '');
}

export function optionalTrimmedUrlEnv(key: string) {
  return optionalEnv(key)?.replace(/\/+$/, '');
}

export function envFlag(key: string) {
  return optionalEnv(key) === 'true';
}

export function envNumber(key: string, fallback: number) {
  const value = optionalEnv(key);

  return value ? Number(value) : fallback;
}

export function isProductionEnv() {
  return process.env.NODE_ENV === 'production';
}

export function isDevelopmentEnv() {
  return process.env.NODE_ENV === 'development';
}

export function authSecret() {
  return requiredEnv('AUTH_SECRET');
}

export function authTokenSecret() {
  return optionalEnv('AUTH_TOKEN_SECRET') ?? authSecret();
}

export function authTokenEncryptionSecret() {
  return optionalEnv('AUTH_TOKEN_ENCRYPTION_KEY') ?? authSecret();
}

export function oauthSigningSecret() {
  return optionalEnv('OAUTH_SECRET') ?? authSecret();
}

export function oauthEncryptionSecret() {
  return optionalEnv('OAUTH_ENCRYPTION_KEY') ?? authSecret();
}

export function projectUseAgentModel() {
  return requiredEnv('PROJECT_USE_AGENT_MODEL');
}

export function projectDevAgentModel() {
  return requiredEnv('PROJECT_DEV_AGENT_MODEL');
}

export function userAgentModel() {
  return optionalEnv('USER_AGENT_MODEL') ?? projectDevAgentModel();
}

export function resendApiKey() {
  return optionalEnv('RESEND_API_KEY');
}

export function emailFrom() {
  return optionalEnv('EMAIL_FROM') ?? 'onboarding@resend.dev';
}

export function agentRuntimeUrl() {
  return optionalTrimmedUrlEnv('AGENT_URL');
}

export function managerUrl() {
  return requiredTrimmedUrlEnv('MANAGER_URL');
}

export function platformBaseUrl() {
  return requiredTrimmedUrlEnv('PLATFORM_BASE_URL');
}

export function siteUrl() {
  return optionalTrimmedUrlEnv('SITE_URL') ?? 'https://www.os7.dev';
}

export function platformDomain() {
  return requiredEnv('PLATFORM_DOMAIN');
}

export function projectPublicScheme() {
  return requiredEnv('PROJECT_PUBLIC_SCHEME');
}

export function oauthInternalBaseUrl() {
  return requiredTrimmedUrlEnv('OAUTH_INTERNAL_BASE_URL');
}

export function redisUrl() {
  return requiredEnv('REDIS_URL');
}

export function redisPubSubUrl() {
  return optionalEnv('REDIS_PUBSUB_URL') ?? redisUrl();
}

export function forgejoUrl() {
  return requiredTrimmedUrlEnv('FORGEJO_URL');
}

export function forgejoGitUrl() {
  return requiredTrimmedUrlEnv('FORGEJO_GIT_URL');
}

export function forgejoAdminUser() {
  return requiredEnv('FORGEJO_ADMIN_USER');
}

export function forgejoAdminPassword() {
  return requiredEnv('FORGEJO_ADMIN_PASSWORD');
}

export function appReadyBaseUrl() {
  return requiredTrimmedUrlEnv('APP_READY_BASE_URL');
}
