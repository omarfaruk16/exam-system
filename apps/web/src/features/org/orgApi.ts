import type {
  Batch,
  Course,
  CoursePart,
  Department,
  Faculty,
  FacultyStats,
  Program,
  Semester,
  StudentRow,
  TeacherOption,
  TeacherRow,
} from '@exam/types';
import { api } from '@/lib/api';

const qs = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v);
  return entries.length
    ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}`
    : '';
};

// ── Structure ──
export const fetchFaculties = () => api.get<Faculty[]>('/org/faculties');
export const fetchFacultyStats = (publicId: string) =>
  api.get<FacultyStats>(`/org/faculties/${publicId}/stats`);
export const fetchDepartments = (faculty?: string) =>
  api.get<Department[]>(`/org/departments${qs({ faculty })}`);
export const fetchPrograms = (department?: string) =>
  api.get<Program[]>(`/org/programs${qs({ department })}`);
export const fetchBatches = (program?: string, department?: string) =>
  api.get<Batch[]>(`/org/batches${qs({ program, department })}`);
export const fetchSemesters = (batch?: string) =>
  api.get<Semester[]>(`/org/semesters${qs({ batch })}`);
export const fetchCourses = (semester?: string) =>
  api.get<Course[]>(`/org/courses${qs({ semester })}`);
export const fetchCourseParts = (course?: string) =>
  api.get<CoursePart[]>(`/org/course-parts${qs({ course })}`);

// Create
export const createFaculty = (b: { name: string }) => api.post<Faculty>('/org/faculties', b);
export const createDepartment = (b: { facultyPublicId: string; name: string }) =>
  api.post<Department>('/org/departments', b);
export const createProgram = (b: {
  departmentPublicId: string;
  name: string;
  degreeType: string;
  durationYears: number;
}) => api.post<Program>('/org/programs', b);
export const createBatch = (b: { programPublicId: string; name: string; year: number }) =>
  api.post<Batch>('/org/batches', b);
export const createSemester = (b: { batchPublicId: string; name: string; number?: number }) =>
  api.post<Semester>('/org/semesters', b);
export const updateSemester = (id: string, b: { name?: string }) =>
  api.patch<Semester>(`/org/semesters/${id}`, b);
export const createCourse = (b: {
  semesterPublicId: string;
  code: string;
  name: string;
  credit: number;
}) => api.post<Course>('/org/courses', b);
export const createCoursePart = (b: {
  coursePublicId: string;
  name: string;
  marksWeight: number;
}) => api.post<CoursePart>('/org/course-parts', b);

// Update
export const updateFaculty = (id: string, b: { name?: string }) =>
  api.patch<Faculty>(`/org/faculties/${id}`, b);
export const updateDepartment = (id: string, b: { name?: string }) =>
  api.patch<Department>(`/org/departments/${id}`, b);
export const updateProgram = (
  id: string,
  b: { name?: string; degreeType?: string; durationYears?: number },
) => api.patch<Program>(`/org/programs/${id}`, b);
export const updateBatch = (id: string, b: { name?: string; year?: number }) =>
  api.patch<Batch>(`/org/batches/${id}`, b);
export const updateCourse = (id: string, b: { code?: string; name?: string; credit?: number }) =>
  api.patch<Course>(`/org/courses/${id}`, b);
export const updateCoursePart = (id: string, b: { name?: string; marksWeight?: number }) =>
  api.patch<CoursePart>(`/org/course-parts/${id}`, b);

// Delete (soft)
export const deleteFaculty = (id: string) => api.del(`/org/faculties/${id}`);
export const deleteDepartment = (id: string) => api.del(`/org/departments/${id}`);
export const deleteProgram = (id: string) => api.del(`/org/programs/${id}`);
export const deleteBatch = (id: string) => api.del(`/org/batches/${id}`);
export const deleteSemester = (id: string) => api.del(`/org/semesters/${id}`);
export const deleteCourse = (id: string) => api.del(`/org/courses/${id}`);
export const deleteCoursePart = (id: string) => api.del(`/org/course-parts/${id}`);

// ── Teacher admin management ──
export const fetchTeachersAdmin = (department?: string) =>
  api.get<TeacherRow[]>(`/org/teachers${qs({ department })}`);
export const createTeacher = (b: {
  displayName: string;
  email: string;
  departmentPublicId: string;
  designation?: string;
}) => api.post<TeacherRow>('/org/teachers', b);
export const updateTeacher = (id: string, b: { designation?: string; displayName?: string }) =>
  api.patch<TeacherRow>(`/org/teachers/${id}`, b);
export const deleteTeacher = (id: string) => api.del(`/org/teachers/${id}`);
/** Set (or, with no password, reset to the default Teacher@12345) a teacher's sign-in password. */
export const setTeacherPassword = (id: string, password?: string) =>
  api.post<void>(`/org/teachers/${id}/set-password`, password ? { password } : {});

// ── Teacher selector (dept_head-accessible, scoped to department) ──
export const fetchTeachersSelector = (department: string) =>
  api.get<TeacherOption[]>(`/org/teachers/selector${qs({ department })}`);

// ── A teacher's course-part assignments (teaching load) ──
export interface TeacherAssignment {
  publicId: string;
  name: string;
  courseCode: string;
  courseName: string;
  semesterLabel: string;
  examCount: number;
}
export const fetchTeacherAssignments = (teacherPublicId: string) =>
  api.get<TeacherAssignment[]>(`/org/teachers/${teacherPublicId}/assignments`);

// ── Teacher / student Excel export (browser download) ──
export async function downloadExport(path: string, filename: string) {
  const res = await fetch(`/api/v1${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Teacher assignment (on a course part) ──
export const assignTeacher = (coursePartId: string, teacherPublicId: string | null) =>
  api.put<CoursePart>(`/org/course-parts/${coursePartId}/teacher`, { teacherPublicId });

// ── Batch → semester assignment ──
export const assignBatchSemester = (batchId: string, semesterPublicId: string | null) =>
  api.put<Batch>(`/org/batches/${batchId}/semester`, { semesterPublicId });

// ── Session structure export / import ──
export const exportBatchStructure = (batchPublicId: string) =>
  api.get<Record<string, unknown>>(`/org/batches/${batchPublicId}/export-structure`);

export const importBatchStructure = (batchPublicId: string, data: unknown) =>
  api.post<{ semesters: number; courses: number; parts: number }>(
    `/org/batches/${batchPublicId}/import-structure`,
    data,
  );

// ── Students ──
export const fetchStudents = (batch?: string) =>
  api.get<StudentRow[]>(`/org/students${qs({ batch })}`);
export const createStudent = (b: {
  studentId: string;
  displayName: string;
  email?: string;
  batchPublicId: string;
  registrationNumber?: string;
}) => api.post<StudentRow>('/org/students', b);
export const updateStudent = (
  id: string,
  b: { displayName?: string; email?: string; registrationNumber?: string },
) => api.patch<StudentRow>(`/org/students/${id}`, b);
export const deleteStudent = (id: string) => api.del(`/org/students/${id}`);
export const changeStudentBatch = (studentId: string, batchPublicId: string) =>
  api.put<StudentRow>(`/org/students/${studentId}/batch`, { batchPublicId });
