-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_experience_level" AS ENUM ('none', 'beginner', 'advanced');

-- CreateEnum
CREATE TYPE "project_member_role" AS ENUM ('admin', 'editor', 'viewer');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" VARCHAR(18) NOT NULL,
    "name" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "aiExperienceLevel" "user_experience_level",
    "vibeCodingExperienceLevel" "user_experience_level",
    "onboardingGoal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "git" VARCHAR(1024) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "devDomain" VARCHAR(255),
    "url" VARCHAR(255) NOT NULL,
    "devUrl" VARCHAR(255),
    "status" VARCHAR(32) NOT NULL DEFAULT 'deploying',
    "appPort" INTEGER NOT NULL,
    "agentPort" INTEGER NOT NULL,
    "agentToolsToken" VARCHAR(128),
    "managerJobId" VARCHAR(128),
    "deployError" TEXT,
    "resources" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "project_member_role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_templates" (
    "id" VARCHAR(64) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,
    "icon" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'coming_soon',
    "repository" VARCHAR(128),
    "git" VARCHAR(255),
    "image" VARCHAR(255),
    "appPort" INTEGER,
    "agentPort" INTEGER,
    "hubTopicId" VARCHAR(64),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "manifestUrl" VARCHAR(512),
    "manifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_template_translations" (
    "id" TEXT NOT NULL,
    "templateId" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "app_template_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "clientId" VARCHAR(128) NOT NULL,
    "clientSecretHash" VARCHAR(255) NOT NULL,
    "clientSecretEncrypted" TEXT NOT NULL,
    "redirectUri" VARCHAR(1024) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_authorization_codes" (
    "id" TEXT NOT NULL,
    "codeHash" VARCHAR(255) NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" VARCHAR(1024) NOT NULL,
    "scope" VARCHAR(512),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_access_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" VARCHAR(512),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_agent_chat_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "source" VARCHAR(32) NOT NULL DEFAULT 'user',
    "mode" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_agent_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_agent_chat_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_agent_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "scope" VARCHAR(32) NOT NULL,
    "mode" VARCHAR(16) NOT NULL DEFAULT 'use',
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "inputMessageId" VARCHAR(255),
    "outputMessageId" VARCHAR(255),
    "model" VARCHAR(128),
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_usage" (
    "id" TEXT NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "userMessageId" VARCHAR(255),
    "assistantMessageId" VARCHAR(255),
    "mode" VARCHAR(16) NOT NULL,
    "model" VARCHAR(128),
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_accounts" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "creditBalance" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_prices" (
    "id" TEXT NOT NULL,
    "meterType" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(64),
    "model" VARCHAR(128),
    "unit" VARCHAR(64) NOT NULL,
    "inputCredits" DECIMAL(18,0),
    "outputCredits" DECIMAL(18,0),
    "unitCredits" DECIMAL(18,0),
    "inputCostUsd" DECIMAL(18,8),
    "outputCostUsd" DECIMAL(18,8),
    "unitCostUsd" DECIMAL(18,8),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entries" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "projectId" TEXT,
    "sourceType" VARCHAR(64) NOT NULL,
    "sourceId" VARCHAR(128) NOT NULL,
    "meterType" VARCHAR(64) NOT NULL,
    "credits" DECIMAL(18,0) NOT NULL,
    "costUsd" DECIMAL(18,8),
    "description" VARCHAR(255) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "subjectType" VARCHAR(32) NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "scope" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "encryptedToken" TEXT,
    "tokenLast4" VARCHAR(8) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_devDomain_key" ON "projects"("devDomain");

-- CreateIndex
CREATE INDEX "projects_domain_idx" ON "projects"("domain");

-- CreateIndex
CREATE INDEX "projects_devDomain_idx" ON "projects"("devDomain");

-- CreateIndex
CREATE INDEX "projects_userId_deletedAt_createdAt_idx" ON "projects"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "project_members_userId_role_idx" ON "project_members"("userId", "role");

-- CreateIndex
CREATE INDEX "project_members_projectId_role_idx" ON "project_members"("projectId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_templates_slug_key" ON "app_templates"("slug");

-- CreateIndex
CREATE INDEX "app_templates_status_sortOrder_idx" ON "app_templates"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "app_template_translations_locale_idx" ON "app_template_translations"("locale");

-- CreateIndex
CREATE UNIQUE INDEX "app_template_translations_templateId_locale_key" ON "app_template_translations"("templateId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_projectId_key" ON "oauth_clients"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

-- CreateIndex
CREATE INDEX "oauth_clients_projectId_revokedAt_idx" ON "oauth_clients"("projectId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_authorization_codes_codeHash_key" ON "oauth_authorization_codes"("codeHash");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_clientId_expiresAt_idx" ON "oauth_authorization_codes"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "oauth_authorization_codes_userId_createdAt_idx" ON "oauth_authorization_codes"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_tokens_tokenHash_key" ON "oauth_access_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_clientId_expiresAt_idx" ON "oauth_access_tokens"("clientId", "expiresAt");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_userId_createdAt_idx" ON "oauth_access_tokens"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "project_agent_chat_messages_userId_projectId_createdAt_idx" ON "project_agent_chat_messages"("userId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "user_agent_chat_messages_userId_createdAt_idx" ON "user_agent_chat_messages"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_requestId_key" ON "agent_runs"("requestId");

-- CreateIndex
CREATE INDEX "agent_runs_userId_scope_projectId_status_createdAt_idx" ON "agent_runs"("userId", "scope", "projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_runs_status_createdAt_idx" ON "agent_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_run_events_runId_seq_idx" ON "agent_run_events"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_events_runId_seq_key" ON "agent_run_events"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "agent_usage_requestId_key" ON "agent_usage"("requestId");

-- CreateIndex
CREATE INDEX "agent_usage_userId_projectId_createdAt_idx" ON "agent_usage"("userId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_usage_assistantMessageId_idx" ON "agent_usage"("assistantMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_accounts_ownerUserId_key" ON "billing_accounts"("ownerUserId");

-- CreateIndex
CREATE INDEX "usage_prices_meterType_provider_model_effectiveTo_idx" ON "usage_prices"("meterType", "provider", "model", "effectiveTo");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_accountId_createdAt_idx" ON "credit_ledger_entries"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_actorUserId_createdAt_idx" ON "credit_ledger_entries"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_projectId_createdAt_idx" ON "credit_ledger_entries"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_entries_sourceType_sourceId_meterType_key" ON "credit_ledger_entries"("sourceType", "sourceId", "meterType");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_subjectType_scope_revokedAt_idx" ON "auth_tokens"("subjectType", "scope", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_scope_revokedAt_createdAt_idx" ON "auth_tokens"("userId", "scope", "revokedAt", "createdAt");

-- CreateIndex
CREATE INDEX "auth_tokens_projectId_scope_revokedAt_idx" ON "auth_tokens"("projectId", "scope", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_tokens_projectId_userId_scope_revokedAt_idx" ON "auth_tokens"("projectId", "userId", "scope", "revokedAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_template_translations" ADD CONSTRAINT "app_template_translations_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "app_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_agent_chat_messages" ADD CONSTRAINT "project_agent_chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_agent_chat_messages" ADD CONSTRAINT "project_agent_chat_messages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_agent_chat_messages" ADD CONSTRAINT "user_agent_chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "billing_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Platform extensions and Hub
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "projects" ADD COLUMN "templateImage" VARCHAR(255);

CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "scope" VARCHAR(32) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageBucket" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(1024) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "thumbnailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uploaded_file_chunks" (
    "id" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "embeddingModel" VARCHAR(128),
    "embeddingDimensions" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_file_chunks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uploaded_file_extractions" (
    "id" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "format" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "provider" VARCHAR(64),
    "model" VARCHAR(128),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_file_extractions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_agent_chat_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_agent_chat_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_agent_chat_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_agent_chat_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_topics" (
  "id" TEXT NOT NULL,
  "slug" VARCHAR(160),
  "title" VARCHAR(160) NOT NULL,
  "intent" TEXT NOT NULL,
  "description" TEXT,
  "category" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'analyzing',
  "appUrl" VARCHAR(1024),
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "hub_topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_artifacts" (
  "id" TEXT NOT NULL,
  "slug" VARCHAR(160),
  "topicId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "uploadedFileId" TEXT,
  "type" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'analyzing',
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "textContent" TEXT,
  "externalUrl" VARCHAR(1024),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "hub_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_artifact_translations" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "locale" VARCHAR(8) NOT NULL,
  "title" VARCHAR(160) NOT NULL,

  CONSTRAINT "hub_artifact_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_topic_translations" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "locale" VARCHAR(8) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "intent" TEXT NOT NULL,
  "description" TEXT,

  CONSTRAINT "hub_topic_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_comments" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "artifactId" TEXT,
  "parentId" TEXT,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "hub_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_comment_translations" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "locale" VARCHAR(8) NOT NULL,
  "body" TEXT NOT NULL,

  CONSTRAINT "hub_comment_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_comment_upvotes" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "hub_comment_upvotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_comment_downvotes" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "hub_comment_downvotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_tags" (
  "id" TEXT NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "slug" VARCHAR(64) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "hub_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_tag_translations" (
  "id" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "locale" VARCHAR(8) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "hint" TEXT,

  CONSTRAINT "hub_tag_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_topic_tags" (
  "topicId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,

  CONSTRAINT "hub_topic_tags_pkey" PRIMARY KEY ("topicId", "tagId")
);

CREATE TABLE "hub_artifact_tags" (
  "id" TEXT NOT NULL,
  "slug" VARCHAR(64) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "hub_artifact_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_artifact_tag_translations" (
  "id" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "locale" VARCHAR(8) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "hint" TEXT,

  CONSTRAINT "hub_artifact_tag_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_artifact_tag_assignments" (
  "artifactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,

  CONSTRAINT "hub_artifact_tag_assignments_pkey" PRIMARY KEY ("artifactId", "tagId")
);

CREATE TABLE "hub_upvotes" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "hub_upvotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hub_downvotes" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "hub_downvotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "uploaded_files_userId_scope_createdAt_idx" ON "uploaded_files"("userId", "scope", "createdAt");
CREATE INDEX "uploaded_files_projectId_createdAt_idx" ON "uploaded_files"("projectId", "createdAt");
CREATE INDEX "uploaded_files_status_createdAt_idx" ON "uploaded_files"("status", "createdAt");
CREATE INDEX "uploaded_files_thumbnailId_idx" ON "uploaded_files"("thumbnailId");
CREATE INDEX "uploaded_files_userId_deletedAt_createdAt_idx" ON "uploaded_files"("userId", "deletedAt", "createdAt");
CREATE UNIQUE INDEX "uploaded_file_chunks_uploadedFileId_chunkIndex_key" ON "uploaded_file_chunks"("uploadedFileId", "chunkIndex");
CREATE INDEX "uploaded_file_chunks_userId_projectId_createdAt_idx" ON "uploaded_file_chunks"("userId", "projectId", "createdAt");
CREATE UNIQUE INDEX "uploaded_file_extractions_uploadedFileId_format_key" ON "uploaded_file_extractions"("uploadedFileId", "format");
CREATE INDEX "uploaded_file_extractions_uploadedFileId_createdAt_idx" ON "uploaded_file_extractions"("uploadedFileId", "createdAt");

CREATE UNIQUE INDEX "user_agent_chat_message_attachments_messageId_uploadedFileI_key" ON "user_agent_chat_message_attachments"("messageId", "uploadedFileId");
CREATE INDEX "user_agent_chat_message_attachments_userId_createdAt_idx" ON "user_agent_chat_message_attachments"("userId", "createdAt");
CREATE INDEX "user_agent_chat_message_attachments_uploadedFileId_idx" ON "user_agent_chat_message_attachments"("uploadedFileId");

CREATE UNIQUE INDEX "project_agent_chat_message_attachments_messageId_uploadedFi_key" ON "project_agent_chat_message_attachments"("messageId", "uploadedFileId");
CREATE INDEX "project_agent_chat_message_attachments_userId_projectId_cre_idx" ON "project_agent_chat_message_attachments"("userId", "projectId", "createdAt");
CREATE INDEX "project_agent_chat_message_attachments_uploadedFileId_idx" ON "project_agent_chat_message_attachments"("uploadedFileId");

CREATE INDEX "hub_topics_category_createdAt_idx" ON "hub_topics"("category", "createdAt");
CREATE INDEX "hub_topics_status_createdAt_idx" ON "hub_topics"("status", "createdAt");
CREATE INDEX "hub_topics_authorId_createdAt_idx" ON "hub_topics"("authorId", "createdAt");
CREATE UNIQUE INDEX "hub_topics_slug_key" ON "hub_topics"("slug");

CREATE INDEX "hub_artifacts_topicId_createdAt_idx" ON "hub_artifacts"("topicId", "createdAt");
CREATE INDEX "hub_artifacts_authorId_createdAt_idx" ON "hub_artifacts"("authorId", "createdAt");
CREATE INDEX "hub_artifacts_uploadedFileId_idx" ON "hub_artifacts"("uploadedFileId");
CREATE UNIQUE INDEX "hub_artifacts_slug_key" ON "hub_artifacts"("slug");

CREATE UNIQUE INDEX "hub_artifact_translations_artifactId_locale_key" ON "hub_artifact_translations"("artifactId", "locale");
CREATE INDEX "hub_artifact_translations_locale_idx" ON "hub_artifact_translations"("locale");

CREATE UNIQUE INDEX "hub_topic_translations_topicId_locale_key" ON "hub_topic_translations"("topicId", "locale");
CREATE INDEX "hub_topic_translations_locale_idx" ON "hub_topic_translations"("locale");

CREATE INDEX "hub_comments_topicId_createdAt_idx" ON "hub_comments"("topicId", "createdAt");
CREATE INDEX "hub_comments_artifactId_createdAt_idx" ON "hub_comments"("artifactId", "createdAt");
CREATE INDEX "hub_comments_parentId_createdAt_idx" ON "hub_comments"("parentId", "createdAt");
CREATE INDEX "hub_comments_authorId_createdAt_idx" ON "hub_comments"("authorId", "createdAt");

CREATE UNIQUE INDEX "hub_comment_translations_commentId_locale_key" ON "hub_comment_translations"("commentId", "locale");
CREATE INDEX "hub_comment_translations_locale_idx" ON "hub_comment_translations"("locale");

CREATE UNIQUE INDEX "hub_comment_upvotes_commentId_userId_key" ON "hub_comment_upvotes"("commentId", "userId");
CREATE INDEX "hub_comment_upvotes_userId_createdAt_idx" ON "hub_comment_upvotes"("userId", "createdAt");

CREATE UNIQUE INDEX "hub_comment_downvotes_commentId_userId_key" ON "hub_comment_downvotes"("commentId", "userId");
CREATE INDEX "hub_comment_downvotes_userId_createdAt_idx" ON "hub_comment_downvotes"("userId", "createdAt");

CREATE UNIQUE INDEX "hub_tags_category_slug_key" ON "hub_tags"("category", "slug");
CREATE INDEX "hub_tags_category_sortOrder_idx" ON "hub_tags"("category", "sortOrder");

CREATE UNIQUE INDEX "hub_tag_translations_tagId_locale_key" ON "hub_tag_translations"("tagId", "locale");
CREATE INDEX "hub_tag_translations_locale_idx" ON "hub_tag_translations"("locale");

CREATE INDEX "hub_topic_tags_tagId_idx" ON "hub_topic_tags"("tagId");

CREATE UNIQUE INDEX "hub_artifact_tags_slug_key" ON "hub_artifact_tags"("slug");
CREATE INDEX "hub_artifact_tags_sortOrder_idx" ON "hub_artifact_tags"("sortOrder");

CREATE UNIQUE INDEX "hub_artifact_tag_translations_tagId_locale_key" ON "hub_artifact_tag_translations"("tagId", "locale");
CREATE INDEX "hub_artifact_tag_translations_locale_idx" ON "hub_artifact_tag_translations"("locale");

CREATE INDEX "hub_artifact_tag_assignments_tagId_idx" ON "hub_artifact_tag_assignments"("tagId");

CREATE UNIQUE INDEX "hub_upvotes_topicId_userId_key" ON "hub_upvotes"("topicId", "userId");
CREATE INDEX "hub_upvotes_userId_createdAt_idx" ON "hub_upvotes"("userId", "createdAt");

CREATE UNIQUE INDEX "hub_downvotes_topicId_userId_key" ON "hub_downvotes"("topicId", "userId");
CREATE INDEX "hub_downvotes_userId_createdAt_idx" ON "hub_downvotes"("userId", "createdAt");

ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_thumbnailId_fkey" FOREIGN KEY ("thumbnailId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "uploaded_file_chunks" ADD CONSTRAINT "uploaded_file_chunks_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "uploaded_file_extractions" ADD CONSTRAINT "uploaded_file_extractions_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_agent_chat_message_attachments" ADD CONSTRAINT "user_agent_chat_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "user_agent_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_agent_chat_message_attachments" ADD CONSTRAINT "user_agent_chat_message_attachments_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_agent_chat_message_attachments" ADD CONSTRAINT "user_agent_chat_message_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "project_agent_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_topics"
  ADD CONSTRAINT "hub_topics_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_artifacts"
  ADD CONSTRAINT "hub_artifacts_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "hub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_artifacts"
  ADD CONSTRAINT "hub_artifacts_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_artifacts"
  ADD CONSTRAINT "hub_artifacts_uploadedFileId_fkey"
  FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "hub_artifact_translations"
  ADD CONSTRAINT "hub_artifact_translations_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "hub_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_topic_translations"
  ADD CONSTRAINT "hub_topic_translations_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "hub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comments"
  ADD CONSTRAINT "hub_comments_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "hub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comments"
  ADD CONSTRAINT "hub_comments_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "hub_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comments"
  ADD CONSTRAINT "hub_comments_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "hub_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comments"
  ADD CONSTRAINT "hub_comments_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comment_translations"
  ADD CONSTRAINT "hub_comment_translations_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "hub_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comment_upvotes"
  ADD CONSTRAINT "hub_comment_upvotes_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "hub_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comment_upvotes"
  ADD CONSTRAINT "hub_comment_upvotes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comment_downvotes"
  ADD CONSTRAINT "hub_comment_downvotes_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "hub_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_comment_downvotes"
  ADD CONSTRAINT "hub_comment_downvotes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_topic_tags"
  ADD CONSTRAINT "hub_topic_tags_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "hub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_tag_translations"
  ADD CONSTRAINT "hub_tag_translations_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "hub_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_topic_tags"
  ADD CONSTRAINT "hub_topic_tags_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "hub_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_artifact_tag_translations"
  ADD CONSTRAINT "hub_artifact_tag_translations_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "hub_artifact_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_artifact_tag_assignments"
  ADD CONSTRAINT "hub_artifact_tag_assignments_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "hub_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_artifact_tag_assignments"
  ADD CONSTRAINT "hub_artifact_tag_assignments_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "hub_artifact_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_upvotes"
  ADD CONSTRAINT "hub_upvotes_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "hub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_upvotes"
  ADD CONSTRAINT "hub_upvotes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_downvotes"
  ADD CONSTRAINT "hub_downvotes_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "hub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hub_downvotes"
  ADD CONSTRAINT "hub_downvotes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
