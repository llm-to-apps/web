ALTER TABLE "uploaded_files" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "uploaded_files_userId_deletedAt_createdAt_idx" ON "uploaded_files"("userId", "deletedAt", "createdAt");
