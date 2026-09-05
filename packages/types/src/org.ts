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
  _count: { batches: number };
}

export interface Semester {
  publicId: string;
  number: number;
  name: string | null;
  /** A semester belongs to a batch, which belongs to a programme. */
  batch: { publicId: string; name: string; program: { publicId: string; name: string } };
  /** courses in this semester */
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
    semester: { batch: { program: { department: { publicId: string; name: string } } } };
  };
  assignedTeacher: AssignedTeacher | null;
  _count: { exams: number };
}

export interface Batch {
  publicId: string;
  name: string;
  year: number;
  program: { publicId: string; name: string; department: { publicId: string; name: string } };
  currentSemester: { publicId: string; number: number; name: string | null } | null;
  _count: { students: number; semesters: number };
}

export interface StudentRow {
  publicId: string;
  studentId: string;
  registrationNumber: string | null;
  user: { displayName: string; email: string | null };
  batch: { publicId: string; name: string };
}

export interface TeacherOption {
  publicId: string;
  displayName: string;
  email: string | null;
  designation: string | null;
  /** The teacher's home department (a part may borrow a teacher from another department). */
  department: string;
}

export interface TeacherRow {
  publicId: string;
  designation: string | null;
  createdAt: string;
  user: { publicId: string; username: string; displayName: string; email: string | null };
  department: { publicId: string; name: string };
}

export interface FacultyStats {
  publicId: string;
  name: string;
  createdAt: string;
  departments: { publicId: string; name: string; programCount: number }[];
  stats: {
    departmentCount: number;
    programCount: number;
    studentCount: number;
    teacherCount: number;
  };
}

export interface AdminUserRow {
  publicId: string;
  username: string;
  displayName: string;
  email: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  role: 'admin' | 'department_head';
  scopeFaculty: { publicId: string; name: string } | null;
  scopeDepartment: { publicId: string; name: string } | null;
}
