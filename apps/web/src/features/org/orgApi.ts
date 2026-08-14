import type {
  AcademicTerm,
  Batch,
  Course,
  CourseOffering,
  CoursePart,
  Department,
  Faculty,
  OfferingPart,
  Program,
  Semester,
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
export const createFaculty = (b: { name: string; code: string }) =>
  api.post<Faculty>('/org/faculties', b);
export const createDepartment = (b: { facultyPublicId: string; name: string; code: string }) =>
  api.post<Department>('/org/departments', b);
export const createProgram = (b: {
  departmentPublicId: string;
  name: string;
  degreeType: string;
  durationYears: number;
}) => api.post<Program>('/org/programs', b);
export const createBatch = (b: { programPublicId: string; name: string; admissionYear: number }) =>
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
export const updateFaculty = (id: string, b: { name?: string; code?: string }) =>
  api.patch<Faculty>(`/org/faculties/${id}`, b);
export const updateDepartment = (id: string, b: { name?: string; code?: string }) =>
  api.patch<Department>(`/org/departments/${id}`, b);
export const updateProgram = (
  id: string,
  b: { name?: string; degreeType?: string; durationYears?: number },
) => api.patch<Program>(`/org/programs/${id}`, b);
export const updateBatch = (id: string, b: { name?: string; admissionYear?: number }) =>
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

// ── Terms ──
export const fetchTerms = () => api.get<AcademicTerm[]>('/org/terms');
export const createTerm = (b: {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
}) => api.post<AcademicTerm>('/org/terms', b);
export const updateTerm = (
  id: string,
  b: { name?: string; startDate?: string; endDate?: string; isActive?: boolean },
) => api.patch<AcademicTerm>(`/org/terms/${id}`, b);
export const deleteTerm = (id: string) => api.del(`/org/terms/${id}`);

// ── Offerings ──
export const fetchOfferings = () => api.get<CourseOffering[]>('/org/offerings');
export const createOffering = (b: {
  coursePublicId: string;
  batchPublicId: string;
  termPublicId: string;
}) => api.post<CourseOffering>('/org/offerings', b);
export const deleteOffering = (id: string) => api.del(`/org/offerings/${id}`);
export const fetchOfferingParts = (offeringId: string) =>
  api.get<OfferingPart[]>(`/org/offerings/${offeringId}/parts`);
export const assignTeacher = (offeringPartId: string, teacherPublicId: string | null) =>
  api.put<OfferingPart>(`/org/offering-parts/${offeringPartId}/teacher`, { teacherPublicId });

// ── Teachers ──
export const fetchTeachers = (department: string) =>
  api.get<TeacherOption[]>(`/org/teachers${qs({ department })}`);
