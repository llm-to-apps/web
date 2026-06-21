-- CreateTable
CREATE TABLE "project_integration_grants" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "integrationId" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenType" VARCHAR(32) NOT NULL DEFAULT 'Bearer',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_integration_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_integration_grants_projectId_userId_integrationId_key" ON "project_integration_grants"("projectId", "userId", "integrationId");

-- CreateIndex
CREATE INDEX "project_integration_grants_projectId_integrationId_provider_idx" ON "project_integration_grants"("projectId", "integrationId", "provider");

-- CreateIndex
CREATE INDEX "project_integration_grants_userId_provider_idx" ON "project_integration_grants"("userId", "provider");

-- AddForeignKey
ALTER TABLE "project_integration_grants" ADD CONSTRAINT "project_integration_grants_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_integration_grants" ADD CONSTRAINT "project_integration_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
