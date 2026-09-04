-- Move Semester ownership from Program to Batch.
-- Hierarchy is now: Department → Programme → Batch → Semester → Course.
-- A required `batchId` cannot be back-filled for pre-existing semesters (there is no
-- program→batch mapping), so this migration applies cleanly only when the Semester table
-- is empty. On a populated database, clear the academic content first (prisma migrate reset
-- in dev; a scoped wipe in prod) — the structure is meant to be rebuilt per batch.

-- DropForeignKey
ALTER TABLE "Semester" DROP CONSTRAINT "Semester_programId_fkey";

-- DropIndex
DROP INDEX "Semester_programId_idx";

-- DropIndex
DROP INDEX "Semester_programId_number_key";

-- AlterTable
ALTER TABLE "Semester" DROP COLUMN "programId",
ADD COLUMN     "batchId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "Semester_batchId_idx" ON "Semester"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_batchId_number_key" ON "Semester"("batchId", "number");

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
