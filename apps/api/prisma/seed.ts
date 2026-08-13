/**
 * Idempotent seed (safe to re-run). Builds a small but complete slice:
 * Faculty → Department → Program → Batch → Semester → Course → Part, an active term,
 * one concrete offering with two assigned teachers, and one user for every role.
 *
 * The sample exam (MCQ + written) is seeded in Phase 3, once those tables exist.
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

async function main(): Promise<void> {
  // 1. Roles
  const roleNames: RoleName[] = ['super_admin', 'admin', 'department_head', 'teacher', 'student'];
  for (const name of roleNames) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    roleMap.set(name, role.id);
  }

  // 2. Faculties
  const sci = await prisma.faculty.upsert({
    where: { code: 'SCI' },
    update: { name: 'Faculty of Science' },
    create: { name: 'Faculty of Science', code: 'SCI' },
  });
  const bus = await prisma.faculty.upsert({
    where: { code: 'BUS' },
    update: { name: 'Faculty of Business Studies' },
    create: { name: 'Faculty of Business Studies', code: 'BUS' },
  });

  // 3. Departments
  const cse = await prisma.department.upsert({
    where: { facultyId_code: { facultyId: sci.id, code: 'CSE' } },
    update: { name: 'Computer Science & Engineering' },
    create: { facultyId: sci.id, name: 'Computer Science & Engineering', code: 'CSE' },
  });
  const phy = await prisma.department.upsert({
    where: { facultyId_code: { facultyId: sci.id, code: 'PHY' } },
    update: {},
    create: { facultyId: sci.id, name: 'Physics', code: 'PHY' },
  });
  const mgt = await prisma.department.upsert({
    where: { facultyId_code: { facultyId: bus.id, code: 'MGT' } },
    update: {},
    create: { facultyId: bus.id, name: 'Management', code: 'MGT' },
  });

  // 4. Programs
  const cseBsc =
    (await prisma.program.findFirst({
      where: { departmentId: cse.id, name: 'BSc in Computer Science & Engineering' },
    })) ??
    (await prisma.program.create({
      data: {
        departmentId: cse.id,
        name: 'BSc in Computer Science & Engineering',
        degreeType: DegreeType.bachelor,
        durationYears: 4,
      },
    }));
  const bba =
    (await prisma.program.findFirst({
      where: { departmentId: mgt.id, name: 'Bachelor of Business Administration' },
    })) ??
    (await prisma.program.create({
      data: {
        departmentId: mgt.id,
        name: 'Bachelor of Business Administration',
        degreeType: DegreeType.bachelor,
        durationYears: 4,
      },
    }));

  // 5. Batches
  const cseBatch = await prisma.batch.upsert({
    where: { programId_name: { programId: cseBsc.id, name: '2021 Batch' } },
    update: { admissionYear: 2021 },
    create: { programId: cseBsc.id, name: '2021 Batch', admissionYear: 2021 },
  });
  await prisma.batch.upsert({
    where: { programId_name: { programId: bba.id, name: '2022 Batch' } },
    update: { admissionYear: 2022 },
    create: { programId: bba.id, name: '2022 Batch', admissionYear: 2022 },
  });

  // 6. Semester
  const cseSem1 = await prisma.semester.upsert({
    where: { programId_number: { programId: cseBsc.id, number: 1 } },
    update: {},
    create: { programId: cseBsc.id, number: 1 },
  });

  // 7. Course
  const course = await prisma.course.upsert({
    where: { semesterId_code: { semesterId: cseSem1.id, code: 'CSE-1101' } },
    update: { name: 'Structured Programming', credit: 3 },
    create: { semesterId: cseSem1.id, code: 'CSE-1101', name: 'Structured Programming', credit: 3 },
  });

  // 8. Course parts
  const partA =
    (await prisma.coursePart.findFirst({ where: { courseId: course.id, name: 'Part A' } })) ??
    (await prisma.coursePart.create({
      data: { courseId: course.id, name: 'Part A', marksWeight: 60 },
    }));
  const partB =
    (await prisma.coursePart.findFirst({ where: { courseId: course.id, name: 'Part B' } })) ??
    (await prisma.coursePart.create({
      data: { courseId: course.id, name: 'Part B', marksWeight: 40 },
    }));

  // 9. Academic term (active)
  const term = await prisma.academicTerm.upsert({
    where: { name: 'Spring 2026' },
    update: { isActive: true },
    create: {
      name: 'Spring 2026',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-06-15'),
      isActive: true,
    },
  });

  // 10. Staff users
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

  // 11. Concrete offering + teacher assignments
  const offering = await prisma.courseOffering.upsert({
    where: {
      courseId_batchId_termId: { courseId: course.id, batchId: cseBatch.id, termId: term.id },
    },
    update: {},
    create: { courseId: course.id, batchId: cseBatch.id, termId: term.id },
  });
  await prisma.offeringPart.upsert({
    where: { offeringId_coursePartId: { offeringId: offering.id, coursePartId: partA.id } },
    update: { assignedTeacherId: teacher1.id },
    create: { offeringId: offering.id, coursePartId: partA.id, assignedTeacherId: teacher1.id },
  });
  await prisma.offeringPart.upsert({
    where: { offeringId_coursePartId: { offeringId: offering.id, coursePartId: partB.id } },
    update: { assignedTeacherId: teacher2.id },
    create: { offeringId: offering.id, coursePartId: partB.id, assignedTeacherId: teacher2.id },
  });

  // 11b. Physics subtree (second department under the same faculty) so cross-department
  //      scoping can be tested for real: cse.head must NOT reach these Physics entities.
  const phyProgram =
    (await prisma.program.findFirst({ where: { departmentId: phy.id, name: 'BSc in Physics' } })) ??
    (await prisma.program.create({
      data: {
        departmentId: phy.id,
        name: 'BSc in Physics',
        degreeType: DegreeType.bachelor,
        durationYears: 4,
      },
    }));
  const phyBatch = await prisma.batch.upsert({
    where: { programId_name: { programId: phyProgram.id, name: '2021 Batch' } },
    update: { admissionYear: 2021 },
    create: { programId: phyProgram.id, name: '2021 Batch', admissionYear: 2021 },
  });
  const phySem1 = await prisma.semester.upsert({
    where: { programId_number: { programId: phyProgram.id, number: 1 } },
    update: {},
    create: { programId: phyProgram.id, number: 1 },
  });
  const phyCourse = await prisma.course.upsert({
    where: { semesterId_code: { semesterId: phySem1.id, code: 'PHY-1101' } },
    update: { name: 'Mechanics', credit: 3 },
    create: { semesterId: phySem1.id, code: 'PHY-1101', name: 'Mechanics', credit: 3 },
  });
  const phyPartA =
    (await prisma.coursePart.findFirst({ where: { courseId: phyCourse.id, name: 'Part A' } })) ??
    (await prisma.coursePart.create({
      data: { courseId: phyCourse.id, name: 'Part A', marksWeight: 100 },
    }));

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

  const phyOffering = await prisma.courseOffering.upsert({
    where: {
      courseId_batchId_termId: { courseId: phyCourse.id, batchId: phyBatch.id, termId: term.id },
    },
    update: {},
    create: { courseId: phyCourse.id, batchId: phyBatch.id, termId: term.id },
  });
  await prisma.offeringPart.upsert({
    where: { offeringId_coursePartId: { offeringId: phyOffering.id, coursePartId: phyPartA.id } },
    update: { assignedTeacherId: phyTeacher.id },
    create: {
      offeringId: phyOffering.id,
      coursePartId: phyPartA.id,
      assignedTeacherId: phyTeacher.id,
    },
  });

  // 12. Students in the CSE 2021 batch
  const students = [
    { studentId: '2021001', name: 'Ayesha Siddiqua', email: 'ayesha@student.ru.ac.bd' },
    { studentId: '2021002', name: 'Tanvir Hasan', email: 'tanvir@student.ru.ac.bd' },
    { studentId: '2021003', name: 'Mitu Rani Das', email: 'mitu@student.ru.ac.bd' },
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
      update: { batchId: cseBatch.id, studentId: s.studentId },
      create: { userId: u.id, studentId: s.studentId, batchId: cseBatch.id },
    });
    await setRoles(u.id, [{ name: 'student' }]);
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
  │ Student           │ 2021002       │ ${STUDENT_PW} │
  │ Student           │ 2021003       │ ${STUDENT_PW} │
  └───────────────────┴───────────────┴───────────────┘
  Offering: CSE-1101 Structured Programming · CSE 2021 Batch · Spring 2026
`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
