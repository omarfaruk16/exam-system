-- AlterTable
ALTER TABLE "CoursePartResult" ADD COLUMN     "sentMetric" TEXT;

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "proctorViolations" INTEGER NOT NULL DEFAULT 0;
