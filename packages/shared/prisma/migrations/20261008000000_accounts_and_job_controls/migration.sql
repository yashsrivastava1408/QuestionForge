-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'USER_UPDATED';
ALTER TYPE "ActionType" ADD VALUE 'PASSWORD_CHANGED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "GenerationBatch" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GenerationItem" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

