ALTER TABLE "hub_topics"
  ADD COLUMN "visibility" VARCHAR(32) NOT NULL DEFAULT 'public';

CREATE INDEX "hub_topics_visibility_createdAt_idx" ON "hub_topics"("visibility", "createdAt");
