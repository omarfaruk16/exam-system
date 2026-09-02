-- CreateTable
CREATE TABLE "CoursePartResult" (
    "id" SERIAL NOT NULL,
    "publicId" TEXT NOT NULL,
    "coursePartId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "examsCounted" INTEGER NOT NULL DEFAULT 0,
    "examsTotal" INTEGER NOT NULL DEFAULT 0,
    "averageAll" DOUBLE PRECISION,
    "bestOne" DOUBLE PRECISION,
    "bestTwoAverage" DOUBLE PRECISION,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByTeacherId" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePartResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoursePartResult_publicId_key" ON "CoursePartResult"("publicId");

-- CreateIndex
CREATE INDEX "CoursePartResult_coursePartId_idx" ON "CoursePartResult"("coursePartId");

-- CreateIndex
CREATE INDEX "CoursePartResult_studentId_idx" ON "CoursePartResult"("studentId");

-- CreateIndex
CREATE INDEX "CoursePartResult_finalizedAt_idx" ON "CoursePartResult"("finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePartResult_coursePartId_studentId_key" ON "CoursePartResult"("coursePartId", "studentId");

-- CreateIndex
CREATE INDEX "ExamAttempt_studentId_idx" ON "ExamAttempt"("studentId");

-- CreateIndex
CREATE INDEX "Student_deletedAt_idx" ON "Student"("deletedAt");

-- AddForeignKey
ALTER TABLE "CoursePartResult" ADD CONSTRAINT "CoursePartResult_coursePartId_fkey" FOREIGN KEY ("coursePartId") REFERENCES "CoursePart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePartResult" ADD CONSTRAINT "CoursePartResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePartResult" ADD CONSTRAINT "CoursePartResult_finalizedByTeacherId_fkey" FOREIGN KEY ("finalizedByTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
