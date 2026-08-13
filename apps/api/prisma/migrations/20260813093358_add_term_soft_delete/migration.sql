-- AlterTable
ALTER TABLE "AcademicTerm" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AcademicTerm_deletedAt_idx" ON "AcademicTerm"("deletedAt");
