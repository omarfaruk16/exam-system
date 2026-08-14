/**
 * Seeds a written exam that has already ENDED, with student 2021001's attempt submitted, the MCQ
 * auto-graded, and one written answer pending — so the grading→auto-publish→reports flow can be
 * driven entirely over HTTP. Prints EXAM_ID and STUDENT_PUBLIC_ID.
 */
process.loadEnvFile('.env');
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const partA = await prisma.offeringPart.findFirstOrThrow({
    where: { offering: { course: { code: 'CSE-1101' } }, coursePart: { name: 'Part A' } },
    select: { id: true, assignedTeacherId: true },
  });
  const student = await prisma.student.findFirstOrThrow({
    where: { studentId: '2021001' },
    select: { id: true, publicId: true },
  });

  const bank = await prisma.questionBank.create({
    data: {
      offeringPartId: partA.id,
      name: `Grading Demo Bank ${Date.now()}`,
      createdByTeacherId: partA.assignedTeacherId,
    },
  });
  const mcq = await prisma.question.create({
    data: { bankId: bank.id, type: 'mcq', text: 'Capital of Bangladesh?', marks: 3 },
  });
  const optA = await prisma.questionOption.create({
    data: { questionId: mcq.id, text: 'Dhaka', isCorrect: true, order: 0 },
  });
  await prisma.questionOption.create({
    data: { questionId: mcq.id, text: 'Delhi', isCorrect: false, order: 1 },
  });
  const written = await prisma.question.create({
    data: {
      bankId: bank.id,
      type: 'written',
      text: 'Explain what an operating system does.',
      marks: 5,
      modelAnswer: 'Manages hardware and software resources.',
    },
  });

  const exam = await prisma.exam.create({
    data: {
      offeringPartId: partA.id,
      createdByTeacherId: partA.assignedTeacherId!,
      title: `Grading Demo ${Date.now()}`,
      startAt: new Date(Date.now() - 2 * 3600 * 1000),
      endAt: new Date(Date.now() - 1000), // already ended
      durationMinutes: 60,
      status: 'ended',
      totalMarks: 8,
      publishedAt: new Date(),
      settings: {
        showMarksAfterSubmit: true,
        showExplanation: true,
        shuffleQuestions: false,
        shuffleOptions: false,
        negativeMarking: false,
        negativeMarkValue: 0,
      },
    },
    select: { id: true, publicId: true },
  });
  await prisma.examQuestion.create({
    data: {
      examId: exam.id,
      questionId: mcq.id,
      order: 1,
      snapshotAt: new Date(),
      snapshotType: 'mcq',
      snapshotText: mcq.text,
      snapshotMarks: 3,
      snapshotOptions: [{ id: optA.publicId, text: 'Dhaka', order: 0 }],
      snapshotCorrectOptionId: optA.publicId,
    },
  });
  await prisma.examQuestion.create({
    data: {
      examId: exam.id,
      questionId: written.id,
      order: 2,
      snapshotAt: new Date(),
      snapshotType: 'written',
      snapshotText: written.text,
      snapshotMarks: 5,
      snapshotModelAnswer: written.modelAnswer,
    },
  });

  const attempt = await prisma.examAttempt.create({
    data: {
      examId: exam.id,
      studentId: student.id,
      status: 'submitted',
      gradingStatus: 'awaiting_manual',
      submittedAt: new Date(),
      totalScore: 3,
    },
    select: { id: true },
  });
  // MCQ: already auto-graded (correct = 3). Written: pending.
  await prisma.answer.create({
    data: {
      attemptId: attempt.id,
      questionId: mcq.id,
      selectedOptionId: optA.publicId,
      autoScore: 3,
      isGraded: true,
    },
  });
  await prisma.answer.create({
    data: {
      attemptId: attempt.id,
      questionId: written.id,
      writtenText: 'An OS manages CPU, memory, and I/O and provides services to programs.',
      isGraded: false,
    },
  });

  console.log(`EXAM_ID=${exam.publicId}`);

  console.log(`STUDENT_PUBLIC_ID=${student.publicId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
