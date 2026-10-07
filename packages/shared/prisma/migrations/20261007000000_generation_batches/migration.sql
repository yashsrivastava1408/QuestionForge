-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('GENERATE', 'COMPLETE_IMPORT', 'REVALIDATE');

-- CreateEnum
CREATE TYPE "GenerationItemStatus" AS ENUM ('QUEUED', 'GENERATING', 'VALIDATING', 'VALIDATED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'QUESTION_REVALIDATED';
ALTER TYPE "ActionType" ADD VALUE 'USER_CREATED';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "validationAssets" JSONB;

-- AlterTable
ALTER TABLE "ExportRecord" ADD COLUMN     "storageKey" TEXT;

-- CreateTable
CREATE TABLE "GenerationBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" "GenerationKind" NOT NULL DEFAULT 'GENERATE',
    "config" JSONB NOT NULL,
    "paperId" TEXT,
    "total" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "topic" TEXT,
    "status" "GenerationItemStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "questionId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenerationBatch_organizationId_createdAt_idx" ON "GenerationBatch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationItem_questionId_idx" ON "GenerationItem"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationItem_batchId_index_key" ON "GenerationItem"("batchId", "index");

-- AddForeignKey
ALTER TABLE "GenerationBatch" ADD CONSTRAINT "GenerationBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationItem" ADD CONSTRAINT "GenerationItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GenerationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

