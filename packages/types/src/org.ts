/** Admin org-management surfaces: structure tree, teacher assignment, batches, students. */

export interface Faculty {
  publicId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { departments: number };
}

export interface Department {
  publicId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  faculty: { publicId: string; name: string };
  _count: { programs: number };
}

export interface Program {
  publicId: string;
  name: string;
  degreeType: string;
  durationYears: number;
  department: { publicId: string; name: string };
  _count: { batches: number; semesters: number };
}

export interface Semester {
  publicId: string;
  number: number;
  program: { publicId: string; name: string };
  /** courses in this semester; batches currently assigned to it */
  _count: { courses: number; batches: number };
}

export interface Course {
  publicId: string;
  code: string;
  name: string;
  credit: number;
  semester: { publicId: string; number: number };
  _count: { parts: number };
}

export interface AssignedTeacher {
  publicId: string;
  designation: string | null;
  user: { publicId: string; displayName: string };
}

export interface CoursePart {
  publicId: string;
  name: string;
  marksWeight: number;
  course: {
    publicId: string;
    code: string;
    name: string;
    semester: { program: { department: { publicId: string; name: string } } };
  };
  assignedTeacher: AssignedTeacher | null;
  _count: { exams: number };
}

export interface Batch {
  publicId: string;
  name: string;
  year: number;
  program: { publicId: string; name: string };
  currentSemester: { publicId: string; number: number } | null;
  _count: { students: number };
}

export interface StudentRow {
  publicId: string;
  studentId: string;
  registrationNumber: string | null;
  rollNumber: string | null;
  user: { displayName: string; email: string | null };
  batch: { publicId: string; name: string };
}

export interface TeacherOption {
  publicId: string;
  displayName: string;
  username: string;
  designation: string | null;
}
