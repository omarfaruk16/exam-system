import { Prisma } from '@prisma/client';

/**
 * Client-safe Prisma selects: every one omits internal `id` and exposes `publicId` plus the
 * parent's publicId. Responses therefore never leak autoincrement ints.
 */
export const facultySelect = {
  publicId: true,
  name: true,
  code: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FacultySelect;

export const departmentSelect = {
  publicId: true,
  name: true,
  code: true,
  createdAt: true,
  updatedAt: true,
  faculty: { select: { publicId: true, code: true, name: true } },
} satisfies Prisma.DepartmentSelect;

export const programSelect = {
  publicId: true,
  name: true,
  degreeType: true,
  durationYears: true,
  department: { select: { publicId: true, code: true, name: true } },
} satisfies Prisma.ProgramSelect;

export const batchSelect = {
  publicId: true,
  name: true,
  admissionYear: true,
  program: { select: { publicId: true, name: true } },
} satisfies Prisma.BatchSelect;

export const semesterSelect = {
  publicId: true,
  number: true,
  program: { select: { publicId: true, name: true } },
} satisfies Prisma.SemesterSelect;

export const courseSelect = {
  publicId: true,
  code: true,
  name: true,
  credit: true,
  semester: { select: { publicId: true, number: true } },
} satisfies Prisma.CourseSelect;

export const coursePartSelect = {
  publicId: true,
  name: true,
  marksWeight: true,
  course: { select: { publicId: true, code: true } },
} satisfies Prisma.CoursePartSelect;

export const termSelect = {
  publicId: true,
  name: true,
  startDate: true,
  endDate: true,
  isActive: true,
} satisfies Prisma.AcademicTermSelect;

export const offeringSelect = {
  publicId: true,
  course: { select: { publicId: true, code: true, name: true } },
  batch: { select: { publicId: true, name: true } },
  term: { select: { publicId: true, name: true } },
} satisfies Prisma.CourseOfferingSelect;

export const offeringPartSelect = {
  publicId: true,
  coursePart: { select: { publicId: true, name: true, marksWeight: true } },
  offering: { select: { publicId: true } },
  assignedTeacher: {
    select: {
      publicId: true,
      designation: true,
      user: { select: { publicId: true, displayName: true } },
    },
  },
} satisfies Prisma.OfferingPartSelect;
