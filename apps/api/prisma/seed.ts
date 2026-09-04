/**
 * Idempotent seed (safe to re-run). Builds a small but complete slice of the academic hierarchy:
 *   Faculty → Department → Program → Semester → Course → Course Part (with an assigned teacher),
 * plus batches assigned to a semester, students with registration/roll numbers, one user for
 * every role, and a sample question bank + draft exam.
 */
import { DegreeType, PrismaClient, type RoleName } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const HASH_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
const hash = (pw: string): Promise<string> => argon2.hash(pw, HASH_OPTS);

const STAFF_PW = 'Admin@12345';
const STUDENT_PW = 'Student@123';

const roleMap = new Map<RoleName, number>();

interface RoleAssignment {
  name: RoleName;
  scopeFacultyId?: number;
  scopeDepartmentId?: number;
}

async function upsertUser(input: {
  username: string;
  email: string;
  displayName: string;
  password: string;
  mustChange?: boolean;
}) {
  const passwordHash = await hash(input.password);
  return prisma.user.upsert({
    where: { username: input.username },
    update: { email: input.email, displayName: input.displayName },
    create: {
      username: input.username,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      mustChangePassword: input.mustChange ?? false,
    },
  });
}

async function setRoles(userId: number, roles: RoleAssignment[]): Promise<void> {
  await prisma.userRole.deleteMany({ where: { userId } });
  for (const r of roles) {
    await prisma.userRole.create({
      data: {
        userId,
        roleId: roleMap.get(r.name)!,
        scopeFacultyId: r.scopeFacultyId ?? null,
        scopeDepartmentId: r.scopeDepartmentId ?? null,
      },
    });
  }
}

/** Faculty has no unique business key, so find-or-create by name. */
async function ensureFaculty(name: string) {
  return (
    (await prisma.faculty.findFirst({ where: { name } })) ??
    (await prisma.faculty.create({ data: { name } }))
  );
}

