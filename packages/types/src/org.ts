/** Admin org-management surfaces: structure tree, terms, offerings, teacher assignment. */

export interface Faculty {
  publicId: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  _count: { departments: number };
}

export interface Department {
  publicId: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  faculty: { publicId: string; code: string; name: string };
  _count: { programs: number };
}

export interface Program {
  publicId: string;
  name: string;
  degreeType: string;
  durationYears: number;
  department: { publicId: string; code: string; name: string };
  _count: { batches: number; semesters: number };
}

export interface Batch {
  publicId: string;
  name: string;
  admissionYear: number;
  program: { publicId: string; name: string };
  _count: { students: number };
}

export interface Semester {
  publicId: string;
  number: number;
  program: { publicId: string; name: string };
  _count: { courses: number };
}

export interface Course {
  publicId: string;
  code: string;
  name: string;
  credit: number;
  semester: { publicId: string; number: number };
  _count: { parts: number };
}

export interface CoursePart {
  publicId: string;
  name: string;
  marksWeight: number;
  course: { publicId: string; code: string };
}

export interface AcademicTerm {
  publicId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface CourseOffering {
  publicId: string;
  course: {
    publicId: string;
    code: string;
    name: string;
    semester: { program: { department: { publicId: string; name: string } } };
  };
  batch: { publicId: string; name: string };
  term: { publicId: string; name: string };
}

export interface OfferingPart {
  publicId: string;
  coursePart: { publicId: string; name: string; marksWeight: number };
  offering: { publicId: string };
  assignedTeacher: {
    publicId: string;
    designation: string | null;
    user: { publicId: string; displayName: string };
  } | null;
}

export interface TeacherOption {
  publicId: string;
  displayName: string;
  username: string;
  designation: string | null;
}
