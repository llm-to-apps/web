CREATE TABLE "project_agent_chat_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_agent_chat_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_agent_chat_message_attachments_messageId_uploadedFileId_key" ON "project_agent_chat_message_attachments"("messageId", "uploadedFileId");
CREATE INDEX "project_agent_chat_message_attachments_userId_projectId_createdAt_idx" ON "project_agent_chat_message_attachments"("userId", "projectId", "createdAt");
CREATE INDEX "project_agent_chat_message_attachments_uploadedFileId_idx" ON "project_agent_chat_message_attachments"("uploadedFileId");

ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "project_agent_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_agent_chat_message_attachments" ADD CONSTRAINT "project_agent_chat_message_attachments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
