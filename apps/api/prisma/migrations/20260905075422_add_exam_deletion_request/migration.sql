-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "ExamDeletionRequest" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "examId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "rejectionNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExamDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamDeletionRequest_publicId_key" ON "ExamDeletionRequest"("publicId");

-- CreateIndex
CREATE INDEX "ExamDeletionRequest_examId_idx" ON "ExamDeletionRequest"("examId");

-- CreateIndex
CREATE INDEX "ExamDeletionRequest_status_idx" ON "ExamDeletionRequest"("status");

-- CreateIndex
CREATE INDEX "ExamDeletionRequest_requestedById_idx" ON "ExamDeletionRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "ExamDeletionRequest" ADD CONSTRAINT "ExamDeletionRequest_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDeletionRequest" ADD CONSTRAINT "ExamDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamDeletionRequest" ADD CONSTRAINT "ExamDeletionRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
