/**
 * Seeds a LIVE exam (4 MCQ + 1 written) on CSE Part A so the exam-taking screen can be demoed as
 * student 2021001. Any prior attempt by 2021001 on this fresh exam does not exist (new exam each run).
 * Prints EXAM_ID.
 */
process.loadEnvFile('.env');
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MCQS = [
  {
    text: 'Which data structure uses LIFO (last-in, first-out) ordering?',
    opts: ['Queue', 'Stack', 'Linked list', 'Hash map'],
    correct: 1,
    marks: 2,
  },
  {
    text: 'What is the time complexity of binary search on a sorted array of n elements?',
    opts: ['O(n)', 'O(n log n)', 'O(log n)', 'O(1)'],
    correct: 2,
    marks: 2,
  },
  {
    text: 'In C, which operator is used to access a member through a pointer to a struct?',
    opts: ['.', '->', '::', '&'],
    correct: 1,
    marks: 1,
  },
  {
    text: 'Which of these is NOT a primitive type in C?',
    opts: ['int', 'char', 'float', 'string'],
    correct: 3,
    marks: 1,
  },
];

async function main(): Promise<void> {
  const partA = await prisma.offeringPart.findFirstOrThrow({
    where: { offering: { course: { code: 'CSE-1101' } }, coursePart: { name: 'Part A' } },
    select: { id: true, assignedTeacherId: true },
  });

  const bank = await prisma.questionBank.create({
    data: {
      offeringPartId: partA.id,
      name: `Live Demo Bank ${Date.now()}`,
      createdByTeacherId: partA.assignedTeacherId,
    },
  });

  const now = Date.now();
  const exam = await prisma.exam.create({
    data: {
      offeringPartId: partA.id,
      createdByTeacherId: partA.assignedTeacherId!,
      title: 'CSE-1101 Data Structures — Class Test 2',
      instructions:
        'Answer all questions. MCQs are auto-graded; the written question is marked by your teacher.',
      startAt: new Date(now - 3 * 60_000),
      endAt: new Date(now + 40 * 60_000),
      durationMinutes: 45,
      status: 'live',
      totalMarks: 11,
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

  let order = 1;
  for (const q of MCQS) {
    const question = await prisma.question.create({
      data: { bankId: bank.id, type: 'mcq', text: q.text, marks: q.marks },
    });
    const options = [];
    for (let i = 0; i < q.opts.length; i++) {
      options.push(
        await prisma.questionOption.create({
          data: { questionId: question.id, text: q.opts[i]!, isCorrect: i === q.correct, order: i },
        }),
      );
    }
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        questionId: question.id,
        order: order++,
        snapshotAt: new Date(),
        snapshotType: 'mcq',
        snapshotText: q.text,
        snapshotMarks: q.marks,
        snapshotOptions: options.map((o, i) => ({ id: o.publicId, text: q.opts[i]!, order: i })),
        snapshotCorrectOptionId: options[q.correct]!.publicId,
      },
    });
  }

  const written = await prisma.question.create({
    data: {
      bankId: bank.id,
      type: 'written',
      text: 'Explain, with an example, the difference between a stack and a queue and give one real-world use of each.',
      marks: 5,
      modelAnswer: 'Stack = LIFO (e.g. undo history); Queue = FIFO (e.g. print jobs).',
    },
  });
  await prisma.examQuestion.create({
    data: {
      examId: exam.id,
      questionId: written.id,
      order: order++,
      snapshotAt: new Date(),
      snapshotType: 'written',
      snapshotText: written.text,
      snapshotMarks: 5,
      snapshotModelAnswer: written.modelAnswer,
    },
  });

  console.log(`EXAM_ID=${exam.publicId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
