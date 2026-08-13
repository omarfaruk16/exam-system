-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('mcq', 'written');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('draft', 'in_review', 'approved', 'changes_requested', 'rejected', 'published', 'live', 'ended', 'grading', 'results_published', 'archived');

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "offeringPartId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdByTeacherId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "bankId" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT,
    "modelAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "offeringPartId" INTEGER NOT NULL,
    "createdByTeacherId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ExamStatus" NOT NULL DEFAULT 'draft',
    "settings" JSONB NOT NULL,
    "reviewNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestion" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "examId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "marksOverride" DOUBLE PRECISION,
    "snapshotAt" TIMESTAMP(3),
    "snapshotType" "QuestionType",
    "snapshotText" TEXT,
    "snapshotMarks" DOUBLE PRECISION,
    "snapshotExplanation" TEXT,
    "snapshotModelAnswer" TEXT,
    "snapshotOptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBank_publicId_key" ON "QuestionBank"("publicId");

-- CreateIndex
CREATE INDEX "QuestionBank_offeringPartId_idx" ON "QuestionBank"("offeringPartId");

-- CreateIndex
CREATE INDEX "QuestionBank_deletedAt_idx" ON "QuestionBank"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_publicId_key" ON "Question"("publicId");

-- CreateIndex
CREATE INDEX "Question_bankId_idx" ON "Question"("bankId");

-- CreateIndex
CREATE INDEX "Question_deletedAt_idx" ON "Question"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_publicId_key" ON "QuestionOption"("publicId");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_publicId_key" ON "Exam"("publicId");

-- CreateIndex
CREATE INDEX "Exam_offeringPartId_status_idx" ON "Exam"("offeringPartId", "status");

-- CreateIndex
CREATE INDEX "Exam_status_idx" ON "Exam"("status");

-- CreateIndex
CREATE INDEX "Exam_deletedAt_idx" ON "Exam"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestion_publicId_key" ON "ExamQuestion"("publicId");

-- CreateIndex
CREATE INDEX "ExamQuestion_examId_idx" ON "ExamQuestion"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestion_examId_questionId_key" ON "ExamQuestion"("examId", "questionId");

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_offeringPartId_fkey" FOREIGN KEY ("offeringPartId") REFERENCES "OfferingPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_createdByTeacherId_fkey" FOREIGN KEY ("createdByTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_offeringPartId_fkey" FOREIGN KEY ("offeringPartId") REFERENCES "OfferingPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdByTeacherId_fkey" FOREIGN KEY ("createdByTeacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (Phase 3 integrity guards; not modelled by Prisma)
ALTER TABLE "Question" ADD CONSTRAINT "Question_marks_check" CHECK ("marks" >= 0);
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_order_check" CHECK ("order" >= 0);
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_marks_check" CHECK ("marksOverride" IS NULL OR "marksOverride" >= 0);
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_order_check" CHECK ("order" >= 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_duration_check" CHECK ("durationMinutes" > 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_totalMarks_check" CHECK ("totalMarks" >= 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_window_check" CHECK ("endAt" > "startAt");
