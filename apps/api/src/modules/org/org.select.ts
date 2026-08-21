import { Prisma } from '@prisma/client';

/**
 * Client-safe Prisma selects: every one omits internal `id` and exposes `publicId` plus the
 * parent's publicId. Responses therefore never leak autoincrement ints.
 *
 * Child counts use a filtered relation count so soft-deleted children are excluded
 * (the soft-delete extension does not auto-filter nested `_count`).
 */
const notDeleted = { where: { deletedAt: null } };

export const facultySelect = {
  publicId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { departments: notDeleted } },
} satisfies Prisma.FacultySelect;

export const departmentSelect = {
  publicId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  faculty: { select: { publicId: true, name: true } },
  _count: { select: { programs: notDeleted } },
} satisfies Prisma.DepartmentSelect;

export const programSelect = {
  publicId: true,
  name: true,
  degreeType: true,
  durationYears: true,
  department: { select: { publicId: true, name: true } },
  _count: { select: { batches: notDeleted, semesters: true } },
} satisfies Prisma.ProgramSelect;

export const semesterSelect = {
  publicId: true,
  number: true,
  name: true,
  program: { select: { publicId: true, name: true } },
  _count: { select: { courses: notDeleted, batches: notDeleted } },
} satisfies Prisma.SemesterSelect;

export const batchSelect = {
  publicId: true,
  name: true,
  year: true,
  program: { select: { publicId: true, name: true } },
  currentSemester: { select: { publicId: true, number: true, name: true } },
  _count: { select: { students: notDeleted } },
} satisfies Prisma.BatchSelect;

export const courseSelect = {
  publicId: true,
  code: true,
  name: true,
  credit: true,
  semester: { select: { publicId: true, number: true } },
  _count: { select: { parts: notDeleted } },
} satisfies Prisma.CourseSelect;

export const coursePartSelect = {
  publicId: true,
  name: true,
  marksWeight: true,
  course: {
    select: {
      publicId: true,
      code: true,
      name: true,
      // Expose the owning department so the UI can scope the assign-teacher selector.
      semester: {
        select: {
          program: { select: { department: { select: { publicId: true, name: true } } } },
        },
      },
    },
  },
  assignedTeacher: {
    select: {
      publicId: true,
      designation: true,
      user: { select: { publicId: true, displayName: true } },
    },
  },
  _count: { select: { exams: notDeleted } },
} satisfies Prisma.CoursePartSelect;

export const teacherOptionSelect = {
  publicId: true,
  designation: true,
  user: { select: { displayName: true, email: true } },
} satisfies Prisma.TeacherSelect;

/** Full teacher row for admin management pages. */
export const teacherAdminSelect = {
  publicId: true,
  designation: true,
  createdAt: true,
  user: { select: { publicId: true, username: true, displayName: true, email: true } },
  department: { select: { publicId: true, name: true } },
} satisfies Prisma.TeacherSelect;

export const studentSelect = {
  publicId: true,
  studentId: true,
  registrationNumber: true,
  rollNumber: true,
  user: { select: { displayName: true, email: true } },
  batch: { select: { publicId: true, name: true } },
} satisfies Prisma.StudentSelect;
