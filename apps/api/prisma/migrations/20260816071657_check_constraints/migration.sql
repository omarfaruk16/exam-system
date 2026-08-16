-- CHECK constraints (Prisma cannot model these). Defence-in-depth alongside DTO validation.
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_number_range" CHECK ("number" BETWEEN 1 AND 12);
ALTER TABLE "Course" ADD CONSTRAINT "Course_credit_nonneg" CHECK ("credit" >= 0);
ALTER TABLE "CoursePart" ADD CONSTRAINT "CoursePart_marksWeight_nonneg" CHECK ("marksWeight" >= 0);
ALTER TABLE "Question" ADD CONSTRAINT "Question_marks_nonneg" CHECK ("marks" >= 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_duration_positive" CHECK ("durationMinutes" > 0);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_totalMarks_nonneg" CHECK ("totalMarks" >= 0);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_year_range" CHECK ("year" BETWEEN 1950 AND 2100);
