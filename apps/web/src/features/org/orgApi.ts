import type {
  Batch,
  Course,
  CoursePart,
  Department,
  Faculty,
  Program,
  Semester,
  StudentRow,
  TeacherOption,
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
export const fetchDepartments = (faculty?: string) =>
  api.get<Department[]>(`/org/departments${qs({ faculty })}`);
export const fetchPrograms = (department?: string) =>
  api.get<Program[]>(`/org/programs${qs({ department })}`);
export const fetchBatches = (program?: string) =>
  api.get<Batch[]>(`/org/batches${qs({ program })}`);
export const fetchSemesters = (program?: string) =>
  api.get<Semester[]>(`/org/semesters${qs({ program })}`);
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
export const createSemester = (b: { programPublicId: string; number: number }) =>
  api.post<Semester>('/org/semesters', b);
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

// ── Teacher assignment (on a course part) ──
export const fetchTeachers = (department: string) =>
  api.get<TeacherOption[]>(`/org/teachers${qs({ department })}`);
export const assignTeacher = (coursePartId: string, teacherPublicId: string | null) =>
  api.put<CoursePart>(`/org/course-parts/${coursePartId}/teacher`, { teacherPublicId });

// ── Batch → semester assignment ──
export const assignBatchSemester = (batchId: string, semesterPublicId: string | null) =>
  api.put<Batch>(`/org/batches/${batchId}/semester`, { semesterPublicId });

// ── Students ──
export const fetchStudents = (batch?: string) =>
  api.get<StudentRow[]>(`/org/students${qs({ batch })}`);
export const changeStudentBatch = (studentId: string, batchPublicId: string) =>
  api.put<StudentRow>(`/org/students/${studentId}/batch`, { batchPublicId });