async function main(): Promise<void> {
  // 1. Roles
  const roleNames: RoleName[] = ['super_admin', 'admin', 'department_head', 'teacher', 'student'];
  for (const name of roleNames) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    roleMap.set(name, role.id);
  }

  // 2. Faculties
  const sci = await ensureFaculty('Faculty of Science');
  const bus = await ensureFaculty('Faculty of Business Studies');

  // 3. Departments (unique per faculty by name)
  const cse = await prisma.department.upsert({
    where: { facultyId_name: { facultyId: sci.id, name: 'Computer Science & Engineering' } },
    update: {},
    create: { facultyId: sci.id, name: 'Computer Science & Engineering' },
  });
  const phy = await prisma.department.upsert({
    where: { facultyId_name: { facultyId: sci.id, name: 'Physics' } },
    update: {},
    create: { facultyId: sci.id, name: 'Physics' },
  });
  const mgt = await prisma.department.upsert({
    where: { facultyId_name: { facultyId: bus.id, name: 'Management' } },
    update: {},
    create: { facultyId: bus.id, name: 'Management' },
  });

  // 4. Programs
  const cseHons =
    (await prisma.program.findFirst({ where: { departmentId: cse.id, name: 'Honours' } })) ??
    (await prisma.program.create({
      data: {
        departmentId: cse.id,
        name: 'Honours',
        degreeType: DegreeType.bachelor,
        durationYears: 4,
      },
    }));
  const bba =
    (await prisma.program.findFirst({ where: { departmentId: mgt.id, name: 'BBA' } })) ??
    (await prisma.program.create({
      data: {
        departmentId: mgt.id,
        name: 'BBA',
        degreeType: DegreeType.bachelor,
        durationYears: 4,
      },
    }));

  // 5. Batches — semesters now belong to a batch, so the batch is created first.
  const cseBatch = await prisma.batch.upsert({
    where: { programId_name: { programId: cseHons.id, name: '2021 Batch' } },
    update: { year: 2021 },
    create: { programId: cseHons.id, name: '2021 Batch', year: 2021 },
  });
  const bbaBatch = await prisma.batch.upsert({
    where: { programId_name: { programId: bba.id, name: '2022 Batch' } },
    update: { year: 2022 },
    create: { programId: bba.id, name: '2022 Batch', year: 2022 },
  });

  // 6. Semesters — each belongs to a batch. The CSE 2021 batch currently sits in semester 1.
  const cseSem1 = await prisma.semester.upsert({
    where: { batchId_number: { batchId: cseBatch.id, number: 1 } },
    update: {},
    create: { batchId: cseBatch.id, number: 1 },
  });
  await prisma.semester.upsert({
    where: { batchId_number: { batchId: cseBatch.id, number: 2 } },
    update: {},
    create: { batchId: cseBatch.id, number: 2 },
  });
  await prisma.semester.upsert({
    where: { batchId_number: { batchId: bbaBatch.id, number: 1 } },
    update: {},
    create: { batchId: bbaBatch.id, number: 1 },
  });
  await prisma.batch.update({
    where: { id: cseBatch.id },
    data: { currentSemesterId: cseSem1.id },
  });

  // 7. Course
  const course = await prisma.course.upsert({
    where: { semesterId_code: { semesterId: cseSem1.id, code: 'CSE-1101' } },
    update: { name: 'Structured Programming', credit: 3 },
    create: { semesterId: cseSem1.id, code: 'CSE-1101', name: 'Structured Programming', credit: 3 },
  });

  // 8. Staff users
  const superAdmin = await upsertUser({
    username: 'superadmin',
    email: 'superadmin@ru.ac.bd',
    displayName: 'System Administrator',
    password: STAFF_PW,
  });
  await setRoles(superAdmin.id, [{ name: 'super_admin' }]);

  const admin = await upsertUser({
    username: 'admin',
    email: 'admin@ru.ac.bd',
    displayName: 'Exam Controller',
    password: STAFF_PW,
  });
  await setRoles(admin.id, [{ name: 'admin' }]);

  const t1 = await upsertUser({
    username: 'teacher1',
    email: 'kabir@ru.ac.bd',
    displayName: 'Dr. Kabir Ahmed',
    password: STAFF_PW,
  });
  const teacher1 = await prisma.teacher.upsert({
    where: { userId: t1.id },
    update: { departmentId: cse.id, designation: 'Associate Professor' },
    create: { userId: t1.id, departmentId: cse.id, designation: 'Associate Professor' },
  });
  await setRoles(t1.id, [{ name: 'teacher' }]);

  const t2 = await upsertUser({
    username: 'teacher2',
    email: 'nusrat@ru.ac.bd',
    displayName: 'Nusrat Jahan',
    password: STAFF_PW,
  });
  const teacher2 = await prisma.teacher.upsert({
    where: { userId: t2.id },
    update: { departmentId: cse.id, designation: 'Lecturer' },
    create: { userId: t2.id, departmentId: cse.id, designation: 'Lecturer' },
  });
  await setRoles(t2.id, [{ name: 'teacher' }]);

  const head = await upsertUser({
    username: 'cse.head',
    email: 'head.cse@ru.ac.bd',
    displayName: 'Prof. Rahima Khatun',
    password: STAFF_PW,
  });
  await prisma.teacher.upsert({
    where: { userId: head.id },
    update: { departmentId: cse.id, designation: 'Professor & Head' },
    create: { userId: head.id, departmentId: cse.id, designation: 'Professor & Head' },
  });
  await setRoles(head.id, [
    { name: 'department_head', scopeDepartmentId: cse.id },
    { name: 'teacher' },
  ]);

  // 9. Course parts, each with its assigned teacher.
  const partA = await prisma.coursePart.upsert({
    where: { courseId_name: { courseId: course.id, name: 'Part A' } },
    update: { marksWeight: 60, assignedTeacherId: teacher1.id },
    create: {
      courseId: course.id,
      name: 'Part A',
      marksWeight: 60,
      assignedTeacherId: teacher1.id,
    },
  });
  await prisma.coursePart.upsert({
    where: { courseId_name: { courseId: course.id, name: 'Part B' } },
    update: { marksWeight: 40, assignedTeacherId: teacher2.id },
    create: {
      courseId: course.id,
      name: 'Part B',
      marksWeight: 40,
      assignedTeacherId: teacher2.id,
    },
  });

  // 10. Physics subtree (second department under the same faculty) so cross-department scoping
  //     can be tested for real: cse.head must NOT reach these Physics entities.
  const phyProgram =
    (await prisma.program.findFirst({ where: { departmentId: phy.id, name: 'Honours' } })) ??
    (await prisma.program.create({
      data: {
        departmentId: phy.id,
        name: 'Honours',
        degreeType: DegreeType.bachelor,
        durationYears: 4,
      },
    }));
  const phyBatch = await prisma.batch.upsert({
    where: { programId_name: { programId: phyProgram.id, name: '2021 Batch' } },
    update: { year: 2021 },
    create: { programId: phyProgram.id, name: '2021 Batch', year: 2021 },
  });
  const phySem1 = await prisma.semester.upsert({
    where: { batchId_number: { batchId: phyBatch.id, number: 1 } },
    update: {},
    create: { batchId: phyBatch.id, number: 1 },
  });
  await prisma.batch.update({
    where: { id: phyBatch.id },
    data: { currentSemesterId: phySem1.id },
  });
  const phyCourse = await prisma.course.upsert({
    where: { semesterId_code: { semesterId: phySem1.id, code: 'PHY-1101' } },
    update: { name: 'Mechanics', credit: 3 },
    create: { semesterId: phySem1.id, code: 'PHY-1101', name: 'Mechanics', credit: 3 },
  });
  const phyTeacherUser = await upsertUser({
    username: 'phy.teacher',
    email: 'phy.teacher@ru.ac.bd',
    displayName: 'Dr. Imran Hossain',
    password: STAFF_PW,
  });
  const phyTeacher = await prisma.teacher.upsert({
    where: { userId: phyTeacherUser.id },
    update: { departmentId: phy.id, designation: 'Assistant Professor' },
    create: { userId: phyTeacherUser.id, departmentId: phy.id, designation: 'Assistant Professor' },
  });
  await setRoles(phyTeacherUser.id, [{ name: 'teacher' }]);
  await prisma.coursePart.upsert({
    where: { courseId_name: { courseId: phyCourse.id, name: 'Part A' } },
    update: { marksWeight: 100, assignedTeacherId: phyTeacher.id },
    create: {
      courseId: phyCourse.id,
      name: 'Part A',
      marksWeight: 100,
      assignedTeacherId: phyTeacher.id,
    },
  });

  // 11. Students in the CSE 2021 batch, with registration + roll numbers.
  const students = [
    {
      studentId: '2021001',
      reg: 'RU-2021-CSE-001',
      roll: '01',
      name: 'Ayesha Siddiqua',
      email: 'ayesha@student.ru.ac.bd',
    },
    {
      studentId: '2021002',
      reg: 'RU-2021-CSE-002',
      roll: '02',
      name: 'Tanvir Hasan',
      email: 'tanvir@student.ru.ac.bd',
    },
    {
      studentId: '2021003',
      reg: 'RU-2021-CSE-003',
      roll: '03',
      name: 'Mitu Rani Das',
      email: 'mitu@student.ru.ac.bd',
    },
  ];
  for (const s of students) {
    const u = await upsertUser({
      username: s.studentId,
      email: s.email,
      displayName: s.name,
      password: STUDENT_PW,
    });
    await prisma.student.upsert({
      where: { userId: u.id },
      update: {
        batchId: cseBatch.id,
        studentId: s.studentId,
        registrationNumber: s.reg,
        rollNumber: s.roll,
      },
      create: {
        userId: u.id,
        studentId: s.studentId,
        registrationNumber: s.reg,
        rollNumber: s.roll,
        batchId: cseBatch.id,
      },
    });
    await setRoles(u.id, [{ name: 'student' }]);
  }

  // 12. Sample question bank + a draft exam (MCQ + written) for CSE Part A, owned by teacher1.
  const bank =
    (await prisma.questionBank.findFirst({
      where: { coursePartId: partA.id, name: 'CSE-1101 Bank' },
    })) ??
    (await prisma.questionBank.create({
      data: { coursePartId: partA.id, name: 'CSE-1101 Bank', createdByTeacherId: teacher1.id },
    }));

  async function ensureMcq(
    text: string,
    marks: number,
    opts: { text: string; isCorrect: boolean }[],
    explanation?: string,
  ) {
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, text } });
    if (existing) return existing;
    const q = await prisma.question.create({
      data: { bankId: bank.id, type: 'mcq', text, marks, explanation: explanation ?? null },
    });
    await prisma.questionOption.createMany({
      data: opts.map((o, i) => ({
        questionId: q.id,
        text: o.text,
        isCorrect: o.isCorrect,
        order: i,
      })),
    });
    return q;
  }
  async function ensureWritten(text: string, marks: number, modelAnswer?: string) {
    const existing = await prisma.question.findFirst({ where: { bankId: bank.id, text } });
    if (existing) return existing;
    return prisma.question.create({
      data: { bankId: bank.id, type: 'written', text, marks, modelAnswer: modelAnswer ?? null },
    });
  }

  const q1 = await ensureMcq(
    'Which data type stores whole numbers in C?',
    2,
    [
      { text: 'int', isCorrect: true },
      { text: 'char', isCorrect: false },
      { text: 'float', isCorrect: false },
    ],
    'int stores integers; float stores decimals; char stores a single character.',
  );
  const q2 = await ensureMcq('Which symbol terminates a statement in C?', 1, [
    { text: 'Semicolon ;', isCorrect: true },
    { text: 'Colon :', isCorrect: false },
    { text: 'Comma ,', isCorrect: false },
  ]);
  const q3 = await ensureWritten(
    'Explain the difference between a while loop and a for loop.',
    5,
    'Both repeat a block; a for loop is typically count-controlled, a while loop condition-controlled.',
  );

  const sampleExam =
    (await prisma.exam.findFirst({
      where: { coursePartId: partA.id, title: 'CSE-1101 Midterm (Sample)' },
    })) ??
    (await prisma.exam.create({
      data: {
        coursePartId: partA.id,
        createdByTeacherId: teacher1.id,
        title: 'CSE-1101 Midterm (Sample)',
        instructions:
          'Answer all questions. MCQs are auto-graded; written answers are marked by your teacher.',
        startAt: new Date('2026-03-01T04:00:00Z'),
        endAt: new Date('2026-03-01T05:00:00Z'),
        durationMinutes: 60,
        status: 'draft',
        totalMarks: 8,
        settings: {
          showMarksAfterSubmit: true,
          showExplanation: true,
          shuffleQuestions: true,
          shuffleOptions: true,
          negativeMarking: false,
          negativeMarkValue: 0,
        },
      },
    }));
  let order = 1;
  for (const q of [q1, q2, q3]) {
    await prisma.examQuestion.upsert({
      where: { examId_questionId: { examId: sampleExam.id, questionId: q.id } },
      update: { order },
      create: { examId: sampleExam.id, questionId: q.id, order },
    });
    order++;
  }

  console.log(`
✔ Seed complete — University of Rajshahi Examination System

  Demo logins (all passwords must be changed in production):
  ┌───────────────────┬───────────────┬───────────────┐
  │ Role              │ Login         │ Password      │
  ├───────────────────┼───────────────┼───────────────┤
  │ Super Admin       │ superadmin    │ ${STAFF_PW}   │
  │ Admin             │ admin         │ ${STAFF_PW}   │
  │ Department Head   │ cse.head      │ ${STAFF_PW}   │
  │ Teacher           │ teacher1      │ ${STAFF_PW}   │
  │ Teacher           │ teacher2      │ ${STAFF_PW}   │
  │ Student           │ 2021001       │ ${STUDENT_PW} │
  └───────────────────┴───────────────┴───────────────┘
  CSE Honours → Semester 1 → CSE-1101 (Part A: Dr. Kabir Ahmed, Part B: Nusrat Jahan)
  CSE 2021 Batch is assigned to Semester 1.
`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
