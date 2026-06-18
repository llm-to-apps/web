CREATE EXTENSION IF NOT EXISTS vector;

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

CREATE INDEX "uploaded_files_userId_scope_createdAt_idx" ON "uploaded_files"("userId", "scope", "createdAt");
CREATE INDEX "uploaded_files_projectId_createdAt_idx" ON "uploaded_files"("projectId", "createdAt");
CREATE INDEX "uploaded_files_status_createdAt_idx" ON "uploaded_files"("status", "createdAt");
CREATE UNIQUE INDEX "uploaded_file_chunks_uploadedFileId_chunkIndex_key" ON "uploaded_file_chunks"("uploadedFileId", "chunkIndex");
CREATE INDEX "uploaded_file_chunks_userId_projectId_createdAt_idx" ON "uploaded_file_chunks"("userId", "projectId", "createdAt");

ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uploaded_file_chunks" ADD CONSTRAINT "uploaded_file_chunks_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
