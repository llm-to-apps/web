CREATE TABLE "user_agent_chat_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_agent_chat_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_agent_chat_message_attachments_messageId_uploadedFileId_key" ON "user_agent_chat_message_attachments"("messageId", "uploadedFileId");
CREATE INDEX "user_agent_chat_message_attachments_userId_createdAt_idx" ON "user_agent_chat_message_attachments"("userId", "createdAt");
CREATE INDEX "user_agent_chat_message_attachments_uploadedFileId_idx" ON "user_agent_chat_message_attachments"("uploadedFileId");

ALTER TABLE "user_agent_chat_message_attachments" ADD CONSTRAINT "user_agent_chat_message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "user_agent_chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_agent_chat_message_attachments" ADD CONSTRAINT "user_agent_chat_message_attachments_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_agent_chat_message_attachments" ADD CONSTRAINT "user_agent_chat_message_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
