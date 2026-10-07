-- Brings a database built from the `init` migration in line with schema.prisma.
--
-- The schema had moved ahead of the migrations: `MCQ` was missing from the
-- QuestionType enum, the two solution columns were TEXT instead of JSONB (so
-- storing per-language solutions failed), and the composite indexes were never
-- created. Databases created with `prisma db push` already match the schema, so
-- every statement here is written to be a no-op when there is nothing to fix.

ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'MCQ';

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Question' AND column_name = 'optimalSolution') = 'text' THEN
    -- Existing text is kept, wrapped as a JSON string.
    ALTER TABLE "Question" ALTER COLUMN "optimalSolution" TYPE JSONB USING to_jsonb("optimalSolution");
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Question' AND column_name = 'bruteForceSolution') = 'text' THEN
    ALTER TABLE "Question" ALTER COLUMN "bruteForceSolution" TYPE JSONB USING to_jsonb("bruteForceSolution");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_action_idx" ON "AuditLog"("organizationId", "action");
CREATE INDEX IF NOT EXISTS "Question_organizationId_status_idx" ON "Question"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Question_organizationId_type_difficulty_idx" ON "Question"("organizationId", "type", "difficulty");
CREATE INDEX IF NOT EXISTS "Question_organizationId_createdAt_idx" ON "Question"("organizationId", "createdAt");
